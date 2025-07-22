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
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isScrapingAll, setIsScrapingAll] = useState(false);
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
  }, []);

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
        
        if (!Array.