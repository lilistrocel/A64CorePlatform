/**
 * PerformanceTab Component
 *
 * Manages employee performance reviews with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { hrApi, formatDate } from '../../services/hrService';
import type { PerformanceReview, PerformanceReviewCreate, PerformanceReviewUpdate } from '../../types/hr';

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
  color: #212121;
  margin: 0;
`;

const AddButton = styled.button`
  padding: 8px 16px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;

const CardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Card = styled.div`
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
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
  color: #212121;
`;

const RatingContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RatingStars = styled.div`
  font-size: 18px;
  color: #F59E0B;
`;

const RatingText = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #616161;
`;

const CardDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: #616161;
`;

const DetailRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
`;

const DetailLabel = styled.span`
  font-weight: 600;
  min-width: 150px;
  color: #212121;
`;

const HappinessBar = styled.div<{ $score: number }>`
  width: 200px;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: ${({ $score }) => ($score / 10) * 100}%;
    background: ${({ $score }) => {
      if ($score >= 8) return '#10B981';
      if ($score >= 5) return '#F59E0B';
      return '#EF4444';
    }};
    border-radius: 4px;
  }
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Tag = styled.span<{ $color?: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color || '#e3f2fd'};
  color: ${({ $color }) => ($color ? '#fff' : '#1976d2')};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
`;

const ActionButton = styled.button<{ $variant?: 'secondary' | 'danger' }>`
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: #EF4444;
        border: 1px solid #EF4444;
        &:hover {
          background: #FEE2E2;
        }
      `;
    }
    return `
      background: transparent;
      color: #3B82F6;
      border: 1px solid #3B82F6;
      &:hover {
        background: #e3f2fd;
      }
    `;
  }}
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 48px;
  color: #9e9e9e;
`;

const Modal = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  justify-content: center;
  align-items: center;
  z-index: 1100;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 700px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
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
  color: #212121;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: #9e9e9e;
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover {
    color: #616161;
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
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const Input = styled.input`
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
`;

const Textarea = styled.textarea`
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  font-family: inherit;
`;

const FormActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        border: none;
        &:hover {
          background: #1976d2;
        }
      `;
    }
    return `
      background: transparent;
      color: #616161;
      border: 1px solid #e0e0e0;
      &:hover {
        background: #f5f5f5;
      }
    `;
  }}
`;

const HelpText = styled.span`
  font-size: 12px;
  color: #9e9e9e;
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function renderStars(rating: number): string {
  const fullStar = '★';
  const emptyStar = '☆';
  return fullStar.repeat(rating) + emptyStar.repeat(5 - rating);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PerformanceTab({ employeeId }: PerformanceTabProps) {
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
        <AddButton onClick={handleAdd}>+ Add Review</AddButton>
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
                  <RatingStars>{renderStars(review.rating)}</RatingStars>
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
                        <Tag key={idx} $color="#10B981">
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
                        <Tag key={idx} $color="#F59E0B">
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
                        <Tag key={idx} $color="#3B82F6">
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
            <CloseButton onClick={() => setModalOpen(false)}>×</CloseButton>
          </ModalHeader>

          <Form onSubmit={handleSubmit}>
            <FormField>
              <Label>Review Date</Label>
              <Input type="date" value={formData.reviewDate} onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })} required />
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
