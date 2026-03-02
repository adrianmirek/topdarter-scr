import { scrapeLeaguesByKeyword } from "./lib/nakka-scraper.js";

/**
 * Test script for league scraping functionality
 * Tests the complete flow: league discovery -> event scraping -> match fetching
 */
async function testLeagueSync() {
  console.log("=".repeat(60));
  console.log("Testing League Sync Service");
  console.log("=".repeat(60));
  
  // Test with a keyword that should return results
  const keyword = "池袋"; // Ikebukuro - common area for leagues
  
  try {
    console.log(`\n🔍 Searching for leagues with keyword: "${keyword}"`);
    console.log("This may take a few minutes...\n");
    
    const startTime = Date.now();
    const result = await scrapeLeaguesByKeyword(keyword);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Calculate totals from nested structure
    const totalEvents = result.leagues.reduce((sum, league) => sum + league.events.length, 0);
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ Test Complete");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Statistics:`);
    console.log(`   - Leagues found: ${result.leagues.length}`);
    console.log(`   - Completed events found: ${totalEvents}`);
    
    // Show sample data
    if (result.leagues.length > 0) {
      console.log(`\n📋 Sample League:`);
      const sampleLeague = result.leagues[0];
      console.log(`   ID: ${sampleLeague.lgid}`);
      console.log(`   Name: ${sampleLeague.league_name}`);
      console.log(`   Portal: ${sampleLeague.portal_href}`);
      console.log(`   Events: ${sampleLeague.events.length}`);
    }
    
    // Get first event from nested structure
    const firstEvent = result.leagues.find(l => l.events.length > 0)?.events[0];
    if (firstEvent) {
      console.log(`\n📋 Sample Event:`);
      console.log(`   ID: ${firstEvent.event_id}`);
      console.log(`   Name: ${firstEvent.event_name}`);
      console.log(`   League ID: ${firstEvent.league_id}`);
      console.log(`   URL: ${firstEvent.event_href}`);
      console.log(`   Status: ${firstEvent.event_status}`);
      console.log(`   Date: ${firstEvent.event_date.toISOString()}`);
    }
    
    console.log("\n✅ Test passed successfully!");
    
  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testLeagueSync()
  .then(() => {
    console.log("\n👋 Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Unhandled error:", error);
    process.exit(1);
  });
