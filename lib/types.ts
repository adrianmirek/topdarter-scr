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

