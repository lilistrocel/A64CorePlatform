/**
 * Block Automation Tab
 *
 * Displays automation systems for a block:
 * - Sensors (IoT devices monitoring environmental conditions)
 * - Controllers (Actuators and relays for automated control)
 * - AI Logic (Automation rules and decision-making systems)
 *
 * NOTE: Currently using mock data. Backend integration pending.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { Droplet, Thermometer, Sun, Wind, Zap, Power, Lightbulb, AlertCircle, CheckCircle, Clock } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface SensorData {
  id: string;
  name: string;
  type: 'temperature' | 'humidity' | 'soil_moisture' | 'light' | 'air_quality';
  value: number;
  unit: string;
  status: 'online' | 'offline' | 'warning';
  lastUpdated: string;
  icon: typeof Thermometer;
}

interface ControllerData {
  id: string;
  name: string;
  type: 'irrigation' | 'lighting' | 'ventilation' | 'heating';
  status: 'on' | 'off';
  connectionStatus: 'online' | 'offline';
  lastAction: string;
  manualOverride: boolean;
  icon: typeof Droplet;
}

interface AutomationRule {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'triggered';
  condition: string;
  action: string;
  lastTriggered?: string;
  priority: 'high' | 'medium' | 'low';
}

interface BlockAutomationTabProps {
  blockId: string;
  farmId: string;
}

// ============================================================================
// MOCK DATA
// ============================================================================

const getMockSensors = (): SensorData[] => [
  {
    id: 'sensor-1',
    name: 'Primary Temperature Sensor',
    type: 'temperature',
    value: 24.5,
    unit: '°C',
    status: 'online',
    lastUpdated: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    icon: Thermometer,
  },
  {
    id: 'sensor-2',
    name: 'Humidity Sensor',
    type: 'humidity',
    value: 68,
    unit: '%',
    status: 'online',
    lastUpdated: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    icon: Droplet,
  },
  {
    id: 'sensor-3',
    name: 'Soil Moisture Sensor',
    type: 'soil_moisture',
    value: 45,
    unit: '%',
    status: 'warning',
    lastUpdated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    icon: Droplet,
  },
  {
    id: 'sensor-4',
    name: 'Light Level Sensor',
    type: 'light',
    value: 850,
    unit: 'lux',
    status: 'online',
    lastUpdated: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    icon: Sun,
  },
  {
    id: 'sensor-5',
    name: 'Air Quality Monitor',
    type: 'air_quality',
    value: 92,
    unit: 'AQI',
    status: 'online',
    lastUpdated: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    icon: Wind,
  },
];

const getMockControllers = (): ControllerData[] => [
  {
    id: 'ctrl-1',
    name: 'Main Irrigation Pump',
    type: 'irrigation',
    status: 'off',
    connectionStatus: 'online',
    lastAction: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    manualOverride: false,
    icon: Droplet,
  },
  {
    id: 'ctrl-2',
    name: 'LED Grow Lights',
    type: 'lighting',
    status: 'on',
    connectionStatus: 'online',
    lastAction: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    manualOverride: false,
    icon: Lightbulb,
  },
  {
    id: 'ctrl-3',
    name: 'Ventilation Fan',
    type: 'ventilation',
    status: 'on',
    connectionStatus: 'online',
    lastAction: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    manualOverride: true,
    icon: Wind,
  },
  {
    id: 'ctrl-4',
    name: 'Secondary Irrigation',
    type: 'irrigation',
    status: 'off',
    connectionStatus: 'offline',
    lastAction: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    manualOverride: false,
    icon: Droplet,
  },
];

const getMockAutomationRules = (): AutomationRule[] => [
  {
    id: 'rule-1',
    name: 'Auto-Irrigation Schedule',
    status: 'active',
    condition: 'IF soil moisture < 40% AND time = 06:00',
    action: 'THEN activate Main Irrigation Pump for 15 minutes',
    lastTriggered: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    priority: 'high',
  },
  {
    id: 'rule-2',
    name: 'Temperature Control',
    status: 'active',
    condition: 'IF temperature > 28°C',
    action: 'THEN activate Ventilation Fan at 80% speed',
    lastTriggered: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    priority: 'high',
  },
  {
    id: 'rule-3',
    name: 'Daylight Grow Lights',
    status: 'active',
    condition: 'IF light level < 500 lux AND time between 06:00-18:00',
    action: 'THEN turn ON LED Grow Lights',
    lastTriggered: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    priority: 'medium',
  },
  {
    id: 'rule-4',
    name: 'Night Mode Shutdown',
    status: 'active',
    condition: 'IF time = 20:00',
    action: 'THEN turn OFF all grow lights',
    priority: 'medium',
  },
  {
    id: 'rule-5',
    name: 'Emergency Overheat Protection',
    status: 'inactive',
    condition: 'IF temperature > 35°C',
    action: 'THEN activate all ventilation AND send alert',
    priority: 'high',
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockAutomationTab({ blockId, farmId }: BlockAutomationTabProps) {
  const [sensors] = useState<SensorData[]>(getMockSensors());
  const [controllers] = useState<ControllerData[]>(getMockControllers());
  const [automationRules] = useState<AutomationRule[]>(getMockAutomationRules());

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const getSensorStatusColor = (status: SensorData['status']) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'offline': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getControllerStatusColor = (status: ControllerData['status']) => {
    return status === 'on' ? '#10B981' : '#6B7280';
  };

  const getRulePriorityColor = (priority: AutomationRule['priority']) => {
    switch (priority) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      case 'low': return '#3B82F6';
      default: return '#6B7280';
    }
  };

  return (
    <Container>
      {/* Mock Data Notice */}
      <NoticeCard>
        <AlertCircle size={20} />
        <NoticeText>
          <strong>Demo Mode:</strong> This tab displays mock automation data. Backend integration for IoT sensors
          and controllers is pending implementation.
        </NoticeText>
      </NoticeCard>

      {/* Sensors Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Zap size={20} />
            Sensors & Environmental Monitoring
          </SectionTitle>
          <SectionSubtitle>{sensors.length} sensors registered</SectionSubtitle>
        </SectionHeader>

        <SensorGrid>
          {sensors.map((sensor) => {
            const Icon = sensor.icon;
            return (
              <SensorCard key={sensor.id}>
                <SensorHeader>
                  <SensorIconWrapper $color={getSensorStatusColor(sensor.status)}>
                    <Icon size={20} />
                  </SensorIconWrapper>
                  <SensorInfo>
                    <SensorName>{sensor.name}</SensorName>
                    <SensorMeta>
                      <StatusDot $color={getSensorStatusColor(sensor.status)} />
                      <SensorStatus>{sensor.status}</SensorStatus>
                    </SensorMeta>
                  </SensorInfo>
                </SensorHeader>

                <SensorReading>
                  <ReadingValue>{sensor.value}</ReadingValue>
                  <ReadingUnit>{sensor.unit}</ReadingUnit>
                </SensorReading>

                <SensorFooter>
                  <FooterText>
                    <Clock size={12} />
                    Updated {formatTimeAgo(sensor.lastUpdated)}
                  </FooterText>
                </SensorFooter>
              </SensorCard>
            );
          })}
        </SensorGrid>
      </Section>

      {/* Controllers Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Power size={20} />
            Controllers & Actuators
          </SectionTitle>
          <SectionSubtitle>{controllers.length} controllers configured</SectionSubtitle>
        </SectionHeader>

        <ControllerGrid>
          {controllers.map((controller) => {
            const Icon = controller.icon;
            return (
              <ControllerCard key={controller.id} $isOffline={controller.connectionStatus === 'offline'}>
                <ControllerHeader>
                  <ControllerIconWrapper $color={getControllerStatusColor(controller.status)}>
                    <Icon size={20} />
                  </ControllerIconWrapper>
                  <ControllerInfo>
                    <ControllerName>{controller.name}</ControllerName>
                    <ControllerType>{controller.type.replace('_', ' ')}</ControllerType>
                  </ControllerInfo>
                </ControllerHeader>

                <ControllerStatus>
                  <StatusRow>
                    <StatusLabel>Power:</StatusLabel>
                    <StatusBadge $color={getControllerStatusColor(controller.status)}>
                      {controller.status.toUpperCase()}
                    </StatusBadge>
                  </StatusRow>
                  <StatusRow>
                    <StatusLabel>Connection:</StatusLabel>
                    <StatusBadge $color={controller.connectionStatus === 'online' ? '#10B981' : '#EF4444'}>
                      {controller.connectionStatus}
                    </StatusBadge>
                  </StatusRow>
                  {controller.manualOverride && (
                    <OverrideBadge>Manual Override Active</OverrideBadge>
                  )}
                </ControllerStatus>

                <ControllerFooter>
                  <FooterText>
                    <Clock size={12} />
                    Last action {formatTimeAgo(controller.lastAction)}
                  </FooterText>
                  <ToggleButton
                    $isOn={controller.status === 'on'}
                    disabled={controller.connectionStatus === 'offline'}
                  >
                    Toggle
                  </ToggleButton>
                </ControllerFooter>
              </ControllerCard>
            );
          })}
        </ControllerGrid>
      </Section>

      {/* AI Logic & Automation Rules Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <AlertCircle size={20} />
            AI Logic & Automation Rules
          </SectionTitle>
          <SectionSubtitle>{automationRules.length} rules configured</SectionSubtitle>
        </SectionHeader>

        <RulesList>
          {automationRules.map((rule) => (
            <RuleCard key={rule.id} $status={rule.status}>
              <RuleHeader>
                <RuleHeaderLeft>
                  <RuleName>{rule.name}</RuleName>
                  <RuleBadges>
                    <PriorityBadge $color={getRulePriorityColor(rule.priority)}>
                      {rule.priority} priority
                    </PriorityBadge>
                    <StatusBadge
                      $color={rule.status === 'active' ? '#10B981' : rule.status === 'triggered' ? '#F59E0B' : '#6B7280'}
                    >
                      {rule.status === 'active' ? (
                        <>
                          <CheckCircle size={14} /> Active
                        </>
                      ) : (
                        rule.status
                      )}
                    </StatusBadge>
                  </RuleBadges>
                </RuleHeaderLeft>
              </RuleHeader>

              <RuleLogic>
                <LogicBlock>
                  <LogicLabel>Condition:</LogicLabel>
                  <LogicText>{rule.condition}</LogicText>
                </LogicBlock>
                <LogicArrow>→</LogicArrow>
                <LogicBlock>
                  <LogicLabel>Action:</LogicLabel>
                  <LogicText>{rule.action}</LogicText>
                </LogicBlock>
              </RuleLogic>

              {rule.lastTriggered && (
                <RuleFooter>
                  <FooterText>
                    <Clock size={12} />
                    Last triggered {formatTimeAgo(rule.lastTriggered)}
                  </FooterText>
                </RuleFooter>
              )}
            </RuleCard>
          ))}
        </RulesList>
      </Section>
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

const NoticeCard = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: #FEF3C7;
  border: 1px solid #F59E0B;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: #92400E;
`;

const NoticeText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  line-height: 1.5;

  strong {
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
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

const SensorIconWrapper = styled.div<{ $color: string }>`
  width: 40px;
  height: 40px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
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

const StatusDot = styled.div<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

const SensorStatus = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const SensorReading = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ReadingValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ReadingUnit = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SensorFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const FooterText = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Controller Styles
const ControllerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const ControllerCard = styled.div<{ $isOffline: boolean }>`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  transition: all 150ms ease-in-out;
  opacity: ${({ $isOffline }) => ($isOffline ? 0.6 : 1)};

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    border-color: ${({ theme }) => theme.colors.primary[300]};
  }
`;

const ControllerHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ControllerIconWrapper = styled.div<{ $color: string }>`
  width: 48px;
  height: 48px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const ControllerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  flex: 1;
`;

const ControllerName = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ControllerType = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const ControllerStatus = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const StatusRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const StatusLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StatusBadge = styled.div<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 4px 8px;
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-transform: uppercase;
`;

const OverrideBadge = styled.div`
  padding: 6px 12px;
  background: #FEF3C7;
  border: 1px solid #F59E0B;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: #92400E;
  text-align: center;
`;

const ControllerFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ToggleButton = styled.button<{ $isOn: boolean }>`
  padding: 6px 16px;
  background: ${({ $isOn, theme }) => ($isOn ? theme.colors.success : theme.colors.neutral[300])};
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

// Automation Rules Styles
const RulesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const RuleCard = styled.div<{ $status: string }>`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-left: 4px solid ${({ $status }) => {
    switch ($status) {
      case 'active': return '#10B981';
      case 'triggered': return '#F59E0B';
      case 'inactive': return '#6B7280';
      default: return '#6B7280';
    }
  }};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const RuleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const RuleHeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  flex: 1;
`;

const RuleName = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const RuleBadges = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const PriorityBadge = styled.div<{ $color: string }>`
  padding: 4px 8px;
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-transform: uppercase;
`;

const RuleLogic = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const LogicBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  flex: 1;
  min-width: 200px;
`;

const LogicLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const LogicText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'Courier New', monospace;
  background: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const LogicArrow = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.primary[500]};
  flex-shrink: 0;

  @media (max-width: 768px) {
    transform: rotate(90deg);
  }
`;

const RuleFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;
