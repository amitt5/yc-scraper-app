'use client';

import { useState } from 'react';

interface CompanyData {
  name: string;
  title: string;
  description: string;
  url: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [error, setError] = useState<string>('');

  const handleScrape = async () => {
    if (!url.trim()) {
      setError('Please enter a valid Y Combinator URL');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setCompanies([]);
    
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape companies');
      }

      setCompanies(data.companies || []);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while scraping');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Y Combinator Company Scraper
            </h1>
            <p className="text-gray-600 text-lg">
              Extract company information from Y Combinator filtered lists
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                Y Combinator URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.ycombinator.com/companies?batch=Spring%202025&query=cursor"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
            </div>

            <button
              onClick={handleScrape}
              disabled={isLoading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Scraping Companies...</span>
                </>
              ) : (
                <span>Scrape Companies</span>
              )}
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Example: Paste a Y Combinator companies URL with filters to extract company details
            </p>
          </div>
        </div>

        {/* Results Section */}
        {companies.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Scraped Companies ({companies.length})
            </h2>
            
            <div className="space-y-6">
              {companies.map((company, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {company.name}
                    </h3>
                    {company.title && (
                      <p className="text-lg text-orange-600 font-medium mb-3">
                        {company.title}
                      </p>
                    )}
                    {company.description && (
                      <p className="text-gray-700 leading-relaxed">
                        {company.description}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <a
                      href={company.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 hover:text-orange-600 text-sm font-medium hover:underline"
                    >
                      View Company Profile →
                    </a>
                    <span className="text-xs text-gray-400">
                      Company #{index + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
