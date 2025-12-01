/**
 * SensorFusionTab Component
 *
 * Placeholder tab for future IoT sensor integration.
 * Shows empty state with call-to-action to connect sensors.
 */

import styled from 'styled-components';
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
  color: #212121;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ComingSoonBadge = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: #8B5CF6;
  background: #EDE9FE;
  padding: 4px 10px;
  border-radius: 12px;
`;

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  background: linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%);
  border-radius: 16px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 24px;
`;

const EmptyTitle = styled.h3`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 12px 0;
`;

const EmptyDescription = styled.p`
  font-size: 15px;
  color: #616161;
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

const FeatureCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 20px;
  text-align: left;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  .icon {
    font-size: 28px;
    margin-bottom: 12px;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: #212121;
    margin-bottom: 4px;
  }

  .description {
    font-size: 12px;
    color: #9e9e9e;
  }
`;

const ContactInfo = styled.div`
  padding: 20px 24px;
  background: white;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;

  .icon {
    font-size: 32px;
  }

  .content {
    text-align: left;

    .label {
      font-size: 13px;
      color: #9e9e9e;
      margin-bottom: 4px;
    }

    .text {
      font-size: 15px;
      font-weight: 500;
      color: #212121;
    }
  }
`;

const SupportedSensorsSection = styled.div`
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
`;

const SectionTitle = styled.h4`
  font-size: 13px;
  font-weight: 600;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 16px 0;
`;

const SensorLogos = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
`;

const SensorBrand = styled.div`
  padding: 12px 20px;
  background: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #616161;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
`;

interface SensorFusionTabProps {
  farm: Farm;
}

export function SensorFusionTab({ farm: _farm }: SensorFusionTabProps) {
  const upcomingFeatures = [
    {
      icon: '🌡️',
      title: 'Temperature Sensors',
      description: 'Soil & air temperature monitoring',
    },
    {
      icon: '💧',
      title: 'Moisture Sensors',
      description: 'Real-time soil moisture levels',
    },
    {
      icon: '☀️',
      title: 'Light Sensors',
      description: 'PAR & UV light measurement',
    },
    {
      icon: '🌬️',
      title: 'Weather Stations',
      description: 'On-site weather monitoring',
    },
    {
      icon: '📊',
      title: 'EC & pH Meters',
      description: 'Nutrient solution monitoring',
    },
    {
      icon: '📷',
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
          📡 Sensor Fusion
          <ComingSoonBadge>Coming Soon</ComingSoonBadge>
        </Title>
      </Header>

      <EmptyStateContainer>
        <EmptyIcon>📡</EmptyIcon>
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
          <span className="icon">💬</span>
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
