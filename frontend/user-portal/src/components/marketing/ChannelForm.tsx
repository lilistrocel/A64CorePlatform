import { useState, useRef } from 'react';
import styled, { css } from 'styled-components';
import { X } from 'lucide-react';
import { marketingApi } from '../../services/marketingService';
import type { MarketingChannel, MarketingChannelCreate, MarketingChannelUpdate } from '../../types/marketing';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';

interface ChannelFormProps { channel: MarketingChannel | null; onClose: () => void; }

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
const Select = styled.select`
  ${inputStyle}
  cursor: pointer;
  option { background: ${({ theme }) => theme.colors.cosmosHi}; color: ${({ theme }) => theme.colors.textPrimary}; }
`;
const CheckboxLabel = styled.label`display: flex; align-items: center; gap: 8px; cursor: pointer; color: ${({ theme }) => theme.colors.textPrimary};`;
const Checkbox = styled.input`width: 18px; height: 18px; cursor: pointer; accent-color: ${({ theme }) => theme.colors.bright.emerald};`;
const ButtonRow = styled.div`display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;`;
const Button = styled.button`padding: 10px 24px; background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]}); color: ${({ theme }) => theme.colors.onAccent}; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 150ms ease-in-out; &:hover { filter: brightness(1.05); } &:disabled { opacity: 0.6; cursor: not-allowed; }`;
const CancelButton = styled.button`padding: 10px 24px; background: transparent; color: ${({ theme }) => theme.colors.celeste}; border: 1px solid ${({ theme }) => theme.colors.glass.border}; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }`;
const ErrorText = styled.div`color: ${({ theme }) => theme.colors.error}; font-size: 13px; margin-top: 8px;`;

export function ChannelForm({ channel, onClose }: ChannelFormProps) {
  const [formData, setFormData] = useState({
    name: channel?.name || '', type: channel?.type || 'social_media', platform: channel?.platform || '',
    costPerImpression: channel?.costPerImpression || 0, isActive: channel?.isActive !== undefined ? channel.isActive : true,
  });
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Synchronous ref guard prevents concurrent submissions (double-click protection)
    if (submittingRef.current) return;
    submittingRef.current = true;

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
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Overlay>
      <Modal onClick={(e) => e.stopPropagation()}>
        <TitleRow>
          <Title>{channel ? 'Edit Channel' : 'Create Channel'}</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </TitleRow>
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
