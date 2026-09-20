import type {
  NakkaLeagueEventScrapedDTO,
  NakkaLeagueScrapedDTO,
} from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import {
  NAKKA_LEAGUE_BASE_URL,
  NAKKA_STATUS_CODES,
  NAKKA_V1_LEAGUE_LIST_URL,
  NAKKA_V1_TOURNAMENT_LIST_URL,
} from "./constants.js";

export const LEAGUE_LIST_PAGE_SIZE = 30;
export const LEAGUE_LIST_MAX_PAGES = 20;
export const SEASON_LIST_PAGE_SIZE = 30;
export const SEASON_LIST_MAX_PAGES = 20;

export interface NakkaApiLeagueListItem {
  lgid: string;
  title: string;
  cnt?: number;
  createTime?: number;
  updateTime?: number;
}

export interface NakkaV1LeagueListResponse {
  result?: number;
  list?: NakkaApiLeagueListItem[];
}

export interface NakkaApiLeagueSeasonItem {
  tdid: string;
  title: string;
  status: number;
  t_date: number;
  createTime?: number;
  lgid?: string;
  s?: number;
  d?: number;
}

export interface NakkaV1LeagueSeasonListResponse {
  result?: number;
  list?: NakkaApiLeagueSeasonItem[];
}

export function isLeagueListPayload(
  data: unknown
): data is { result: 0; list: NakkaApiLeagueListItem[] } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as NakkaV1LeagueListResponse;
  return payload.result === 0 && Array.isArray(payload.list);
}

export function isSeasonListPayload(
  data: unknown
): data is { result: 0; list: NakkaApiLeagueSeasonItem[] } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as NakkaV1LeagueSeasonListResponse;
  return payload.result === 0 && Array.isArray(payload.list);
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

export function toLeagueEventListDto(
  item: NakkaApiLeagueSeasonItem,
  leagueId: string
): NakkaLeagueEventScrapedDTO {
  return {
    event_id: item.tdid,
    event_name: item.title || "Unknown Event",
    event_href: `${NAKKA_LEAGUE_BASE_URL}/season.php?id=${item.tdid}`,
    league_id: leagueId,
    event_status: "completed",
    event_date: null,
  };
}

export function toLeagueEventDto(
  item: NakkaApiLeagueSeasonItem,
  leagueId: string,
  parsedDate: Date
): NakkaLeagueEventScrapedDTO {
  return {
    ...toLeagueEventListDto(item, leagueId),
    event_date: parsedDate,
  };
}

async function fetchLeagueListPage(
  keyword: string,
  skip: number
): Promise<NakkaApiLeagueListItem[]> {
  const url = `${NAKKA_V1_LEAGUE_LIST_URL}?cmd=get_list&skip=${skip}&count=${LEAGUE_LIST_PAGE_SIZE}&keyword=${encodeURIComponent(keyword)}`;
  console.log(`[API] Requesting league list: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);

  if (!isLeagueListPayload(data)) {
    throw new Error(
      `League list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data.list;
}

async function fetchSeasonListPage(
  lgid: string,
  skip: number
): Promise<NakkaApiLeagueSeasonItem[]> {
  const url = `${NAKKA_V1_TOURNAMENT_LIST_URL}?lgid=${encodeURIComponent(lgid)}&skip=${skip}&count=${SEASON_LIST_PAGE_SIZE}&status=${NAKKA_STATUS_CODES.COMPLETED}`;
  console.log(`[API] Requesting season list: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);

  if (!isSeasonListPayload(data)) {
    throw new Error(
      `Season list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data.list;
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

  const leagues: NakkaLeagueScrapedDTO[] = [];
  let totalCompletedEvents = 0;

  for (const league of allLeagues) {
    if (!league.lgid) {
      continue;
    }

    const seasons = await fetchLeagueSeasonsFromApi(league.lgid);
    const events = seasons
      .filter(
        (season) =>
          Boolean(season.tdid) &&
          season.status === Number(NAKKA_STATUS_CODES.COMPLETED)
      )
      .map((season) => toLeagueEventListDto(season, league.lgid));

    totalCompletedEvents += events.length;
    leagues.push(toLeagueDto(league, events));
  }

  console.log(
    `Final results: ${leagues.length} leagues, ${totalCompletedEvents} completed events`
  );

  return { leagues };
}

export async function scrapeLeaguesByKeyword(
  keyword: string
): Promise<{ leagues: NakkaLeagueScrapedDTO[] }> {
  return fetchLeaguesByKeywordFromApi(keyword);
}
