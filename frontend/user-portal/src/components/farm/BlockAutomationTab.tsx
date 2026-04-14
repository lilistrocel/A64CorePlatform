/**
 * Block Automation Tab - SenseHub Integration
 *
 * Displays SenseHub automation systems for a block:
 * - Connection Management
 * - Dashboard Overview
 * - Equipment (Sensors & Relays)
 * - Automations
 * - Alerts
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
  TrendingUp,
  Activity,
  Bell,
  Play,
  Pause,
  Eye,
  FlaskConical,
  Filter,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
} from 'lucide-react';
import {
  connectSenseHub,
  disconnectSenseHub,
  getSenseHubStatus,
  getSenseHubDashboard,
  getSenseHubEquipment,
  controlSenseHubRelay,
  getSenseHubAutomations,
  toggleSenseHubAutomation,
  triggerSenseHubAutomation,
  getSenseHubAlerts,
  acknowledgeSenseHubAlert,
  getSenseHubLabNutrients,
  getSenseHubLabLatest,
  getSenseHubLabReadings,
  getSenseHubCacheStatus,
  triggerSenseHubSync,
} from '../../services/farmApi';
import type {
  SenseHubConnectionStatus,
  SenseHubDashboard,
  SenseHubEquipment,
  SenseHubAutomation,
  SenseHubAlert,
  SenseHubLabReading,
  SenseHubLabStat,
} from '../../types/farm';
import { FarmAIChat } from './FarmAIChat';

// ============================================================================
// TYPES
// ============================================================================

interface BlockAutomationTabProps {
  blockId: string;
  farmId: string;
}

type SubTab = 'overview' | 'equipment' | 'automations' | 'alerts' | 'lab';

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockAutomationTab({ blockId, farmId }: BlockAutomationTabProps) {
  const [connectionStatus, setConnectionStatus] = useState<SenseHubConnectionStatus | null>(null);
  const [dashboard, setDashboard] = useState<SenseHubDashboard | null>(null);
  const [equipment, setEquipment] = useState<SenseHubEquipment[]>([]);
  const [automations, setAutomations] = useState<SenseHubAutomation[]>([]);
  const [alerts, setAlerts] = useState<SenseHubAlert[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('overview');

  // Connection form state
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionForm, setConnectionForm] = useState({
    address: '',
    port: 3000,
    email: '',
    password: '',
    mcpApiKey: '',
    mcpPort: 3001,
  });
  const [connecting, setConnecting] = useState(false);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const autoRefreshInterval = useRef<NodeJS.Timeout | null>(null);

  // Lab data state
  const [labLatest, setLabLatest] = useState<SenseHubLabReading[]>([]);
  const [labStatsByZone, setLabStatsByZone] = useState<Record<string, SenseHubLabStat[]>>({});
  const [labReadings, setLabReadings] = useState<SenseHubLabReading[]>([]);
  const [labReadingsTotal, setLabReadingsTotal] = useState(0);
  const [labNutrients, setLabNutrients] = useState<Array<{ id: string; name: string }>>([]);
  const [labLoading, setLabLoading] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [labZoneFilter, setLabZoneFilter] = useState('');
  const [labNutrientFilter, setLabNutrientFilter] = useState('');
  const [labFromDate, setLabFromDate] = useState('');
  const [labToDate, setLabToDate] = useState('');
  const [labPage, setLabPage] = useState(0);

  // Action states
  const [togglingRelay, setTogglingRelay] = useState<number | null>(null);
  const [togglingAutomation, setTogglingAutomation] = useState<number | null>(null);
  const [triggeringAutomation, setTriggeringAutomation] = useState<number | null>(null);
  const [acknowledgingAlert, setAcknowledgingAlert] = useState<number | null>(null);

  // Data Sync state
  const [syncStatus, setSyncStatus] = useState<any | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ============================================================================
  // LOAD STATUS & DATA
  // ============================================================================

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await getSenseHubStatus(farmId, blockId);
      setConnectionStatus(status);

      if (status.connected) {
        await loadDashboardData();
      } else {
        setShowConnectionForm(true);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setConnectionStatus(null);
        setShowConnectionForm(true);
      } else {
        setError(err.message || 'Failed to load SenseHub status');
      }
    } finally {
      setLoading(false);
    }
  }, [farmId, blockId]);

  const loadDashboardData = async () => {
    try {
      const dashboardData = await getSenseHubDashboard(farmId, blockId);
      setDashboard(dashboardData);
      setLastRefresh(new Date());
    } catch (err: any) {
      if (err.response?.status === 503) {
        setError('SenseHub not responding. Check if device is online.');
      } else if (err.response?.status === 504) {
        setError('Request timeout. SenseHub may be offline.');
      } else {
        setError(err.message || 'Failed to load SenseHub dashboard');
      }
    }
  };

  const loadEquipment = async () => {
    try {
      const equipmentData = await getSenseHubEquipment(farmId, blockId);
      setEquipment(equipmentData);
    } catch (err: any) {
      setError(err.message || 'Failed to load equipment');
    }
  };

  const loadAutomations = async () => {
    try {
      const automationsData = await getSenseHubAutomations(farmId, blockId);
      setAutomations(automationsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load automations');
    }
  };

  const loadAlerts = async () => {
    try {
      const alertsData = await getSenseHubAlerts(farmId, blockId);
      setAlerts(alertsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load alerts');
    }
  };

  const loadLabData = async () => {
    setLabLoading(true);
    setLabError(null);
    try {
      const params: Record<string, string | number> = {};
      if (labZoneFilter) params.zone_id = labZoneFilter;
      if (labFromDate) params.from = labFromDate;
      if (labToDate) params.to = labToDate;

      const [nutrients, latest] = await Promise.all([
        getSenseHubLabNutrients(farmId, blockId),
        getSenseHubLabLatest(farmId, blockId, labZoneFilter ? { zone_id: labZoneFilter } : undefined),
      ]);
      setLabNutrients(nutrients);
      setLabLatest(latest);

      // Build per-zone stats from latest readings so fertigation and drain aren't mixed
      const statsByZone: Record<string, SenseHubLabStat[]> = {};
      for (const r of latest) {
        const zone = r.zone_name || String(r.zone_id);
        if (!statsByZone[zone]) statsByZone[zone] = [];
        // Check if nutrient already in this zone's stats (shouldn't happen for "latest" but be safe)
        const existing = statsByZone[zone].find(s => s.nutrient === r.nutrient);
        if (existing) {
          existing.count++;
          existing.avg = (existing.avg * (existing.count - 1) + r.value) / existing.count;
          existing.min = Math.min(existing.min, r.value);
          existing.max = Math.max(existing.max, r.value);
        } else {
          statsByZone[zone].push({
            nutrient: r.nutrient,
            avg: r.value,
            min: r.value,
            max: r.value,
            count: 1,
            unit: r.unit,
          });
        }
      }
      setLabStatsByZone(statsByZone);

      // Load readings if nutrient filter is set
      if (labNutrientFilter) {
        const readingsParams: Record<string, string | number> = { nutrient: labNutrientFilter, limit: 20 };
        if (labZoneFilter) readingsParams.zone_id = labZoneFilter;
        if (labFromDate) readingsParams.from = labFromDate;
        if (labToDate) readingsParams.to = labToDate;
        const readingsData = await getSenseHubLabReadings(farmId, blockId, readingsParams as any);
        setLabReadings(readingsData.readings || []);
        setLabReadingsTotal(readingsData.total || 0);
      } else {
        setLabReadings([]);
        setLabReadingsTotal(0);
      }
    } catch (err: any) {
      if (err.response?.status === 400) {
        setLabError('MCP not configured. Connect with MCP API key to access lab data.');
      } else if (err.response?.status === 503) {
        setLabError('SenseHub not responding. Check if device is online.');
      } else {
        setLabError(err.response?.data?.detail || err.message || 'Failed to load lab data');
      }
    } finally {
      setLabLoading(false);
    }
  };

  // ============================================================================
  // DATA SYNC
  // ============================================================================

  const loadCacheStatus = useCallback(async () => {
    try {
      const status = await getSenseHubCacheStatus();
      setSyncStatus(status);
    } catch {
      // Cache status is non-critical; silently ignore errors
    }
  }, []);

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      setSyncError(null);
      await triggerSenseHubSync();
      await loadCacheStatus();
    } catch (err: any) {
      setSyncError(err.response?.data?.detail || err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadCacheStatus();
  }, [loadStatus, loadCacheStatus]);

  // Load sub-tab data when switching tabs
  useEffect(() => {
    if (!connectionStatus?.connected) return;

    if (activeSubTab === 'equipment') {
      loadEquipment();
    } else if (activeSubTab === 'automations') {
      loadAutomations();
    } else if (activeSubTab === 'alerts') {
      loadAlerts();
    } else if (activeSubTab === 'lab') {
      loadLabData();
    }
  }, [activeSubTab, connectionStatus]);

  // ============================================================================
  // AUTO-REFRESH
  // ============================================================================

  useEffect(() => {
    if (autoRefresh && connectionStatus?.connected) {
      autoRefreshInterval.current = setInterval(() => {
        loadDashboardData();
        if (activeSubTab === 'equipment') loadEquipment();
        if (activeSubTab === 'automations') loadAutomations();
        if (activeSubTab === 'alerts') loadAlerts();
        if (activeSubTab === 'lab') loadLabData();
      }, 10000); // 10 seconds

      return () => {
        if (autoRefreshInterval.current) {
          clearInterval(autoRefreshInterval.current);
        }
      };
    }
  }, [autoRefresh, connectionStatus, activeSubTab]);

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError(null);
      await connectSenseHub(farmId, blockId, connectionForm);
      setConnectionForm({ address: '', port: 3000, email: '', password: '', mcpApiKey: '', mcpPort: 3001 });
      setShowConnectionForm(false);
      await loadStatus();
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Invalid credentials. Please check email and password.');
      } else if (err.response?.status === 503) {
        setError('Cannot connect to SenseHub. Check address and port.');
      } else {
        setError(err.message || 'Failed to connect to SenseHub');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect from SenseHub?')) return;

    try {
      setError(null);
      await disconnectSenseHub(farmId, blockId);
      setConnectionStatus(null);
      setDashboard(null);
      setEquipment([]);
      setAutomations([]);
      setAlerts([]);
      setShowConnectionForm(true);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect from SenseHub');
    }
  };

  // ============================================================================
  // RELAY CONTROL
  // ============================================================================

  const handleToggleRelay = async (equipmentId: number, channel: number, currentState: boolean) => {
    try {
      setTogglingRelay(equipmentId);
      setError(null);
      await controlSenseHubRelay(farmId, blockId, equipmentId, { channel, state: !currentState });
      await loadEquipment();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle relay');
    } finally {
      setTogglingRelay(null);
    }
  };

  // ============================================================================
  // AUTOMATION CONTROL
  // ============================================================================

  const handleToggleAutomation = async (automationId: number) => {
    try {
      setTogglingAutomation(automationId);
      setError(null);
      await toggleSenseHubAutomation(farmId, blockId, automationId);
      await loadAutomations();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle automation');
    } finally {
      setTogglingAutomation(null);
    }
  };

  const handleTriggerAutomation = async (automationId: number) => {
    try {
      setTriggeringAutomation(automationId);
      setError(null);
      await triggerSenseHubAutomation(farmId, blockId, automationId);
      await loadAutomations();
    } catch (err: any) {
      setError(err.message || 'Failed to trigger automation');
    } finally {
      setTriggeringAutomation(null);
    }
  };

  // ============================================================================
  // ALERT MANAGEMENT
  // ============================================================================

  const handleAcknowledgeAlert = async (alertId: number) => {
    try {
      setAcknowledgingAlert(alertId);
      setError(null);
      await acknowledgeSenseHubAlert(farmId, blockId, alertId);
      await loadAlerts();
    } catch (err: any) {
      setError(err.message || 'Failed to acknowledge alert');
    } finally {
      setAcknowledgingAlert(null);
    }
  };

  // ============================================================================
  // MANUAL REFRESH
  // ============================================================================

  const handleRefresh = async () => {
    if (!connectionStatus?.connected) return;

    await loadDashboardData();
    if (activeSubTab === 'equipment') await loadEquipment();
    if (activeSubTab === 'automations') await loadAutomations();
    if (activeSubTab === 'alerts') await loadAlerts();
    if (activeSubTab === 'lab') await loadLabData();
  };

  // ============================================================================
  // UTILITY
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

  const getSeverityColor = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical': return '#EF4444';
      case 'warning': return '#F59E0B';
      case 'info': return '#3B82F6';
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <Container>
        <LoadingState>
          <RefreshCw size={24} />
          Loading SenseHub integration...
        </LoadingState>
      </Container>
    );
  }

  const isConnected = connectionStatus?.connected ?? false;

  return (
    <Container>
      {/* Connection Status Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Settings size={20} />
            SenseHub Connection
          </SectionTitle>
        </SectionHeader>

        {!isConnected ? (
          showConnectionForm ? (
            <ConnectionForm>
              <FormTitle>Connect to SenseHub</FormTitle>
              <FormGroup>
                <Label>SenseHub Address</Label>
                <Input
                  type="text"
                  placeholder="e.g., sensehub.local or 192.168.1.100"
                  value={connectionForm.address}
                  onChange={(e) => setConnectionForm({ ...connectionForm, address: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Port</Label>
                <Input
                  type="number"
                  placeholder="443"
                  value={connectionForm.port}
                  onChange={(e) => setConnectionForm({ ...connectionForm, port: parseInt(e.target.value) || 443 })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={connectionForm.email}
                  onChange={(e) => setConnectionForm({ ...connectionForm, email: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={connectionForm.password}
                  onChange={(e) => setConnectionForm({ ...connectionForm, password: e.target.value })}
                />
              </FormGroup>
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                  MCP API Key (optional — for AI chat integration)
                </label>
                <input
                  type="password"
                  placeholder="Leave blank if not using MCP"
                  value={connectionForm.mcpApiKey}
                  onChange={e => setConnectionForm(prev => ({ ...prev, mcpApiKey: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                  MCP Port (default: 3001)
                </label>
                <input
                  type="number"
                  value={connectionForm.mcpPort}
                  onChange={e => setConnectionForm(prev => ({ ...prev, mcpPort: parseInt(e.target.value) || 3001 }))}
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <ButtonRow>
                <ConnectButton onClick={handleConnect} disabled={connecting || !connectionForm.address || !connectionForm.email}>
                  {connecting ? 'Connecting...' : 'Connect'}
                </ConnectButton>
              </ButtonRow>
            </ConnectionForm>
          ) : (
            <ConfigEmptyState>
              <WifiOff size={48} color="#6B7280" />
              <EmptyText>Not connected to SenseHub</EmptyText>
              <ConfigButton onClick={() => setShowConnectionForm(true)}>
                Connect to SenseHub
              </ConfigButton>
            </ConfigEmptyState>
          )
        ) : (
          <ConfigCard>
            <ConfigInfo>
              <ConfigLabel>Status:</ConfigLabel>
              <ConfigValue>
                <Wifi size={16} color="#10B981" />
                Connected to {connectionStatus.address}:{connectionStatus.port}
              </ConfigValue>
            </ConfigInfo>
            {connectionStatus.senseHubVersion && (
              <ConfigInfo>
                <ConfigLabel>Version:</ConfigLabel>
                <ConfigValue>{connectionStatus.senseHubVersion}</ConfigValue>
              </ConfigInfo>
            )}
            <ConfigActions>
              <RefreshButton onClick={handleRefresh}>
                <RefreshCw size={16} />
                Refresh
              </RefreshButton>
              <AutoRefreshToggle>
                <ToggleInput
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                <ToggleLabel>Auto-refresh (10s)</ToggleLabel>
              </AutoRefreshToggle>
              <DisconnectButton onClick={handleDisconnect}>Disconnect</DisconnectButton>
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

      {/* Data Sync Section */}
      {isConnected && (
        <Section>
          <SectionHeader>
            <SectionTitle>
              <Database size={20} />
              Data Sync
            </SectionTitle>
          </SectionHeader>
          <ConfigCard>
            <ConfigInfo>
              <ConfigLabel>Last synced:</ConfigLabel>
              <ConfigValue>
                <Clock size={16} />
                {syncStatus?.cacheStats?.lastSync?.startedAt
                  ? formatTimeAgo(new Date(syncStatus.cacheStats.lastSync.startedAt))
                  : syncStatus?.lastSync
                  ? formatTimeAgo(new Date(syncStatus.lastSync))
                  : 'Never'}
              </ConfigValue>
            </ConfigInfo>
            {syncStatus?.cacheStats && (
              <ConfigInfo>
                <ConfigLabel>Cached data:</ConfigLabel>
                <LastUpdateText>
                  {syncStatus.cacheStats.equipment ?? 0} equipment &nbsp;&middot;&nbsp;
                  {syncStatus.cacheStats.alerts ?? 0} alerts &nbsp;&middot;&nbsp;
                  {syncStatus.cacheStats.labReadings ?? 0} lab readings
                </LastUpdateText>
              </ConfigInfo>
            )}
            <ConfigActions>
              <RefreshButton onClick={handleSyncNow} disabled={syncing}>
                {syncing ? (
                  <>
                    <RefreshCw size={16} />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Database size={16} />
                    Sync Now
                  </>
                )}
              </RefreshButton>
            </ConfigActions>
            {syncError && (
              <LastUpdateText style={{ color: '#991b1b' }}>
                <AlertCircle size={12} />
                {syncError}
              </LastUpdateText>
            )}
          </ConfigCard>
        </Section>
      )}

      {/* Error Display */}
      {error && (
        <ErrorBanner>
          <AlertCircle size={20} />
          <ErrorText>{error}</ErrorText>
          {isConnected && (
            <RetryButton onClick={handleRefresh}>Retry</RetryButton>
          )}
        </ErrorBanner>
      )}

      {/* Sub-tabs (only show when connected) */}
      {isConnected && (
        <>
          <SubTabBar>
            <SubTab $active={activeSubTab === 'overview'} onClick={() => setActiveSubTab('overview')}>
              <TrendingUp size={16} />
              Overview
            </SubTab>
            <SubTab $active={activeSubTab === 'equipment'} onClick={() => setActiveSubTab('equipment')}>
              <Activity size={16} />
              Equipment
            </SubTab>
            <SubTab $active={activeSubTab === 'automations'} onClick={() => setActiveSubTab('automations')}>
              <Zap size={16} />
              Automations
            </SubTab>
            <SubTab $active={activeSubTab === 'alerts'} onClick={() => setActiveSubTab('alerts')}>
              <Bell size={16} />
              Alerts {dashboard?.alerts?.unacknowledged > 0 && <AlertBadge>{dashboard.alerts.unacknowledged}</AlertBadge>}
            </SubTab>
            <SubTab $active={activeSubTab === 'lab'} onClick={() => setActiveSubTab('lab')}>
              <FlaskConical size={16} />
              Lab Data
            </SubTab>
          </SubTabBar>

          {/* Overview Tab */}
          {activeSubTab === 'overview' && dashboard && (
            <Section>
              <SectionHeader>
                <SectionTitle>Dashboard Summary</SectionTitle>
              </SectionHeader>
              <StatsGrid>
                <StatCard>
                  <StatLabel>Equipment</StatLabel>
                  <StatValue>{dashboard.equipment.total}</StatValue>
                  <StatBreakdown>
                    <StatItem $color="#10B981">{dashboard.equipment.online} online</StatItem>
                    <StatItem $color="#EF4444">{dashboard.equipment.offline} offline</StatItem>
                    {dashboard.equipment.error > 0 && <StatItem $color="#F59E0B">{dashboard.equipment.error} error</StatItem>}
                  </StatBreakdown>
                </StatCard>

                <StatCard>
                  <StatLabel>Automations</StatLabel>
                  <StatValue>{dashboard.automations.total}</StatValue>
                  <StatBreakdown>
                    <StatItem $color="#10B981">{dashboard.automations.active} active</StatItem>
                  </StatBreakdown>
                </StatCard>

                <StatCard>
                  <StatLabel>Alerts</StatLabel>
                  <StatValue>{dashboard.alerts.unacknowledged}</StatValue>
                  <StatBreakdown>
                    {dashboard.alerts.critical > 0 && <StatItem $color="#EF4444">{dashboard.alerts.critical} critical</StatItem>}
                    {dashboard.alerts.warning > 0 && <StatItem $color="#F59E0B">{dashboard.alerts.warning} warning</StatItem>}
                    {dashboard.alerts.info > 0 && <StatItem $color="#3B82F6">{dashboard.alerts.info} info</StatItem>}
                  </StatBreakdown>
                </StatCard>
              </StatsGrid>

              {dashboard.recent_alerts && dashboard.recent_alerts.length > 0 && (
                <>
                  <SectionHeader style={{ marginTop: '24px' }}>
                    <SectionTitle>Recent Alerts</SectionTitle>
                  </SectionHeader>
                  <AlertsList>
                    {dashboard.recent_alerts.slice(0, 5).map((alert) => (
                      <AlertCard key={alert.id} $severity={alert.severity}>
                        <AlertHeader>
                          <AlertTitle>{alert.message}</AlertTitle>
                          <AlertBadge style={{ background: getSeverityColor(alert.severity) }}>
                            {alert.severity}
                          </AlertBadge>
                        </AlertHeader>
                        <AlertMeta>
                          {alert.equipment_name} • {alert.zone_name} • {new Date(alert.created_at).toLocaleString()}
                        </AlertMeta>
                      </AlertCard>
                    ))}
                  </AlertsList>
                </>
              )}
            </Section>
          )}

          {/* Equipment Tab */}
          {activeSubTab === 'equipment' && (
            <Section>
              <SectionHeader>
                <SectionTitle>Equipment</SectionTitle>
                <SectionSubtitle>{equipment.length} devices</SectionSubtitle>
              </SectionHeader>

              {equipment.length === 0 ? (
                <EmptyState>
                  <EmptyIcon>
                    <Activity size={32} />
                  </EmptyIcon>
                  <EmptyText>No equipment found</EmptyText>
                </EmptyState>
              ) : (
                <EquipmentGrid>
                  {equipment.map((item) => (
                    <EquipmentCard key={item.id}>
                      <EquipmentHeader>
                        <EquipmentIconWrapper $online={item.status === 'online'}>
                          {item.type === 'sensor' ? <Thermometer size={20} /> : <Power size={20} />}
                        </EquipmentIconWrapper>
                        <EquipmentInfo>
                          <EquipmentName>{item.name}</EquipmentName>
                          <EquipmentMeta>
                            <StatusDot $online={item.status === 'online'} />
                            <EquipmentStatus>{item.status}</EquipmentStatus>
                            <EquipmentType>{item.type}</EquipmentType>
                          </EquipmentMeta>
                        </EquipmentInfo>
                      </EquipmentHeader>

                      {item.type === 'sensor' && item.last_reading && (() => {
                        // Parse last_reading - SenseHub returns it as a JSON string
                        // Structure: {"values": {"Temperature": {"value": 22.3, "unit": "°C"}, ...}}
                        let sensorValues: Record<string, { value: number; unit: string }> = {};
                        try {
                          const parsed = typeof item.last_reading === 'string'
                            ? JSON.parse(item.last_reading)
                            : item.last_reading;
                          sensorValues = parsed?.values || parsed || {};
                        } catch { /* ignore parse errors */ }

                        const entries = Object.entries(sensorValues);
                        if (entries.length === 0) return null;

                        return (
                          <ReadingsContainer>
                            {entries.map(([key, reading]) => (
                              <ReadingRow key={key}>
                                <ReadingLabel>{key}:</ReadingLabel>
                                <ReadingValue>
                                  {typeof reading === 'object' && reading !== null
                                    ? `${reading.value} ${reading.unit || ''}`
                                    : String(reading)}
                                </ReadingValue>
                              </ReadingRow>
                            ))}
                          </ReadingsContainer>
                        );
                      })()}

                      {item.type === 'relay' && !item.write_only && (() => {
                        // Parse last_reading - SenseHub returns it as a JSON string
                        // Structure: {"relayStates": {"0": true, "1": false, ...}}
                        let relayStates: Record<string, boolean> = {};
                        try {
                          const parsed = typeof item.last_reading === 'string'
                            ? JSON.parse(item.last_reading)
                            : item.last_reading;
                          relayStates = parsed?.relayStates || {};
                        } catch { /* ignore parse errors */ }

                        return (
                          <RelayControls>
                            {item.register_mappings.map((mapping) => {
                              const regKey = String(mapping.register);
                              const channel = parseInt(regKey, 10);
                              const isOn = relayStates[regKey] === true;
                              return (
                                <RelayControl key={mapping.name}>
                                  <RelayLabel>{mapping.label || mapping.name}</RelayLabel>
                                  <ToggleRelayButton
                                    $isOn={isOn}
                                    onClick={() => handleToggleRelay(item.id, channel, isOn)}
                                    disabled={item.status !== 'online' || togglingRelay === item.id}
                                  >
                                    {togglingRelay === item.id ? '...' : isOn ? 'ON' : 'OFF'}
                                  </ToggleRelayButton>
                                </RelayControl>
                              );
                            })}
                          </RelayControls>
                        );
                      })()}
                    </EquipmentCard>
                  ))}
                </EquipmentGrid>
              )}
            </Section>
          )}

          {/* Automations Tab */}
          {activeSubTab === 'automations' && (
            <Section>
              <SectionHeader>
                <SectionTitle>Automations</SectionTitle>
                <SectionSubtitle>{automations.length} configured</SectionSubtitle>
              </SectionHeader>

              {automations.length === 0 ? (
                <EmptyState>
                  <EmptyIcon>
                    <Zap size={32} />
                  </EmptyIcon>
                  <EmptyText>No automations configured</EmptyText>
                </EmptyState>
              ) : (
                <AutomationsList>
                  {automations.map((automation) => (
                    <AutomationCard key={automation.id}>
                      <AutomationHeader>
                        <AutomationInfo>
                          <AutomationName>{automation.name}</AutomationName>
                          <AutomationDescription>{automation.description}</AutomationDescription>
                        </AutomationInfo>
                        <AutomationBadge $enabled={automation.enabled}>
                          {automation.enabled ? 'Enabled' : 'Disabled'}
                        </AutomationBadge>
                      </AutomationHeader>

                      <AutomationMeta>
                        Priority: {automation.priority} • Run count: {automation.run_count}
                        {automation.last_run && ` • Last run: ${new Date(automation.last_run).toLocaleString()}`}
                      </AutomationMeta>

                      <AutomationActions>
                        <AutomationButton
                          onClick={() => handleToggleAutomation(automation.id)}
                          disabled={togglingAutomation === automation.id}
                        >
                          {togglingAutomation === automation.id ? (
                            'Toggling...'
                          ) : automation.enabled ? (
                            <><Pause size={14} /> Disable</>
                          ) : (
                            <><Play size={14} /> Enable</>
                          )}
                        </AutomationButton>

                        <AutomationButton
                          onClick={() => handleTriggerAutomation(automation.id)}
                          disabled={triggeringAutomation === automation.id || !automation.enabled}
                        >
                          {triggeringAutomation === automation.id ? (
                            'Running...'
                          ) : (
                            <><Play size={14} /> Trigger Now</>
                          )}
                        </AutomationButton>
                      </AutomationActions>
                    </AutomationCard>
                  ))}
                </AutomationsList>
              )}
            </Section>
          )}

          {/* Alerts Tab */}
          {activeSubTab === 'alerts' && (
            <Section>
              <SectionHeader>
                <SectionTitle>Alerts</SectionTitle>
                <SectionSubtitle>{alerts.length} total</SectionSubtitle>
              </SectionHeader>

              {alerts.length === 0 ? (
                <EmptyState>
                  <EmptyIcon>
                    <Bell size={32} />
                  </EmptyIcon>
                  <EmptyText>No alerts</EmptyText>
                </EmptyState>
              ) : (
                <AlertsList>
                  {alerts.map((alert) => (
                    <AlertCard key={alert.id} $severity={alert.severity}>
                      <AlertHeader>
                        <AlertTitle>{alert.message}</AlertTitle>
                        <AlertBadge style={{ background: getSeverityColor(alert.severity) }}>
                          {alert.severity}
                        </AlertBadge>
                      </AlertHeader>

                      <AlertMeta>
                        Equipment: {alert.equipment_name} • Zone: {alert.zone_name}
                        <br />
                        Created: {new Date(alert.created_at).toLocaleString()}
                      </AlertMeta>

                      {!alert.acknowledged && (
                        <AcknowledgeButton
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          disabled={acknowledgingAlert === alert.id}
                        >
                          {acknowledgingAlert === alert.id ? (
                            'Acknowledging...'
                          ) : (
                            <><CheckCircle size={14} /> Acknowledge</>
                          )}
                        </AcknowledgeButton>
                      )}

                      {alert.acknowledged && (
                        <AcknowledgedText>
                          <CheckCircle size={14} />
                          Acknowledged
                        </AcknowledgedText>
                      )}
                    </AlertCard>
                  ))}
                </AlertsList>
              )}
            </Section>
          )}
          {/* Lab Data Tab */}
          {activeSubTab === 'lab' && (
            <Section>
              <SectionHeader>
                <SectionTitle><FlaskConical size={20} /> Lab Data</SectionTitle>
                <SectionSubtitle>Nutrient analysis from fertigation and drain systems</SectionSubtitle>
              </SectionHeader>

              {/* Filters */}
              <LabFilters>
                <LabFilterGroup>
                  <Label>Zone</Label>
                  <LabSelect value={labZoneFilter} onChange={(e) => setLabZoneFilter(e.target.value)}>
                    <option value="">All Zones</option>
                    {[...new Set(labLatest.map(r => r.zone_id))].map(zid => {
                      const name = labLatest.find(r => r.zone_id === zid)?.zone_name || zid;
                      return <option key={zid} value={zid}>{name}</option>;
                    })}
                  </LabSelect>
                </LabFilterGroup>
                <LabFilterGroup>
                  <Label>Nutrient</Label>
                  <LabSelect value={labNutrientFilter} onChange={(e) => setLabNutrientFilter(e.target.value)}>
                    <option value="">All Nutrients</option>
                    {labNutrients.map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </LabSelect>
                </LabFilterGroup>
                <LabFilterGroup>
                  <Label>From</Label>
                  <Input type="date" value={labFromDate} onChange={(e) => setLabFromDate(e.target.value)} />
                </LabFilterGroup>
                <LabFilterGroup>
                  <Label>To</Label>
                  <Input type="date" value={labToDate} onChange={(e) => setLabToDate(e.target.value)} />
                </LabFilterGroup>
                <LabApplyButton onClick={() => { setLabPage(0); loadLabData(); }}>
                  <Filter size={14} /> Apply
                </LabApplyButton>
              </LabFilters>

              {labError && (
                <ErrorBanner>
                  <AlertCircle size={20} />
                  <ErrorText>{labError}</ErrorText>
                  <RetryButton onClick={loadLabData}>Retry</RetryButton>
                </ErrorBanner>
              )}

              {labLoading && !labError && (
                <LoadingState>
                  <RefreshCw size={24} className="spin" />
                  Loading lab data...
                </LoadingState>
              )}

              {!labLoading && !labError && labLatest.length === 0 && (
                <EmptyState>
                  <EmptyIcon><FlaskConical size={48} /></EmptyIcon>
                  <EmptyText>No lab data available yet.</EmptyText>
                </EmptyState>
              )}

              {!labLoading && !labError && labLatest.length > 0 && (
                <>
                  {/* Latest Readings by Zone */}
                  <LabSectionTitle><Droplet size={16} /> Latest Readings</LabSectionTitle>
                  {(() => {
                    const zones = [...new Set(labLatest.map(r => r.zone_name))];
                    return (
                      <LabZoneGrid>
                        {zones.map(zone => (
                          <LabZoneCard key={zone}>
                            <LabZoneHeader>{zone}</LabZoneHeader>
                            <LabReadingsGrid>
                              {labLatest.filter(r => r.zone_name === zone).map(r => (
                                <LabReadingCard key={`${r.zone_id}-${r.nutrient}`}>
                                  <LabReadingNutrient>{r.nutrient}</LabReadingNutrient>
                                  <LabReadingValue>{typeof r.value === 'number' ? r.value.toFixed(2) : r.value}</LabReadingValue>
                                  <LabReadingUnit>{r.unit}</LabReadingUnit>
                                  <LabReadingDate>{new Date(r.sample_date).toLocaleDateString()}</LabReadingDate>
                                </LabReadingCard>
                              ))}
                            </LabReadingsGrid>
                          </LabZoneCard>
                        ))}
                      </LabZoneGrid>
                    );
                  })()}

                  {/* Zone Comparison (only when no zone filter) */}
                  {!labZoneFilter && labLatest.length > 0 && (() => {
                    const zones = [...new Set(labLatest.map(r => r.zone_name))];
                    const nutrients = [...new Set(labLatest.map(r => r.nutrient))];
                    if (zones.length < 2) return null;
                    return (
                      <>
                        <LabSectionTitle><BarChart3 size={16} /> Zone Comparison</LabSectionTitle>
                        <LabTable>
                          <thead>
                            <tr>
                              <LabTh>Nutrient</LabTh>
                              {zones.map(z => <LabTh key={z}>{z}</LabTh>)}
                            </tr>
                          </thead>
                          <tbody>
                            {nutrients.map(nutrient => {
                              const unit = labLatest.find(r => r.nutrient === nutrient)?.unit || '';
                              return (
                                <tr key={nutrient}>
                                  <LabTd><strong>{nutrient}</strong> <span style={{ color: '#9e9e9e', fontSize: 12 }}>({unit})</span></LabTd>
                                  {zones.map(zone => {
                                    const reading = labLatest.find(r => r.zone_name === zone && r.nutrient === nutrient);
                                    return (
                                      <LabTd key={zone}>
                                        {reading ? (typeof reading.value === 'number' ? reading.value.toFixed(2) : reading.value) : '-'}
                                      </LabTd>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </LabTable>
                      </>
                    );
                  })()}

                  {/* Nutrient Summary (per zone) */}
                  {Object.keys(labStatsByZone).length > 0 && (
                    <>
                      <LabSectionTitle><TrendingUp size={16} /> Nutrient Summary</LabSectionTitle>
                      {Object.entries(labStatsByZone).map(([zoneName, stats]) => (
                        stats.length > 0 && (
                          <div key={zoneName}>
                            <LabZoneStatsHeader>{zoneName}</LabZoneStatsHeader>
                            <LabTable>
                              <thead>
                                <tr>
                                  <LabTh>Nutrient</LabTh>
                                  <LabTh>Value</LabTh>
                                  <LabTh>Unit</LabTh>
                                </tr>
                              </thead>
                              <tbody>
                                {stats.map(s => (
                                  <tr key={s.nutrient}>
                                    <LabTd><strong>{s.nutrient}</strong></LabTd>
                                    <LabTd>{typeof s.avg === 'number' ? s.avg.toFixed(2) : s.avg}</LabTd>
                                    <LabTd>{s.unit}</LabTd>
                                  </tr>
                                ))}
                              </tbody>
                            </LabTable>
                          </div>
                        )
                      ))}
                    </>
                  )}

                  {/* History (when nutrient filter active) */}
                  {labNutrientFilter && labReadings.length > 0 && (
                    <>
                      <LabSectionTitle><Clock size={16} /> Reading History: {labNutrientFilter}</LabSectionTitle>
                      <LabTable>
                        <thead>
                          <tr>
                            <LabTh>Date</LabTh>
                            <LabTh>Value</LabTh>
                            <LabTh>Unit</LabTh>
                            <LabTh>Zone</LabTh>
                            <LabTh>Notes</LabTh>
                          </tr>
                        </thead>
                        <tbody>
                          {labReadings.map(r => (
                            <tr key={r.id}>
                              <LabTd>{new Date(r.sample_date).toLocaleString()}</LabTd>
                              <LabTd><strong>{typeof r.value === 'number' ? r.value.toFixed(2) : r.value}</strong></LabTd>
                              <LabTd>{r.unit}</LabTd>
                              <LabTd>{r.zone_name}</LabTd>
                              <LabTd>{r.notes || '-'}</LabTd>
                            </tr>
                          ))}
                        </tbody>
                      </LabTable>
                      {labReadingsTotal > 20 && (
                        <LabPagination>
                          <AutomationButton
                            disabled={labPage === 0}
                            onClick={() => setLabPage(p => Math.max(0, p - 1))}
                          >
                            <ChevronLeft size={14} /> Prev
                          </AutomationButton>
                          <span style={{ fontSize: 14, color: '#616161' }}>
                            Page {labPage + 1} of {Math.ceil(labReadingsTotal / 20)}
                          </span>
                          <AutomationButton
                            disabled={(labPage + 1) * 20 >= labReadingsTotal}
                            onClick={() => setLabPage(p => p + 1)}
                          >
                            Next <ChevronRight size={14} />
                          </AutomationButton>
                        </LabPagination>
                      )}
                    </>
                  )}
                </>
              )}
            </Section>
          )}
        </>
      )}
      {/* AI Chat Widget (only when SenseHub is connected) */}
      <FarmAIChat farmId={farmId} blockId={blockId} isConnected={isConnected} />
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SectionTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const SectionSubtitle = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ConfigEmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 16px;
  background: ${({ theme }) => theme.colors.surface};
  border: 2px dashed ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 16px;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ConfigButton = styled.button`
  padding: 8px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1d4ed8;
  }
`;

const ConnectionForm = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 500px;
`;

const FormTitle = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Input = styled.input`
  padding: 8px 16px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px #bfdbfe;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ConnectButton = styled.button`
  padding: 8px 24px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
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

const ConfigCard = styled.div`
  padding: 16px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ConfigInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ConfigLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ConfigValue = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'Courier New', monospace;
`;

const ConfigActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[300]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AutoRefreshToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ToggleInput = styled.input`
  cursor: pointer;
`;

const ToggleLabel = styled.label`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
`;

const DisconnectButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
  }
`;

const LastUpdateText = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ErrorText = styled.div`
  flex: 1;
  font-size: 14px;
`;

const RetryButton = styled.button`
  padding: 4px 8px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #b91c1c;
  }
`;

const SubTabBar = styled.div`
  display: flex;
  gap: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  padding-bottom: 4px;
`;

const SubTab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: ${({ $active }) => ($active ? '#e3f2fd' : 'transparent')};
  color: ${({ $active, theme }) => ($active ? '#3b82f6' : theme.colors.textSecondary)};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? '#3b82f6' : 'transparent')};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.infoBg};
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const AlertBadge = styled.span`
  background: ${({ theme }) => theme.colors.error};
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  min-width: 18px;
  text-align: center;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatValue = styled.div`
  font-size: 30px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatBreakdown = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatItem = styled.div<{ $color: string }>`
  font-size: 12px;
  color: ${({ $color }) => $color};
  font-weight: 500;
`;

const AlertsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AlertCard = styled.div<{ $severity: 'critical' | 'warning' | 'info' }>`
  background: ${({ theme }) => theme.colors.background};
  border-left: 4px solid ${({ $severity }) => {
    switch ($severity) {
      case 'critical': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
    }
  }};
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AlertHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const AlertTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  flex: 1;
`;

const AlertMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const AcknowledgeButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  align-self: flex-start;

  &:hover:not(:disabled) {
    background: #1d4ed8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AcknowledgedText = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #10b981;
  font-weight: 500;
`;

const EquipmentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`;

const EquipmentCard = styled.div`
  padding: 16px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border-color: #93c5fd;
  }
`;

const EquipmentHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const EquipmentIconWrapper = styled.div<{ $online: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: ${({ $online }) => ($online ? '#10b98115' : '#6b728015')};
  color: ${({ $online }) => ($online ? '#10b981' : '#6b7280')};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const EquipmentInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
`;

const EquipmentName = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const EquipmentMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const StatusDot = styled.div<{ $online: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $online }) => ($online ? '#10b981' : '#ef4444')};
`;

const EquipmentStatus = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const EquipmentType = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  padding: 2px 6px;
  background: ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 4px;
`;

const ReadingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const ReadingRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const ReadingLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const ReadingValue = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const RelayControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const RelayControl = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const RelayLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ToggleRelayButton = styled.button<{ $isOn: boolean }>`
  padding: 4px 12px;
  background: ${({ $isOn, theme }) => ($isOn ? '#10b981' : theme.colors.neutral[300])};
  color: ${({ $isOn, theme }) => ($isOn ? 'white' : theme.colors.textPrimary)};
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-width: 50px;

  &:hover:not(:disabled) {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AutomationsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AutomationCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AutomationHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const AutomationInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
`;

const AutomationName = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AutomationDescription = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const AutomationBadge = styled.span<{ $enabled: boolean }>`
  padding: 4px 12px;
  background: ${({ $enabled }) => ($enabled ? '#10b98115' : '#6b728015')};
  color: ${({ $enabled }) => ($enabled ? '#10b981' : '#6b7280')};
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
`;

const AutomationMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const AutomationActions = styled.div`
  display: flex;
  gap: 8px;
`;

const AutomationButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[300]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Lab Data styled components

const LabFilters = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
`;

const LabFilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const LabSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  min-width: 140px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px #bfdbfe;
  }
`;

const LabApplyButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1d4ed8;
  }
`;

const LabSectionTitle = styled.h4`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 8px 0 0 0;
`;

const LabZoneGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
`;

const LabZoneCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  padding: 16px;
`;

const LabZoneHeader = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const LabReadingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
`;

const LabReadingCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  padding: 8px;
  text-align: center;
`;

const LabReadingNutrient = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const LabReadingValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 4px 0 2px;
`;

const LabReadingUnit = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const LabReadingDate = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textDisabled};
  margin-top: 4px;
`;

const LabTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  overflow: hidden;
`;

const LabTh = styled.th`
  padding: 10px 12px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const LabTd = styled.td`
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface};
`;

const LabZoneStatsHeader = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary[500]};
  margin-top: 8px;
  padding: 6px 12px;
  background: ${({ theme }) => theme.colors.infoBg};
  border-radius: 6px 6px 0 0;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-bottom: none;
`;

const LabPagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 0;
`;
