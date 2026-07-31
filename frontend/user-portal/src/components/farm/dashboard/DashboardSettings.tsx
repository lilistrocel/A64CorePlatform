/**
 * DashboardSettings Component
 *
 * Modal for configuring dashboard appearance and behavior.
 * Allows users to customize colors, icons, layout, and data display.
 */

import styled from 'styled-components';
import { Settings, X } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
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
          <Title><Settings size={18} strokeWidth={1.8} /> Dashboard Settings</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.8} />
          </CloseButton>
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

// Night Observatory modal recipe (spec §4 "Modals/drawers").
const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  z-index: 9998;
`;

const Modal = styled.div`
  ${glassPanel}
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Title = styled.h2`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
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

// Celeste, not gold — this modal repeats SectionTitle 4x and gold is
// budgeted at <=4 elements per view (spec §3); the Save button below is this
// view's one gold element.
const SectionTitle = styled.h3`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
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
  color: ${({ theme }) => theme.colors.textPrimary};
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input[type='checkbox'] {
    cursor: pointer;
    accent-color: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

const RangeInput = styled.input`
  flex: 1;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.secondary[500]};
`;

const SettingValue = styled.div`
  ${monoLabel}
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.celeste};
  min-width: 30px;
  text-align: right;
`;

const Select = styled.select`
  ${glassControl}
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const IconSetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`;

const IconSetOption = styled.div<{ $isSelected: boolean }>`
  ${glassControl}
  padding: 16px;
  border-width: ${(props) => (props.$isSelected ? '2px' : '1px')};
  border-color: ${(props) => (props.$isSelected ? props.theme.colors.celeste : props.theme.colors.glass.border)};
  background: ${(props) => (props.$isSelected ? props.theme.colors.glass.hi : props.theme.colors.glass.base)};
  cursor: pointer;
  text-align: center;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: ${({ theme }) => theme.colors.celeste};
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const IconSetName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
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
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
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
  border-radius: 8px;
  background: ${(props) => props.$color};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
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
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  gap: 12px;
`;

// Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
const ResetButton = styled.button`
  padding: 10px 20px;
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

// This view's one gold-gradient CTA (spec §3).
const SaveButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;
