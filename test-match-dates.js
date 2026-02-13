import { scrapeTournamentsByKeyword, scrapeTournamentMatches } from './dist/lib/nakka-scraper.js';

async function testMatchDates() {
  console.log('='.repeat(80));
  console.log('Testing Match Date Functionality with "Amator" keyword');
  console.log('='.repeat(80));
  console.log();

  try {
    // Step 1: Search for tournaments
    console.log('Step 1: Searching for "Amator under 40 Złota Bila 5 Cykl 5/5" tournaments...');
    const tournaments = await scrapeTournamentsByKeyword('Amator under 40 Złota Bila 5 Cykl 5/5');
    
    if (tournaments.length === 0) {
      console.log('❌ No tournaments found for "Amator"');
      return;
    }
    
    console.log(`✅ Found ${tournaments.length} tournament(s)\n`);
    
    // Step 2: Get the first tournament
    const firstTournament = tournaments[0];
    console.log('Step 2: Testing with first tournament:');
    console.log(`  Tournament: ${firstTournament.tournament_name}`);
    console.log(`  Date: ${firstTournament.tournament_date}`);
    console.log(`  URL: ${firstTournament.href}`);
    console.log();
    
    // Step 3: Scrape matches
    console.log('Step 3: Scraping matches from tournament...');
    const matches = await scrapeTournamentMatches(firstTournament.href);
    
    if (matches.length === 0) {
      console.log('❌ No matches found in tournament');
      return;
    }
    
    console.log(`✅ Found ${matches.length} match(es)\n`);
    
    // Step 4: Display results
    console.log('='.repeat(80));
    console.log('MATCH RESULTS WITH DATES:');
    console.log('='.repeat(80));
    console.log();
    
    const matchesWithDates = matches.filter(m => m.match_date);
    const matchesWithoutDates = matches.filter(m => !m.match_date);
    
    console.log(`📊 Statistics:`);
    console.log(`  Total matches: ${matches.length}`);
    console.log(`  Matches with dates: ${matchesWithDates.length} (${Math.round(matchesWithDates.length / matches.length * 100)}%)`);
    console.log(`  Matches without dates: ${matchesWithoutDates.length}`);
    console.log();
    
    // Display first 5 matches with dates
    console.log('📅 Sample matches with dates (first 5):');
    console.log('-'.repeat(80));
    matchesWithDates.slice(0, 5).forEach((match, index) => {
      console.log(`${index + 1}. ${match.first_player_name} vs ${match.second_player_name}`);
      console.log(`   Type: ${match.match_type}`);
      console.log(`   Date: ${match.match_date ? new Date(match.match_date).toISOString() : 'No date'}`);
      console.log(`   ID: ${match.nakka_match_identifier}`);
      console.log();
    });
    
    if (matchesWithoutDates.length > 0) {
      console.log('⚠️  Sample matches WITHOUT dates (first 3):');
      console.log('-'.repeat(80));
      matchesWithoutDates.slice(0, 3).forEach((match, index) => {
        console.log(`${index + 1}. ${match.first_player_name} vs ${match.second_player_name}`);
        console.log(`   Type: ${match.match_type}`);
        console.log(`   Date: ${match.match_date || 'No date'}`);
        console.log(`   ID: ${match.nakka_match_identifier}`);
        console.log();
      });
    }
    
    console.log('='.repeat(80));
    console.log('✅ TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testMatchDates().catch(console.error);
