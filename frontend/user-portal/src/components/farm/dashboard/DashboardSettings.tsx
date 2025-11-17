/**
 * DashboardSettings Component
 *
 * Modal for configuring dashboard appearance and behavior.
 * Allows users to customize colors, icons, layout, and data display.
 */

import styled from 'styled-components';
import type { DashboardConfig } from '../../../hooks/farm/useDashboardConfig';

interface DashboardSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: DashboardConfig;
  onConfigChange: (updates: Partial<DashboardConfig>) => void;
}

export function DashboardSettings({
  isOpen,
  onClose,
  config,
  onConfigChange,
}: DashboardSettingsProps) {
  if (!isOpen) return null;

  const handleReset = () => {
    if (confirm('Reset all dashboard settings to defaults?')) {
      // Reset to default config
      onConfigChange({
        layout: {
          cardSize: 'compact',
          cardsPerRow: 8,
          showBlockCode: true,
          showBlockName: true,
          showTimeline: true,
          showAlerts: true,
        },
      });
    }
  };

  return (
    <>
      <Backdrop onClick={onClose} />
      <Modal>
        <Header>
          <Title>⚙️ Dashboard Settings</Title>
          <CloseButton onClick={onClose}>✕</CloseButton>
        </Header>

        <Content>
          {/* Layout Settings */}
          <Section>
            <SectionTitle>Layout</SectionTitle>

            <Setting>
              <SettingLabel>Cards Per Row</SettingLabel>
              <RangeInput
                type="range"
                min="4"
                max="12"
                value={config.layout.cardsPerRow}
                onChange={(e) =>
                  onConfigChange({
                    layout: { ...config.layout, cardsPerRow: parseInt(e.target.value) },
                  })
                }
              />
              <SettingValue>{config.layout.cardsPerRow}</SettingValue>
            </Setting>

            <Setting>
              <SettingLabel>
                <input
                  type="checkbox"
                  checked={config.layout.showBlockCode}
                  onChange={(e) =>
                    onConfigChange({
                      layout: { ...config.layout, showBlockCode: e.target.checked },
                    })
                  }
                />
                Show Block Codes
              </SettingLabel>
            </Setting>

            <Setting>
              <SettingLabel>
                <input
                  type="checkbox"
                  checked={config.layout.showBlockName}
                  onChange={(e) =>
                    onConfigChange({
                      layout: { ...config.layout, showBlockName: e.target.checked },
                    })
                  }
                />
                Show Block Names
              </SettingLabel>
            </Setting>

            <Setting>
              <SettingLabel>
                <input
                  type="checkbox"
                  checked={config.layout.showTimeline}
                  onChange={(e) =>
                    onConfigChange({
                      layout: { ...config.layout, showTimeline: e.target.checked },
                    })
                  }
                />
                Show Timeline Info
              </SettingLabel>
            </Setting>

            <Setting>
              <SettingLabel>
                <input
                  type="checkbox"
                  checked={config.layout.showAlerts}
                  onChange={(e) =>
                    onConfigChange({
                      layout: { ...config.layout, showAlerts: e.target.checked },
                    })
                  }
                />
                Show Active Alerts
              </SettingLabel>
            </Setting>
          </Section>

          {/* Data Display Settings */}
          <Section>
            <SectionTitle>Data Display</SectionTitle>

            <Setting>
              <SettingLabel>Date Format</SettingLabel>
              <Select
                value={config.dataDisplay.dateFormat}
                onChange={(e) =>
                  onConfigChange({
                    dataDisplay: {
                      ...config.dataDisplay,
                      dateFormat: e.target.value as 'short' | 'long' | 'relative',
                    },
                  })
                }
              >
                <option value="short">Short (MM/DD/YYYY)</option>
                <option value="long">Long (Month DD, YYYY)</option>
                <option value="relative">Relative (2 days ago)</option>
              </Select>
            </Setting>

            <Setting>
              <SettingLabel>Yield Unit</SettingLabel>
              <Select
                value={config.dataDisplay.yieldUnit}
                onChange={(e) =>
                  onConfigChange({
                    dataDisplay: {
                      ...config.dataDisplay,
                      yieldUnit: e.target.value as 'kg' | 'lbs' | 'tons',
                    },
                  })
                }
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="lbs">Pounds (lbs)</option>
                <option value="tons">Tons</option>
              </Select>
            </Setting>

            <Setting>
              <SettingLabel>
                <input
                  type="checkbox"
                  checked={config.dataDisplay.showPercentages}
                  onChange={(e) =>
                    onConfigChange({
                      dataDisplay: {
                        ...config.dataDisplay,
                        showPercentages: e.target.checked,
                      },
                    })
                  }
                />
                Show Percentages
              </SettingLabel>
            </Setting>

            <Setting>
              <SettingLabel>Decimal Places</SettingLabel>
              <RangeInput
                type="range"
                min="0"
                max="3"
                value={config.dataDisplay.decimalPlaces}
                onChange={(e) =>
                  onConfigChange({
                    dataDisplay: {
                      ...config.dataDisplay,
                      decimalPlaces: parseInt(e.target.value),
                    },
                  })
                }
              />
              <SettingValue>{config.dataDisplay.decimalPlaces}</SettingValue>
            </Setting>
          </Section>

          {/* Icon Set Selection */}
          <Section>
            <SectionTitle>Icon Set</SectionTitle>

            <IconSetGrid>
              <IconSetOption
                $isSelected={config.iconSet === 'emoji'}
                onClick={() => onConfigChange({ iconSet: 'emoji' })}
              >
                <IconSetName>🌾 Emoji</IconSetName>
                <IconSetPreview>🌱 🌿 🍇 🧺</IconSetPreview>
              </IconSetOption>

              <IconSetOption
                $isSelected={config.iconSet === 'material'}
                onClick={() => onConfigChange({ iconSet: 'material' })}
              >
                <IconSetName>📐 Material</IconSetName>
                <IconSetPreview>● ■ ▲ ★</IconSetPreview>
              </IconSetOption>

              <IconSetOption
                $isSelected={config.iconSet === 'fontawesome'}
                onClick={() => onConfigChange({ iconSet: 'fontawesome' })}
              >
                <IconSetName>🔤 FontAwesome</IconSetName>
                <IconSetPreview>⬤ ⬛ ⬆ ⭐</IconSetPreview>
              </IconSetOption>
            </IconSetGrid>
          </Section>

          {/* Color Preview */}
          <Section>
            <SectionTitle>Color Preview</SectionTitle>
            <ColorPreview>
              <ColorGroup>
                <ColorGroupTitle>States</ColorGroupTitle>
                <ColorRow>
                  {Object.entries(config.colorScheme.stateColors).map(([state, color]) => (
                    <ColorSwatch key={state} $color={color} title={state} />
                  ))}
                </ColorRow>
              </ColorGroup>

              <ColorGroup>
                <ColorGroupTitle>Performance</ColorGroupTitle>
                <ColorRow>
                  {Object.entries(config.colorScheme.performanceColors).map(([category, color]) => (
                    <ColorSwatch key={category} $color={color} title={category} />
                  ))}
                </ColorRow>
              </ColorGroup>
            </ColorPreview>
          </Section>
        </Content>

        <Footer>
          <ResetButton onClick={handleReset}>Reset to Defaults</ResetButton>
          <SaveButton onClick={onClose}>Save & Close</SaveButton>
        </Footer>
      </Modal>
    </>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9998;
`;

const Modal = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 2px solid #f5f5f5;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const CloseButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  background: #f5f5f5;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #e0e0e0;
  }
`;

const Content = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const Section = styled.div`
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
`;

const Setting = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SettingLabel = styled.label`
  font-size: 14px;
  color: #212121;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input[type='checkbox'] {
    cursor: pointer;
  }
`;

const RangeInput = styled.input`
  flex: 1;
  cursor: pointer;
`;

const SettingValue = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #3b82f6;
  min-width: 30px;
  text-align: right;
`;

const Select = styled.select`
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const IconSetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`;

const IconSetOption = styled.div<{ $isSelected: boolean }>`
  padding: 16px;
  border: 2px solid ${(props) => (props.$isSelected ? '#3B82F6' : '#E0E0E0')};
  border-radius: 8px;
  background: ${(props) => (props.$isSelected ? '#E3F2FD' : 'white')};
  cursor: pointer;
  text-align: center;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: #3b82f6;
    background: #f0f7ff;
  }
`;

const IconSetName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
  margin-bottom: 8px;
`;

const IconSetPreview = styled.div`
  font-size: 20px;
`;

const ColorPreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ColorGroup = styled.div``;

const ColorGroupTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #757575;
  margin-bottom: 8px;
`;

const ColorRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ColorSwatch = styled.div<{ $color: string }>`
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: ${(props) => props.$color};
  border: 2px solid #e0e0e0;
  cursor: pointer;
  transition: transform 150ms ease-in-out;

  &:hover {
    transform: scale(1.1);
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 2px solid #f5f5f5;
  gap: 12px;
`;

const ResetButton = styled.button`
  padding: 10px 20px;
  border: 2px solid #f44336;
  border-radius: 8px;
  background: white;
  color: #f44336;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #ffebee;
  }
`;

const SaveButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;
