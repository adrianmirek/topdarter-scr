import type { NakkaTournamentScrapedDTO } from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import { fetchMatchViewFromApiByMid } from "./nakka-api-player-results.js";
import {
  NAKKA_BASE_URL,
  NAKKA_START_SCORE_501,
  NAKKA_STATUS_CODES,
  NAKKA_V1_MATCH_LIST_URL,
  NAKKA_V1_TOURNAMENT_LIST_URL,
} from "./constants.js";

export const TOURNAMENT_LIST_PAGE_SIZE = 30;
export const TOURNAMENT_LIST_MAX_PAGES = 10;

export interface NakkaApiTournamentListItem {
  tdid: string;
  title: string;
  status: number;
  t_date: number;
  createTime?: number;
  s?: number;
  d?: number;
}

export interface NakkaV1MatchListItem {
  mid?: string;
  tmid?: string;
  startTime?: number;
  match_type?: string;
}

export interface NakkaV1MatchListResponse {
  result?: number;
  list?: NakkaV1MatchListItem[];
}

export interface NakkaV1TournamentListResponse {
  result?: number;
  list?: NakkaApiTournamentListItem[];
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

async function fetchFirstMatchIs501(mid: string): Promise<boolean> {
  try {
    const apiData = await fetchMatchViewFromApiByMid(mid);
    const is501 = is501FromFirstLegFirstPlayer(apiData);
    const left = apiData?.legData?.[0]?.playerData?.[0]?.[0]?.left;
    console.log(
      `[API] 501 probe for mid=${mid}: left=${left ?? "missing"} keep=${is501}`
    );
    return is501;
  } catch (error) {
    console.log(`[API] 501 probe failed for mid=${mid}:`, error);
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
): data is { result: 0; list: NakkaApiTournamentListItem[] } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as NakkaV1TournamentListResponse;
  return payload.result === 0 && Array.isArray(payload.list);
}

export function isMatchListHistoryPayload(
  data: unknown
): data is { result: 0; list: NakkaV1MatchListItem[] } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as NakkaV1MatchListResponse;
  return payload.result === 0 && Array.isArray(payload.list);
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

export function toTournamentListDto(
  item: NakkaApiTournamentListItem
): NakkaTournamentScrapedDTO {
  return {
    nakka_identifier: item.tdid,
    tournament_name: item.title || "Unknown Tournament",
    href: `${NAKKA_BASE_URL}/comp.php?id=${item.tdid}`,
    tournament_date: null,
    status: "completed",
  };
}

export function toTournamentDto(
  item: NakkaApiTournamentListItem,
  parsedDate: Date
): NakkaTournamentScrapedDTO {
  return {
    ...toTournamentListDto(item),
    tournament_date: parsedDate,
  };
}

async function fetchHistoryList(
  tournamentId: string
): Promise<NakkaV1MatchListItem[] | null> {
  const historyApiUrl = `${NAKKA_V1_MATCH_LIST_URL}?tdid=${encodeURIComponent(
    tournamentId
  )}&endMatch=1&skip=0&count=1`;
  console.log(`[API] Requesting match history: ${historyApiUrl}`);

  const data = await httpsJsonRequest<unknown>(historyApiUrl);
  const valid = isMatchListHistoryPayload(data);
  if (!valid || data.list.length === 0) {
    console.log(
      `No match data from match list API (valid: ${valid}, listLength: ${
        valid ? data.list.length : 0
      })`
    );
    return null;
  }

  console.log(`Received ${data.list.length} matches from match list API`);
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
          `Scraped date ${parsedDate.toISOString()} from match list API for tournament ${tournamentId} (adjusted -4 hours, time stripped)`
        );
      }

      let is501 = false;
      if (match.mid) {
        is501 = await fetchFirstMatchIs501(match.mid);
      } else {
        console.log(
          `[API] Skipping 501 probe for tournament ${tournamentId}: missing mid`
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
  const url = `${NAKKA_V1_TOURNAMENT_LIST_URL}?skip=${skip}&count=${TOURNAMENT_LIST_PAGE_SIZE}&keyword=${encodeURIComponent(
    keyword
  )}&status=${NAKKA_STATUS_CODES.COMPLETED}`;
  console.log(`[API] Requesting tournament list: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);

  if (!isTournamentListPayload(data)) {
    throw new Error(
      `Tournament list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data.list;
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

  const tournaments = allItems
    .filter(
      (item) =>
        Boolean(item.tdid) &&
        item.status === Number(NAKKA_STATUS_CODES.COMPLETED)
    )
    .map(toTournamentListDto);

  console.log(`Filtered to ${tournaments.length} completed tournaments`);
  return tournaments;
}

export async function fetchTournamentByTdidFromApi(
  tdid: string
): Promise<NakkaTournamentScrapedDTO | null> {
  console.log(`[API] Fetching tournament details for tdid: "${tdid}"`);

  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);

  const item: NakkaApiTournamentListItem = {
    tdid,
    title: "",
    status: Number(NAKKA_STATUS_CODES.COMPLETED),
    t_date: 0,
  };

  let probe: TournamentHistoryProbe;
  try {
    probe = await fetchTournamentDateFromHistoryApi(tdid);
  } catch (error) {
    console.error(`Failed to scrape date for tournament ${tdid}:`, error);
    return null;
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
    return toTournamentDto(item, probe.parsedDate);
  }

  if (probe.parsedDate && !probe.is501) {
    console.log(`[API] Skipping tournament ${tdid}: first match is not 501`);
  }

  return null;
}

export async function scrapeTournamentsByKeyword(
  keyword: string
): Promise<NakkaTournamentScrapedDTO[]> {
  return fetchTournamentsByKeywordFromApi(keyword);
}

export async function scrapeTournamentByTdid(
  tdid: string
): Promise<NakkaTournamentScrapedDTO | null> {
  return fetchTournamentByTdidFromApi(tdid);
}
