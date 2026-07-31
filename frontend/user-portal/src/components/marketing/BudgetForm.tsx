import { useState, useRef } from 'react';
import styled, { css } from 'styled-components';
import { X } from 'lucide-react';
import { marketingApi } from '../../services/marketingService';
import type { MarketingBudget, MarketingBudgetCreate, MarketingBudgetUpdate } from '../../types/marketing';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';

interface BudgetFormProps { budget: MarketingBudget | null; onClose: () => void; }

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
const ButtonRow = styled.div`display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;`;
const Button = styled.button`padding: 10px 24px; background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]}); color: ${({ theme }) => theme.colors.onAccent}; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 150ms ease-in-out; &:hover { filter: brightness(1.05); } &:disabled { opacity: 0.6; cursor: not-allowed; }`;
const CancelButton = styled.button`padding: 10px 24px; background: transparent; color: ${({ theme }) => theme.colors.celeste}; border: 1px solid ${({ theme }) => theme.colors.glass.border}; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }`;
const ErrorText = styled.div`color: ${({ theme }) => theme.colors.error}; font-size: 13px; margin-top: 8px;`;

export function BudgetForm({ budget, onClose }: BudgetFormProps) {
  const [formData, setFormData] = useState({
    name: budget?.name || '', year: budget?.year || new Date().getFullYear(), quarter: budget?.quarter || 0, totalAmount: budget?.totalAmount || 0,
    currency: budget?.currency || 'AED', status: budget?.status || 'draft',
  });
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Overlay>
      <Modal onClick={(e) => e.stopPropagation()}>
        <TitleRow>
          <Title>{budget ? 'Edit Budget' : 'Create Budget'}</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </TitleRow>
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
