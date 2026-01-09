/**
 * Block Automation Tab
 *
 * Displays automation systems for a block:
 * - IoT Controller Configuration
 * - Sensors (IoT devices monitoring environmental conditions)
 * - Controllers (Actuators and relays for automated control)
 *
 * Connects to real IoT hardware via backend proxy.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import {
  Droplet,
  Thermometer,
  Sun,
  Wind,
  Zap,
  Power,
  Settings,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  WifiOff,
  Wifi,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import {
  getBlockIoTController,
  updateBlockIoTController,
  iotProxyGet,
  iotProxyPut,
} from '../../services/farmApi';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build IoT controller URL with proper protocol based on port
 * - Port 443: Use HTTPS without explicit port
 * - Port 80: Use HTTP without explicit port
 * - Other ports: Use HTTP with explicit port
 *
 * Handles addresses that may already include protocol prefix
 */
function buildIoTUrl(address: string, port: number, path: string): string {
  // Strip existing protocol if present
  let cleanAddress = address;
  if (cleanAddress.startsWith('https://')) {
    cleanAddress = cleanAddress.substring(8);
  } else if (cleanAddress.startsWith('http://')) {
    cleanAddress = cleanAddress.substring(7);
  }
  // Remove trailing slash if present
  cleanAddress = cleanAddress.replace(/\/$/, '');

  if (port === 443) {
    return `https://${cleanAddress}${path}`;
  } else if (port === 80) {
    return `http://${cleanAddress}${path}`;
  } else {
    return `http://${cleanAddress}:${port}${path}`;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface IoTControllerConfig {
  blockId: string;
  address: string;
  port: number;
  enabled: boolean;
  apiKey?: string;
  relayLabels?: Record<string, string>;
}

interface SensorReading {
  value: number;
  unit: string;
}

interface Sensor {
  id: string;
  name: string;
  type: string;
  label: string;
  online: boolean;
  readings: Record<string, SensorReading>;
}

interface Relay {
  id: string;
  label: string;
  state: boolean;
  online: boolean;
}

interface IoTDeviceData {
  controllerId: string;
  controllerName: string;
  lastUpdate: string;
  sensors: Sensor[];
  relays: Relay[];
}

interface BlockAutomationTabProps {
  blockId: string;
  farmId: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockAutomationTab({ blockId, farmId }: BlockAutomationTabProps) {
  const [iotConfig, setIoTConfig] = useState<IoTControllerConfig | null>(null);
  const [deviceData, setDeviceData] = useState<IoTDeviceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({ address: '', port: 8090, enabled: true, apiKey: '' });
  const [configSaving, setConfigSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [togglingRelay, setTogglingRelay] = useState<string | null>(null);
  const [editingRelayLabel, setEditingRelayLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');
  const [savingRelayLabel, setSavingRelayLabel] = useState(false);

  const autoRefreshInterval = useRef<NodeJS.Timeout | null>(null);

  // ============================================================================
  // LOAD IOT CONFIGURATION
  // ============================================================================

  const loadIoTConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const config = await getBlockIoTController(farmId, blockId);
      setIoTConfig(config);

      if (config && config.enabled && config.address) {
        await fetchDeviceData(config.address, config.port, config.apiKey);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setIoTConfig(null);
      } else {
        setError(err.message || 'Failed to load IoT controller configuration');
      }
    } finally {
      setLoading(false);
    }
  }, [farmId, blockId]);

  useEffect(() => {
    loadIoTConfig();
  }, [loadIoTConfig]);

  // ============================================================================
  // FETCH DEVICE DATA
  // ============================================================================

  const fetchDeviceData = async (address: string, port: number, apiKey?: string) => {
    try {
      setError(null);
      // Use /api/a64core endpoint for aggregated device data format
      const url = buildIoTUrl(address, port, '/api/a64core');
      const data = await iotProxyGet(url, apiKey);
      setDeviceData(data);
      setLastRefresh(new Date());
    } catch (err: any) {
      if (err.response?.status === 503 || err.code === 'ECONNREFUSED') {
        setError('Controller not responding. Check if device is online.');
      } else if (err.response?.status === 504) {
        setError('Request timeout. Controller may be offline.');
      } else {
        setError(err.message || 'Failed to fetch device data');
      }
      setDeviceData(null);
    }
  };

  // ============================================================================
  // MANUAL REFRESH
  // ============================================================================

  const handleRefresh = async () => {
    if (iotConfig && iotConfig.enabled && iotConfig.address) {
      await fetchDeviceData(iotConfig.address, iotConfig.port, iotConfig.apiKey);
    }
  };

  // ============================================================================
  // AUTO-REFRESH
  // ============================================================================

  useEffect(() => {
    if (autoRefresh && iotConfig && iotConfig.enabled && iotConfig.address) {
      autoRefreshInterval.current = setInterval(() => {
        fetchDeviceData(iotConfig.address, iotConfig.port, iotConfig.apiKey);
      }, 10000); // 10 seconds

      return () => {
        if (autoRefreshInterval.current) {
          clearInterval(autoRefreshInterval.current);
        }
      };
    }
  }, [autoRefresh, iotConfig]);

  // ============================================================================
  // SAVE IOT CONFIGURATION
  // ============================================================================

  const handleSaveConfig = async () => {
    try {
      setConfigSaving(true);
      setError(null);
      const updatedConfig = await updateBlockIoTController(farmId, blockId, configForm);
      setIoTConfig(updatedConfig);
      setShowConfigModal(false);

      if (updatedConfig.enabled && updatedConfig.address) {
        await fetchDeviceData(updatedConfig.address, updatedConfig.port, updatedConfig.apiKey);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save IoT controller configuration');
    } finally {
      setConfigSaving(false);
    }
  };

  // ============================================================================
  // TEST CONNECTION
  // ============================================================================

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      setError(null);
      // Use /api/a64core endpoint for connection test
      const url = buildIoTUrl(configForm.address, configForm.port, '/api/a64core');
      await iotProxyGet(url, configForm.apiKey || undefined);
      alert('Connection successful! Controller is responding.');
    } catch (err: any) {
      alert('Connection failed: ' + (err.message || 'Controller not responding'));
    } finally {
      setTestingConnection(false);
    }
  };

  // ============================================================================
  // TOGGLE RELAY
  // ============================================================================

  const handleToggleRelay = async (relayId: string, currentState: boolean) => {
    if (!iotConfig) return;

    try {
      setTogglingRelay(relayId);
      setError(null);

      const url = buildIoTUrl(iotConfig.address, iotConfig.port, `/api/relays/${relayId}`);
      await iotProxyPut(url, { state: !currentState }, iotConfig.apiKey);

      // Refresh device data to get updated relay state
      await fetchDeviceData(iotConfig.address, iotConfig.port, iotConfig.apiKey);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle relay');
      // Rollback on error by refetching data
      if (iotConfig) {
        await fetchDeviceData(iotConfig.address, iotConfig.port, iotConfig.apiKey);
      }
    } finally {
      setTogglingRelay(null);
    }
  };

  // ============================================================================
  // EDIT RELAY LABEL
  // ============================================================================

  const handleStartEditLabel = (relayId: string, currentLabel: string) => {
    setEditingRelayLabel(relayId);
    setEditLabelValue(currentLabel);
  };

  const handleCancelEditLabel = () => {
    setEditingRelayLabel(null);
    setEditLabelValue('');
  };

  const handleSaveRelayLabel = async (relayId: string) => {
    if (!iotConfig) return;

    try {
      setSavingRelayLabel(true);
      setError(null);

      // Merge new label with existing labels
      const updatedLabels = {
        ...(iotConfig.relayLabels || {}),
        [relayId]: editLabelValue.trim(),
      };

      // If the label is empty, remove it (use default from device)
      if (!editLabelValue.trim()) {
        delete updatedLabels[relayId];
      }

      // Save to backend
      const updatedConfig = await updateBlockIoTController(farmId, blockId, {
        address: iotConfig.address,
        port: iotConfig.port,
        enabled: iotConfig.enabled,
        apiKey: iotConfig.apiKey,
        relayLabels: updatedLabels,
      });

      setIoTConfig(updatedConfig);
      setEditingRelayLabel(null);
      setEditLabelValue('');
    } catch (err: any) {
      setError(err.message || 'Failed to save relay label');
    } finally {
      setSavingRelayLabel(false);
    }
  };

  const getRelayDisplayLabel = (relay: Relay): string => {
    // Use custom label if available, otherwise use device default
    return iotConfig?.relayLabels?.[relay.id] || relay.label;
  };

  // ============================================================================
  // OPEN CONFIGURATION MODAL
  // ============================================================================

  const handleOpenConfigModal = () => {
    if (iotConfig) {
      setConfigForm({
        address: iotConfig.address || '',
        port: iotConfig.port || 8090,
        enabled: iotConfig.enabled,
        apiKey: iotConfig.apiKey || '',
      });
    } else {
      setConfigForm({ address: '', port: 8090, enabled: true, apiKey: '' });
    }
    setShowConfigModal(true);
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 10) return 'just now';
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <Container>
        <LoadingState>
          <RefreshCw size={24} />
          Loading IoT controller configuration...
        </LoadingState>
      </Container>
    );
  }

  const hasConfig = iotConfig && iotConfig.enabled && iotConfig.address;

  return (
    <Container>
      {/* IoT Controller Configuration Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Settings size={20} />
            IoT Controller Configuration
          </SectionTitle>
        </SectionHeader>

        {!hasConfig ? (
          <ConfigEmptyState>
            <WifiOff size={48} color="#6B7280" />
            <EmptyText>No IoT controller configured for this block</EmptyText>
            <ConfigButton onClick={handleOpenConfigModal}>
              Configure IoT Controller
            </ConfigButton>
          </ConfigEmptyState>
        ) : (
          <ConfigCard>
            <ConfigInfo>
              <ConfigLabel>Controller Address:</ConfigLabel>
              <ConfigValue>
                <Wifi size={16} color="#10B981" />
                {iotConfig.address}:{iotConfig.port}
              </ConfigValue>
            </ConfigInfo>
            <ConfigActions>
              <RefreshButton onClick={handleRefresh} disabled={!hasConfig}>
                <RefreshCw size={16} />
                Refresh
              </RefreshButton>
              <AutoRefreshToggle>
                <ToggleInput
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  disabled={!hasConfig}
                />
                <ToggleLabel>Auto-refresh (10s)</ToggleLabel>
              </AutoRefreshToggle>
              <EditButton onClick={handleOpenConfigModal}>Edit</EditButton>
            </ConfigActions>
            {lastRefresh && (
              <LastUpdateText>
                <Clock size={12} />
                Last updated: {formatTimeAgo(lastRefresh)}
              </LastUpdateText>
            )}
          </ConfigCard>
        )}
      </Section>

      {/* Error Display */}
      {error && (
        <ErrorBanner>
          <AlertCircle size={20} />
          <ErrorText>{error}</ErrorText>
          {hasConfig && (
            <RetryButton onClick={handleRefresh}>Retry</RetryButton>
          )}
        </ErrorBanner>
      )}

      {/* Sensors Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Zap size={20} />
            Sensors & Environmental Monitoring
          </SectionTitle>
          {deviceData && (
            <SectionSubtitle>{deviceData.sensors?.length || 0} sensors connected</SectionSubtitle>
          )}
        </SectionHeader>

        {!hasConfig ? (
          <EmptyState>
            <EmptyIcon>
              <Thermometer size={32} />
            </EmptyIcon>
            <EmptyText>No sensors available. Configure an IoT controller to connect sensors.</EmptyText>
          </EmptyState>
        ) : !deviceData || !deviceData.sensors || deviceData.sensors.length === 0 ? (
          <EmptyState>
            <EmptyIcon>
              <Thermometer size={32} />
            </EmptyIcon>
            <EmptyText>No sensor data available. Check controller connection.</EmptyText>
          </EmptyState>
        ) : (
          <SensorGrid>
            {deviceData.sensors.map((sensor) => (
              <SensorCard key={sensor.id}>
                <SensorHeader>
                  <SensorIconWrapper $online={sensor.online}>
                    <Thermometer size={20} />
                  </SensorIconWrapper>
                  <SensorInfo>
                    <SensorName>{sensor.label || sensor.name}</SensorName>
                    <SensorMeta>
                      <StatusDot $online={sensor.online} />
                      <SensorStatus>{sensor.online ? 'Online' : 'Offline'}</SensorStatus>
                    </SensorMeta>
                  </SensorInfo>
                </SensorHeader>

                <ReadingsContainer>
                  {Object.entries(sensor.readings).map(([key, reading]) => (
                    <ReadingRow key={key}>
                      <ReadingLabel>{key}:</ReadingLabel>
                      <ReadingValue>
                        {reading.value} {reading.unit}
                      </ReadingValue>
                    </ReadingRow>
                  ))}
                </ReadingsContainer>
              </SensorCard>
            ))}
          </SensorGrid>
        )}
      </Section>

      {/* Controllers/Relays Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Power size={20} />
            Controllers & Relays
          </SectionTitle>
          {deviceData && (
            <SectionSubtitle>{deviceData.relays?.length || 0} relays configured</SectionSubtitle>
          )}
        </SectionHeader>

        {!hasConfig ? (
          <EmptyState>
            <EmptyIcon>
              <Power size={32} />
            </EmptyIcon>
            <EmptyText>No controllers available. Configure an IoT controller to manage relays.</EmptyText>
          </EmptyState>
        ) : !deviceData || !deviceData.relays || deviceData.relays.length === 0 ? (
          <EmptyState>
            <EmptyIcon>
              <Power size={32} />
            </EmptyIcon>
            <EmptyText>No relay data available. Check controller connection.</EmptyText>
          </EmptyState>
        ) : (
          <RelayGrid>
            {deviceData.relays.map((relay) => (
              <RelayCard key={relay.id}>
                <RelayHeader>
                  <RelayIconWrapper $isOn={relay.state}>
                    <Power size={20} />
                  </RelayIconWrapper>
                  <RelayInfo>
                    {editingRelayLabel === relay.id ? (
                      <RelayLabelEditRow>
                        <RelayLabelInput
                          type="text"
                          value={editLabelValue}
                          onChange={(e) => setEditLabelValue(e.target.value)}
                          placeholder={relay.label}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRelayLabel(relay.id);
                            if (e.key === 'Escape') handleCancelEditLabel();
                          }}
                        />
                        <RelayLabelAction
                          onClick={() => handleSaveRelayLabel(relay.id)}
                          disabled={savingRelayLabel}
                          title="Save"
                        >
                          <Check size={14} />
                        </RelayLabelAction>
                        <RelayLabelAction onClick={handleCancelEditLabel} title="Cancel">
                          <X size={14} />
                        </RelayLabelAction>
                      </RelayLabelEditRow>
                    ) : (
                      <RelayNameRow>
                        <RelayName>{getRelayDisplayLabel(relay)}</RelayName>
                        <EditLabelButton
                          onClick={() => handleStartEditLabel(relay.id, getRelayDisplayLabel(relay))}
                          title="Edit label"
                        >
                          <Edit2 size={12} />
                        </EditLabelButton>
                      </RelayNameRow>
                    )}
                    <RelayMeta>
                      <StatusDot $online={relay.online} />
                      <RelayStatus>{relay.online ? 'Online' : 'Offline'}</RelayStatus>
                      {iotConfig?.relayLabels?.[relay.id] && (
                        <DeviceLabel title="Device default label">({relay.label})</DeviceLabel>
                      )}
                    </RelayMeta>
                  </RelayInfo>
                </RelayHeader>

                <RelayControls>
                  <RelayStateBadge $isOn={relay.state}>
                    {relay.state ? 'ON' : 'OFF'}
                  </RelayStateBadge>
                  <ToggleRelayButton
                    $isOn={relay.state}
                    onClick={() => handleToggleRelay(relay.id, relay.state)}
                    disabled={!relay.online || togglingRelay === relay.id}
                  >
                    {togglingRelay === relay.id ? 'Toggling...' : relay.state ? 'Turn OFF' : 'Turn ON'}
                  </ToggleRelayButton>
                </RelayControls>
              </RelayCard>
            ))}
          </RelayGrid>
        )}
      </Section>

      {/* Configuration Modal */}
      {showConfigModal && (
        <ModalOverlay onClick={() => setShowConfigModal(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Configure IoT Controller</ModalTitle>
              <ModalClose onClick={() => setShowConfigModal(false)}>×</ModalClose>
            </ModalHeader>

            <ModalBody>
              <FormGroup>
                <Label>IP Address or Hostname</Label>
                <Input
                  type="text"
                  placeholder="e.g., 192.168.1.100 or iot-simulator"
                  value={configForm.address}
                  onChange={(e) => setConfigForm({ ...configForm, address: e.target.value })}
                />
              </FormGroup>

              <FormGroup>
                <Label>Port (use 443 for HTTPS)</Label>
                <Input
                  type="number"
                  placeholder="8090"
                  value={configForm.port}
                  onChange={(e) => setConfigForm({ ...configForm, port: parseInt(e.target.value) || 8090 })}
                />
              </FormGroup>

              <FormGroup>
                <CheckboxLabel>
                  <input
                    type="checkbox"
                    checked={configForm.enabled}
                    onChange={(e) => setConfigForm({ ...configForm, enabled: e.target.checked })}
                  />
                  Enable IoT Controller
                </CheckboxLabel>
              </FormGroup>

              <FormGroup>
                <Label>API Key (optional, for relay control)</Label>
                <Input
                  type="password"
                  placeholder="Enter API key for authenticated endpoints"
                  value={configForm.apiKey}
                  onChange={(e) => setConfigForm({ ...configForm, apiKey: e.target.value })}
                />
                <HelpText>Required for controllers that need authentication (e.g., Raspberry Pi)</HelpText>
              </FormGroup>

              <ButtonGroup>
                <TestButton onClick={handleTestConnection} disabled={testingConnection || !configForm.address}>
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </TestButton>
              </ButtonGroup>
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={() => setShowConfigModal(false)}>Cancel</CancelButton>
              <SaveButton onClick={handleSaveConfig} disabled={configSaving || !configForm.address}>
                {configSaving ? 'Saving...' : 'Save'}
              </SaveButton>
            </ModalFooter>
          </Modal>
        </ModalOverlay>
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xl};
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
  gap: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const SectionTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const SectionSubtitle = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ConfigEmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
  gap: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 2px dashed ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
  gap: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  text-align: center;
`;

const EmptyIcon = styled.div`
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ConfigButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const ConfigCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ConfigInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ConfigLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ConfigValue = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'Courier New', monospace;
`;

const ConfigActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AutoRefreshToggle = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ToggleInput = styled.input`
  cursor: pointer;
`;

const ToggleLabel = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
`;

const EditButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: transparent;
  color: ${({ theme }) => theme.colors.primary[500]};
  border: 1px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[50]};
  }
`;

const LastUpdateText = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: #FEE2E2;
  border: 1px solid #EF4444;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: #991B1B;
`;

const ErrorText = styled.div`
  flex: 1;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const RetryButton = styled.button`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: #DC2626;
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #B91C1C;
  }
`;

// Sensor Styles
const SensorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const SensorCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    border-color: ${({ theme }) => theme.colors.primary[300]};
  }
`;

const SensorHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const SensorIconWrapper = styled.div<{ $online: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $online }) => ($online ? '#10B98115' : '#6B728015')};
  color: ${({ $online }) => ($online ? '#10B981' : '#6B7280')};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const SensorInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  flex: 1;
`;

const SensorName = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SensorMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const StatusDot = styled.div<{ $online: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $online }) => ($online ? '#10B981' : '#EF4444')};
`;

const SensorStatus = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const ReadingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ReadingRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const ReadingLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const ReadingValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Relay Styles
const RelayGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const RelayCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    border-color: ${({ theme }) => theme.colors.primary[300]};
  }
`;

const RelayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const RelayIconWrapper = styled.div<{ $isOn: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $isOn }) => ($isOn ? '#10B98115' : '#6B728015')};
  color: ${({ $isOn }) => ($isOn ? '#10B981' : '#6B7280')};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const RelayInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  flex: 1;
`;

const RelayName = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const RelayNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const EditLabelButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  opacity: 0.5;
  transition: all 150ms ease-in-out;

  &:hover {
    opacity: 1;
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const RelayLabelEditRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RelayLabelInput = styled.input`
  flex: 1;
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.primary[300]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  min-width: 100px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary[100]};
  }
`;

const RelayLabelAction = styled.button<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: ${({ theme }) => theme.colors.neutral[100]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[50]};
    border-color: ${({ theme }) => theme.colors.primary[300]};
    color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DeviceLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  opacity: 0.7;
  font-style: italic;
`;

const RelayMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RelayStatus = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const RelayControls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const RelayStateBadge = styled.div<{ $isOn: boolean }>`
  padding: 4px 12px;
  background: ${({ $isOn }) => ($isOn ? '#10B98115' : '#6B728015')};
  color: ${({ $isOn }) => ($isOn ? '#10B981' : '#6B7280')};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
`;

const ToggleRelayButton = styled.button<{ $isOn: boolean }>`
  padding: 6px 16px;
  background: ${({ $isOn, theme }) => ($isOn ? theme.colors.error : theme.colors.success)};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Modal Styles - Uses higher z-index for nested modal inside BlockDetailsModal
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal + 10};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  width: 100%;
  max-width: 500px;
  box-shadow: ${({ theme }) => theme.shadows.xl};
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ModalTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const ModalClose = styled.button`
  background: none;
  border: none;
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Input = styled.input`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[400]};
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  input[type='checkbox'] {
    cursor: pointer;
  }
`;

const HelpText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const TestButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const CancelButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
`;

const SaveButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[700]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
