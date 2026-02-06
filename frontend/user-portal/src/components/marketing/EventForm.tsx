import { useState, useRef } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingEvent, MarketingEventCreate, MarketingEventUpdate } from '../../types/marketing';

interface EventFormProps { event: MarketingEvent | null; onClose: () => void; }

const Overlay = styled.div`position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;`;
const Modal = styled.div`background: white; border-radius: 12px; padding: 32px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;`;
const Title = styled.h2`font-size: 24px; font-weight: 600; color: #212121; margin: 0 0 24px 0;`;
const Form = styled.form``;
const FormGroup = styled.div`margin-bottom: 20px;`;
const Label = styled.label`display: block; font-size: 14px; font-weight: 500; color: #212121; margin-bottom: 8px;`;
const Input = styled.input`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; &:focus { outline: none; border-color: #3B82F6; }`;
const TextArea = styled.textarea`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; min-height: 80px; resize: vertical; &:focus { outline: none; border-color: #3B82F6; }`;
const Select = styled.select`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; &:focus { outline: none; border-color: #3B82F6; }`;
const ButtonRow = styled.div`display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;`;
const Button = styled.button`padding: 10px 24px; background: #3B82F6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #1976d2; }`;
const CancelButton = styled(Button)`background: transparent; color: #616161; border: 1px solid #e0e0e0; &:hover { background: #f5f5f5; }`;
const ErrorText = styled.div`color: #EF4444; font-size: 13px; margin-top: 8px;`;

export function EventForm({ event, onClose }: EventFormProps) {
  const [formData, setFormData] = useState({
    name: event?.name || '', description: event?.description || '', type: event?.type || 'webinar', date: event?.date || '', location: event?.location || '',
    budget: event?.budget || 0, expectedAttendees: event?.expectedAttendees || 0, status: event?.status || 'planned', notes: event?.notes || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Synchronous ref guard prevents concurrent submissions (double-click protection)
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);
    setError(null);

    try {
      const data: MarketingEventCreate | MarketingEventUpdate = {
        ...formData,
        date: formData.date || undefined,
        description: formData.description || undefined,
        location: formData.location || undefined,
        notes: formData.notes || undefined,
        budget: Number(formData.budget) || 0,
        expectedAttendees: Number(formData.expectedAttendees) || 0,
      };

      if (event) {
        await marketingApi.updateEvent(event.eventId, data as MarketingEventUpdate);
      } else {
        await marketingApi.createEvent(data as MarketingEventCreate);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to save event:', err);
      setError(err.response?.data?.message || 'Failed to save event');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Title>{event ? 'Edit Event' : 'Create Event'}</Title>
        <Form onSubmit={handleSubmit}>
          <FormGroup><Label>Event Name *</Label><Input name="name" value={formData.name} onChange={handleChange} required /></FormGroup>
          <FormGroup><Label>Description</Label><TextArea name="description" value={formData.description} onChange={handleChange} /></FormGroup>
          <FormGroup>
            <Label>Type *</Label>
            <Select name="type" value={formData.type} onChange={handleChange} required>
              <option value="trade_show">Trade Show</option>
              <option value="webinar">Webinar</option>
              <option value="workshop">Workshop</option>
              <option value="conference">Conference</option>
              <option value="farm_visit">Farm Visit</option>
            </Select>
          </FormGroup>
          <FormGroup><Label>Date</Label><Input type="date" name="date" value={formData.date} onChange={handleChange} /></FormGroup>
          <FormGroup><Label>Location</Label><Input name="location" value={formData.location} onChange={handleChange} /></FormGroup>
          <FormGroup><Label>Budget</Label><Input type="number" name="budget" value={formData.budget} onChange={handleChange} min="0" step="0.01" /></FormGroup>
          <FormGroup><Label>Expected Attendees</Label><Input type="number" name="expectedAttendees" value={formData.expectedAttendees} onChange={handleChange} min="0" /></FormGroup>
          <FormGroup>
            <Label>Status</Label>
            <Select name="status" value={formData.status} onChange={handleChange}>
              <option value="planned">Planned</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </FormGroup>
          <FormGroup><Label>Notes</Label><TextArea name="notes" value={formData.notes} onChange={handleChange} /></FormGroup>
          {error && <ErrorText>{error}</ErrorText>}
          <ButtonRow>
            <CancelButton type="button" onClick={onClose}>Cancel</CancelButton>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Event'}</Button>
          </ButtonRow>
        </Form>
      </Modal>
    </Overlay>
  );
}
