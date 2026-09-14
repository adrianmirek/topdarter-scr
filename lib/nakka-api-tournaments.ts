import type { NakkaTournamentScrapedDTO } from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import {
  NAKKA_BASE_URL,
  NAKKA_HISTORY_API_URL,
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
  list?: Array<{ startTime?: number }>;
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
  sixMonthsAgo: Date
): boolean {
  return Boolean(
    item.tdid &&
      item.status === Number(NAKKA_STATUS_CODES.COMPLETED) &&
      parsedDate &&
      parsedDate < now &&
      parsedDate >= sixMonthsAgo
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

export async function fetchTournamentDateFromHistoryApi(
  tournamentId: string
): Promise<Date | null> {
  const historyApiUrl = `${NAKKA_HISTORY_API_URL}?cmd=get_t_list&tdid=${encodeURIComponent(tournamentId)}&skip=0&count=1&name=`;
  console.log(`Fetching match history from API directly`);

  try {
    const data = await httpsJsonRequest<NakkaHistoryListResponse>(historyApiUrl);
    if (!data?.list || !Array.isArray(data.list) || data.list.length === 0) {
      console.log(
        `No match data from history API (hasList: ${Boolean(data?.list)}, listLength: ${Array.isArray(data?.list) ? data.list.length : 0})`
      );
      return null;
    }

    console.log(`Received ${data.list.length} matches from history API`);

    for (const match of data.list) {
      if (match.startTime && match.startTime > 0) {
        const parsedDate = parseTournamentDateFromHistoryStartTime(match.startTime);
        if (parsedDate) {
          console.log(
            `Scraped date ${parsedDate.toISOString()} from match history API for tournament ${tournamentId} (adjusted -4 hours, time stripped)`
          );
          return parsedDate;
        }
      }
    }

    console.log("Match data received but no valid dates found");
    return null;
  } catch (apiError) {
    console.log("API call failed:", apiError);
    return null;
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

    let parsedDate: Date | null = null;
    try {
      parsedDate = await fetchTournamentDateFromHistoryApi(item.tdid);
    } catch (error) {
      console.error(`Failed to scrape date for tournament ${item.tdid}:`, error);
      continue;
    }

    if (shouldKeepCompletedTournament(item, parsedDate, now, sixMonthsAgo) && parsedDate) {
      tournaments.push(toTournamentDto(item, parsedDate));
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
