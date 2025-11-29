/**
 * MapSearchBar Component
 *
 * Location search bar for map navigation using Nominatim (OpenStreetMap) geocoding.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import maplibregl from 'maplibre-gl';

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: string[];
}

interface MapSearchBarProps {
  map: maplibregl.Map | null;
  placeholder?: string;
}

export const MapSearchBar: React.FC<MapSearchBarProps> = ({
  map,
  placeholder = 'Search location...',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search using Nominatim API
  const searchLocation = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use Nominatim API for geocoding
      // Nominatim supports CORS, so browser requests work directly
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResult[] = await response.json();
      setResults(data);
      setShowResults(data.length > 0);
    } catch (err) {
      console.error('Search error:', err);
      // Provide a more helpful error message
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Network error. Check your connection.');
      } else {
        setError('Search failed. Please try again.');
      }
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 300);
  }, [searchLocation]);

  // Handle result selection
  const handleSelectResult = useCallback((result: SearchResult) => {
    if (!map) return;

    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // Fly to the selected location
    map.flyTo({
      center: [lon, lat],
      zoom: 15,
      duration: 1500,
    });

    // Update input with selected location
    setQuery(result.display_name.split(',')[0]);
    setShowResults(false);
    setResults([]);
  }, [map]);

  // Handle form submit (search on enter)
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (results.length > 0) {
      handleSelectResult(results[0]);
    }
  }, [results, handleSelectResult]);

  // Clear search
  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setError(null);
  }, []);

  return (
    <SearchContainer ref={containerRef}>
      <SearchForm onSubmit={handleSubmit}>
        <SearchIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </SearchIcon>
        <SearchInput
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={placeholder}
          aria-label="Search location"
        />
        {isLoading && <LoadingSpinner />}
        {query && !isLoading && (
          <ClearButton type="button" onClick={handleClear} aria-label="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </ClearButton>
        )}
      </SearchForm>

      {showResults && results.length > 0 && (
        <ResultsList>
          {results.map((result) => (
            <ResultItem
              key={result.place_id}
              onClick={() => handleSelectResult(result)}
            >
              <ResultIcon>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </ResultIcon>
              <ResultText>{result.display_name}</ResultText>
            </ResultItem>
          ))}
        </ResultsList>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </SearchContainer>
  );
};

// Styled Components
const SearchContainer = styled.div`
  position: absolute;
  top: 10px;
  right: 50px;
  z-index: 10;
  width: 280px;
`;

const SearchForm = styled.form`
  display: flex;
  align-items: center;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 8px 12px;
  gap: 8px;
`;

const SearchIcon = styled.div`
  color: #9ca3af;
  display: flex;
  align-items: center;
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  color: #374151;
  background: transparent;
  min-width: 0;

  &::placeholder {
    color: #9ca3af;
  }
`;

const LoadingSpinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ClearButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  color: #6b7280;
  flex-shrink: 0;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
    color: #374151;
  }
`;

const ResultsList = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 240px;
  overflow-y: auto;
`;

const ResultItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: #f3f4f6;
  }
`;

const ResultIcon = styled.div`
  color: #3b82f6;
  flex-shrink: 0;
  margin-top: 2px;
`;

const ResultText = styled.span`
  font-size: 13px;
  color: #374151;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const ErrorMessage = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fee2e2;
  color: #dc2626;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

export default MapSearchBar;
