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
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const CardHeaderContent = styled.div`
  flex: 1;
`;

const CardTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardSubtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: ${({ theme }) => theme.spacing.xs} 0 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const CardBody = styled.div<{ $padding: string }>`
  padding: ${({ theme, $padding }) => {
    if ($padding === 'none') return '0';
    if ($padding === 'small') return theme.spacing.sm;
    if ($padding === 'medium') return theme.spacing.lg;
    if ($padding === 'large') return theme.spacing.xl;
    return theme.spacing.lg;
  }};
`;
