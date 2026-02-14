import { chromium } from "playwright-core";

/**
 * Test script to find the exact tournament search API endpoint
 * by monitoring network requests and testing direct API calls
 */
async function testTournamentApi() {
  console.log("Launching browser...");
  
  const browser = await chromium.launch({
    headless: false, // Set to false to see what's happening
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });

  const page = await context.newPage();

  // Capture ALL network requests
  const apiCalls: { url: string; method: string; response?: any }[] = [];
  
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes(".php") || url.includes("api") || url.includes("tournament")) {
      console.log(`📤 REQUEST: ${request.method()} ${url}`);
      apiCalls.push({ url, method: request.method() });
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes(".php") && (url.includes("tournament") || url.includes("cmd"))) {
      console.log(`📥 RESPONSE: ${response.status()} ${url}`);
      try {
        const contentType = response.headers()["content-type"];
        if (contentType?.includes("json")) {
          const data = await response.json();
          console.log(`   JSON Response preview:`, JSON.stringify(data).substring(0, 200));
          
          const apiCall = apiCalls.find(c => c.url === url);
          if (apiCall) {
            apiCall.response = data;
          }
        }
      } catch (e) {
        console.log(`   Failed to parse response:`, e);
      }
    }
  });

  console.log("\n🔍 Navigating to search page...");
  await page.goto("https://n01darts.com/n01/tournament/?keyword=agawa", {
    waitUntil: "domcontentloaded",
  });

  console.log("⏳ Waiting for network activity...");
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
    console.log("   Network didn't go idle, continuing...");
  });

  console.log("\n📋 Summary of API calls captured:");
  apiCalls.forEach((call, index) => {
    console.log(`\n${index + 1}. ${call.method} ${call.url}`);
    if (call.response) {
      const preview = JSON.stringify(call.response);
      console.log(`   Response: ${preview.substring(0, 300)}...`);
    }
  });

  // Now test direct API calls using page.evaluate
  console.log("\n\n🧪 Testing direct API calls...");
  
  const testUrls = [
    "https://n01darts.com/n01/tournament/n01_tournament.php?cmd=get_list&keyword=agawa",
    "https://n01darts.com/n01/n01_tournament.php?cmd=get_list&keyword=agawa",
    "https://n01darts.com/n01_tournament.php?cmd=get_list&keyword=agawa",
    "https://n01darts.com/tournament/n01_tournament.php?cmd=get_list&keyword=agawa",
  ];

  for (const testUrl of testUrls) {
    console.log(`\n🔬 Testing: ${testUrl}`);
    const result = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = text.substring(0, 200);
        }
        return { 
          success: true, 
          status: res.status, 
          statusText: res.statusText,
          data,
          isArray: Array.isArray(data),
          length: Array.isArray(data) ? data.length : null
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }, testUrl);

    if (result.success) {
      console.log(`   ✅ Status: ${result.status} ${result.statusText}`);
      console.log(`   Is Array: ${result.isArray}, Length: ${result.length}`);
      console.log(`   Data preview:`, JSON.stringify(result.data).substring(0, 300));
    } else {
      console.log(`   ❌ Failed:`, result.error);
    }
  }

  console.log("\n\n✅ Test complete! Check the output above.");
  console.log("Press any key to close the browser...");
  
  // Keep browser open to inspect
  await new Promise(() => {});
  await browser.close();
}

testTournamentApi().catch(console.error);
