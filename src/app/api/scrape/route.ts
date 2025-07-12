import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

interface CompanyData {
  name: string;
  title: string;
  description: string;
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate that it's a Y Combinator URL
    if (!url.includes('ycombinator.com/companies')) {
      return NextResponse.json(
        { error: 'Please provide a valid Y Combinator companies URL' },
        { status: 400 }
      );
    }

    console.log('Starting to scrape:', url);

    // Launch browser
    const browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    const page = await context.newPage();

    try {
      // Visit the Y Combinator companies list page
      console.log('Visiting YC companies page...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for the page content to load (using a more general approach)
      console.log('Waiting for page content to load...');
      await page.waitForTimeout(3000); // Give time for content to load

      // Extract company profile links using stable href patterns instead of dynamic CSS classes
      console.log('Extracting company links...');
      
      const companyLinks = await page.evaluate(() => {
        // Get all links that point to individual company pages
        // Use href pattern instead of dynamic CSS classes
        const allLinks = document.querySelectorAll('a[href*="/companies/"]');
        
        const companyUrls = Array.from(allLinks)
          .map(link => (link as HTMLAnchorElement).href)
          .filter(href => {
            // Only include individual company pages, not the main companies directory
            return href && 
                   href.includes('ycombinator.com/companies/') && 
                   !href.endsWith('/companies') && 
                   !href.endsWith('/companies/') &&
                   !href.includes('/companies?') && // Exclude filtered search pages
                   !href.includes('/companies/founders') && // Exclude founder directory
                   !href.includes('/companies/industry/') && // Exclude industry pages
                   !href.includes('/companies/location/') && // Exclude location pages
                   !href.includes('/companies/batch/') && // Exclude batch pages
                   !href.includes('#') && // Exclude anchor links
                   !href.includes('/jobs'); // Exclude job links
          })
          // Remove duplicates
          .filter((url, index, array) => array.indexOf(url) === index);

        return companyUrls;
      });

      console.log(`Found ${companyLinks.length} company links:`, companyLinks);

      if (companyLinks.length === 0) {
        // Try to get more info about the page for debugging
        const pageTitle = await page.title();
        const pageUrl = page.url();
        
        return NextResponse.json(
          { 
            error: 'No company links found. The page might not have loaded properly or the structure has changed.',
            debug: {
              pageTitle,
              pageUrl,
              message: 'Try refreshing the Y Combinator page and make sure it shows a list of companies'
            }
          },
          { status: 404 }
        );
      }

      const companies: CompanyData[] = [];

      // Visit each company profile and extract data
      for (const [index, companyUrl] of companyLinks.entries()) {
        try {
          console.log(`Scraping company ${index + 1}/${companyLinks.length}: ${companyUrl}`);
          
          // Use domcontentloaded instead of networkidle to avoid hanging
          await page.goto(companyUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000 
          });
          
          // Wait a bit for content to render after DOM loads
          await page.waitForTimeout(2000);
          
          // Wait for company data to load
          try {
            await page.waitForSelector('h1.text-3xl', { timeout: 5000 });
          } catch (e) {
            // If specific selector not found, wait a bit more and continue
            await page.waitForTimeout(1000);
          }

          // Extract company name, title, and description using exact selectors from the HTML
          const companyData = await page.evaluate(() => {
            // Company name - using the exact selector from the HTML
            let name = '';
            const nameElement = document.querySelector('h1.text-3xl.font-bold');
            if (nameElement?.textContent?.trim()) {
              name = nameElement.textContent.trim();
            }

            // Company title/tagline - using the exact selector from the HTML
            let title = '';
            const titleElement = document.querySelector('div.text-xl');
            if (titleElement?.textContent?.trim()) {
              title = titleElement.textContent.trim();
            }

            // Company description - using the exact selector from the HTML
            let description = '';
            const descriptionElement = document.querySelector('div.prose.max-w-full.whitespace-pre-line');
            if (descriptionElement?.textContent?.trim()) {
              description = descriptionElement.textContent.trim();
            }

            // If no description found with the exact selector, try fallback approaches
            if (!description) {
              // Try other common selectors for description content
              const fallbackSelectors = [
                '.prose.max-w-full',
                'section .prose',
                'div[class*="prose"]'
              ];
              
              for (const selector of fallbackSelectors) {
                const element = document.querySelector(selector);
                const text = element?.textContent?.trim() || '';
                if (text.length > 50 && text !== name && text !== title) {
                  description = text;
                  break;
                }
              }
            }

            return { name, title, description };
          });

          if (companyData.name) {
            companies.push({
              ...companyData,
              url: companyUrl,
            });
            console.log(`Successfully scraped: ${companyData.name} - ${companyData.title}`);
          } else {
            console.log(`Failed to extract name for: ${companyUrl}`);
          }

          // Small delay to be respectful
          await page.waitForTimeout(500);

        } catch (error) {
          console.error(`Error scraping company ${companyUrl}:`, error);
          // Continue with next company even if one fails
        }
      }

      await browser.close();

      console.log(`Successfully scraped ${companies.length} companies`);

      return NextResponse.json({
        success: true,
        count: companies.length,
        companies: companies,
      });

    } catch (error) {
      await browser.close();
      throw error;
    }

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to scrape companies',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 