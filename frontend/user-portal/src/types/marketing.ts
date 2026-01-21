/**
 * Marketing Module Types
 *
 * Type definitions for the Marketing module (Campaigns, Budgets, Events, and Channels).
 */

// ============================================================================
// CAMPAIGN TYPES
// ============================================================================

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export interface CampaignMetrics {
  impressions?: number;
  clicks?: number;
  conversions?: number;
  roi?: number;
}

export interface MarketingCampaign {
  campaignId: string;
  campaignCode: string;
  name: string;
  description?: string;
  budgetId?: string;
  channelIds?: string[];
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
  goals?: string[];
  status: CampaignStatus;
  budget?: number;
  spent?: number;
  metrics?: CampaignMetrics;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingCampaignCreate {
  name: string;
  description?: string;
  budgetId?: string;
  channelIds?: string[];
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
  goals?: string[];
  status?: CampaignStatus;
  budget?: number;
}

export interface MarketingCampaignUpdate {
  name?: string;
  description?: string;
  budgetId?: string;
  channelIds?: string[];
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
  goals?: string[];
  status?: CampaignStatus;
  budget?: number;
  spent?: number;
  metrics?: CampaignMetrics;
}

export interface CampaignSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: CampaignStatus;
}

export interface PaginatedCampaigns {
  items: MarketingCampaign[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// BUDGET TYPES
// ============================================================================

export type BudgetStatus = 'draft' | 'approved' | 'active' | 'closed';

export interface MarketingBudget {
  budgetId: string;
  name: string;
  year: number;
  quarter?: number;
  totalAmount: number;
  allocatedAmount?: number;
  spentAmount?: number;
  currency?: string;
  status: BudgetStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingBudgetCreate {
  name: string;
  year: number;
  quarter?: number;
  totalAmount: number;
  currency?: string;
  status?: BudgetStatus;
}

export interface MarketingBudgetUpdate {
  name?: string;
  year?: number;
  quarter?: number;
  totalAmount?: number;
  allocatedAmount?: number;
  spentAmount?: number;
  currency?: string;
  status?: BudgetStatus;
}

export interface BudgetSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: BudgetStatus;
  year?: number;
}

export interface PaginatedBudgets {
  items: MarketingBudget[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// CHANNEL TYPES
// ============================================================================

export type ChannelType = 'social_media' | 'email' | 'print' | 'digital' | 'event' | 'other';

export interface MarketingChannel {
  channelId: string;
  name: string;
  type: ChannelType;
  platform?: string;
  costPerImpression?: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingChannelCreate {
  name: string;
  type: ChannelType;
  platform?: string;
  costPerImpression?: number;
  isActive?: boolean;
}

export interface MarketingChannelUpdate {
  name?: string;
  type?: ChannelType;
  platform?: string;
  costPerImpression?: number;
  isActive?: boolean;
}

export interface ChannelSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  type?: ChannelType;
  isActive?: boolean;
}

export interface PaginatedChannels {
  items: MarketingChannel[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export type EventType = 'trade_show' | 'webinar' | 'workshop' | 'conference' | 'farm_visit';
export type EventStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';

export interface MarketingEvent {
  eventId: string;
  eventCode: string;
  name: string;
  description?: string;
  type: EventType;
  campaignId?: string;
  date?: string;
  location?: string;
  budget?: number;
  actualCost?: number;
  expectedAttendees?: number;
  actualAttendees?: number;
  status: EventStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingEventCreate {
  name: string;
  description?: string;
  type: EventType;
  campaignId?: string;
  date?: string;
  location?: string;
  budget?: number;
  expectedAttendees?: number;
  status?: EventStatus;
  notes?: string;
}

export interface MarketingEventUpdate {
  name?: string;
  description?: string;
  type?: EventType;
  campaignId?: string;
  date?: string;
  location?: string;
  budget?: number;
  actualCost?: number;
  expectedAttendees?: number;
  actualAttendees?: number;
  status?: EventStatus;
  notes?: string;
}

export interface EventSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  type?: EventType;
  status?: EventStatus;
}

export interface PaginatedEvents {
  items: MarketingEvent[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface MarketingDashboardStats {
  totalBudget: number;
  allocatedBudget: number;
  spentBudget: number;
  activeCampaigns: number;
  totalCampaigns: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  averageROI: number;
  upcomingEvents: number;
  totalEvents: number;
  activeChannels: number;
  topCampaigns?: MarketingCampaign[];
  upcomingEventsList?: MarketingEvent[];
  budgetUtilization?: Array<{
    budgetId: string;
    name: string;
    totalAmount: number;
    spentAmount: number;
    utilizationPercentage: number;
  }>;
}
