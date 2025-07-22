import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://universal-fair-scraper-production.up.railway.app';

function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  
  // Your existing app state
  const [baseUrl, setBaseUrl] = useState('');
  const [discoveredCategories, setDiscoveredCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [scrapedCategories, setScrapedCategories] = useState([]); // Track what's been scraped
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isScrapingAll, setIsScrapingAll] = useState(false);
  const [isScrapingSelected, setIsScrapingSelected] = useState(false);
  const [results, setResults] = useState('');
  const [status, setStatus] = useState('');
  const [scrapingMethod, setScrapingMethod] = useState('auto'); // 'auto' or 'manual'

  // Check for saved auth token on component mount
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      setAuthToken(savedToken);
      setIsAuthenticated(true);
    }
    
    // Load previously scraped categories for this URL
    const savedScrapedCategories = localStorage.getItem(`scrapedCategories_${baseUrl}`);
    if (savedScrapedCategories) {
      setScrapedCategories(JSON.parse(savedScrapedCategories));
    }
  }, [baseUrl]);

  // Save scraped categories when they change
  useEffect(() => {
    if (baseUrl && scrapedCategories.length > 0) {
      localStorage.setItem(`scrapedCategories_${baseUrl}`, JSON.stringify(scrapedCategories));
    }
  }, [scrapedCategories, baseUrl]);

  // Configure axios with authentication headers
  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const response = await axios.post(`${BACKEND_URL}/auth/verify`, {
        password: password
      });

      if (response.data.success) {
        setAuthToken(password);
        setIsAuthenticated(true);
        localStorage.setItem('authToken', password);
        setAuthSuccess('Successfully authenticated!');
        setTimeout(() => setAuthSuccess(''), 3000);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Authentication failed';
      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthToken('');
    setPassword('');
    localStorage.removeItem('authToken');
    // Reset all app state
    setBaseUrl('');
    setDiscoveredCategories([]);
    setSelectedCategories([]);
    setScrapedCategories([]);
    setResults('');
    setStatus('');
    setScrapingMethod('auto');
  };

  const handleDiscoverCategories = async () => {
    if (!baseUrl) {
      setStatus('Please enter a valid URL');
      return;
    }

    setIsDiscovering(true);
    setStatus('🔍 Discovering available categories...');
    setDiscoveredCategories([]);

    try {
      const response = await axios.post(`${BACKEND_URL}/discover-categories`, 
        { baseUrl }, 
        { headers: getAuthHeaders() }
      );

      if (response.data.success) {
        setDiscoveredCategories(response.data.categories);
        setStatus(`✅ Discovered ${response.data.categories.length} categories!`);
        
        // Load previously scraped categories for this URL
        const savedScrapedCategories = localStorage.getItem(`scrapedCategories_${baseUrl}`);
        if (savedScrapedCategories) {
          setScrapedCategories(JSON.parse(savedScrapedCategories));
        } else {
          setScrapedCategories([]);
        }
      } else {
        setStatus('❌ Error: ' + response.data.error);
      }
    } catch (error) {
      console.error('Discovery error:', error);
      if (error.response?.status === 401) {
        setAuthError('Session expired. Please login again.');
        handleLogout();
      } else {
        setStatus('❌ Error: ' + (error.response?.data?.error || error.message));
      }
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
      const response = await axios.post(`${BACKEND_URL}/scrape-all`, 
        { baseUrl }, 
        { headers: getAuthHeaders() }
      );

      console.log('Auto-scrape response:', response.data);

      if (response.data.success) {
        const formattedResults = formatResultsForNewspaper(response.data.data);
        
        if (formattedResults && formattedResults.trim() !== '') {
          setResults(formattedResults);
          setStatus(`✅ Auto-scraped ${response.data.totalCategories} categories successfully!`);
          
          // Mark all categories as scraped
          const allCategoryNames = response.data.discoveredCategories || [];
          setScrapedCategories(allCategoryNames);
        } else {
          setStatus('⚠️ Scraping completed but no results were formatted.');
          setResults('No results were formatted. The fair may not have results posted yet.');
        }
      } else {
        setStatus('❌ Error: ' + response.data.error);
      }
    } catch (error) {
      console.error('Auto-scraping error:', error);
      if (error.response?.status === 401) {
        setAuthError('Session expired. Please login again.');
        handleLogout();
      } else {
        setStatus('❌ Error: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setIsScrapingAll(false);
    }
  };

  const handleScrapeSelected = async () => {
    if (selectedCategories.length === 0) {
      setStatus('Please select at least one category to scrape');
      return;
    }

    setIsScrapingSelected(true);
    setStatus(`🎯 Scraping ${selectedCategories.length} selected categories...`);
    setResults('');

    try {
      // Get the full category objects for selected categories
      const categoriesToScrape = discoveredCategories.filter(cat => 
        selectedCategories.includes(cat.displayName)
      );

      const response = await axios.post(`${BACKEND_URL}/scrape-all`, 
        { 
          baseUrl,
          categories: categoriesToScrape // Send selected categories to backend
        }, 
        { headers: getAuthHeaders() }
      );

      console.log('Selected scrape response:', response.data);

      if (response.data.success) {
        const formattedResults = formatResultsForNewspaper(response.data.data);
        
        if (formattedResults && formattedResults.trim() !== '') {
          setResults(formattedResults);
          setStatus(`✅ Successfully scraped ${selectedCategories.length} selected categories!`);
          
          // Add newly scraped categories to the scraped list
          const newlyScraped = [...new Set([...scrapedCategories, ...selectedCategories])];
          setScrapedCategories(newlyScraped);
          
          // Clear selection after successful scrape
          setSelectedCategories([]);
        } else {
          setStatus('⚠️ Scraping completed but no results were formatted.');
          setResults('No results were formatted. The selected categories may not have results posted yet.');
        }
      } else {
        setStatus('❌ Error: ' + response.data.error);
      }
    } catch (error) {
      console.error('Selected scraping error:', error);
      if (error.response?.status === 401) {
        setAuthError('Session expired. Please login again.');
        handleLogout();
      } else {
        setStatus('❌ Error: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setIsScrapingSelected(false);
    }
  };

  const handleCategoryToggle = (categoryName) => {
    if (selectedCategories.includes(categoryName)) {
      setSelectedCategories(selectedCategories.filter(name => name !== categoryName));
    } else {
      setSelectedCategories([...selectedCategories, categoryName]);
    }
  };

  const handleSelectAll = () => {
    if (selectedCategories.length === discoveredCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(discoveredCategories.map(cat => cat.displayName));
    }
  };

  const handleSelectNew = () => {
    const newCategories = discoveredCategories
      .filter(cat => !scrapedCategories.includes(cat.displayName))
      .map(cat => cat.displayName);
    setSelectedCategories(newCategories);
  };

  const clearScrapedHistory = () => {
    setScrapedCategories([]);
    localStorage.removeItem(`scrapedCategories_${baseUrl}`);
    setStatus('✅ Scraped history cleared');
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

  // Login Form Component
  if (!isAuthenticated) {
    return (
      <div className="App">
        <div className="container">
          <h1>🏆 Universal Fair Results Scraper</h1>
          <div className="auth-container">
            <h2>🔒 Please Enter Password</h2>
            <p className="auth-subtitle">Authentication required to access the scraper</p>
            <form onSubmit={handleLogin} className="auth-form">
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={authLoading}
                required
                className="auth-input"
              />
              <button type="submit" disabled={authLoading} className="auth-button">
                {authLoading ? '🔄 Verifying...' : '🔐 Login'}
              </button>
            </form>
            {authError && <div className="auth-error">❌ {authError}</div>}
            {authSuccess && <div className="auth-success">✅ {authSuccess}</div>}
          </div>
        </div>
      </div>
    );
  }

  // Main App Component
  return (
    <div className="App">
      <div className="container">
        <div className="header-section">
          <h1>🏆 Universal Fair Results Scraper</h1>
          <button onClick={handleLogout} className="logout-button">
            🚪 Logout
          </button>
        </div>
        <p className="subtitle">Works with any FairEntry.com fair - automatically discovers all categories!</p>
        
        <div className="input-section">
          <label>Fair Results URL:</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setDiscoveredCategories([]);
              setSelectedCategories([]);
              setScrapedCategories([]);
            }}
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
                  <div className="categories-header">
                    <h3>📋 Discovered Categories ({discoveredCategories.length}):</h3>
                    {scrapedCategories.length > 0 && (
                      <div className="scraped-info">
                        <span>Previously scraped: {scrapedCategories.length}</span>
                        <button onClick={clearScrapedHistory} className="clear-history-btn">
                          Clear History
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="category-controls">
                    <button 
                      onClick={handleSelectAll} 
                      className="control-button"
                      disabled={isScrapingSelected}
                    >
                      {selectedCategories.length === discoveredCategories.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button 
                      onClick={handleSelectNew} 
                      className="control-button select-new"
                      disabled={isScrapingSelected}
                    >
                      Select New Only ({discoveredCategories.filter(cat => !scrapedCategories.includes(cat.displayName)).length})
                    </button>
                    <button 
                      onClick={handleScrapeSelected} 
                      disabled={isScrapingSelected || selectedCategories.length === 0}
                      className="scrape-button scrape-selected"
                    >
                      {isScrapingSelected ? `🔄 Scraping ${selectedCategories.length}...` : `🎯 Scrape Selected (${selectedCategories.length})`}
                    </button>
                  </div>

                  <div className="category-list">
                    {discoveredCategories.map((category, index) => {
                      const isScraped = scrapedCategories.includes(category.displayName);
                      const isSelected = selectedCategories.includes(category.displayName);
                      
                      return (
                        <div key={index} className={`category-item-selectable ${isScraped ? 'scraped' : ''}`}>
                          <label className="category-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleCategoryToggle(category.displayName)}
                              disabled={isScrapingSelected}
                            />
                            <div className="category-info">
                              <span className="category-name">
                                {category.displayName}
                                {isScraped && <span className="scraped-badge">✓ Scraped</span>}
                              </span>
                              <span className="category-full">{category.text}</span>
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
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
        
        {authError && <div className="auth-error-inline">⚠️ {authError}</div>}
      </div>
    </div>
  );
}

export default App;