/**
 * PerformanceTab Component
 *
 * Manages employee performance reviews with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled, { css, useTheme } from 'styled-components';
import { Plus, X, Star } from 'lucide-react';
import { hrApi, formatDate } from '../../services/hrService';
import type { PerformanceReview, PerformanceReviewCreate, PerformanceReviewUpdate } from '../../types/hr';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PerformanceTabProps {
  employeeId: string;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div``;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const AddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const CardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Card = styled.div`
  ${glassPanel}
  border-radius: 16px;
  padding: 16px;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
`;

const CardTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const RatingContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

/* Rating stars use celeste, not gold — gold is reserved for the Harvesting
   phase / primary CTA / stat numerals (spec §3); a per-card rating widget is
   not on that allow-list. */
const RatingStars = styled.div`
  display: flex;
  align-items: center;
  gap: 1px;
  color: ${({ theme }) => theme.colors.celeste};

  svg:not(.filled) {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const RatingText = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CardDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DetailRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
`;

const DetailLabel = styled.span`
  font-weight: 600;
  min-width: 150px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HappinessBar = styled.div<{ $score: number }>`
  width: 200px;
  height: 10px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 99px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: ${({ $score }) => ($score / 10) * 100}%;
    background: ${({ $score, theme }) => {
      if ($score >= 8) return theme.colors.bright.emerald;
      if ($score >= 5) return theme.colors.bright.terra;
      return theme.colors.bright.coral;
    }};
    box-shadow: 0 0 8px ${({ $score, theme }) => {
      if ($score >= 8) return 'rgba(84, 211, 155, 0.5)';
      if ($score >= 5) return 'rgba(232, 147, 95, 0.5)';
      return 'rgba(240, 138, 112, 0.5)';
    }};
    border-radius: 99px;
  }
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Tag = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const dangerVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
  }
`;

const defaultVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ActionButton = styled.button<{ $variant?: 'secondary' | 'danger' }>`
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  ${({ $variant }) => ($variant === 'danger' ? dangerVariant : defaultVariant)}
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.muted};
`;

const Modal = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  justify-content: center;
  align-items: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
`;

const ModalContent = styled.div`
  ${glassPanel}
  border-radius: 20px;
  padding: 32px;
  max-width: 700px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const ModalTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 4px;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const Textarea = styled.textarea`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
`;

const primaryVariant = css`
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  font-weight: 700;
  border: none;
  &:hover {
    filter: brightness(1.05);
  }
`;

const secondaryVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  ${({ $variant }) => ($variant === 'primary' ? primaryVariant : secondaryVariant)}
`;

const HelpText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format for date inputs
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function RatingStarRow({ rating }: { rating: number }) {
  return (
    <RatingStars aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={16}
          strokeWidth={1.6}
          className={i < rating ? 'filled' : undefined}
          fill={i < rating ? 'currentColor' : 'none'}
        />
      ))}
    </RatingStars>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PerformanceTab({ employeeId }: PerformanceTabProps) {
  const theme = useTheme();
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<PerformanceReview | null>(null);
  const [formData, setFormData] = useState({
    reviewDate: '',
    reviewerId: '',
    rating: '5',
    happinessScore: '',
    strengths: '',
    areasForImprovement: '',
    goals: '',
    notes: '',
  });

  useEffect(() => {
    loadReviews();
  }, [employeeId]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await hrApi.getEmployeePerformanceReviews(employeeId);
      setReviews(data);
    } catch (err) {
      console.error('Failed to load performance reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingReview(null);
    setFormData({
      reviewDate: new Date().toISOString().split('T')[0],
      reviewerId: '',
      rating: '5',
      happinessScore: '',
      strengths: '',
      areasForImprovement: '',
      goals: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const handleEdit = (review: PerformanceReview) => {
    setEditingReview(review);
    setFormData({
      reviewDate: review.reviewDate.split('T')[0],
      reviewerId: review.reviewerId,
      rating: review.rating.toString(),
      happinessScore: review.happinessScore?.toString() || '',
      strengths: review.strengths?.join(', ') || '',
      areasForImprovement: review.areasForImprovement?.join(', ') || '',
      goals: review.goals?.join(', ') || '',
      notes: review.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: PerformanceReviewCreate | PerformanceReviewUpdate = {
        reviewDate: formData.reviewDate,
        reviewerId: formData.reviewerId,
        rating: parseInt(formData.rating),
        happinessScore: formData.happinessScore ? parseInt(formData.happinessScore) : undefined,
        strengths: formData.strengths ? formData.strengths.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        areasForImprovement: formData.areasForImprovement
          ? formData.areasForImprovement.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        goals: formData.goals ? formData.goals.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        notes: formData.notes || undefined,
      };

      if (editingReview) {
        await hrApi.updatePerformanceReview(editingReview.reviewId, submitData);
      } else {
        await hrApi.createPerformanceReview(employeeId, submitData);
      }

      setModalOpen(false);
      loadReviews();
    } catch (err) {
      console.error('Failed to save performance review:', err);
      alert('Failed to save performance review');
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (window.confirm('Are you sure you want to delete this performance review?')) {
      try {
        await hrApi.deletePerformanceReview(reviewId);
        loadReviews();
      } catch (err) {
        console.error('Failed to delete performance review:', err);
        alert('Failed to delete performance review');
      }
    }
  };

  if (loading) {
    return <div>Loading performance reviews...</div>;
  }

  return (
    <Container>
      <Header>
        <Title>Performance Reviews</Title>
        <AddButton onClick={handleAdd}>
          <Plus size={14} strokeWidth={2} /> Add Review
        </AddButton>
      </Header>

      {reviews.length === 0 ? (
        <EmptyText>No performance reviews found</EmptyText>
      ) : (
        <CardList>
          {reviews.map((review) => (
            <Card key={review.reviewId}>
              <CardHeader>
                <CardTitle>Review - {formatDate(review.reviewDate)}</CardTitle>
                <RatingContainer>
                  <RatingStarRow rating={review.rating} />
                  <RatingText>{review.rating}/5</RatingText>
                </RatingContainer>
              </CardHeader>
              <CardDetails>
                <DetailRow>
                  <DetailLabel>Reviewer ID:</DetailLabel>
                  <span>{review.reviewerId}</span>
                </DetailRow>
                {review.happinessScore && (
                  <DetailRow>
                    <DetailLabel>Happiness Score:</DetailLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <HappinessBar $score={review.happinessScore} />
                      <span>{review.happinessScore}/10</span>
                    </div>
                  </DetailRow>
                )}
                {review.strengths && review.strengths.length > 0 && (
                  <DetailRow>
                    <DetailLabel>Strengths:</DetailLabel>
                    <TagList>
                      {review.strengths.map((strength, idx) => (
                        <Tag key={idx} $color={theme.colors.bright.emerald}>
                          {strength}
                        </Tag>
                      ))}
                    </TagList>
                  </DetailRow>
                )}
                {review.areasForImprovement && review.areasForImprovement.length > 0 && (
                  <DetailRow>
                    <DetailLabel>Areas for Improvement:</DetailLabel>
                    <TagList>
                      {review.areasForImprovement.map((area, idx) => (
                        <Tag key={idx} $color={theme.colors.bright.terra}>
                          {area}
                        </Tag>
                      ))}
                    </TagList>
                  </DetailRow>
                )}
                {review.goals && review.goals.length > 0 && (
                  <DetailRow>
                    <DetailLabel>Goals:</DetailLabel>
                    <TagList>
                      {review.goals.map((goal, idx) => (
                        <Tag key={idx} $color={theme.colors.bright.lapis}>
                          {goal}
                        </Tag>
                      ))}
                    </TagList>
                  </DetailRow>
                )}
                {review.notes && (
                  <DetailRow>
                    <DetailLabel>Notes:</DetailLabel>
                    <span>{review.notes}</span>
                  </DetailRow>
                )}
              </CardDetails>
              <Actions>
                <ActionButton onClick={() => handleEdit(review)}>Edit</ActionButton>
                <ActionButton $variant="danger" onClick={() => handleDelete(review.reviewId)}>
                  Delete
                </ActionButton>
              </Actions>
            </Card>
          ))}
        </CardList>
      )}

      <Modal $isOpen={modalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{editingReview ? 'Edit Performance Review' : 'Add Performance Review'}</ModalTitle>
            <CloseButton onClick={() => setModalOpen(false)} aria-label="Close">
              <X size={20} strokeWidth={1.8} />
            </CloseButton>
          </ModalHeader>

          <Form onSubmit={handleSubmit}>
            <FormField>
              <Label>Review Date</Label>
              <Input type="date" value={formData.reviewDate} onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })} max={getToday()} required />
            </FormField>

            <FormField>
              <Label>Reviewer ID</Label>
              <Input
                type="text"
                value={formData.reviewerId}
                onChange={(e) => setFormData({ ...formData, reviewerId: e.target.value })}
                placeholder="Employee ID of the reviewer"
                required
              />
            </FormField>

            <FormField>
              <Label>Rating (1-5)</Label>
              <Input
                type="number"
                min="1"
                max="5"
                value={formData.rating}
                onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                required
              />
              <HelpText>1 = Poor, 5 = Excellent</HelpText>
            </FormField>

            <FormField>
              <Label>Happiness Score (1-10)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={formData.happinessScore}
                onChange={(e) => setFormData({ ...formData, happinessScore: e.target.value })}
              />
              <HelpText>Employee's self-reported happiness level</HelpText>
            </FormField>

            <FormField>
              <Label>Strengths</Label>
              <Input
                type="text"
                value={formData.strengths}
                onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                placeholder="e.g., Leadership, Communication, Problem Solving"
              />
              <HelpText>Comma-separated list</HelpText>
            </FormField>

            <FormField>
              <Label>Areas for Improvement</Label>
              <Input
                type="text"
                value={formData.areasForImprovement}
                onChange={(e) => setFormData({ ...formData, areasForImprovement: e.target.value })}
                placeholder="e.g., Time Management, Documentation"
              />
              <HelpText>Comma-separated list</HelpText>
            </FormField>

            <FormField>
              <Label>Goals</Label>
              <Input
                type="text"
                value={formData.goals}
                onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                placeholder="e.g., Complete certification, Lead a project"
              />
              <HelpText>Comma-separated list</HelpText>
            </FormField>

            <FormField>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional feedback or comments..."
              />
            </FormField>

            <FormActions>
              <Button type="button" $variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" $variant="primary">
                {editingReview ? 'Update' : 'Create'}
              </Button>
            </FormActions>
          </Form>
        </ModalContent>
      </Modal>
    </Container>
  );
}
