/**
 * Marketing API Service
 *
 * This service provides all API calls for the Marketing module (Campaigns, Budgets, Events, and Channels).
 * All endpoints use the /api/v1/marketing base URL.
 */

import { apiClient } from './api';
import type {
  MarketingCampaign,
  MarketingCampaignCreate,
  MarketingCampaignUpdate,
  CampaignSearchParams,
  PaginatedCampaigns,
  MarketingBudget,
  MarketingBudgetCreate,
  MarketingBudgetUpdate,
  BudgetSearchParams,
  PaginatedBudgets,
  MarketingChannel,
  MarketingChannelCreate,
  MarketingChannelUpdate,
  ChannelSearchParams,
  PaginatedChannels,
  MarketingEvent,
  MarketingEventCreate,
  MarketingEventUpdate,
  EventSearchParams,
  PaginatedEvents,
  MarketingDashboardStats,
} from '../types/marketing';

// ============================================================================
// CAMPAIGN ENDPOINTS
// ============================================================================

/**
 * Get all campaigns with search and pagination
 */
export async function getCampaigns(params?: CampaignSearchParams): Promise<PaginatedCampaigns> {
  const response = await apiClient.get<any>('/v1/marketing/campaigns', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      status: params?.status,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single campaign by ID
 */
export async function getCampaign(campaignId: string): Promise<MarketingCampaign> {
  const response = await apiClient.get<{ data: MarketingCampaign }>(`/v1/marketing/campaigns/${campaignId}`);
  return response.data.data;
}

/**
 * Create new campaign
 */
export async function createCampaign(data: MarketingCampaignCreate): Promise<MarketingCampaign> {
  const response = await apiClient.post<{ data: MarketingCampaign }>('/v1/marketing/campaigns', data);
  return response.data.data;
}

/**
 * Update existing campaign
 */
export async function updateCampaign(campaignId: string, data: MarketingCampaignUpdate): Promise<MarketingCampaign> {
  const response = await apiClient.patch<{ data: MarketingCampaign }>(`/v1/marketing/campaigns/${campaignId}`, data);
  return response.data.data;
}

/**
 * Get campaign performance metrics
 */
export async function getCampaignPerformance(campaignId: string): Promise<any> {
  const response = await apiClient.get<{ data: any }>(`/v1/marketing/campaigns/${campaignId}/performance`);
  return response.data.data;
}

/**
 * Delete campaign
 */
export async function deleteCampaign(campaignId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/marketing/campaigns/${campaignId}`);
  return response.data;
}

// ============================================================================
// BUDGET ENDPOINTS
// ============================================================================

/**
 * Get all budgets with search and pagination
 */
export async function getBudgets(params?: BudgetSearchParams): Promise<PaginatedBudgets> {
  const response = await apiClient.get<any>('/v1/marketing/budgets', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      status: params?.status,
      year: params?.year,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single budget by ID
 */
export async function getBudget(budgetId: string): Promise<MarketingBudget> {
  const response = await apiClient.get<{ data: MarketingBudget }>(`/v1/marketing/budgets/${budgetId}`);
  return response.data.data;
}

/**
 * Create new budget
 */
export async function createBudget(data: MarketingBudgetCreate): Promise<MarketingBudget> {
  const response = await apiClient.post<{ data: MarketingBudget }>('/v1/marketing/budgets', data);
  return response.data.data;
}

/**
 * Update existing budget
 */
export async function updateBudget(budgetId: string, data: MarketingBudgetUpdate): Promise<MarketingBudget> {
  const response = await apiClient.patch<{ data: MarketingBudget }>(`/v1/marketing/budgets/${budgetId}`, data);
  return response.data.data;
}

/**
 * Delete budget
 */
export async function deleteBudget(budgetId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/marketing/budgets/${budgetId}`);
  return response.data;
}

// ============================================================================
// CHANNEL ENDPOINTS
// ============================================================================

/**
 * Get all channels with search and pagination
 */
export async function getChannels(params?: ChannelSearchParams): Promise<PaginatedChannels> {
  const response = await apiClient.get<any>('/v1/marketing/channels', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      type: params?.type,
      isActive: params?.isActive,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single channel by ID
 */
export async function getChannel(channelId: string): Promise<MarketingChannel> {
  const response = await apiClient.get<{ data: MarketingChannel }>(`/v1/marketing/channels/${channelId}`);
  return response.data.data;
}

/**
 * Create new channel
 */
export async function createChannel(data: MarketingChannelCreate): Promise<MarketingChannel> {
  const response = await apiClient.post<{ data: MarketingChannel }>('/v1/marketing/channels', data);
  return response.data.data;
}

/**
 * Update existing channel
 */
export async function updateChannel(channelId: string, data: MarketingChannelUpdate): Promise<MarketingChannel> {
  const response = await apiClient.patch<{ data: MarketingChannel }>(`/v1/marketing/channels/${channelId}`, data);
  return response.data.data;
}

/**
 * Delete channel
 */
export async function deleteChannel(channelId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/marketing/channels/${channelId}`);
  return response.data;
}

// ============================================================================
// EVENT ENDPOINTS
// ============================================================================

/**
 * Get all events with search and pagination
 */
export async function getEvents(params?: EventSearchParams): Promise<PaginatedEvents> {
  const response = await apiClient.get<any>('/v1/marketing/events', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      type: params?.type,
      status: params?.status,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single event by ID
 */
export async function getEvent(eventId: string): Promise<MarketingEvent> {
  const response = await apiClient.get<{ data: MarketingEvent }>(`/v1/marketing/events/${eventId}`);
  return response.data.data;
}

/**
 * Create new event
 */
export async function createEvent(data: MarketingEventCreate): Promise<MarketingEvent> {
  const response = await apiClient.post<{ data: MarketingEvent }>('/v1/marketing/events', data);
  return response.data.data;
}

/**
 * Update existing event
 */
export async function updateEvent(eventId: string, data: MarketingEventUpdate): Promise<MarketingEvent> {
  const response = await apiClient.patch<{ data: MarketingEvent }>(`/v1/marketing/events/${eventId}`, data);
  return response.data.data;
}

/**
 * Delete event
 */
export async function deleteEvent(eventId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/marketing/events/${eventId}`);
  return response.data;
}

// ============================================================================
// DASHBOARD ENDPOINT
// ============================================================================

/**
 * Get marketing dashboard statistics
 * Transforms nested API response to flat structure expected by frontend
 */
export async function getDashboardStats(): Promise<MarketingDashboardStats> {
  const response = await apiClient.get<{ data: any }>('/v1/marketing/dashboard');
  const data = response.data.data;

  // Transform nested API response to flat structure
  return {
    totalBudget: data.budgets?.totalAmount || 0,
    allocatedBudget: data.budgets?.allocated || 0,
    spentBudget: data.budgets?.spent || 0,
    activeCampaigns: data.campaigns?.active || 0,
    totalCampaigns: data.campaigns?.total || 0,
    totalImpressions: data.campaigns?.performance?.impressions || 0,
    totalClicks: data.campaigns?.performance?.clicks || 0,
    totalConversions: data.campaigns?.performance?.conversions || 0,
    averageROI: 0, // Can be calculated if needed
    upcomingEvents: data.events?.upcoming || 0,
    totalEvents: data.events?.total || 0,
    activeChannels: data.channels?.active || 0,
    topCampaigns: [], // Would need separate API call
    upcomingEventsList: [], // Would need separate API call
    budgetUtilization: [], // Would need separate API call
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get campaign status color
 */
export function getCampaignStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return '#6B7280'; // gray
    case 'active':
      return '#10B981'; // green
    case 'paused':
      return '#F59E0B'; // amber
    case 'completed':
      return '#3B82F6'; // blue
    default:
      return '#6B7280';
  }
}

/**
 * Get budget status color
 */
export function getBudgetStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return '#6B7280'; // gray
    case 'approved':
      return '#3B82F6'; // blue
    case 'active':
      return '#10B981'; // green
    case 'closed':
      return '#EF4444'; // red
    default:
      return '#6B7280';
  }
}

/**
 * Get event status color
 */
export function getEventStatusColor(status: string): string {
  switch (status) {
    case 'planned':
      return '#3B82F6'; // blue
    case 'ongoing':
      return '#F59E0B'; // amber
    case 'completed':
      return '#10B981'; // green
    case 'cancelled':
      return '#EF4444'; // red
    default:
      return '#6B7280';
  }
}

/**
 * Get channel type color
 */
export function getChannelTypeColor(type: string): string {
  switch (type) {
    case 'social_media':
      return '#8B5CF6'; // purple
    case 'email':
      return '#3B82F6'; // blue
    case 'print':
      return '#6B7280'; // gray
    case 'digital':
      return '#10B981'; // green
    case 'event':
      return '#F59E0B'; // amber
    case 'other':
      return '#EF4444'; // red
    default:
      return '#6B7280';
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'AED'): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get channel type label
 */
export function getChannelTypeLabel(type: string): string {
  switch (type) {
    case 'social_media':
      return 'Social Media';
    case 'email':
      return 'Email';
    case 'print':
      return 'Print';
    case 'digital':
      return 'Digital';
    case 'event':
      return 'Event';
    case 'other':
      return 'Other';
    default:
      return type;
  }
}

/**
 * Get event type label
 */
export function getEventTypeLabel(type: string): string {
  switch (type) {
    case 'trade_show':
      return 'Trade Show';
    case 'webinar':
      return 'Webinar';
    case 'workshop':
      return 'Workshop';
    case 'conference':
      return 'Conference';
    case 'farm_visit':
      return 'Farm Visit';
    default:
      return type;
  }
}

/**
 * Calculate budget utilization percentage
 */
export function calculateBudgetUtilization(spent: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((spent / total) * 100);
}

/**
 * Calculate ROI percentage
 */
export function calculateROI(revenue: number, cost: number): number {
  if (cost === 0) return 0;
  return Math.round(((revenue - cost) / cost) * 100);
}

// Export all functions as a single object for convenience
export const marketingApi = {
  // Campaigns
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  getCampaignPerformance,
  deleteCampaign,

  // Budgets
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,

  // Channels
  getChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,

  // Events
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,

  // Dashboard
  getDashboardStats,

  // Utilities
  getCampaignStatusColor,
  getBudgetStatusColor,
  getEventStatusColor,
  getChannelTypeColor,
  formatCurrency,
  formatDate,
  getChannelTypeLabel,
  getEventTypeLabel,
  calculateBudgetUtilization,
  calculateROI,
};

export default marketingApi;
