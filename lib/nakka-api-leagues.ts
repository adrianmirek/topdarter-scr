import type {
  NakkaLeagueEventScrapedDTO,
  NakkaLeagueScrapedDTO,
} from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import {
  NAKKA_LEAGUE_API_URL,
  NAKKA_LEAGUE_BASE_URL,
  NAKKA_STATUS_CODES,
} from "./constants.js";
import {
  fetchTournamentDateFromHistoryApi,
  type TournamentHistoryProbe,
} from "./nakka-api-tournaments.js";

export const LEAGUE_LIST_PAGE_SIZE = 30;
export const LEAGUE_LIST_MAX_PAGES = 20;
export const SEASON_LIST_PAGE_SIZE = 30;
export const SEASON_LIST_MAX_PAGES = 20;

export interface NakkaApiLeagueListItem {
  lgid: string;
  title: string;
  cnt?: number;
}

export interface NakkaApiLeagueSeasonItem {
  tdid: string;
  title: string;
  status: number;
  t_date: number;
  createTime?: number;
  s?: number;
  d?: number;
}

export function isLeagueListPayload(
  data: unknown
): data is NakkaApiLeagueListItem[] {
  return Array.isArray(data);
}

export function isSeasonListPayload(
  data: unknown
): data is NakkaApiLeagueSeasonItem[] {
  return Array.isArray(data);
}

export function shouldKeepCompletedLeagueEvent(
  item: NakkaApiLeagueSeasonItem,
  parsedDate: Date | null,
  now: Date,
  sixMonthsAgo: Date,
  is501: boolean
): boolean {
  return Boolean(
    item.tdid &&
      item.status === Number(NAKKA_STATUS_CODES.COMPLETED) &&
      parsedDate &&
      parsedDate < now &&
      parsedDate >= sixMonthsAgo &&
      is501
  );
}

export function toLeagueDto(
  item: NakkaApiLeagueListItem,
  events: NakkaLeagueEventScrapedDTO[]
): NakkaLeagueScrapedDTO {
  return {
    lgid: item.lgid,
    league_name: item.title || "Unknown League",
    portal_href: `${NAKKA_LEAGUE_BASE_URL}/portal.php?lgid=${item.lgid}`,
    events,
  };
}

export function toLeagueEventDto(
  item: NakkaApiLeagueSeasonItem,
  leagueId: string,
  parsedDate: Date
): NakkaLeagueEventScrapedDTO {
  return {
    event_id: item.tdid,
    event_name: item.title || "Unknown Event",
    event_href: `${NAKKA_LEAGUE_BASE_URL}/season.php?id=${item.tdid}`,
    league_id: leagueId,
    event_status: "completed",
    event_date: parsedDate,
  };
}

async function fetchLeagueListPage(
  keyword: string,
  skip: number
): Promise<NakkaApiLeagueListItem[]> {
  const url = `${NAKKA_LEAGUE_API_URL}?cmd=get_list&skip=${skip}&count=${LEAGUE_LIST_PAGE_SIZE}&keyword=${encodeURIComponent(keyword)}`;
  console.log(`[API] Requesting league list: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);

  if (!isLeagueListPayload(data)) {
    throw new Error(
      `League list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function fetchSeasonListPage(
  lgid: string,
  skip: number
): Promise<NakkaApiLeagueSeasonItem[]> {
  const url = `${NAKKA_LEAGUE_API_URL}?cmd=get_season_list&lgid=${encodeURIComponent(lgid)}`;
  console.log(`[API] Requesting season list: ${url} skip=${skip}`);

  const data = await httpsJsonRequest<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      skip,
      count: SEASON_LIST_PAGE_SIZE,
      keyword: "",
      status: [NAKKA_STATUS_CODES.COMPLETED],
      sort: "date",
      sort_order: -1,
    }),
  });

  if (!isSeasonListPayload(data)) {
    throw new Error(
      `Season list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function fetchLeagueSeasonsFromApi(
  lgid: string
): Promise<NakkaApiLeagueSeasonItem[]> {
  const allItems: NakkaApiLeagueSeasonItem[] = [];

  for (let page = 0; page < SEASON_LIST_MAX_PAGES; page++) {
    const skip = page * SEASON_LIST_PAGE_SIZE;
    const pageItems = await fetchSeasonListPage(lgid, skip);
    console.log(
      `[API] Season list lgid=${lgid} skip=${skip} count=${pageItems.length}`
    );
    allItems.push(...pageItems);

    if (pageItems.length < SEASON_LIST_PAGE_SIZE) {
      break;
    }
  }

  return allItems;
}

export async function fetchLeaguesByKeywordFromApi(
  keyword: string
): Promise<{ leagues: NakkaLeagueScrapedDTO[] }> {
  console.log(`[API] Fetching leagues for keyword: "${keyword}"`);

  const allLeagues: NakkaApiLeagueListItem[] = [];

  for (let page = 0; page < LEAGUE_LIST_MAX_PAGES; page++) {
    const skip = page * LEAGUE_LIST_PAGE_SIZE;
    const pageItems = await fetchLeagueListPage(keyword, skip);
    console.log(`[API] League list page skip=${skip} count=${pageItems.length}`);
    allLeagues.push(...pageItems);

    if (pageItems.length < LEAGUE_LIST_PAGE_SIZE) {
      break;
    }
  }

  console.log(`Collected: ${allLeagues.length} leagues`);

  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);

  const leagues: NakkaLeagueScrapedDTO[] = [];
  let totalFilteredEvents = 0;

  for (const league of allLeagues) {
    if (!league.lgid) {
      continue;
    }

    const seasons = await fetchLeagueSeasonsFromApi(league.lgid);
    const events: NakkaLeagueEventScrapedDTO[] = [];

    for (const season of seasons) {
      if (!season.tdid || season.status !== Number(NAKKA_STATUS_CODES.COMPLETED)) {
        continue;
      }

      let probe: TournamentHistoryProbe;
      try {
        probe = await fetchTournamentDateFromHistoryApi(season.tdid);
      } catch (error) {
        console.error(`Failed to scrape date for event ${season.tdid}:`, error);
        continue;
      }

      if (
        shouldKeepCompletedLeagueEvent(
          season,
          probe.parsedDate,
          now,
          sixMonthsAgo,
          probe.is501
        ) &&
        probe.parsedDate
      ) {
        events.push(toLeagueEventDto(season, league.lgid, probe.parsedDate));
        totalFilteredEvents++;
      } else if (probe.parsedDate && !probe.is501) {
        console.log(
          `[API] Skipping event ${season.tdid}: first match is not 501`
        );
      } else if (!probe.parsedDate) {
        console.log(`Skipping event ${season.tdid} - no valid date found`);
      } else {
        console.log(
          `Skipping event ${season.tdid} - date ${probe.parsedDate.toISOString()} outside 6-month range`
        );
      }
    }

    leagues.push(toLeagueDto(league, events));
  }

  console.log(
    `Final results: ${leagues.length} leagues, ${totalFilteredEvents} completed events`
  );

  return { leagues };
}

export async function scrapeLeaguesByKeyword(
  keyword: string
): Promise<{ leagues: NakkaLeagueScrapedDTO[] }> {
  return fetchLeaguesByKeywordFromApi(keyword);
}
