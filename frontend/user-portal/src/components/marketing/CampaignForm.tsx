/**
 * CampaignForm Component - Create/Edit campaign modal form
 */

import { useState, useRef } from 'react';
import styled, { css } from 'styled-components';
import { X } from 'lucide-react';
import { marketingApi } from '../../services/marketingService';
import type { MarketingCampaign, MarketingCampaignCreate, MarketingCampaignUpdate } from '../../types/marketing';
import { showSuccessToast } from '../../stores/toast.store';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';

interface CampaignFormProps {
  campaign: MarketingCampaign | null;
  onClose: () => void;
}

const Overlay = styled.div`position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(10, 14, 36, 0.6); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: ${({ theme }) => theme.zIndex.modal};`;
const Modal = styled.div`${glassPanel} border-radius: 20px; padding: 32px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);`;
const TitleRow = styled.div`display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;`;
const Title = styled.h2`font-size: 24px; font-weight: 600; color: ${({ theme }) => theme.colors.textPrimary}; margin: 0;`;
const CloseButton = styled.button`display: flex; align-items: center; justify-content: center; background: none; border: none; color: ${({ theme }) => theme.colors.muted}; cursor: pointer; padding: 4px; &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }`;
const Form = styled.form``;
const FormGroup = styled.div`margin-bottom: 20px;`;
const Label = styled.label`${monoLabel} display: block; font-size: 0.68rem; color: ${({ theme }) => theme.colors.celeste}; margin-bottom: 8px;`;
const inputStyle = css`
  ${glassControl}
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
`;
const Input = styled.input`${inputStyle}`;
const TextArea = styled.textarea`${inputStyle} min-height: 100px; resize: vertical; font-family: inherit;`;
const Select = styled.select`
  ${inputStyle}
  cursor: pointer;
  option { background: ${({ theme }) => theme.colors.cosmosHi}; color: ${({ theme }) => theme.colors.textPrimary}; }
`;
const ButtonRow = styled.div`display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;`;
const Button = styled.button`padding: 10px 24px; background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]}); color: ${({ theme }) => theme.colors.onAccent}; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 150ms ease-in-out; &:hover { filter: brightness(1.05); } &:disabled { opacity: 0.6; cursor: not-allowed; }`;
const CancelButton = styled.button`padding: 10px 24px; background: transparent; color: ${({ theme }) => theme.colors.celeste}; border: 1px solid ${({ theme }) => theme.colors.glass.border}; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }`;
const ErrorText = styled.div`color: ${({ theme }) => theme.colors.error}; font-size: 13px; margin-top: 8px;`;
const TagInput = styled(Input)``;
const TagsContainer = styled.div`display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;`;
const Tag = styled.span`padding: 4px 12px; background: rgba(107, 138, 224, 0.16); color: ${({ theme }) => theme.colors.bright.lapis}; border: 1px solid rgba(107, 138, 224, 0.35); border-radius: 12px; font-size: 13px; display: flex; align-items: center; gap: 6px;`;
const RemoveTag = styled.button`display: flex; align-items: center; background: none; border: none; color: ${({ theme }) => theme.colors.bright.lapis}; cursor: pointer; padding: 0; &:hover { color: ${({ theme }) => theme.colors.textPrimary}; }`;

export function CampaignForm({ campaign, onClose }: CampaignFormProps) {
  const [formData, setFormData] = useState({
    name: campaign?.name || '', description: campaign?.description || '', startDate: campaign?.startDate || '', endDate: campaign?.endDate || '',
    targetAudience: campaign?.targetAudience || '', status: campaign?.status || 'draft', budget: campaign?.budget || 0,
  });
  const [goals, setGoals] = useState<string[]>(campaign?.goals || []);
  const [goalInput, setGoalInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddGoal = () => {
    if (goalInput.trim() && !goals.includes(goalInput.trim())) {
      setGoals([...goals, goalInput.trim()]);
      setGoalInput('');
    }
  };

  const handleRemoveGoal = (goal: string) => {
    setGoals(goals.filter(g => g !== goal));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Synchronous ref guard prevents concurrent submissions (double-click protection)
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);
    setError(null);

    try {
      const data: MarketingCampaignCreate | MarketingCampaignUpdate = {
        ...formData,
        goals,
        budget: Number(formData.budget) || undefined,
      };

      if (campaign) {
        await marketingApi.updateCampaign(campaign.campaignId, data as MarketingCampaignUpdate);
        showSuccessToast('Campaign updated successfully');
      } else {
        await marketingApi.createCampaign(data as MarketingCampaignCreate);
        showSuccessToast('Campaign created successfully');
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to save campaign:', err);
      setError(err.response?.data?.message || 'Failed to save campaign');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Overlay>
      <Modal onClick={(e) => e.stopPropagation()}>
        <TitleRow>
          <Title>{campaign ? 'Edit Campaign' : 'Create Campaign'}</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </TitleRow>
        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label>Campaign Name *</Label>
            <Input name="name" value={formData.name} onChange={handleChange} required />
          </FormGroup>
          <FormGroup>
            <Label>Description</Label>
            <TextArea name="description" value={formData.description} onChange={handleChange} />
          </FormGroup>
          <FormGroup>
            <Label>Start Date</Label>
            <Input type="date" name="startDate" value={formData.startDate} onChange={handleChange} />
          </FormGroup>
          <FormGroup>
            <Label>End Date</Label>
            <Input type="date" name="endDate" value={formData.endDate} onChange={handleChange} />
          </FormGroup>
          <FormGroup>
            <Label>Target Audience</Label>
            <Input name="targetAudience" value={formData.targetAudience} onChange={handleChange} />
          </FormGroup>
          <FormGroup>
            <Label>Budget</Label>
            <Input type="number" name="budget" value={formData.budget} onChange={handleChange} min="0" step="0.01" />
          </FormGroup>
          <FormGroup>
            <Label>Status</Label>
            <Select name="status" value={formData.status} onChange={handleChange}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Goals (Press Enter to add)</Label>
            <TagInput value={goalInput} onChange={(e) => setGoalInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGoal())} placeholder="Type goal and press Enter" />
            <TagsContainer>
              {goals.map(goal => (
                <Tag key={goal}>
                  {goal}
                  <RemoveTag type="button" onClick={() => handleRemoveGoal(goal)} aria-label={`Remove goal ${goal}`}>
                    <X size={12} strokeWidth={2} />
                  </RemoveTag>
                </Tag>
              ))}
            </TagsContainer>
          </FormGroup>
          {error && <ErrorText>{error}</ErrorText>}
          <ButtonRow>
            <CancelButton type="button" onClick={onClose}>Cancel</CancelButton>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Campaign'}</Button>
          </ButtonRow>
        </Form>
      </Modal>
    </Overlay>
  );
}
