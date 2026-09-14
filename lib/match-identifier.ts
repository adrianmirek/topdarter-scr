export function extractMatchIdentifierComponents(nakkaMatchIdentifier: string): {
  tournamentId: string;
  matchType: string;
  round: string;
} | null {
  const parts = nakkaMatchIdentifier.split("_");

  if (parts.length < 5) {
    console.error(`Invalid match identifier format: ${nakkaMatchIdentifier}`);
    return null;
  }

  return {
    tournamentId: parts.slice(0, 3).join("_"),
    matchType: parts[3],
    round: parts[4],
  };
}
