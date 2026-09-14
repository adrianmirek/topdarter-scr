import type { NakkaTournamentScrapedDTO } from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import { fetchMatchViewFromApi } from "./nakka-api-player-results.js";
import {
  NAKKA_BASE_URL,
  NAKKA_HISTORY_API_URL,
  NAKKA_START_SCORE_501,
  NAKKA_STATUS_CODES,
  NAKKA_TOURNAMENT_API_URL,
} from "./constants.js";

export const TOURNAMENT_LIST_PAGE_SIZE = 30;
export const TOURNAMENT_LIST_MAX_PAGES = 20;

export interface NakkaApiTournamentListItem {
  tdid: string;
  title: string;
  status: number;
  t_date: number;
  createTime?: number;
  s?: number;
  d?: number;
}

interface NakkaHistoryListResponse {
  list?: Array<{
    tmid?: string;
    startTime?: number;
  }>;
}

export interface TournamentHistoryProbe {
  parsedDate: Date | null;
  is501: boolean;
}

export function is501FromFirstLegFirstPlayer(match: {
  legData?: Array<{
    playerData?: Array<Array<{ score?: number; left?: number }>>;
  }>;
} | null | undefined): boolean {
  const left = match?.legData?.[0]?.playerData?.[0]?.[0]?.left;
  return left === NAKKA_START_SCORE_501;
}

async function fetchFirstMatchIs501(tmid: string): Promise<boolean> {
  try {
    const apiData = await fetchMatchViewFromApi(tmid);
    const is501 = is501FromFirstLegFirstPlayer(apiData);
    const left = apiData?.legData?.[0]?.playerData?.[0]?.[0]?.left;
    console.log(
      `[API] 501 probe for tmid=${tmid}: left=${left ?? "missing"} keep=${is501}`
    );
    return is501;
  } catch (error) {
    console.log(`[API] 501 probe failed for tmid=${tmid}:`, error);
    return false;
  }
}

/**
 * Same date math as scrapeTournamentDateFromResults:
 * startTime unix seconds, minus 4 hours, then UTC midnight.
 */
export function parseTournamentDateFromHistoryStartTime(
  startTime: number
): Date | null {
  if (!startTime || startTime <= 0) {
    return null;
  }

  const matchDate = new Date(startTime * 1000);
  matchDate.setHours(matchDate.getHours() - 4);
  const parsedDate = new Date(
    Date.UTC(
      matchDate.getFullYear(),
      matchDate.getMonth(),
      matchDate.getDate(),
      0,
      0,
      0,
      0
    )
  );

  if (isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

export function isTournamentListPayload(
  data: unknown
): data is NakkaApiTournamentListItem[] {
  return Array.isArray(data);
}

export function shouldKeepCompletedTournament(
  item: NakkaApiTournamentListItem,
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

export function toTournamentDto(
  item: NakkaApiTournamentListItem,
  parsedDate: Date
): NakkaTournamentScrapedDTO {
  return {
    nakka_identifier: item.tdid,
    tournament_name: item.title || "Unknown Tournament",
    href: `${NAKKA_BASE_URL}/comp.php?id=${item.tdid}`,
    tournament_date: parsedDate,
    status: "completed",
  };
}

async function fetchHistoryList(
  tournamentId: string
): Promise<Array<{ tmid?: string; startTime?: number }> | null> {
  const historyApiUrl = `${NAKKA_HISTORY_API_URL}?cmd=get_t_list&tdid=${encodeURIComponent(tournamentId)}&skip=0&count=1&name=`;
  console.log(`Fetching match history from API directly`);

  const data = await httpsJsonRequest<NakkaHistoryListResponse>(historyApiUrl);
  if (!data?.list || !Array.isArray(data.list) || data.list.length === 0) {
    console.log(
      `No match data from history API (hasList: ${Boolean(data?.list)}, listLength: ${Array.isArray(data?.list) ? data.list.length : 0})`
    );
    return null;
  }

  console.log(`Received ${data.list.length} matches from history API`);
  return data.list;
}

export async function fetchTournamentDateFromHistoryApi(
  tournamentId: string
): Promise<TournamentHistoryProbe> {
  try {
    const list = await fetchHistoryList(tournamentId);
    if (!list) {
      return { parsedDate: null, is501: false };
    }

    for (const match of list) {
      const parsedDate =
        match.startTime && match.startTime > 0
          ? parseTournamentDateFromHistoryStartTime(match.startTime)
          : null;

      if (parsedDate) {
        console.log(
          `Scraped date ${parsedDate.toISOString()} from match history API for tournament ${tournamentId} (adjusted -4 hours, time stripped)`
        );
      }

      let is501 = false;
      if (match.tmid) {
        is501 = await fetchFirstMatchIs501(match.tmid);
      } else {
        console.log(
          `[API] Skipping 501 probe for tournament ${tournamentId}: missing tmid`
        );
      }

      return { parsedDate, is501 };
    }

    console.log("Match data received but no valid dates found");
    return { parsedDate: null, is501: false };
  } catch (apiError) {
    console.log("API call failed:", apiError);
    return { parsedDate: null, is501: false };
  }
}

async function fetchTournamentListPage(
  keyword: string,
  skip: number
): Promise<NakkaApiTournamentListItem[]> {
  const url = `${NAKKA_TOURNAMENT_API_URL}?cmd=get_list&skip=${skip}&count=${TOURNAMENT_LIST_PAGE_SIZE}&keyword=${encodeURIComponent(keyword)}`;
  console.log(`[API] Requesting tournament list: ${url}`);

  const data = await httpsJsonRequest<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: [NAKKA_STATUS_CODES.COMPLETED],
      sort: "active",
    }),
  });

  if (!isTournamentListPayload(data)) {
    throw new Error(
      `Tournament list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function fetchTournamentsByKeywordFromApi(
  keyword: string
): Promise<NakkaTournamentScrapedDTO[]> {
  console.log(`[API] Fetching tournaments for keyword: "${keyword}"`);

  const allItems: NakkaApiTournamentListItem[] = [];

  for (let page = 0; page < TOURNAMENT_LIST_MAX_PAGES; page++) {
    const skip = page * TOURNAMENT_LIST_PAGE_SIZE;
    const pageItems = await fetchTournamentListPage(keyword, skip);
    console.log(`[API] Tournament list page skip=${skip} count=${pageItems.length}`);
    allItems.push(...pageItems);

    if (pageItems.length < TOURNAMENT_LIST_PAGE_SIZE) {
      break;
    }
  }

  console.log(`Collected: ${allItems.length} tournaments`);

  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);

  const tournaments: NakkaTournamentScrapedDTO[] = [];

  for (const item of allItems) {
    if (!item.tdid || item.status !== Number(NAKKA_STATUS_CODES.COMPLETED)) {
      continue;
    }

    let probe: TournamentHistoryProbe;
    try {
      probe = await fetchTournamentDateFromHistoryApi(item.tdid);
    } catch (error) {
      console.error(`Failed to scrape date for tournament ${item.tdid}:`, error);
      continue;
    }

    if (
      shouldKeepCompletedTournament(
        item,
        probe.parsedDate,
        now,
        sixMonthsAgo,
        probe.is501
      ) &&
      probe.parsedDate
    ) {
      tournaments.push(toTournamentDto(item, probe.parsedDate));
    } else if (probe.parsedDate && !probe.is501) {
      console.log(
        `[API] Skipping tournament ${item.tdid}: first match is not 501`
      );
    }
  }

  console.log(`Filtered to ${tournaments.length} completed tournaments`);
  return tournaments;
}

export async function scrapeTournamentsByKeyword(
  keyword: string
): Promise<NakkaTournamentScrapedDTO[]> {
  return fetchTournamentsByKeywordFromApi(keyword);
}
