/**
 * CampaignForm Component - Create/Edit campaign modal form
 */

import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingCampaign, MarketingCampaignCreate, MarketingCampaignUpdate } from '../../types/marketing';
import { showSuccessToast } from '../../stores/toast.store';

interface CampaignFormProps {
  campaign: MarketingCampaign | null;
  onClose: () => void;
}

const Overlay = styled.div`position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;`;
const Modal = styled.div`background: white; border-radius: 12px; padding: 32px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;`;
const Title = styled.h2`font-size: 24px; font-weight: 600; color: #212121; margin: 0 0 24px 0;`;
const Form = styled.form``;
const FormGroup = styled.div`margin-bottom: 20px;`;
const Label = styled.label`display: block; font-size: 14px; font-weight: 500; color: #212121; margin-bottom: 8px;`;
const Input = styled.input`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; &:focus { outline: none; border-color: #3B82F6; }`;
const TextArea = styled.textarea`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; min-height: 100px; resize: vertical; &:focus { outline: none; border-color: #3B82F6; }`;
const Select = styled.select`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; &:focus { outline: none; border-color: #3B82F6; }`;
const ButtonRow = styled.div`display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;`;
const Button = styled.button`padding: 10px 24px; background: #3B82F6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #1976d2; }`;
const CancelButton = styled(Button)`background: transparent; color: #616161; border: 1px solid #e0e0e0; &:hover { background: #f5f5f5; }`;
const ErrorText = styled.div`color: #EF4444; font-size: 13px; margin-top: 8px;`;
const TagInput = styled(Input)``;
const TagsContainer = styled.div`display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;`;
const Tag = styled.span`padding: 4px 12px; background: #E0F2FE; color: #0369A1; border-radius: 12px; font-size: 13px; display: flex; align-items: center; gap: 6px;`;
const RemoveTag = styled.button`background: none; border: none; color: #0369A1; cursor: pointer; font-size: 16px; padding: 0;`;

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
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Title>{campaign ? 'Edit Campaign' : 'Create Campaign'}</Title>
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
                <Tag key={goal}>{goal}<RemoveTag type="button" onClick={() => handleRemoveGoal(goal)}>×</RemoveTag></Tag>
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
