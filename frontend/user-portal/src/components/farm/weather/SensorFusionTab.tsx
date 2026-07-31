/**
 * SensorFusionTab Component
 *
 * Placeholder tab for future IoT sensor integration.
 * Shows empty state with call-to-action to connect sensors.
 */

import styled from 'styled-components';
import {
  Satellite,
  Thermometer,
  Droplet,
  Sun,
  Wind,
  BarChart3,
  Camera,
  MessageCircle,
} from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { Farm } from '../../../types/farm';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.celeste};
  }
`;

// "Coming Soon" is a not-yet-started status — routed through the §5.2
// draft/not-started phase colour ('empty'), not gold (gold is reserved for
// the literal harvest phase / primary CTA / focus ring, never a generic
// status pill).
const ComingSoonBadge = styled.span`
  ${phaseBadge('empty')}
`;

const EmptyStateContainer = styled.div`
  ${glassPanel}
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  display: flex;
  margin-bottom: 24px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const EmptyTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 12px 0;
`;

const EmptyDescription = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 32px 0;
  max-width: 500px;
  line-height: 1.6;
`;

const FeaturesList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  max-width: 800px;
  margin-bottom: 32px;
`;

// Nested inside EmptyStateContainer's glassPanel — per the T-901 two-glass-
// layer rule the inner surface drops to a plain `line` border with no fill
// rather than stacking a second glass layer.
const FeatureCard = styled.div`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  padding: 20px;
  text-align: left;

  .icon {
    display: flex;
    margin-bottom: 12px;
    color: ${({ theme }) => theme.colors.bright.lapis};
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
    margin-bottom: 4px;
  }

  .description {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const ContactInfo = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 16px;

  .icon {
    display: flex;
    color: ${({ theme }) => theme.colors.bright.emerald};
  }

  .content {
    text-align: left;

    .label {
      font-size: 13px;
      color: ${({ theme }) => theme.colors.muted};
      margin-bottom: 4px;
    }

    .text {
      font-size: 15px;
      font-weight: 500;
      color: ${({ theme }) => theme.colors.textPrimary};
    }
  }
`;

const SupportedSensorsSection = styled.div`
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const SectionTitle = styled.h4`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 16px 0;
`;

const SensorLogos = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
`;

// Small pill — glassControl per spec §1 ("small pills/badges/toggles").
const SensorBrand = styled.div`
  ${glassControl}
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.celeste};
`;

interface SensorFusionTabProps {
  farm: Farm;
}

export function SensorFusionTab({ farm: _farm }: SensorFusionTabProps) {
  const upcomingFeatures = [
    {
      icon: <Thermometer size={22} strokeWidth={1.6} />,
      title: 'Temperature Sensors',
      description: 'Soil & air temperature monitoring',
    },
    {
      icon: <Droplet size={22} strokeWidth={1.6} />,
      title: 'Moisture Sensors',
      description: 'Real-time soil moisture levels',
    },
    {
      icon: <Sun size={22} strokeWidth={1.6} />,
      title: 'Light Sensors',
      description: 'PAR & UV light measurement',
    },
    {
      icon: <Wind size={22} strokeWidth={1.6} />,
      title: 'Weather Stations',
      description: 'On-site weather monitoring',
    },
    {
      icon: <BarChart3 size={22} strokeWidth={1.6} />,
      title: 'EC & pH Meters',
      description: 'Nutrient solution monitoring',
    },
    {
      icon: <Camera size={22} strokeWidth={1.6} />,
      title: 'Cameras & AI',
      description: 'Visual crop monitoring',
    },
  ];

  const supportedBrands = [
    'Davis Instruments',
    'Sentek',
    'Teralytic',
    'METER Group',
    'Pessl Instruments',
    'Campbell Scientific',
  ];

  return (
    <Container>
      <Header>
        <Title>
          <Satellite size={18} strokeWidth={1.6} />
          Sensor Fusion
          <ComingSoonBadge>Coming Soon</ComingSoonBadge>
        </Title>
      </Header>

      <EmptyStateContainer>
        <EmptyIcon><Satellite size={48} strokeWidth={1.4} /></EmptyIcon>
        <EmptyTitle>Connect Your Sensors</EmptyTitle>
        <EmptyDescription>
          Integrate IoT sensors with your farm to get real-time data on soil conditions,
          weather, and crop health. Combine sensor data with satellite imagery and
          weather forecasts for comprehensive farm intelligence.
        </EmptyDescription>

        <FeaturesList>
          {upcomingFeatures.map((feature, index) => (
            <FeatureCard key={index}>
              <div className="icon">{feature.icon}</div>
              <div className="title">{feature.title}</div>
              <div className="description">{feature.description}</div>
            </FeatureCard>
          ))}
        </FeaturesList>

        <ContactInfo>
          <span className="icon"><MessageCircle size={28} strokeWidth={1.6} /></span>
          <div className="content">
            <div className="label">Interested in sensor integration?</div>
            <div className="text">Contact us at sensors@a64core.com</div>
          </div>
        </ContactInfo>

        <SupportedSensorsSection>
          <SectionTitle>Compatible Sensor Brands</SectionTitle>
          <SensorLogos>
            {supportedBrands.map((brand, index) => (
              <SensorBrand key={index}>{brand}</SensorBrand>
            ))}
          </SensorLogos>
        </SupportedSensorsSection>
      </EmptyStateContainer>
    </Container>
  );
}
