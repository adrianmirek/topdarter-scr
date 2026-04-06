export interface NakkaTournamentScrapedDTO {
  nakka_identifier: string;
  tournament_name: string;
  href: string;
  tournament_date: Date;
  status: string;
}

export interface NakkaMatchScrapedDTO {
  nakka_match_identifier: string;
  match_type: string;
  first_player_name: string;
  first_player_code: string;
  second_player_name: string;
  second_player_code: string;
  href: string;
  match_date?: Date | null;
}

export interface NakkaMatchPlayerResultScrapedDTO {
  nakka_match_player_identifier: string;
  average_score: number | null;
  first_nine_avg: number | null;
  checkout_percentage: number | null;
  score_60_count: number;
  score_100_count: number;
  score_140_count: number;
  score_180_count: number;
  high_finish: number;
  best_leg: number;
  worst_leg: number;
  player_score: number;
  opponent_score: number;
}

export interface NakkaPlayerStatsDTO {
  player_id: string;
  rank: number;
  score_100_count: number;
  score_140_count: number;
  score_170_count: number;
  score_180_count: number;
  high_finish: number;
  best_leg: number;
  average_score: number;
  first_nine_avg: number;
  win_rate: number;
  leg_rate: number;
  matches_count: number;
  legs_count: number;
}

export interface NakkaTournamentStatsDTO {
  tournament_id: string;
  players_stats: NakkaPlayerStatsDTO[];
}

export interface NakkaLeagueScrapedDTO {
  lgid: string;
  league_name: string;
  portal_href: string;
  events: NakkaLeagueEventScrapedDTO[];
}

export interface NakkaLeagueEventScrapedDTO {
  event_id: string;
  event_name: string;
  event_href: string;
  league_id: string;
  event_status: string;
  event_date: Date;
}

