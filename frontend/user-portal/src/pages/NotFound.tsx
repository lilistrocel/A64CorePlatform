import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.neutral[100]} 0%, ${({ theme }) => theme.colors.primary[100]} 100%);
  padding: 2rem;
  text-align: center;
`;

const ErrorCode = styled.h1`
  font-size: 8rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.primary[500]};
  margin: 0;
  line-height: 1;

  @media (max-width: 640px) {
    font-size: 5rem;
  }
`;

const Title = styled.h2`
  font-size: 2rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 1rem 0 0.5rem;

  @media (max-width: 640px) {
    font-size: 1.5rem;
  }
`;

const Message = styled.p`
  font-size: 1.125rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 2rem;
  max-width: 480px;
  line-height: 1.6;

  @media (max-width: 640px) {
    font-size: 1rem;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
`;

const PrimaryButton = styled.button`
  padding: 0.75rem 2rem;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const SecondaryButton = styled.button`
  padding: 0.75rem 2rem;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.neutral[800]};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
    border-color: ${({ theme }) => theme.colors.neutral[400]};
  }
`;

export function NotFound() {
  const navigate = useNavigate();

  return (
    <Container>
      <ErrorCode>404</ErrorCode>
      <Title>Page Not Found</Title>
      <Message>
        The page you are looking for doesn't exist or has been moved.
        Please check the URL or navigate back to the dashboard.
      </Message>
      <ButtonGroup>
        <PrimaryButton onClick={() => navigate('/dashboard')}>
          Go to Dashboard
        </PrimaryButton>
        <SecondaryButton onClick={() => navigate(-1)}>
          Go Back
        </SecondaryButton>
      </ButtonGroup>
    </Container>
  );
}
