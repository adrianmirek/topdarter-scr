// Simple browser console test for league API
// Copy and paste this into browser console at https://n01darts.com/n01/league/
(async () => {
  console.log('Testing League API...');
  
  // Test 1: Search leagues by keyword
  const keyword = 'Ikebukuro'; // Ikebukuro
  const url = `https://tk2-228-23746.vs.sakura.ne.jp/n01/league/n01_league.php?cmd=get_list&skip=0&count=30&keyword=${encodeURIComponent(keyword)}`;
  console.log('API URL:', url);
  
  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json();
  
  console.log('Response:', data);
  console.log('Is array:', Array.isArray(data));
  
  if (Array.isArray(data) && data.length > 0) {
    console.log(`✅ Found ${data.length} leagues`);
    const firstLeague = data[0];
    console.log('First league:', firstLeague);
    console.log('  lgid:', firstLeague.lgid);
    console.log('  title:', firstLeague.title);
    
    // Test 2: Fetch events/seasons from first league
    const lgid = firstLeague.lgid;
    console.log(`\nTesting league portal for lgid: ${lgid}`);
    console.log(`Portal URL: https://n01darts.com/n01/league/portal.php?lgid=${lgid}`);
    console.log('Navigate to the portal URL to see events');
    
  } else {
    console.log('❌ No leagues found or unexpected response format');
  }
})();
