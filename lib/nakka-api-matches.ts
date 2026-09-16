import type { NakkaMatchScrapedDTO } from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import { NAKKA_BASE_URL, NAKKA_V1_MATCH_LIST_URL } from "./constants.js";

export const MATCH_LIST_PAGE_SIZE = 100;
export const MATCH_LIST_MAX_PAGES = 20;

export interface NakkaApiMatchHistoryItem {
  tmid: string;
  startTime: number;
  p1tpid: string;
  p2tpid: string;
  p1name: string;
  p2name: string;
  title: string;
  subtitle?: string;
  tpid?: string;
  vstpid?: string;
  round?: string;
  ttype?: string;
  match_type?: string;
}

export interface NakkaV1PublicMatchListItem {
  mid?: string;
  tmid?: string;
  title?: string;
  startTime?: number;
  match_type?: string;
  statsData?: Array<{
    name?: string;
    tpid?: string;
  }>;
}

export interface NakkaHistoryListResponse {
  result?: number;
  list?: NakkaV1PublicMatchListItem[];
}

export function extractTournamentIdFromHref(tournamentHref: string): string {
  const tournamentIdMatch = tournamentHref.match(/[?&]id=([^&]+)/);
  if (!tournamentIdMatch) {
    throw new Error(`Could not extract tournament ID from URL: ${tournamentHref}`);
  }
  return tournamentIdMatch[1];
}

export function isHistoryListPayload(
  data: unknown
): data is { result: 0; list: NakkaV1PublicMatchListItem[] } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as NakkaHistoryListResponse;
  return payload.result === 0 && Array.isArray(payload.list);
}

export function toMatchHistoryItem(
  item: NakkaV1PublicMatchListItem
): NakkaMatchScrapedDTO {
  const tmid = item.tmid || "";
  return {
    nakka_match_identifier: tmid,
    nakka_mid: item.mid || "",
    match_type: item.title || "unknown",
    first_player_name: item.statsData?.[0]?.name || "Unknown",
    first_player_code: item.statsData?.[0]?.tpid || "",
    second_player_name: item.statsData?.[1]?.name || "Unknown",
    second_player_code: item.statsData?.[1]?.tpid || "",
    href: `${NAKKA_BASE_URL}/n01_view.html?tmid=${tmid}`,
    match_date: parseMatchDateFromStartTime(item.startTime || 0),
  };
}

export function parseMatchDateFromStartTime(startTime: number): Date | null {
  if (!startTime || startTime <= 0) {
    return null;
  }
  const matchDate = new Date(startTime * 1000);
  return isNaN(matchDate.getTime()) ? null : matchDate;
}

export function shouldKeepHistoryMatch(item: NakkaMatchScrapedDTO): boolean {
  return Boolean(
    item.nakka_match_identifier &&
      item.first_player_code &&
      item.second_player_code
  );
}

export function toMatchDto(item: NakkaApiMatchHistoryItem): NakkaMatchScrapedDTO {
  return {
    nakka_match_identifier: item.tmid,
    nakka_mid: "",
    match_type: item.title || "unknown",
    first_player_name: item.p1name || "Unknown",
    first_player_code: item.p1tpid,
    second_player_name: item.p2name || "Unknown",
    second_player_code: item.p2tpid,
    href: `${NAKKA_BASE_URL}/n01_view.html?tmid=${item.tmid}`,
    match_date: parseMatchDateFromStartTime(item.startTime),
  };
}

async function fetchMatchListPage(
  tournamentId: string,
  skip: number
): Promise<NakkaMatchScrapedDTO[]> {
  const url = `${NAKKA_V1_MATCH_LIST_URL}?tdid=${encodeURIComponent(
    tournamentId
  )}&skip=${skip}&count=${MATCH_LIST_PAGE_SIZE}`;
  console.log(`[API] Requesting match list: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);

  if (!isHistoryListPayload(data)) {
    throw new Error(
      `Match list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data.list.map(toMatchHistoryItem);
}

export async function fetchTournamentMatchesFromApi(
  tournamentHref: string
): Promise<NakkaMatchScrapedDTO[]> {
  const tournamentId = extractTournamentIdFromHref(tournamentHref);
  console.log(`[API] Fetching matches for tournament: ${tournamentId}`);

  const matches: NakkaMatchScrapedDTO[] = [];

  for (let page = 0; page < MATCH_LIST_MAX_PAGES; page++) {
    const skip = page * MATCH_LIST_PAGE_SIZE;
    const pageItems = await fetchMatchListPage(tournamentId, skip);
    console.log(
      `[API] Match list page skip=${skip} count=${pageItems.length}`
    );

    for (const item of pageItems) {
      if (shouldKeepHistoryMatch(item)) {
        matches.push(item);
      }
    }

    if (pageItems.length < MATCH_LIST_PAGE_SIZE) {
      break;
    }
  }

  const matchesWithDates = matches.filter((match) => match.match_date).length;
  console.log(`[API] Total matches fetched: ${matches.length}`);
  console.log(`[API] Matches with dates: ${matchesWithDates}/${matches.length}`);

  return matches;
}

export async function scrapeTournamentMatches(
  tournamentHref: string
): Promise<NakkaMatchScrapedDTO[]> {
  return fetchTournamentMatchesFromApi(tournamentHref);
}
