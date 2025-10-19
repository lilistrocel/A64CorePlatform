# Widget Development Guide

**Version:** 1.0.0
**Status:** Planning
**Created:** 2025-10-19
**Platform:** A64 Core Platform

---

## Table of Contents

1. [Introduction](#introduction)
2. [Widget Types](#widget-types)
3. [Creating a Widget](#creating-a-widget)
4. [Widget Configuration](#widget-configuration)
5. [Data Sources](#data-sources)
6. [Widget Components](#widget-components)
7. [Styling Widgets](#styling-widgets)
8. [Testing Widgets](#testing-widgets)
9. [Publishing Widgets](#publishing-widgets)
10. [Best Practices](#best-practices)
11. [Examples](#examples)

---

## Introduction

### What is a Widget?

A **widget** is a self-contained UI component that displays data in the CCM (Centralized Controls Monitoring) dashboard. Widgets can:

- Display data from ERP modules
- Display data from external APIs
- Display system metrics
- Update in real-time
- Trigger alerts based on conditions
- Be customized by users

### Widget Development Workflow

```
1. Define widget purpose and data requirements
2. Choose widget type (stat, chart, table, etc.)
3. Configure data source
4. Create widget component (if custom)
5. Write widget configuration
6. Test widget functionality
7. Register widget in marketplace
8. Deploy to production
```

---

## Widget Types

The platform supports 7 built-in widget types:

### 1. Stat Widget
**Purpose:** Display a single metric with optional trend

**Use Cases:**
- Total sales today
- Active users count
- Server uptime percentage
- Stock value

**Features:**
- Primary value with label
- Secondary metrics
- Trend indicators (up/down/neutral)
- Percentage change
- Comparison with previous period

**Example:**
```typescript
{
  type: 'stat',
  statConfig: {
    primaryValue: 'total_sales',
    primaryLabel: 'Total Sales',
    format: 'currency',
    trend: {
      enabled: true,
      compareWith: 'yesterday',
      showPercentage: true
    },
    secondaryMetrics: [
      { value: 'order_count', label: 'Orders', format: 'number' }
    ]
  }
}
```

---

### 2. Chart Widget
**Purpose:** Visualize data trends and comparisons

**Use Cases:**
- Revenue over time
- Sales by product category
- User growth chart
- API response times

**Supported Chart Types:**
- Line chart
- Bar chart
- Pie chart
- Area chart
- Donut chart

**Features:**
- Multiple data series
- Time range selection
- Data aggregation (hourly, daily, weekly, monthly)
- Interactive tooltips
- Legend

**Example:**
```typescript
{
  type: 'chart',
  chartConfig: {
    chartType: 'line',
    xAxis: 'date',
    yAxis: 'amount',
    series: [
      { name: 'Revenue', dataKey: 'revenue', color: '#2196f3' },
      { name: 'Costs', dataKey: 'costs', color: '#f44336' }
    ],
    timeRange: '7d',
    aggregation: 'daily'
  }
}
```

---

### 3. Table Widget
**Purpose:** Display structured data in rows and columns

**Use Cases:**
- Recent orders list
- User activity log
- Product inventory
- Transaction history

**Features:**
- Sortable columns
- Filterable data
- Pagination
- Row actions
- Custom column rendering

**Example:**
```typescript
{
  type: 'table',
  tableConfig: {
    columns: [
      { key: 'order_id', label: 'Order ID', sortable: true },
      { key: 'customer_name', label: 'Customer', sortable: true },
      { key: 'total', label: 'Total', format: 'currency' },
      { key: 'status', label: 'Status', badge: true }
    ],
    pagination: {
      enabled: true,
      pageSize: 10
    },
    sortBy: 'created_at',
    sortOrder: 'desc'
  }
}
```

---

### 4. Gauge Widget
**Purpose:** Display metrics with thresholds

**Use Cases:**
- System health score
- Completion percentage
- Performance metrics
- Resource utilization

**Features:**
- Min/max range
- Color-coded thresholds
- Labels
- Percentage or value display

**Example:**
```typescript
{
  type: 'gauge',
  gaugeConfig: {
    value: 'health_score',
    min: 0,
    max: 100,
    thresholds: [
      { value: 0, color: 'red', label: 'Critical' },
      { value: 50, color: 'yellow', label: 'Warning' },
      { value: 80, color: 'green', label: 'Healthy' }
    ],
    showLabels: true
  }
}
```

---

### 5. Map Widget
**Purpose:** Display geolocation data

**Use Cases:**
- Customer locations
- Warehouse locations
- Delivery tracking
- Store finder

**Features:**
- Markers
- Heatmaps
- Regions/polygons
- Clustering
- Zoom controls

**Example:**
```typescript
{
  type: 'map',
  mapConfig: {
    center: { lat: 40.7128, lng: -74.0060 },
    zoom: 10,
    markers: 'locations',
    markerConfig: {
      latKey: 'latitude',
      lngKey: 'longitude',
      labelKey: 'name'
    }
  }
}
```

---

### 6. List Widget
**Purpose:** Display a list of items

**Use Cases:**
- Low stock alerts
- Recent notifications
- Upcoming tasks
- Error logs

**Features:**
- Item templates
- Badges
- Icons
- Sorting
- Max items limit

**Example:**
```typescript
{
  type: 'list',
  listConfig: {
    itemTemplate: {
      title: 'product_name',
      subtitle: 'sku',
      badge: 'stock_level',
      badgeColor: 'red',
      icon: 'AlertTriangle'
    },
    maxItems: 10,
    sortBy: 'stock_level',
    sortOrder: 'asc'
  }
}
```

---

### 7. Custom Widget
**Purpose:** Fully custom React component

**Use Cases:**
- Complex visualizations
- Interactive tools
- Module-specific UIs
- Advanced features

**Features:**
- Full React component
- Access to widget data
- Access to shared components
- Custom styling

**Example:**
```typescript
{
  type: 'custom',
  component: MyCustomWidgetComponent
}
```

---

## Creating a Widget

### Step 1: Define Widget Purpose

Ask yourself:
- What data does this widget display?
- Who will use this widget?
- How often should the data update?
- What actions can users take?

### Step 2: Choose Data Source

**Module Data Source:**
```typescript
dataSource: {
  type: 'module',
  moduleName: 'sales',
  endpoint: '/api/metrics/summary'
}
```

**External API Data Source:**
```typescript
dataSource: {
  type: 'external_api',
  apiName: 'stripe',
  endpoint: '/v1/charges',
  credentials: 'stripe_api_key'
}
```

**System Data Source:**
```typescript
dataSource: {
  type: 'system',
  metric: 'cpu_usage'
}
```

### Step 3: Choose Widget Type

Select the most appropriate widget type based on your data:
- Single metric → **Stat Widget**
- Time-series data → **Chart Widget** (line/area)
- Categorical comparison → **Chart Widget** (bar/pie)
- Structured records → **Table Widget**
- Metric with threshold → **Gauge Widget**
- Geographic data → **Map Widget**
- List of items → **List Widget**
- Custom visualization → **Custom Widget**

### Step 4: Write Widget Configuration

```typescript
// modules/sales/frontend/src/widgets/sales-summary.widget.ts
import { CCMWidget } from '@a64core/shared';

export const salesSummaryWidget: CCMWidget = {
  id: 'sales-summary',
  title: 'Sales Summary',
  description: 'Daily sales metrics and trends',
  icon: 'TrendingUp',

  dataSource: {
    type: 'module',
    moduleName: 'sales',
    endpoint: '/api/metrics/daily-summary'
  },
  refreshInterval: 300, // 5 minutes

  type: 'stat',
  size: 'medium',

  statConfig: {
    primaryValue: 'total_sales',
    primaryLabel: 'Total Sales',
    format: 'currency',
    trend: {
      enabled: true,
      compareWith: 'yesterday',
      showPercentage: true
    }
  },

  permissions: ['sales.view_metrics'],
  roles: ['user', 'moderator', 'admin'],

  category: 'Sales',
  tags: ['sales', 'revenue', 'metrics'],
  author: 'sales',
  version: '1.0.0'
};
```

### Step 5: Implement Backend Endpoint (for Module Widgets)

```python
# modules/sales/backend/src/api/widget_data.py
from fastapi import APIRouter, Depends
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/metrics")

@router.get("/daily-summary")
async def get_daily_summary():
    """Get daily sales summary for widget"""

    today = datetime.now().date()
    yesterday = today - timedelta(days=1)

    # Calculate today's sales
    today_sales = await calculate_sales(today)
    yesterday_sales = await calculate_sales(yesterday)

    # Calculate trend
    if yesterday_sales > 0:
        trend_percentage = (
            (today_sales - yesterday_sales) / yesterday_sales
        ) * 100
    else:
        trend_percentage = 0

    return {
        "total_sales": today_sales,
        "order_count": await count_orders(today),
        "avg_order_value": today_sales / await count_orders(today),
        "trend": {
            "direction": "up" if trend_percentage > 0 else "down",
            "percentage": abs(trend_percentage),
            "comparison": "yesterday"
        },
        "timestamp": datetime.utcnow().isoformat()
    }
```

### Step 6: Register Widget

```typescript
// modules/sales/frontend/src/module.config.ts
import { salesSummaryWidget } from './widgets/sales-summary.widget';

export const moduleConfig: ERPModuleConfig = {
  name: 'sales',
  // ... other config

  dashboardWidgets: [
    salesSummaryWidget,
    // ... other widgets
  ]
};
```

---

## Widget Configuration

### Complete Widget Configuration Schema

```typescript
interface CCMWidget {
  // ========== REQUIRED FIELDS ==========

  id: string;
  // Unique widget identifier
  // Convention: {module}-{widget-name} or {api}-{widget-name}
  // Examples: "sales-summary", "stripe-payments", "system-health"

  title: string;
  // Display title shown in widget header
  // Keep concise (max 40 characters)

  dataSource: WidgetDataSource;
  // Where the widget gets its data
  // See "Data Sources" section

  type: WidgetType;
  // Widget visualization type
  // Options: 'stat' | 'chart' | 'table' | 'gauge' | 'map' | 'list' | 'custom'

  size: WidgetSize;
  // Initial widget size in grid
  // Options: 'small' | 'medium' | 'large' | 'wide' | 'full-width'

  permissions: string[];
  // Required permissions to view widget
  // Examples: ['sales.view_metrics', 'admin.view_all']

  roles: string[];
  // Allowed user roles
  // Options: ['guest', 'user', 'moderator', 'admin', 'super_admin']

  // ========== OPTIONAL FIELDS ==========

  description?: string;
  // Longer description shown in marketplace
  // Max 200 characters

  icon?: string;
  // Icon name from Lucide React
  // Examples: 'TrendingUp', 'DollarSign', 'Users'

  refreshInterval?: number;
  // Auto-refresh interval in seconds
  // Default: 60
  // Min: 10, Max: 3600

  theme?: 'light' | 'dark' | 'auto';
  // Widget color theme
  // Default: 'auto' (follows dashboard theme)

  // ========== TYPE-SPECIFIC CONFIG ==========

  statConfig?: StatConfig;
  // Required if type === 'stat'

  chartConfig?: ChartConfig;
  // Required if type === 'chart'

  tableConfig?: TableConfig;
  // Required if type === 'table'

  gaugeConfig?: GaugeConfig;
  // Required if type === 'gauge'

  mapConfig?: MapConfig;
  // Required if type === 'map'

  listConfig?: ListConfig;
  // Required if type === 'list'

  component?: React.ComponentType<WidgetProps>;
  // Required if type === 'custom'

  // ========== ALERT CONFIG ==========

  alerts?: AlertConfig;
  // Optional alert configuration
  // See "Alert System" section

  // ========== METADATA ==========

  category?: string;
  // Widget category for marketplace
  // Examples: 'Sales', 'Finance', 'Inventory', 'System'

  tags?: string[];
  // Search tags
  // Examples: ['sales', 'revenue', 'metrics']

  author?: string;
  // Module name or author
  // Examples: 'sales', 'crm', 'stripe'

  version?: string;
  // Widget version
  // Follow semantic versioning: "1.0.0"
}
```

---

## Data Sources

### Module Data Source

Used to fetch data from installed ERP modules.

```typescript
interface ModuleDataSource {
  type: 'module';
  moduleName: string;    // Module identifier (e.g., 'crm', 'sales')
  endpoint: string;      // API endpoint path (e.g., '/api/metrics/summary')
  params?: Record<string, any>; // Optional query parameters
}
```

**Example:**
```typescript
dataSource: {
  type: 'module',
  moduleName: 'inventory',
  endpoint: '/api/alerts/low-stock',
  params: {
    threshold: 10,
    warehouse: 'main'
  }
}
```

**Backend Endpoint Requirements:**
- Return JSON response
- Include `timestamp` field
- Fast response time (< 500ms)
- Handle errors gracefully

**Response Format:**
```json
{
  "data": { /* widget data */ },
  "timestamp": "2025-10-19T14:30:00Z",
  "metadata": { /* optional metadata */ }
}
```

---

### External API Data Source

Used to fetch data from external services via platform proxy.

```typescript
interface ExternalAPIDataSource {
  type: 'external_api';
  apiName: string;       // API identifier (e.g., 'stripe', 'sendgrid')
  endpoint: string;      // API endpoint path
  credentials?: string;  // Reference to stored credentials
  params?: Record<string, any>;
}
```

**Example:**
```typescript
dataSource: {
  type: 'external_api',
  apiName: 'stripe',
  endpoint: '/v1/charges',
  credentials: 'stripe_api_key',
  params: {
    limit: 100,
    created: { gte: 'today' }
  }
}
```

**Supported External APIs:**
See [External-API-Integration.md](./External-API-Integration.md) for full list.

---

### System Data Source

Used to fetch platform system metrics.

```typescript
interface SystemDataSource {
  type: 'system';
  metric: string;        // Metric name
  params?: Record<string, any>;
}
```

**Available System Metrics:**

| Metric | Description | Data Returned |
|--------|-------------|---------------|
| `health_overview` | Overall system health | Health score (0-100) |
| `cpu_usage` | CPU utilization | Percentage (0-100) |
| `memory_usage` | Memory utilization | Used/total MB |
| `disk_usage` | Disk utilization | Used/total GB |
| `db_connections` | Database connections | Active/max connections |
| `api_response_time` | API performance | Avg response time (ms) |
| `active_users` | Current active users | Count |
| `module_status` | Module health | Status per module |

**Example:**
```typescript
dataSource: {
  type: 'system',
  metric: 'cpu_usage',
  params: {
    timeRange: '1h'
  }
}
```

---

## Widget Components

### Using Built-in Widget Components

Built-in widgets (stat, chart, table, etc.) are automatically rendered by the `WidgetRenderer` component. You only need to provide configuration.

**Example: Chart Widget**
```typescript
export const revenueChartWidget: CCMWidget = {
  id: 'revenue-chart',
  title: 'Revenue Trend',
  type: 'chart',
  size: 'large',

  dataSource: {
    type: 'module',
    moduleName: 'sales',
    endpoint: '/api/charts/revenue'
  },

  chartConfig: {
    chartType: 'line',
    xAxis: 'date',
    yAxis: 'amount',
    series: [
      { name: 'Revenue', dataKey: 'revenue', color: '#2196f3' }
    ]
  },

  permissions: ['sales.view_metrics'],
  roles: ['user', 'admin']
};
```

No custom component needed! The platform handles rendering.

---

### Creating Custom Widget Components

For unique visualizations, create a custom React component.

**Step 1: Create Component**

```typescript
// modules/sales/frontend/src/widgets/SalesFunnelWidget.tsx
import React from 'react';
import { WidgetProps } from '@a64core/shared';
import { Card, Spinner } from '@a64core/shared/components';
import styled from 'styled-components';

export function SalesFunnelWidget({ data, loading, error }: WidgetProps) {
  if (loading) return <Spinner />;
  if (error) return <ErrorDisplay error={error} />;

  const { stages } = data;

  return (
    <FunnelContainer>
      {stages.map((stage, index) => (
        <FunnelStage
          key={stage.name}
          width={`${100 - (index * 15)}%`}
        >
          <StageName>{stage.name}</StageName>
          <StageCount>{stage.count}</StageCount>
          <StagePercentage>
            {stage.percentage}%
          </StagePercentage>
        </FunnelStage>
      ))}
    </FunnelContainer>
  );
}

const FunnelContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
`;

const FunnelStage = styled.div<{ width: string }>`
  width: ${({ width }) => width};
  background: ${({ theme }) => theme.colors.primary[100]};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  text-align: center;
`;

// ... more styled components
```

**Step 2: Register Component**

```typescript
// modules/sales/frontend/src/widgets/sales-funnel.widget.ts
import { SalesFunnelWidget } from './SalesFunnelWidget';

export const salesFunnelWidget: CCMWidget = {
  id: 'sales-funnel',
  title: 'Sales Funnel',
  type: 'custom',
  size: 'large',

  component: SalesFunnelWidget,

  dataSource: {
    type: 'module',
    moduleName: 'sales',
    endpoint: '/api/funnel/data'
  },

  permissions: ['sales.view_funnel'],
  roles: ['user', 'admin']
};
```

**Widget Props Interface:**

```typescript
interface WidgetProps {
  data: any;              // Data from data source
  loading: boolean;       // Loading state
  error: Error | null;    // Error if fetch failed
  config: CCMWidget;      // Widget configuration
  onRefresh: () => void;  // Manual refresh function
}
```

---

## Styling Widgets

### Using Theme System

All widgets should use the centralized theme for consistency.

```typescript
import styled from 'styled-components';

const WidgetCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.md};

  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
`;

const WidgetTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;
```

### Responsive Design

Widgets should adapt to different screen sizes.

```typescript
const ResponsiveChart = styled.div`
  width: 100%;
  height: 300px;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    height: 200px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.mobile}) {
    height: 150px;
  }
`;
```

### Accessibility

- Use semantic HTML
- Add ARIA labels
- Ensure keyboard navigation
- Provide text alternatives for charts
- Maintain color contrast ratios (WCAG 2.1 AA)

```typescript
<FunnelStage
  role="listitem"
  aria-label={`${stage.name}: ${stage.count} items, ${stage.percentage}%`}
  tabIndex={0}
>
  {/* content */}
</FunnelStage>
```

---

## Testing Widgets

### Unit Tests

Test widget component rendering and behavior.

```typescript
// modules/sales/frontend/src/widgets/__tests__/SalesFunnelWidget.test.tsx
import { render, screen } from '@testing-library/react';
import { SalesFunnelWidget } from '../SalesFunnelWidget';
import { ThemeProvider } from 'styled-components';
import { theme } from '@a64core/shared';

describe('SalesFunnelWidget', () => {
  const mockData = {
    stages: [
      { name: 'Leads', count: 100, percentage: 100 },
      { name: 'Qualified', count: 50, percentage: 50 },
      { name: 'Proposals', count: 25, percentage: 25 },
      { name: 'Won', count: 10, percentage: 10 }
    ]
  };

  it('renders all funnel stages', () => {
    render(
      <ThemeProvider theme={theme}>
        <SalesFunnelWidget data={mockData} loading={false} error={null} />
      </ThemeProvider>
    );

    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('Qualified')).toBeInTheDocument();
    expect(screen.getByText('Proposals')).toBeInTheDocument();
    expect(screen.getByText('Won')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    render(
      <ThemeProvider theme={theme}>
        <SalesFunnelWidget data={null} loading={true} error={null} />
      </ThemeProvider>
    );

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('displays error state', () => {
    const error = new Error('Failed to fetch');
    render(
      <ThemeProvider theme={theme}>
        <SalesFunnelWidget data={null} loading={false} error={error} />
      </ThemeProvider>
    );

    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```

### Integration Tests

Test widget data fetching.

```typescript
// modules/sales/frontend/src/widgets/__tests__/sales-funnel.integration.test.ts
import { widgetService } from '@a64core/shared';
import { salesFunnelWidget } from '../sales-funnel.widget';

describe('Sales Funnel Widget Integration', () => {
  it('fetches funnel data from module', async () => {
    const data = await widgetService.fetchModuleData(
      salesFunnelWidget.dataSource
    );

    expect(data).toHaveProperty('stages');
    expect(Array.isArray(data.stages)).toBe(true);
    expect(data.stages.length).toBeGreaterThan(0);
  });
});
```

### End-to-End Tests

Test widget in dashboard context.

```typescript
// tests/e2e/widgets/sales-funnel.spec.ts
import { test, expect } from '@playwright/test';

test('sales funnel widget displays in dashboard', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Navigate to dashboard
  await page.goto('/dashboard');

  // Add widget
  await page.click('[data-testid="add-widget-button"]');
  await page.click('[data-testid="widget-sales-funnel"]');

  // Wait for widget to load
  await page.waitForSelector('[data-widget-id="sales-funnel"]');

  // Verify widget content
  const widget = await page.locator('[data-widget-id="sales-funnel"]');
  await expect(widget).toContainText('Sales Funnel');
  await expect(widget).toContainText('Leads');
});
```

---

## Publishing Widgets

### Step 1: Register Widget in Module Config

```typescript
// modules/sales/frontend/src/module.config.ts
export const moduleConfig: ERPModuleConfig = {
  name: 'sales',
  version: '1.0.0',
  // ... other config

  dashboardWidgets: [
    salesSummaryWidget,
    salesFunnelWidget,
    revenueChartWidget,
    // Add new widgets here
  ]
};
```

### Step 2: Build Module

```bash
cd modules/sales/frontend
npm run build
```

### Step 3: Deploy Module

The module deployment process automatically registers widgets in the marketplace.

```bash
# Deploy module via admin portal or API
POST /api/v1/modules/install
{
  "module_name": "sales",
  "docker_image": "localhost:5000/sales:1.0.0",
  "version": "1.0.0",
  "license_key": "..."
}
```

### Step 4: Widgets Available in Marketplace

Once the module is installed, its widgets automatically appear in the widget marketplace for users to add to their dashboards.

---

## Best Practices

### 1. Performance

**✅ DO:**
- Cache data when appropriate
- Use pagination for large datasets
- Implement lazy loading
- Optimize chart rendering
- Use virtualization for long lists

**❌ DON'T:**
- Fetch all data at once
- Re-render entire widget on every update
- Use short refresh intervals (< 10 seconds) without good reason
- Perform heavy calculations on frontend

### 2. Data Fetching

**✅ DO:**
- Return only required data
- Use appropriate refresh intervals
- Handle errors gracefully
- Include timestamps
- Cache responses

**❌ DON'T:**
- Return entire database tables
- Poll aggressively
- Ignore error states
- Return stale data without indication

### 3. User Experience

**✅ DO:**
- Show loading states
- Display error messages clearly
- Provide refresh button
- Use meaningful titles
- Add helpful descriptions

**❌ DON'T:**
- Show raw error stack traces
- Leave widgets blank during loading
- Use cryptic labels
- Overwhelm with too much data

### 4. Security

**✅ DO:**
- Validate all inputs
- Check permissions
- Sanitize data
- Use HTTPS for external APIs
- Store credentials securely

**❌ DON'T:**
- Expose sensitive data
- Skip permission checks
- Trust user input
- Hardcode API keys
- Return internal error details

### 5. Accessibility

**✅ DO:**
- Use semantic HTML
- Add ARIA labels
- Ensure keyboard navigation
- Maintain color contrast
- Provide text alternatives

**❌ DON'T:**
- Rely only on color
- Use inaccessible components
- Ignore screen readers
- Use tiny fonts

---

## Examples

### Example 1: Simple Stat Widget

```typescript
export const activeUsersWidget: CCMWidget = {
  id: 'active-users',
  title: 'Active Users',
  description: 'Currently active users on the platform',
  icon: 'Users',

  dataSource: {
    type: 'system',
    metric: 'active_users'
  },
  refreshInterval: 60,

  type: 'stat',
  size: 'small',

  statConfig: {
    primaryValue: 'count',
    primaryLabel: 'Active Now',
    format: 'number'
  },

  permissions: ['system.view'],
  roles: ['admin'],
  category: 'System',
  tags: ['users', 'activity'],
  version: '1.0.0'
};
```

### Example 2: Multi-Series Chart Widget

```typescript
export const salesVsCostsWidget: CCMWidget = {
  id: 'sales-vs-costs',
  title: 'Sales vs Costs',
  description: 'Monthly revenue and costs comparison',
  icon: 'BarChart3',

  dataSource: {
    type: 'module',
    moduleName: 'accounting',
    endpoint: '/api/charts/sales-vs-costs',
    params: {
      months: 12
    }
  },
  refreshInterval: 3600, // 1 hour

  type: 'chart',
  size: 'large',

  chartConfig: {
    chartType: 'bar',
    xAxis: 'month',
    yAxis: 'amount',
    series: [
      { name: 'Sales', dataKey: 'sales', color: '#4caf50' },
      { name: 'Costs', dataKey: 'costs', color: '#f44336' }
    ],
    stacked: false
  },

  permissions: ['accounting.view_metrics'],
  roles: ['admin', 'moderator'],
  category: 'Finance',
  tags: ['sales', 'costs', 'comparison'],
  version: '1.0.0'
};
```

### Example 3: Table Widget with Actions

```typescript
export const recentOrdersWidget: CCMWidget = {
  id: 'recent-orders',
  title: 'Recent Orders',
  description: 'Latest customer orders',
  icon: 'ShoppingCart',

  dataSource: {
    type: 'module',
    moduleName: 'sales',
    endpoint: '/api/orders/recent',
    params: {
      limit: 20
    }
  },
  refreshInterval: 120,

  type: 'table',
  size: 'wide',

  tableConfig: {
    columns: [
      { key: 'order_id', label: 'Order ID', sortable: true },
      { key: 'customer_name', label: 'Customer', sortable: true },
      { key: 'items', label: 'Items', sortable: false },
      { key: 'total', label: 'Total', format: 'currency', sortable: true },
      { key: 'status', label: 'Status', badge: true },
      { key: 'created_at', label: 'Date', format: 'datetime', sortable: true }
    ],
    actions: [
      { label: 'View', icon: 'Eye', action: 'view' },
      { label: 'Invoice', icon: 'FileText', action: 'invoice' }
    ],
    pagination: {
      enabled: true,
      pageSize: 10
    },
    sortBy: 'created_at',
    sortOrder: 'desc'
  },

  permissions: ['sales.view_orders'],
  roles: ['user', 'moderator', 'admin'],
  category: 'Sales',
  tags: ['orders', 'sales', 'customers'],
  version: '1.0.0'
};
```

### Example 4: Gauge Widget with Alerts

```typescript
export const diskUsageWidget: CCMWidget = {
  id: 'disk-usage',
  title: 'Disk Usage',
  description: 'Server disk space utilization',
  icon: 'HardDrive',

  dataSource: {
    type: 'system',
    metric: 'disk_usage'
  },
  refreshInterval: 300,

  type: 'gauge',
  size: 'small',

  gaugeConfig: {
    value: 'percentage',
    min: 0,
    max: 100,
    thresholds: [
      { value: 0, color: 'green', label: 'Normal' },
      { value: 70, color: 'yellow', label: 'Warning' },
      { value: 90, color: 'red', label: 'Critical' }
    ],
    showLabels: true,
    unit: '%'
  },

  alerts: {
    enabled: true,
    conditions: [
      { field: 'percentage', operator: '>', value: 90, severity: 'critical' },
      { field: 'percentage', operator: '>', value: 80, severity: 'warning' }
    ],
    notifications: ['dashboard', 'email']
  },

  permissions: ['system.view'],
  roles: ['admin'],
  category: 'System',
  tags: ['disk', 'storage', 'monitoring'],
  version: '1.0.0'
};
```

### Example 5: Custom Widget

```typescript
// Component
export function HeatmapWidget({ data, loading, error }: WidgetProps) {
  if (loading) return <Spinner />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <HeatmapContainer>
      <ResponsiveHeatMap
        data={data.heatmapData}
        margin={{ top: 60, right: 90, bottom: 60, left: 90 }}
        axisTop={{ tickSize: 5, tickPadding: 5, tickRotation: -90 }}
        axisLeft={{ tickSize: 5, tickPadding: 5, tickRotation: 0 }}
        colors={{
          type: 'sequential',
          scheme: 'blues'
        }}
        emptyColor="#eeeeee"
        legends={[
          {
            anchor: 'bottom',
            translateX: 0,
            translateY: 30,
            length: 400,
            thickness: 8,
            direction: 'row'
          }
        ]}
      />
    </HeatmapContainer>
  );
}

// Configuration
export const salesHeatmapWidget: CCMWidget = {
  id: 'sales-heatmap',
  title: 'Sales Activity Heatmap',
  description: 'Sales activity by hour and day of week',
  icon: 'Grid3x3',

  dataSource: {
    type: 'module',
    moduleName: 'sales',
    endpoint: '/api/heatmap/activity'
  },
  refreshInterval: 3600,

  type: 'custom',
  size: 'large',
  component: HeatmapWidget,

  permissions: ['sales.view_analytics'],
  roles: ['admin', 'moderator'],
  category: 'Sales',
  tags: ['sales', 'activity', 'heatmap'],
  version: '1.0.0'
};
```

---

## Troubleshooting

### Widget Not Appearing in Marketplace

**Possible causes:**
- Widget not registered in module config
- Module not deployed
- User lacks required permissions

**Solution:**
1. Verify widget is in `dashboardWidgets` array
2. Rebuild and redeploy module
3. Check user has required permissions/roles

### Widget Data Not Loading

**Possible causes:**
- Backend endpoint error
- Invalid data source configuration
- Network issues
- Permission denied

**Solution:**
1. Check browser console for errors
2. Verify backend endpoint is accessible
3. Test endpoint directly (curl/Postman)
4. Check user permissions

### Widget Rendering Issues

**Possible causes:**
- Missing configuration
- Invalid data format
- Theme not applied
- Component error

**Solution:**
1. Validate widget configuration
2. Check data format matches expected schema
3. Ensure ThemeProvider wraps component
4. Check component error boundaries

---

## Resources

### Documentation
- [CCM Architecture](./CCM-Architecture.md)
- [Frontend Architecture](./Frontend-Architecture.md)
- [External API Integration](./External-API-Integration.md)

### Code Examples
- [Example Widgets](../../modules/core-modules/*/frontend/src/widgets/)
- [Shared Components](../../frontend/shared/src/components/widgets/)

### Tools
- [React Documentation](https://react.dev)
- [Recharts (Charts)](https://recharts.org)
- [Lucide Icons](https://lucide.dev)
- [styled-components](https://styled-components.com)

---

**End of Widget Development Guide**
