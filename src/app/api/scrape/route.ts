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

    // Create a ReadableStream for streaming responses
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        (async () => {
          try {
            await scrapeCompanies(url, controller, encoder);
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Request parsing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to parse request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function scrapeCompanies(url: string, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
  try {
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

      // Handle infinite scroll / lazy loading to get ALL companies
      console.log('Scrolling to load all companies...');
      
      let previousCompanyCount = 0;
      let currentCompanyCount = 0;
      let maxScrollAttempts = 20; // Prevent infinite loop
      let scrollAttempts = 0;
      
      // Keep scrolling until no more companies are loaded
      do {
        previousCompanyCount = currentCompanyCount;
        
        // Scroll to bottom of page
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        
        // Wait for new content to load
        await page.waitForTimeout(2000);
        
        // Count current companies
        currentCompanyCount = await page.evaluate(() => {
          const allLinks = document.querySelectorAll('a[href*="/companies/"]');
          return Array.from(allLinks)
            .map(link => (link as HTMLAnchorElement).href)
            .filter(href => {
              return href && 
                     href.includes('ycombinator.com/companies/') && 
                     !href.endsWith('/companies') && 
                     !href.endsWith('/companies/') &&
                     !href.includes('/companies?') &&
                     !href.includes('/companies/founders') &&
                     !href.includes('/companies/industry/') &&
                     !href.includes('/companies/location/') &&
                     !href.includes('/companies/batch/') &&
                     !href.includes('#') &&
                     !href.includes('/jobs');
            })
            .filter((url, index, array) => array.indexOf(url) === index)
            .length;
        });
        
        scrollAttempts++;
        console.log(`Scroll attempt ${scrollAttempts}: Found ${currentCompanyCount} companies (was ${previousCompanyCount})`);
        
        // If we've tried too many times, break out
        if (scrollAttempts >= maxScrollAttempts) {
          console.log('Max scroll attempts reached, proceeding with current companies');
          break;
        }
        
      } while (currentCompanyCount > previousCompanyCount);
      
      console.log(`Finished loading companies. Total found: ${currentCompanyCount}`);

      // Extract company profile links using stable href patterns instead of dynamic CSS classes
      console.log('Extracting all company links...');
      
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
        // Send error message
        const errorMsg = { 
          type: 'error',
          message: 'No company links found. The page might not have loaded properly or the structure has changed.'
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMsg) + '\n'));
        return;
      }

      // Send initial progress message
      const initialMsg = { 
        type: 'progress',
        message: `Found ${companyLinks.length} companies. Starting to scrape...`,
        total: companyLinks.length,
        current: 0
      };
      controller.enqueue(encoder.encode(JSON.stringify(initialMsg) + '\n'));

      const companies: CompanyData[] = [];

      // Visit each company profile and extract data
      for (const [index, companyUrl] of companyLinks.entries()) {
        try {
          // Send progress update
          const progressMsg = { 
            type: 'progress',
            message: `Scraping company ${index + 1}/${companyLinks.length}`,
            total: companyLinks.length,
            current: index + 1,
            currentUrl: companyUrl
          };
          controller.enqueue(encoder.encode(JSON.stringify(progressMsg) + '\n'));
          
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
            const company = {
              ...companyData,
              url: companyUrl,
            };
            companies.push(company);
            
            // Send the company data immediately
            const companyMsg = { 
              type: 'company',
              data: company
            };
            controller.enqueue(encoder.encode(JSON.stringify(companyMsg) + '\n'));
            
            console.log(`Successfully scraped: ${companyData.name} - ${companyData.title}`);
          } else {
            console.log(`Failed to extract name for: ${companyUrl}`);
            
            // Send error for this specific company
            const errorMsg = { 
              type: 'company_error',
              message: `Failed to extract data for company: ${companyUrl}`,
              url: companyUrl
            };
            controller.enqueue(encoder.encode(JSON.stringify(errorMsg) + '\n'));
          }

          // Small delay to be respectful
          await page.waitForTimeout(500);

        } catch (error) {
          console.error(`Error scraping company ${companyUrl}:`, error);
          
          // Send error for this specific company
          const errorMsg = { 
            type: 'company_error',
            message: `Error scraping company: ${error instanceof Error ? error.message : 'Unknown error'}`,
            url: companyUrl
          };
          controller.enqueue(encoder.encode(JSON.stringify(errorMsg) + '\n'));
          
          // Continue with next company even if one fails
        }
      }

      await browser.close();

      console.log(`Successfully scraped ${companies.length} companies`);

      // Send completion message
      const completionMsg = { 
        type: 'complete',
        message: `Successfully scraped ${companies.length} companies`,
        totalScraped: companies.length,
        totalFound: companyLinks.length
      };
      controller.enqueue(encoder.encode(JSON.stringify(completionMsg) + '\n'));

    } catch (error) {
      await browser.close();
      throw error;
    }

  } catch (error) {
    console.error('Scraping error:', error);
    
    // Send error message
    const errorMsg = { 
      type: 'error',
      message: 'Failed to scrape companies',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
    controller.enqueue(encoder.encode(JSON.stringify(errorMsg) + '\n'));
  }
} 