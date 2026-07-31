import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { glassPanel } from '@a64core/shared';

// Night Observatory (T-901): NotFound is a standalone route outside
// MainLayout (no sidebar) — like the auth screens, the fixed Sky layer at
// the app shell is the entire backdrop. Styled per spec §4 "Empty states":
// Fraunces italic celeste headline, one muted sentence, one primary button
// (a secondary "Go Back" is kept alongside — not a strict single-CTA empty
// state, but the same visual vocabulary).
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
`;

const Card = styled.div`
  ${glassPanel}
  border-radius: 22px;
  padding: 2.5rem 2rem;
  max-width: 520px;
  width: 100%;
`;

const ErrorCode = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  letter-spacing: 0.15em;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 0.5rem;
`;

const Title = styled.h1`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 2rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 0.75rem;

  @media (max-width: 640px) {
    font-size: 1.5rem;
  }
`;

const Message = styled.p`
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 2rem;
  max-width: 480px;
  line-height: 1.6;

  @media (max-width: 640px) {
    font-size: 0.9375rem;
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
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: 1px solid transparent;
  border-radius: 11px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease-in-out, box-shadow 150ms ease-in-out;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const SecondaryButton = styled.button`
  padding: 0.75rem 2rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 11px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

export function NotFound() {
  const navigate = useNavigate();

  return (
    <Container>
      <Card>
        <ErrorCode>Error 404</ErrorCode>
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
      </Card>
    </Container>
  );
}
