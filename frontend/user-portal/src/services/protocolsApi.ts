/**
 * Protocols (SOP) API Service
 */

import { apiClient } from './api';
import type {
  CreateProtocolPayload,
  Protocol,
  ProtocolRef,
  UpdateProtocolPayload,
} from '../types/protocols';
import type { Paginated } from '../types/genetics';

const BASE = '/v1/protocols/protocols';

export interface ListProtocolsParams {
  page?: number;
  perPage?: number;
  category?: string;
  status?: string;
  appliesTo?: string;
  tag?: string;
  search?: string;
}

export async function listProtocols(
  params: ListProtocolsParams = {}
): Promise<Paginated<Protocol>> {
  const { data } = await apiClient.get(BASE, { params });
  return data;
}

export async function getProtocol(protocolId: string): Promise<Protocol> {
  const { data } = await apiClient.get(`${BASE}/${protocolId}`);
  return data.data;
}

/**
 * Active protocols bound to a scope tag — what surfaces the right SOP inside
 * the modal recording the work. Drafts and retired procedures are excluded
 * server-side.
 */
export async function getProtocolsForScope(scope: string): Promise<Protocol[]> {
  const { data } = await apiClient.get(`${BASE}/for-scope/${encodeURIComponent(scope)}`);
  return data.data;
}

export async function createProtocol(payload: CreateProtocolPayload): Promise<Protocol> {
  const { data } = await apiClient.post(BASE, payload);
  return data.data;
}

export async function updateProtocol(
  protocolId: string,
  payload: UpdateProtocolPayload
): Promise<Protocol> {
  const { data } = await apiClient.patch(`${BASE}/${protocolId}`, payload);
  return data.data;
}

export async function approveProtocol(
  protocolId: string,
  approvedByName?: string
): Promise<Protocol> {
  const { data } = await apiClient.post(`${BASE}/${protocolId}/approve`, {
    approvedByName,
  });
  return data.data;
}

export async function getProtocolRef(protocolId: string): Promise<ProtocolRef> {
  const { data } = await apiClient.get(`${BASE}/${protocolId}/ref`);
  return data.data;
}
