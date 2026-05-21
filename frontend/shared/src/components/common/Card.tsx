import styled from 'styled-components';

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  padding?: 'none' | 'small' | 'medium' | 'large';
}

export function Card({ children, title, subtitle, actions, padding = 'medium' }: CardProps) {
  return (
    <StyledCard>
      {(title || subtitle || actions) && (
        <CardHeader>
          <CardHeaderContent>
            {title && <CardTitle>{title}</CardTitle>}
            {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
          </CardHeaderContent>
          {actions && <CardActions>{actions}</CardActions>}
        </CardHeader>
      )}
      <CardBody $padding={padding}>{children}</CardBody>
    </StyledCard>
  );
}

const StyledCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s ease-in-out, transform 0.2s ease-in-out;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.lg};
    transform: translateY(-2px);
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space['6']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const CardHeaderContent = styled.div`
  flex: 1;
`;

const CardTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardSubtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: ${({ theme }) => theme.space['1']} 0 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['2']};
`;

const CardBody = styled.div<{ $padding: string }>`
  padding: ${({ theme, $padding }) => {
    if ($padding === 'none') return '0';
    if ($padding === 'small') return theme.space['2'];
    if ($padding === 'medium') return theme.space['6'];
    if ($padding === 'large') return theme.space['8'];
    return theme.space['6'];
  }};
`;
