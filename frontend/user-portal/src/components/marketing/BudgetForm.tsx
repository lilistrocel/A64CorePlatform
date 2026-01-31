import { useState } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingBudget, MarketingBudgetCreate, MarketingBudgetUpdate } from '../../types/marketing';

interface BudgetFormProps { budget: MarketingBudget | null; onClose: () => void; }

const Overlay = styled.div`position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;`;
const Modal = styled.div`background: white; border-radius: 12px; padding: 32px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;`;
const Title = styled.h2`font-size: 24px; font-weight: 600; color: #212121; margin: 0 0 24px 0;`;
const Form = styled.form``;
const FormGroup = styled.div`margin-bottom: 20px;`;
const Label = styled.label`display: block; font-size: 14px; font-weight: 500; color: #212121; margin-bottom: 8px;`;
const Input = styled.input`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; &:focus { outline: none; border-color: #3B82F6; }`;
const Select = styled.select`width: 100%; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; &:focus { outline: none; border-color: #3B82F6; }`;
const ButtonRow = styled.div`display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;`;
const Button = styled.button`padding: 10px 24px; background: #3B82F6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #1976d2; }`;
const CancelButton = styled(Button)`background: transparent; color: #616161; border: 1px solid #e0e0e0; &:hover { background: #f5f5f5; }`;
const ErrorText = styled.div`color: #EF4444; font-size: 13px; margin-top: 8px;`;

export function BudgetForm({ budget, onClose }: BudgetFormProps) {
  const [formData, setFormData] = useState({
    name: budget?.name || '', year: budget?.year || new Date().getFullYear(), quarter: budget?.quarter || 0, totalAmount: budget?.totalAmount || 0,
    currency: budget?.currency || 'AED', status: budget?.status || 'draft',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data: MarketingBudgetCreate | MarketingBudgetUpdate = {
        ...formData,
        year: Number(formData.year),
        quarter: Number(formData.quarter) || undefined,
        totalAmount: Number(formData.totalAmount),
      };

      if (budget) {
        await marketingApi.updateBudget(budget.budgetId, data as MarketingBudgetUpdate);
      } else {
        await marketingApi.createBudget(data as MarketingBudgetCreate);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to save budget:', err);
      setError(err.response?.data?.message || 'Failed to save budget');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Title>{budget ? 'Edit Budget' : 'Create Budget'}</Title>
        <Form onSubmit={handleSubmit}>
          <FormGroup><Label>Budget Name *</Label><Input name="name" value={formData.name} onChange={handleChange} required /></FormGroup>
          <FormGroup><Label>Year *</Label><Input type="number" name="year" value={formData.year} onChange={handleChange} required min="2020" /></FormGroup>
          <FormGroup>
            <Label>Quarter</Label>
            <Select name="quarter" value={formData.quarter} onChange={handleChange}>
              <option value="0">All Year</option>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </Select>
          </FormGroup>
          <FormGroup><Label>Total Amount *</Label><Input type="number" name="totalAmount" value={formData.totalAmount} onChange={handleChange} required min="0" step="0.01" /></FormGroup>
          <FormGroup><Label>Currency</Label><Input name="currency" value={formData.currency} onChange={handleChange} maxLength={3} placeholder="AED" /></FormGroup>
          <FormGroup>
            <Label>Status</Label>
            <Select name="status" value={formData.status} onChange={handleChange}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </Select>
          </FormGroup>
          {error && <ErrorText>{error}</ErrorText>}
          <ButtonRow>
            <CancelButton type="button" onClick={onClose}>Cancel</CancelButton>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Budget'}</Button>
          </ButtonRow>
        </Form>
      </Modal>
    </Overlay>
  );
}
