const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Testing sakura.ne.jp API endpoint...\n');
  
  const url = 'https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_tournament.php?cmd=get_list&keyword=agawa';
  
  const result = await page.goto(url);
  const text = await page.textContent('body');
  
  try {
    const data = JSON.parse(text);
    console.log('âœ… SUCCESS! API returned JSON data');
    console.log(   Type: );
    console.log(   Length: );
    console.log('\nðŸ“‹ First 3 tournaments:');
    if (Array.isArray(data)) {
      data.slice(0, 3).forEach((item, i) => {
        console.log(\n. );
        console.log(   ID: , Status: );
      });
    }
    console.log('\nâœ… API URL WORKS!');
  } catch (e) {
    console.log('âŒ Not JSON:', text.substring(0, 200));
  }
  
  await browser.close();
})();
