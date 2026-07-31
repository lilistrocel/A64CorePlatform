/**
 * Marketing API Service
 *
 * This service provides all API calls for the Marketing module (Campaigns, Budgets, Events, and Channels).
 * All endpoints use the /api/v1/marketing base URL.
 */

import { apiClient } from './api';
import { formatNumber, formatCurrency as formatCurrencyUtil } from '../utils/formatNumber';
import { theme } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
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
  // Fetch dashboard stats and supporting data in parallel
  const [dashboardRes, campaignsRes, eventsRes, budgetsRes] = await Promise.all([
    apiClient.get<{ data: any }>('/v1/marketing/dashboard'),
    apiClient.get<{ data: any[] }>('/v1/marketing/campaigns', { params: { per_page: 5 } }).catch(() => ({ data: { data: [] } })),
    apiClient.get<{ data: any[] }>('/v1/marketing/events', { params: { per_page: 5 } }).catch(() => ({ data: { data: [] } })),
    apiClient.get<{ data: any[] }>('/v1/marketing/budgets', { params: { per_page: 5 } }).catch(() => ({ data: { data: [] } })),
  ]);

  const data = dashboardRes.data.data;
  const campaigns = Array.isArray(campaignsRes.data.data) ? campaignsRes.data.data : [];
  const events = Array.isArray(eventsRes.data.data) ? eventsRes.data.data : [];
  const budgets = Array.isArray(budgetsRes.data.data) ? budgetsRes.data.data : [];

  // Sort campaigns by impressions descending for "top" campaigns
  const topCampaigns = campaigns
    .sort((a: any, b: any) => (b.metrics?.impressions || 0) - (a.metrics?.impressions || 0))
    .slice(0, 5);

  // Filter upcoming/ongoing events sorted by date
  const upcomingEventsList = events
    .filter((e: any) => e.status === 'planned' || e.status === 'ongoing' || e.status === 'upcoming')
    .sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
    .slice(0, 5);

  // Map budgets to utilization format
  const budgetUtilization = budgets.map((b: any) => ({
    budgetId: b.budgetId,
    name: b.name,
    totalAmount: b.totalAmount || 0,
    spentAmount: b.spentAmount || 0,
    utilizationPercentage: b.totalAmount > 0 ? Math.round((b.spentAmount || 0) / b.totalAmount * 100) : 0,
  }));

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
    averageROI: 0,
    upcomingEvents: data.events?.upcoming || 0,
    totalEvents: data.events?.total || 0,
    activeChannels: data.channels?.active || 0,
    topCampaigns,
    upcomingEventsList,
    budgetUtilization,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get campaign status color
 *
 * Night Observatory (T-901): routed onto colors.phase.* per spec §5.2
 * (`paused`→maintenance — the exact "on hold" table entry, previously
 * borrowed the generic `warning` gold slot; `completed`→resting).
 */
export function getCampaignStatusPhaseKey(status: string): PhaseKey | undefined {
  switch (status) {
    case 'draft':
      return 'empty';
    case 'active':
      return 'inoculated';
    case 'paused':
      return 'maintenance';
    case 'completed':
      return 'resting';
    default:
      return undefined;
  }
}

export function getCampaignStatusColor(status: string): string {
  const key = getCampaignStatusPhaseKey(status);
  return key ? theme.colors.phase[key] : theme.colors.textSecondary;
}

/**
 * Get budget status color
 *
 * Night Observatory (T-901): routed onto colors.phase.* per spec §5.2.
 * `closed` moved from error/coral to phase.resting ("closed/settled/
 * completed" — a neutral wind-down, not a rejection).
 */
export function getBudgetStatusPhaseKey(status: string): PhaseKey | undefined {
  switch (status) {
    case 'draft':
      return 'empty';
    case 'approved':
      return 'fruiting';
    case 'active':
      return 'inoculated';
    case 'closed':
      return 'resting';
    default:
      return undefined;
  }
}

export function getBudgetStatusColor(status: string): string {
  const key = getBudgetStatusPhaseKey(status);
  return key ? theme.colors.phase[key] : theme.colors.textSecondary;
}

/**
 * Get event status color
 *
 * Night Observatory (T-901): routed onto colors.phase.* per spec §5.2.
 * `ongoing` previously (mis)used the generic `warning` gold slot — moved to
 * phase.inoculated (open/active/in progress); `cancelled` moved to
 * decommissioned per the table (distinct from quarantined).
 */
export function getEventStatusPhaseKey(status: string): PhaseKey | undefined {
  switch (status) {
    case 'planned':
      return 'preparing';
    case 'ongoing':
      return 'inoculated';
    case 'completed':
      return 'resting';
    case 'cancelled':
      return 'decommissioned';
    default:
      return undefined;
  }
}

export function getEventStatusColor(status: string): string {
  const key = getEventStatusPhaseKey(status);
  return key ? theme.colors.phase[key] : theme.colors.textSecondary;
}

/**
 * Get channel type color
 *
 * Night Observatory (T-901): channel type is a CATEGORICAL vocabulary, not a
 * status — routed onto colors.bright.*, not colors.phase.* and not gold
 * (spec §3's categorical-map rule; `social_media` and `event` previously
 * (mis)used the raw/semantic gold slots).
 */
export function getChannelTypeColor(type: string): string {
  const c = theme.colors;
  switch (type) {
    case 'social_media':
      return c.bright.lavender;
    case 'email':
      return c.bright.lapis;
    case 'print':
      return c.muted;
    case 'digital':
      return c.bright.verdi;
    case 'event':
      return c.bright.terra;
    case 'other':
      return c.bright.rose;
    default:
      return c.textSecondary;
  }
}

/**
 * Format currency for display (uses centralized formatNumber utility)
 */
export function formatCurrency(amount: number, currency: string = 'AED'): string {
  return formatCurrencyUtil(amount, currency);
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
  getCampaignStatusPhaseKey,
  getBudgetStatusColor,
  getBudgetStatusPhaseKey,
  getEventStatusColor,
  getEventStatusPhaseKey,
  getChannelTypeColor,
  formatCurrency,
  formatDate,
  getChannelTypeLabel,
  getEventTypeLabel,
  calculateBudgetUtilization,
  calculateROI,
};

export default marketingApi;
