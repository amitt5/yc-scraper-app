# Y Combinator Company Scraper

A Next.js application that scrapes company information from Y Combinator filtered company lists.

## Features

- **Web Scraping**: Uses Playwright to scrape Y Combinator company pages
- **Company Data Extraction**: Extracts name, title, and description for each company
- **Modern UI**: Clean, responsive interface built with Tailwind CSS
- **Real-time Results**: Displays scraped company data in a beautiful format

## How It Works

1. **Input a Y Combinator URL**: Paste a filtered Y Combinator companies URL (e.g., `https://www.ycombinator.com/companies?batch=Spring%202025&query=cursor`)
2. **Automated Scraping**: The app visits the page, finds all company profile links
3. **Data Extraction**: For each company, it extracts:
   - Company name
   - One-line title/tagline
   - Detailed description
4. **Results Display**: Shows all scraped companies in a clean, organized format

## Example

For a URL like: `https://www.ycombinator.com/companies?batch=Spring%202025&query=cursor`

The scraper will find companies like:
- **StarSling** - "Cursor for DevOps" - Full description about their agentic developer homepage

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser** and navigate to `http://localhost:3001`

## API Endpoint

The scraping functionality is available via API at:
- **POST** `/api/scrape`
- **Body**: `{ "url": "https://www.ycombinator.com/companies?..." }`

## Technology Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Playwright** - Web scraping
- **React Hooks** - State management

## Notes

- The scraper is limited to 10 companies per request for testing purposes
- Includes respectful delays between requests
- Handles errors gracefully and continues with other companies if one fails
- Uses headless browser automation for reliable scraping
