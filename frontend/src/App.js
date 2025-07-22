import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://universal-fair-scraper-production.up.railway.app';

function App() {
  const [baseUrl, setBaseUrl] = useState('');
  const [discoveredCategories, setDiscoveredCategories] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isScrapingAll, setIsScrapingAll] = useState(false);
  const [results, setResults] = useState('');
  const [status, setStatus] = useState('');
  const [scrapingMethod, setScrapingMethod] = useState('auto'); // 'auto' or 'manual'

  const handleDiscoverCategories = async () => {
    if (!baseUrl) {
      setStatus('Please enter a valid URL');
      return;
    }

    setIsDiscovering(true);
    setStatus('🔍 Discovering available categories...');
    setDiscoveredCategories([]);

    try {
      const response = await axios.post(`${BACKEND_URL}/discover-categories`, { baseUrl });

      if (response.data.success) {
        setDiscoveredCategories(response.data.categories);
        setStatus(`✅ Discovered ${response.data.categories.length} categories!`);
      } else {
        setStatus('❌ Error: ' + response.data.error);
      }
    } catch (error) {
      console.error('Discovery error:', error);
      setStatus('❌ Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleScrapeAll = async () => {
    if (!baseUrl) {
      setStatus('Please enter a valid URL');
      return;
    }

    setIsScrapingAll(true);
    setStatus('🚀 Auto-scraping entire fair (this may take several minutes)...');
    setResults('');

    try {
      const response = await axios.post(`${BACKEND_URL}/scrape-all`, { baseUrl });

      console.log('Auto-scrape response:', response.data);

      if (response.data.success) {
        const formattedResults = formatResultsForNewspaper(response.data.data);
        
        if (formattedResults && formattedResults.trim() !== '') {
          setResults(formattedResults);
          setStatus(`✅ Auto-scraped ${response.data.totalCategories} categories successfully!`);
        } else {
          setStatus('⚠️ Scraping completed but no results were formatted.');
          setResults('No results were formatted. The fair may not have results posted yet.');
        }
      } else {
        setStatus('❌ Error: ' + response.data.error);
      }
    } catch (error) {
      console.error('Auto-scraping error:', error);
      setStatus('❌ Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsScrapingAll(false);
    }
  };

  const formatResultsForNewspaper = (data) => {
    console.log('formatResultsForNewspaper received:', data);
    
    if (!data || typeof data !== 'object') {
      console.error('formatResultsForNewspaper: Invalid data type', typeof data);
      return '';
    }
    
    const categoryKeys = Object.keys(data);
    if (categoryKeys.length === 0) {
      console.error('formatResultsForNewspaper: No categories found');
      return '';
    }
    
    let formatted = '';
    
    categoryKeys.forEach(categoryName => {
      console.log(`Processing category: ${categoryName}`);
      
      const categoryData = data[categoryName];
      
      if (categoryData.error) {
        console.log(`Skipping ${categoryName} due to error:`, categoryData.error);
        return;
      }
      
      if (!categoryData.subcategories || typeof categoryData.subcategories !== 'object') {
        console.log(`No subcategories found for ${categoryName}`);
        return;
      }
      
      const subcategoryNames = Object.keys(categoryData.subcategories);
      if (subcategoryNames.length === 0) {
        console.log(`Empty subcategories for ${categoryName}`);
        return;
      }
      
      // Add category header
      formatted += `**${categoryName}**\n`;
      
      // Process each subcategory
      subcategoryNames.forEach(subcategoryName => {
        const entries = categoryData.subcategories[subcategoryName];
        
        if (!Array.isArray(entries) || entries.length === 0) {
          return;
        }
        
        const formattedEntries = entries.map(entry => {
          let result = entry.name || 'Unknown';
          
          if (entry.club && entry.club.trim() !== '') {
            result += `, ${entry.club}`;
          }
          
          if (entry.placing && entry.placing.trim() !== '') {
            result += `, ${entry.placing}`;
          }
          
          if (entry.awards && entry.awards.trim() !== '') {
            result += `, ${entry.awards}`;
          }
          
          if (entry.ribbon && entry.ribbon.trim() !== '') {
            result += ` - ${entry.ribbon}`;
          }
          
          return result;
        }).filter(entry => entry && entry !== 'Unknown');
        
        if (formattedEntries.length > 0) {
          if (subcategoryName !== 'General') {
            formatted += `${subcategoryName}: ${formattedEntries.join(' ; ')}\n`;
          } else {
            formatted += `${formattedEntries.join(' ; ')}\n`;
          }
        }
      });
      
      formatted += '\n';
    });
    
    return formatted;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(results);
    setStatus('✅ Results copied to clipboard!');
  };

  return (
    <div className="App">
      <div className="container">
        <h1>🏆 Universal Fair Results Scraper</h1>
        <p className="subtitle">Works with any FairEntry.com fair - automatically discovers all categories!</p>
        
        <div className="input-section">
          <label>Fair Results URL:</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Enter any FairEntry.com results URL (e.g., https://fairentry.com/Fair/Results/12345)"
          />
          
          <div className="method-selector">
            <h3>Scraping Method:</h3>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="auto"
                  checked={scrapingMethod === 'auto'}
                  onChange={(e) => setScrapingMethod(e.target.value)}
                />
                🤖 Auto-Scrape Everything (Recommended)
                <span className="method-description">Automatically discovers and scrapes all categories</span>
              </label>
              
              <label>
                <input
                  type="radio"
                  value="manual"
                  checked={scrapingMethod === 'manual'}
                  onChange={(e) => setScrapingMethod(e.target.value)}
                />
                🎯 Manual Category Selection
                <span className="method-description">Discover categories first, then choose which to scrape</span>
              </label>
            </div>
          </div>

          {scrapingMethod === 'auto' && (
            <div className="auto-scrape-section">
              <button 
                onClick={handleScrapeAll} 
                disabled={isScrapingAll || !baseUrl}
                className="scrape-button auto-scrape"
              >
                {isScrapingAll ? '🔄 Auto-Scraping Entire Fair...' : '🚀 Auto-Scrape All Categories'}
              </button>
              <p className="note">This will automatically discover and scrape all available categories. May take 5-10 minutes for large fairs.</p>
            </div>
          )}

          {scrapingMethod === 'manual' && (
            <div className="manual-scrape-section">
              <button 
                onClick={handleDiscoverCategories} 
                disabled={isDiscovering || !baseUrl}
                className="discover-button"
              >
                {isDiscovering ? '🔍 Discovering...' : '🔍 Discover Available Categories'}
              </button>

              {discoveredCategories.length > 0 && (
                <div className="discovered-categories">
                  <h3>📋 Discovered Categories ({discoveredCategories.length}):</h3>
                  <div className="category-list">
                    {discoveredCategories.map((category, index) => (
                      <div key={index} className="category-item-discovered">
                        <span className="category-name">{category.displayName}</span>
                        <span className="category-full">{category.text}</span>
                      </div>
                    ))}
                  </div>
                  <p className="note">Manual selection coming soon - for now use Auto-Scrape mode!</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {status && (
          <div className={`status ${status.includes('❌') ? 'error' : 'success'}`}>
            {status}
          </div>
        )}
        
        {results && results.trim() !== '' && (
          <div className="results-section">
            <h3>📄 Formatted Results for Newspaper:</h3>
            <div className="results-stats">
              <p>Results ready for copy/paste into your newspaper article!</p>
            </div>
            <pre className="results-output">{results}</pre>
            <button onClick={copyToClipboard} className="copy-button">
              📋 Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;