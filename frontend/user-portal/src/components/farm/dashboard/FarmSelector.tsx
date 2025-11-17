/**
 * FarmSelector Component
 *
 * Farm dropdown selector with search capability.
 * Remembers last selected farm in localStorage.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { getFarms } from '../../../services/farmApi';
import type { Farm } from '../../../types/farm';

interface FarmSelectorProps {
  selectedFarmId: string | null;
  onFarmSelect: (farmId: string) => void;
}

export function FarmSelector({ selectedFarmId, onFarmSelect }: FarmSelectorProps) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  /**
   * Load farms from API
   */
  useEffect(() => {
    const loadFarms = async () => {
      try {
        setLoading(true);
        const response = await getFarms(1, 1000); // Load all farms
        setFarms(response.items || []);

        // Auto-select last farm from localStorage if no farm selected
        if (!selectedFarmId && response.items && response.items.length > 0) {
          const lastFarmId = localStorage.getItem('lastSelectedFarmId');
          if (lastFarmId && response.items.some((f) => f.farmId === lastFarmId)) {
            onFarmSelect(lastFarmId);
          } else {
            // Select first farm by default
            onFarmSelect(response.items[0].farmId);
          }
        }
      } catch (error) {
        console.error('Error loading farms:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFarms();
  }, [selectedFarmId, onFarmSelect]);

  /**
   * Save selected farm to localStorage
   */
  useEffect(() => {
    if (selectedFarmId) {
      localStorage.setItem('lastSelectedFarmId', selectedFarmId);
    }
  }, [selectedFarmId]);

  /**
   * Filter farms by search query
   */
  const filteredFarms = farms.filter(
    (farm) =>
      farm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (farm.location?.city && farm.location.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  /**
   * Get selected farm object
   */
  const selectedFarm = farms.find((f) => f.farmId === selectedFarmId);

  /**
   * Handle farm selection
   */
  const handleSelect = (farmId: string) => {
    onFarmSelect(farmId);
    setIsOpen(false);
    setSearchQuery('');
  };

  if (loading) {
    return (
      <Container>
        <LoadingText>Loading farms...</LoadingText>
      </Container>
    );
  }

  if (farms.length === 0) {
    return (
      <Container>
        <EmptyText>No farms available</EmptyText>
      </Container>
    );
  }

  return (
    <Container>
      <Label>Select Farm:</Label>

      <SelectorButton onClick={() => setIsOpen(!isOpen)}>
        <FarmName>
          {selectedFarm ? (
            <>
              <FarmIcon>🌾</FarmIcon>
              <span>{selectedFarm.name}</span>
              {selectedFarm.location?.city && (
                <FarmLocation>
                  📍 {selectedFarm.location.city}, {selectedFarm.location.country}
                </FarmLocation>
              )}
            </>
          ) : (
            'Select a farm'
          )}
        </FarmName>
        <Arrow $isOpen={isOpen}>▼</Arrow>
      </SelectorButton>

      {isOpen && (
        <Dropdown>
          <SearchInput
            type="text"
            placeholder="Search farms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />

          <FarmList>
            {filteredFarms.length === 0 ? (
              <NoResults>No farms found</NoResults>
            ) : (
              filteredFarms.map((farm) => (
                <FarmOption
                  key={farm.farmId}
                  $isSelected={farm.farmId === selectedFarmId}
                  onClick={() => handleSelect(farm.farmId)}
                >
                  <FarmOptionName>
                    <FarmIcon>🌾</FarmIcon>
                    {farm.name}
                  </FarmOptionName>
                  {farm.location?.city && (
                    <FarmOptionLocation>
                      📍 {farm.location.city}, {farm.location.country}
                    </FarmOptionLocation>
                  )}
                  <FarmOptionMeta>
                    {farm.totalArea} hectares
                    {farm.isActive && <ActiveBadge>Active</ActiveBadge>}
                  </FarmOptionMeta>
                </FarmOption>
              ))
            )}
          </FarmList>
        </Dropdown>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && <Backdrop onClick={() => setIsOpen(false)} />}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  position: relative;
  min-width: 300px;
`;

const Label = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const SelectorButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: #3b82f6;
    background: #f8faff;
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const FarmName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #212121;
  flex: 1;
  text-align: left;
`;

const FarmIcon = styled.span`
  font-size: 18px;
`;

const FarmLocation = styled.span`
  font-size: 12px;
  color: #757575;
  margin-left: 8px;
`;

const Arrow = styled.span<{ $isOpen: boolean }>`
  font-size: 10px;
  color: #757575;
  transition: transform 150ms ease-in-out;
  transform: ${(props) => (props.$isOpen ? 'rotate(180deg)' : 'rotate(0)')};
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  max-height: 400px;
  display: flex;
  flex-direction: column;
`;

const SearchInput = styled.input`
  padding: 12px 16px;
  border: none;
  border-bottom: 2px solid #e0e0e0;
  font-size: 14px;
  outline: none;

  &:focus {
    border-bottom-color: #3b82f6;
  }

  &::placeholder {
    color: #9e9e9e;
  }
`;

const FarmList = styled.div`
  overflow-y: auto;
  max-height: 350px;
`;

const FarmOption = styled.div<{ $isSelected: boolean }>`
  padding: 12px 16px;
  cursor: pointer;
  transition: background 100ms ease-in-out;
  border-left: 4px solid ${(props) => (props.$isSelected ? '#3b82f6' : 'transparent')};
  background: ${(props) => (props.$isSelected ? '#f0f7ff' : 'white')};

  &:hover {
    background: ${(props) => (props.$isSelected ? '#e3f2fd' : '#f5f5f5')};
  }
`;

const FarmOptionName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #212121;
  margin-bottom: 4px;
`;

const FarmOptionLocation = styled.div`
  font-size: 12px;
  color: #757575;
  margin-bottom: 4px;
`;

const FarmOptionMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #9e9e9e;
`;

const ActiveBadge = styled.span`
  padding: 2px 8px;
  background: #10b981;
  color: white;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
`;

const NoResults = styled.div`
  padding: 32px 16px;
  text-align: center;
  font-size: 14px;
  color: #9e9e9e;
`;

const LoadingText = styled.div`
  padding: 12px 16px;
  text-align: center;
  font-size: 14px;
  color: #757575;
`;

const EmptyText = styled.div`
  padding: 12px 16px;
  text-align: center;
  font-size: 14px;
  color: #f44336;
`;

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
`;
