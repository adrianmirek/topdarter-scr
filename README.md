# Darter Assistant Scraper

Vercel serverless function for scraping Nakka tournament data with Playwright + Stealth plugin to bypass Cloudflare protection.

## Features

- 🎯 **Stealth Browser Automation**: Uses Playwright with stealth plugin to bypass Cloudflare
- 🚀 **Serverless Architecture**: Runs on Vercel for automatic scaling
- 🔒 **API Key Authentication**: Optional security layer for production
- 🌐 **CORS Enabled**: Ready for cross-origin requests

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file (optional):

```bash
# Optional: API Key for authentication
SCRAPER_API_KEY=your-secret-key-here

# Allowed origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:4321,https://yourdomain.pages.dev
```

### 3. Local Development

```bash
npm run dev
```

This will start a local Vercel dev server at `http://localhost:3000`

### 4. Deploy to Vercel

```bash
npm run deploy
```

Or push to GitHub and connect to Vercel for automatic deployments.

## API Endpoints

### POST /api/scrape-tournaments

Scrapes tournaments by keyword from Nakka.

**Request:**
```json
{
  "keyword": "agawa"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "nakka_identifier": "t_ABC_123",
      "tournament_name": "Agawa Tournament 2024",
      "href": "https://n01darts.com/n01/tournament/comp.php?id=t_ABC_123",
      "tournament_date": "2024-12-20T19:00:00.000Z",
      "status": "completed"
    }
  ],
  "count": 1
}
```

### POST /api/scrape-matches

Scrapes all matches from a tournament page.

**Request:**
```json
{
  "tournamentHref": "https://n01darts.com/n01/tournament/comp.php?id=t_ABC_123"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "nakka_match_identifier": "t_ABC_123_rr_1_P1_P2",
      "match_type": "rr",
      "first_player_name": "John Doe",
      "first_player_code": "P1",
      "second_player_name": "Jane Smith",
      "second_player_code": "P2",
      "href": "https://n01darts.com/n01/tournament/n01_view.html?tmid=t_ABC_123_rr_1_P1_P2"
    }
  ],
  "count": 1
}
```

### POST /api/scrape-player-results

Scrapes detailed player statistics from a match page.

**Request:**
```json
{
  "matchHref": "https://n01darts.com/n01/tournament/n01_view.html?tmid=t_ABC_123_rr_1_P1_P2",
  "nakkaMatchIdentifier": "t_ABC_123_rr_1_P1_P2"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "nakka_match_player_identifier": "t_ABC_123_rr_1_P1",
      "average_score": 65.5,
      "first_nine_avg": 68.2,
      "checkout_percentage": 33.3,
      "score_60_count": 5,
      "score_100_count": 3,
      "score_140_count": 1,
      "score_180_count": 0,
      "high_finish": 120,
      "best_leg": 15,
      "worst_leg": 21,
      "player_score": 3,
      "opponent_score": 2
    }
  ],
  "count": 2
}
```

## Authentication

If you set the `SCRAPER_API_KEY` environment variable, all requests must include the API key in the header:

```bash
curl -X POST https://your-scraper.vercel.app/api/scrape-tournaments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key-here" \
  -d '{"keyword": "agawa"}'
```

## Vercel Configuration

The `vercel.json` file configures:
- **Max Duration**: 60 seconds per function
- **Memory**: 1024 MB for browser operations
- **Playwright**: Automatic browser download enabled

## Project Structure

```
darterassistant-scraper/
├── api/                          # Vercel serverless functions
│   ├── scrape-tournaments.ts     # Tournament scraping endpoint
│   ├── scrape-matches.ts         # Match scraping endpoint
│   └── scrape-player-results.ts  # Player results scraping endpoint
├── lib/                          # Core logic
│   ├── types.ts                  # TypeScript interfaces
│   ├── constants.ts              # Constants (URLs, status codes)
│   └── nakka-scraper.ts          # Playwright scraping logic
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

## Tech Stack

- **Playwright Extra**: Browser automation with plugin support
- **Puppeteer Stealth Plugin**: Bypass bot detection (Cloudflare)
- **Vercel Serverless Functions**: Hosting and deployment
- **TypeScript**: Type safety

## Notes

- Scraping is performed with stealth techniques to bypass Cloudflare
- Each function has a 60-second timeout limit (Vercel max)
- Retry logic is built-in for timeout errors
- Browser runs in headless mode for performance

## License

MIT

