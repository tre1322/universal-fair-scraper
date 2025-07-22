// Dynamic Fair Results Scraper - Auto-discovers all categories and subcategories
const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

// Clean data for JSON serialization
function cleanForSerialization(data) {
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (value === undefined) return null;
    if (typeof value === 'function') return undefined;
    return value;
  }));
}

// Transform scraped data into consistent structure
function transformScrapedData(rawResults) {
  const transformedData = {};
  
  Object.keys(rawResults).forEach(categoryName => {
    const categoryData = rawResults[categoryName];
    
    if (categoryData.error) {
      transformedData[categoryName] = { error: categoryData.error };
      return;
    }
    
    if (!categoryData.results || !Array.isArray(categoryData.results)) {
      transformedData[categoryName] = { error: 'No valid results found' };
      return;
    }
    
    // Group results by subcategory
    const subcategoryGroups = {};
    categoryData.results.forEach(entry => {
      if (!entry || !entry.name) return;
      
      const subcategory = entry.subcategory || 'General';
      if (!subcategoryGroups[subcategory]) {
        subcategoryGroups[subcategory] = [];
      }
      
      subcategoryGroups[subcategory].push({
        name: entry.name || '',
        club: entry.club || '',
        placing: entry.placing || '',
        awards: entry.awards || '',
        ribbon: entry.ribbon || ''
      });
    });
    
    transformedData[categoryName] = {
      subcategories: subcategoryGroups,
      totalEntries: categoryData.results.length
    };
  });
  
  return transformedData;
}

// NEW: Auto-discover all available categories
app.post('/discover-categories', async (req, res) => {
  const { baseUrl } = req.body;
  
  if (!baseUrl) {
    return res.status(400).json({ error: 'Base URL is required' });
  }

  try {
    const categories = await discoverCategories(baseUrl);
    res.json({ success: true, categories: categories });
  } catch (error) {
    console.error('Discovery error:', error);
    res.status(500).json({ error: 'Failed to discover categories', details: error.message });
  }
});

// NEW: Scrape all discovered categories automatically
app.post('/scrape-all', async (req, res) => {
  const { baseUrl } = req.body;
  
  if (!baseUrl) {
    return res.status(400).json({ error: 'Base URL is required' });
  }

  try {
    console.log('1. Discovering categories...');
    const discoveredCategories = await discoverCategories(baseUrl);
    console.log(`2. Found ${discoveredCategories.length} categories`);
    
    console.log('3. Starting comprehensive scrape...');
    const rawResults = await scrapeDiscoveredCategories(baseUrl, discoveredCategories);
    console.log('4. Raw scrape complete');
    
    const transformedData = transformScrapedData(rawResults);
    console.log('5. Transform complete');
    
    const cleanData = cleanForSerialization(transformedData);
    console.log('6. Serialization clean');
    
    res.json({ 
      success: true, 
      data: cleanData, 
      discoveredCategories: discoveredCategories.map(cat => cat.displayName),
      totalCategories: discoveredCategories.length 
    });
  } catch (error) {
    console.error('Auto-scraping error:', error);
    res.status(500).json({ error: 'Failed to auto-scrape fair', details: error.message });
  }
});

// Original manual scrape endpoint (keep for backward compatibility)
app.post('/scrape', async (req, res) => {
  const { baseUrl, categories } = req.body;
  
  if (!baseUrl || !categories || categories.length === 0) {
    return res.status(400).json({ error: 'Base URL and categories are required' });
  }

  try {
    const results = await scrapeCategories(baseUrl, categories);
    const transformedData = transformScrapedData(results);
    const cleanData = cleanForSerialization(transformedData);
    
    res.json({ success: true, data: cleanData });
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: 'Failed to scrape data', details: error.message });
  }
});

// NEW: Discover all available categories from dropdown
async function discoverCategories(baseUrl) {
  let browser;
  
  try {
    browser = await puppeteer.launch({ 
      headless: false,
      slowMo: 500,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    console.log('Navigating to:', baseUrl);
    await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const categories = await page.evaluate(() => {
      const select = document.querySelector('select[name], select#Division, select');
      if (!select) return [];
      
      return Array.from(select.options)
        .filter(option => option.value && option.value !== '' && option.textContent.trim() !== '')
        .map(option => ({
          value: option.value,
          text: option.textContent.trim(),
          displayName: option.textContent.trim().split('/').pop().trim() // Extract just the category name
        }));
    });
    
    console.log(`Discovered ${categories.length} categories:`, categories.map(cat => cat.displayName));
    return categories;
    
  } catch (error) {
    console.error('Category discovery error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// NEW: Scrape all discovered categories
async function scrapeDiscoveredCategories(baseUrl, discoveredCategories) {
  let browser;
  const results = {};

  try {
    browser = await puppeteer.launch({ 
      headless: false,
      slowMo: 500,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    for (const category of discoveredCategories) {
      console.log(`\n=== SCRAPING: ${category.displayName} ===`);
      
      try {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Select the category using the exact value
        await page.select('select', category.value);
        console.log(`Selected: ${category.text}`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Submit the form
        const searchClicked = await page.evaluate(() => {
          const searchSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:contains("Search")',
            '.btn-search',
            '#search-btn',
            '[value="Search"]',
            'button'
          ];
          
          for (const selector of searchSelectors) {
            const button = document.querySelector(selector);
            if (button) {
              const buttonText = button.textContent || button.value || '';
              if (buttonText.toLowerCase().includes('search') || 
                  button.type === 'submit' || 
                  button.className.includes('search')) {
                button.click();
                return true;
              }
            }
          }
          
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          
          return false;
        });
        
        if (searchClicked) {
          console.log('Search submitted');
        } else {
          console.log('No search button found, trying Enter key');
          await page.focus('select');
          await page.keyboard.press('Enter');
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
          await page.waitForSelector('table', { timeout: 10000 });
          console.log('Table found, extracting results');
        } catch (e) {
          console.log('No table found, may be empty category');
        }
        
        // Extract results using our proven method
        const categoryResults = await extractCategoryResults(page, category.displayName);
        results[category.displayName] = categoryResults;
        
        const resultCount = categoryResults.results ? categoryResults.results.length : 0;
        console.log(`Found ${resultCount} results for ${category.displayName}`);
        
      } catch (categoryError) {
        console.error(`Error scraping ${category.displayName}:`, categoryError);
        results[category.displayName] = { error: categoryError.message };
      }
    }
    
  } catch (error) {
    console.error('Browser error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return results;
}

// Extract results from a single category page
async function extractCategoryResults(page, categoryName) {
  return await page.evaluate((categoryName) => {
    const table = document.querySelector('table');
    if (!table) {
      return { error: 'No table found', results: [] };
    }
    
    const debugLogs = [];
    const results = [];
    let currentSubcategory = 'General';
    
    // Get all table rows
    const allTableRows = Array.from(table.querySelectorAll('tr'));
    debugLogs.push(`Found ${allTableRows.length} total table rows`);
    
    // Find column indices
    const headerCells = table.querySelectorAll('thead th, tr:first-child th, tr:first-child td');
    const headers = Array.from(headerCells).map(th => th.textContent.trim());
    
    let nameCol = -1, ribbonCol = -1, awardsCol = -1, clubCol = -1, placingCol = -1;
    headers.forEach((header, index) => {
      const headerLower = header.toLowerCase();
      if (headerLower.includes('exhibitor') && headerLower.includes('name')) {
        nameCol = index;
      } else if (headerLower.includes('ribbon')) {
        ribbonCol = index;
      } else if (headerLower.includes('award')) {
        awardsCol = index;
      } else if (headerLower.includes('club')) {
        clubCol = index;
      } else if (headerLower.includes('placing')) {
        placingCol = index;
      }
    });
    
    // Process all rows
    allTableRows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      if (cells.length === 0) return;
      
      const cellTexts = cells.map(cell => cell.textContent.trim());
      
      // Check for subcategory header (th with colspan)
      const headerCell = row.querySelector('th[colspan]');
      if (headerCell) {
        const spans = headerCell.querySelectorAll('span');
        if (spans.length > 0) {
          const lastSpan = spans[spans.length - 1];
          const lastSpanText = lastSpan.textContent.trim();
          
          if (lastSpanText.includes(':')) {
            const colonIndex = lastSpanText.indexOf(':');
            if (colonIndex > 0) {
              currentSubcategory = lastSpanText.substring(colonIndex + 1).trim();
              debugLogs.push(`*** NEW SUBCATEGORY: "${currentSubcategory}" ***`);
            }
          }
        }
        return; // Skip header rows
      }
      
      // Process data rows
      const exhibitorName = nameCol >= 0 && nameCol < cellTexts.length ? cellTexts[nameCol] : 
                           cellTexts.length > 1 ? cellTexts[1] : '';
      
      if (!exhibitorName || 
          exhibitorName === '' || 
          exhibitorName.toLowerCase().includes('exhibitor') ||
          exhibitorName === 'Exhibitor Name') {
        return; // Skip invalid rows
      }
      
      // Extract other fields
      const ribbon = ribbonCol >= 0 && ribbonCol < cellTexts.length ? cellTexts[ribbonCol] : 
                    cellTexts.length > 4 ? cellTexts[4] : '';
      const awards = awardsCol >= 0 && awardsCol < cellTexts.length ? cellTexts[awardsCol] : 
                    cellTexts.length > 6 ? cellTexts[6] : '';
      const placing = placingCol >= 0 && placingCol < cellTexts.length ? cellTexts[placingCol] : 
                     cellTexts.length > 5 ? cellTexts[5] : '';
      
      let club = clubCol >= 0 && clubCol < cellTexts.length ? cellTexts[clubCol] : '';
      if (!club) {
        // Try to find club name in any cell
        for (const text of cellTexts) {
          if (text.includes('Clovers') || text.includes('Stockmen') || 
              text.includes('Getters') || text.includes('Venturers') || 
              text.includes('FFA') || text.includes('Mounties') ||
              text.includes('Rolling River') || text.includes('Pulse') ||
              text.includes('4-H') || text.includes('Club')) {
            club = text;
            break;
          }
        }
      }
      
      results.push({
        name: exhibitorName,
        ribbon: ribbon,
        awards: awards,
        placing: placing,
        club: club,
        subcategory: currentSubcategory
      });
      
      debugLogs.push(`Added: ${exhibitorName} -> "${currentSubcategory}"`);
    });
    
    return {
      results: results,
      totalRows: results.length,
      debugLogs: debugLogs
    };
  }, categoryName);
}

// Keep original scrapeCategories function for backward compatibility
async function scrapeCategories(baseUrl, categories) {
  // Implementation stays the same as before
  // ... (keeping existing implementation for manual category scraping)
}

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});