import type { NakkaMatchScrapedDTO } from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import { NAKKA_BASE_URL, NAKKA_HISTORY_API_URL } from "./constants.js";

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

export interface NakkaHistoryListResponse {
  time?: number;
  list?: NakkaApiMatchHistoryItem[];
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
): data is { list: NakkaApiMatchHistoryItem[] } {
  return Boolean(
    data &&
      typeof data === "object" &&
      Array.isArray((data as NakkaHistoryListResponse).list)
  );
}

export function parseMatchDateFromStartTime(startTime: number): Date | null {
  if (!startTime || startTime <= 0) {
    return null;
  }
  const matchDate = new Date(startTime * 1000);
  return isNaN(matchDate.getTime()) ? null : matchDate;
}

export function shouldKeepHistoryMatch(item: NakkaApiMatchHistoryItem): boolean {
  return Boolean(item.tmid && item.p1tpid && item.p2tpid);
}

export function toMatchDto(item: NakkaApiMatchHistoryItem): NakkaMatchScrapedDTO {
  return {
    nakka_match_identifier: item.tmid,
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
): Promise<NakkaApiMatchHistoryItem[]> {
  const url = `${NAKKA_HISTORY_API_URL}?cmd=get_t_list&tdid=${encodeURIComponent(tournamentId)}&skip=${skip}&count=${MATCH_LIST_PAGE_SIZE}&name=`;
  console.log(`[API] Requesting match list: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);

  if (!isHistoryListPayload(data)) {
    throw new Error(
      `Match list API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data.list;
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
        matches.push(toMatchDto(item));
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
