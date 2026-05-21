import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.surface.canvas};
  padding: 2rem;
  text-align: center;
`;

const ErrorCode = styled.h1`
  font-size: 8rem;
  font-weight: 800;
  color: #0F6E56;
  margin: 0;
  line-height: 1;

  @media (max-width: 640px) {
    font-size: 5rem;
  }
`;

const Title = styled.h2`
  font-size: 2rem;
  font-weight: 600;
  color: #0F0F0F;
  margin: 1rem 0 0.5rem;

  @media (max-width: 640px) {
    font-size: 1.5rem;
  }
`;

const Message = styled.p`
  font-size: 1.125rem;
  color: #4B4844;
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
  background: #0F6E56;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #0B5644;
  }
`;

const SecondaryButton = styled.button`
  padding: 0.75rem 2rem;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: #0F0F0F;
  border: 1px solid #DCD8CF;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
    border-color: #4B4844;
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
