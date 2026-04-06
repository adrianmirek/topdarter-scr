import { scrapeTournamentStats } from './dist/lib/nakka-scraper.js';

const TEST_TOURNAMENT_ID = 't_3CaN_8156';

async function testTournamentStats() {
  console.log('='.repeat(80));
  console.log('Testing Tournament Stats Feature');
  console.log(`Tournament ID: ${TEST_TOURNAMENT_ID}`);
  console.log('='.repeat(80));
  console.log();

  try {
    console.log(`Fetching stats for tournament: ${TEST_TOURNAMENT_ID} ...`);
    const result = await scrapeTournamentStats(TEST_TOURNAMENT_ID);

    if (!result || !result.players_stats || result.players_stats.length === 0) {
      console.log('❌ No player stats returned');
      return;
    }

    console.log(`✅ Received stats for ${result.players_stats.length} player(s)\n`);

    console.log('='.repeat(80));
    console.log('TOURNAMENT STATS SUMMARY:');
    console.log('='.repeat(80));
    console.log(`  tournament_id : ${result.tournament_id}`);
    console.log(`  players count : ${result.players_stats.length}`);
    console.log();

    // Sort by rank (win_rate desc) for display
    const sorted = [...result.players_stats].sort((a, b) => b.win_rate - a.win_rate);

    console.log('TOP PLAYERS (sorted by win rate):');
    console.log('-'.repeat(80));

    sorted.slice(0, 5).forEach((p, i) => {
      console.log(`${i + 1}. Player ID      : ${p.player_id}`);
      console.log(`   Average score  : ${p.average_score}`);
      console.log(`   First 9 avg    : ${p.first_nine_avg}`);
      console.log(`   Win rate       : ${p.win_rate}%`);
      console.log(`   Leg rate       : ${p.leg_rate}%`);
      console.log(`   100s           : ${p.score_100_count}`);
      console.log(`   140s           : ${p.score_140_count}`);
      console.log(`   170s           : ${p.score_170_count}`);
      console.log(`   180s           : ${p.score_180_count}`);
      console.log(`   High finish    : ${p.high_finish}`);
      console.log(`   Best leg       : ${p.best_leg}`);
      console.log();
    });

    // Validate data integrity for first player
    const first = result.players_stats[0];
    console.log('='.repeat(80));
    console.log('DATA VALIDATION (first player):');
    console.log('-'.repeat(80));

    const checks = [
      { label: 'player_id is non-empty string', pass: typeof first.player_id === 'string' && first.player_id.length > 0 },
      { label: 'average_score >= 0', pass: first.average_score >= 0 },
      { label: 'first_nine_avg >= 0', pass: first.first_nine_avg >= 0 },
      { label: 'win_rate is between 0 and 100', pass: first.win_rate >= 0 && first.win_rate <= 100 },
      { label: 'leg_rate is between 0 and 100', pass: first.leg_rate >= 0 && first.leg_rate <= 100 },
      { label: 'score_180_count >= 0', pass: first.score_180_count >= 0 },
      { label: 'best_leg > 0', pass: first.best_leg > 0 },
    ];

    let allPassed = true;
    for (const check of checks) {
      const icon = check.pass ? '✅' : '❌';
      console.log(`  ${icon} ${check.label}`);
      if (!check.pass) allPassed = false;
    }

    console.log();
    console.log('='.repeat(80));
    if (allPassed) {
      console.log('✅ ALL CHECKS PASSED — TEST COMPLETED SUCCESSFULLY');
    } else {
      console.log('❌ SOME CHECKS FAILED');
    }
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

testTournamentStats().catch(console.error);
