import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 2rem;
  text-align: center;
`;

const ErrorCode = styled.h1`
  font-size: 8rem;
  font-weight: 800;
  color: #3B82F6;
  margin: 0;
  line-height: 1;

  @media (max-width: 640px) {
    font-size: 5rem;
  }
`;

const Title = styled.h2`
  font-size: 2rem;
  font-weight: 600;
  color: #1F2937;
  margin: 1rem 0 0.5rem;

  @media (max-width: 640px) {
    font-size: 1.5rem;
  }
`;

const Message = styled.p`
  font-size: 1.125rem;
  color: #6B7280;
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
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #2563EB;
  }
`;

const SecondaryButton = styled.button`
  padding: 0.75rem 2rem;
  background: white;
  color: #374151;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #F9FAFB;
    border-color: #9CA3AF;
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
