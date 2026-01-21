import { useState } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingChannel, MarketingChannelCreate, MarketingChannelUpdate } from '../../types/marketing';

interface ChannelFormProps { channel: MarketingChannel | null; onClose: () => void; }

const Overlay = styled.div`position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;`;
const Modal = styled.div`background: white; border-radius: 12px; padding: 32px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;`;
const Title = styled.h2`font-size: 24px; font-weight: 600; color: #212121; margin: 0 0 24px 0;`;
const Form = styled.form``;
const FormGroup = styled.div`margin-bottom: 20px;`;
const Label = styled.label`display: block; font-size: 14px; font-weight: 500; color: #212121; margin-bottom: 8px;`;
const Input = styled.input`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; &:focus { outline: none; border-color: #3B82F6; }`;
const Select = styled.select`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; &:focus { outline: none; border-color: #3B82F6; }`;
const CheckboxLabel = styled.label`display: flex; align-items: center; gap: 8px; cursor: pointer;`;
const Checkbox = styled.input`width: 20px; height: 20px; cursor: pointer;`;
const ButtonRow = styled.div`display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;`;
const Button = styled.button`padding: 10px 24px; background: #3B82F6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #1976d2; }`;
const CancelButton = styled(Button)`background: transparent; color: #616161; border: 1px solid #e0e0e0; &:hover { background: #f5f5f5; }`;
const ErrorText = styled.div`color: #EF4444; font-size: 13px; margin-top: 8px;`;

export function ChannelForm({ channel, onClose }: ChannelFormProps) {
  const [formData, setFormData] = useState({
    name: channel?.name || '', type: channel?.type || 'social_media', platform: channel?.platform || '',
    costPerImpression: channel?.costPerImpression || 0, isActive: channel?.isActive !== undefined ? channel.isActive : true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data: MarketingChannelCreate | MarketingChannelUpdate = {
        ...formData,
        costPerImpression: Number(formData.costPerImpression) || undefined,
      };

      if (channel) {
        await marketingApi.updateChannel(channel.channelId, data as MarketingChannelUpdate);
      } else {
        await marketingApi.createChannel(data as MarketingChannelCreate);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to save channel:', err);
      setError(err.response?.data?.message || 'Failed to save channel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Title>{channel ? 'Edit Channel' : 'Create Channel'}</Title>
        <Form onSubmit={handleSubmit}>
          <FormGroup><Label>Channel Name *</Label><Input name="name" value={formData.name} onChange={handleChange} required /></FormGroup>
          <FormGroup>
            <Label>Type *</Label>
            <Select name="type" value={formData.type} onChange={handleChange} required>
              <option value="social_media">Social Media</option>
              <option value="email">Email</option>
              <option value="print">Print</option>
              <option value="digital">Digital</option>
              <option value="event">Event</option>
              <option value="other">Other</option>
            </Select>
          </FormGroup>
          <FormGroup><Label>Platform</Label><Input name="platform" value={formData.platform} onChange={handleChange} placeholder="e.g., Facebook, Instagram, Google Ads" /></FormGroup>
          <FormGroup><Label>Cost Per Impression</Label><Input type="number" name="costPerImpression" value={formData.costPerImpression} onChange={handleChange} min="0" step="0.01" /></FormGroup>
          <FormGroup>
            <CheckboxLabel>
              <Checkbox type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} />
              <span>Active</span>
            </CheckboxLabel>
          </FormGroup>
          {error && <ErrorText>{error}</ErrorText>}
          <ButtonRow>
            <CancelButton type="button" onClick={onClose}>Cancel</CancelButton>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Channel'}</Button>
          </ButtonRow>
        </Form>
      </Modal>
    </Overlay>
  );
}
