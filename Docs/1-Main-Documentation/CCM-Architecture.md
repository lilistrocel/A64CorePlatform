# CCM (Centralized Controls Monitoring) Architecture

**Version:** 1.0.0
**Status:** Planning
**Created:** 2025-10-19
**Platform:** A64 Core Platform

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [System Components](#system-components)
4. [Widget System](#widget-system)
5. [Data Flow](#data-flow)
6. [Dashboard Layouts](#dashboard-layouts)
7. [Real-Time Updates](#real-time-updates)
8. [Alert System](#alert-system)
9. [Role-Based Views](#role-based-views)
10. [Security Architecture](#security-architecture)
11. [Performance Considerations](#performance-considerations)
12. [Scalability](#scalability)

---

## Overview

### What is CCM?

**CCM (Centralized Controls Monitoring)** is a universal monitoring dashboard that provides:

- **Unified View**: Single dashboard displaying data from multiple sources
- **Real-Time Monitoring**: Live updates from modules, external APIs, and system metrics
- **Customizable Layouts**: Drag-and-drop widget arrangement
- **Cross-Module Insights**: Correlate data across different ERP modules
- **External Integration**: Display data from external services (Stripe, SendGrid, Analytics, IoT, etc.)
- **Alerting**: Automated alerts based on thresholds and conditions

### Use Cases

**Business Operations Monitoring:**
- Sales dashboard showing real-time orders, revenue, and conversion rates
- Inventory dashboard with stock levels, low-stock alerts, and warehouse status
- Financial dashboard with cash flow, accounts receivable/payable, and P&L metrics

**System Monitoring:**
- Server health metrics (CPU, memory, disk usage)
- Database performance (query times, connection pool usage)
- Module health status (running, stopped, error states)
- API response times and error rates

**External Service Monitoring:**
- Payment gateway stats (Stripe, PayPal)
- Email campaign performance (SendGrid, Mailchimp)
- Analytics data (Google Analytics, custom analytics)
- IoT sensor data (temperature, humidity, equipment status)
- Third-party API usage and quotas

**Cross-Module Correlation:**
- Sales vs. Inventory correlation (identify bestsellers running low on stock)
- CRM leads vs. Sales conversion funnel
- HR attendance vs. Productivity metrics
- Accounting receivables vs. Sales pipeline

---

## Architecture Principles

### 1. **Modularity**
- Widgets are self-contained, reusable components
- Each widget has a clear data source and configuration
- Widgets can be added/removed without affecting others

### 2. **Extensibility**
- New widget types can be added easily
- Modules can contribute widgets to the marketplace
- External API connectors are pluggable

### 3. **Performance**
- Lazy loading of widgets
- Efficient data fetching with caching
- Real-time updates via WebSockets (not polling)
- Pagination and virtualization for large datasets

### 4. **Security**
- Permission-based widget access
- Role-based dashboard views
- Secure credential storage for external APIs
- Data isolation between tenants

### 5. **User Experience**
- Intuitive drag-and-drop interface
- Responsive design (works on desktop, tablet, mobile)
- Fast rendering (< 500ms per widget)
- Graceful error handling

---

## System Components

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER PORTAL FRONTEND                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │                   CCM DASHBOARD                           │      │
│  │                                                           │      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │      │
│  │  │ Grid Layout  │  │Widget        │  │Widget        │   │      │
│  │  │ Manager      │  │Renderer      │  │Marketplace   │   │      │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │      │
│  │                                                           │      │
│  │  ┌──────────────────────────────────────────────────┐   │      │
│  │  │         Widget Instances (20+ widgets)           │   │      │
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │   │      │
│  │  │  │Sales│ │Inv. │ │Acc. │ │API  │ │CPU  │       │   │      │
│  │  │  │Stats│ │Alert│ │KPIs │ │Stats│ │Usage│  ...  │   │      │
│  │  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │   │      │
│  │  └──────────────────────────────────────────────────┘   │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
    ┌───────────▼─────────────┐    ┌───────────▼────────────┐
    │  BACKEND API (FastAPI)  │    │   WEBSOCKET SERVER     │
    │                         │    │                        │
    │  /api/v1/widgets/*      │    │  /ws/widgets/*         │
    │  /api/v1/external-api/* │    │  Real-time updates     │
    │  /api/v1/modules/*      │    │  Push notifications    │
    └──────────┬──────────────┘    └────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────────┐  ┌─────────▼──────────┐  ┌──────────────────┐
│  MongoDB   │  │  MODULES           │  │  EXTERNAL APIs   │
│            │  │                    │  │                  │
│  - widgets │  │  - CRM             │  │  - Stripe        │
│  - layouts │  │  - Sales           │  │  - SendGrid      │
│  - configs │  │  - Inventory       │  │  - Analytics     │
│            │  │  - Accounting      │  │  - IoT Sensors   │
└────────────┘  │  - HR              │  └──────────────────┘
                │                    │
                │  Each provides:    │
                │  - Widget data API │
                │  - Metrics API     │
                │  - Events API      │
                └────────────────────┘
```

### Frontend Components

**1. CCMDashboard Component**
- Main dashboard container
- Manages layout state
- Handles widget lifecycle (add, remove, update)

**2. GridLayout Component**
- Drag-and-drop grid system
- Responsive breakpoints
- Layout persistence

**3. WidgetRenderer Component**
- Renders individual widgets
- Handles loading/error states
- Manages widget refresh

**4. WidgetMarketplace Component**
- Browse available widgets
- Add widgets to dashboard
- Widget categories and search

**5. Widget Types**
- StatWidget (single metric display)
- ChartWidget (line, bar, pie, area charts)
- TableWidget (data tables)
- GaugeWidget (gauges and meters)
- MapWidget (geolocation data)
- ListWidget (item lists)
- CustomWidget (module-specific widgets)

### Backend Services

**1. Widget Service** (`src/services/widget_service.py`)
- Widget CRUD operations
- Widget data fetching
- Widget configuration management

**2. External API Service** (`src/services/external_api_service.py`)
- Proxy for external APIs
- Credential management
- Rate limiting
- Response caching

**3. Module Bridge Service** (`src/services/module_bridge.py`)
- Module-to-module communication
- Widget data aggregation
- Cross-module queries

**4. WebSocket Manager** (`src/services/websocket_manager.py`)
- Real-time data streaming
- Connection management
- Event broadcasting

---

## Widget System

### Widget Configuration Schema

```typescript
interface CCMWidget {
  // Identification
  id: string;                    // Unique widget ID
  title: string;                 // Display title
  description?: string;          // Optional description
  icon?: string;                 // Icon name (Lucide)

  // Data Source
  dataSource: WidgetDataSource;
  refreshInterval?: number;      // Refresh interval in seconds (default: 60)

  // Display Configuration
  type: WidgetType;
  size: WidgetSize;
  theme?: 'light' | 'dark' | 'auto';

  // Type-Specific Configuration
  chartConfig?: ChartConfig;
  statConfig?: StatConfig;
  tableConfig?: TableConfig;
  gaugeConfig?: GaugeConfig;

  // Permissions & Access
  permissions: string[];         // Required permissions
  roles: string[];              // Allowed roles

  // Alert Configuration
  alerts?: AlertConfig;

  // Metadata
  category?: string;            // Widget category
  tags?: string[];              // Search tags
  author?: string;              // Module/creator name
  version?: string;             // Widget version
}

type WidgetDataSource =
  | ModuleDataSource
  | ExternalAPIDataSource
  | SystemDataSource;

interface ModuleDataSource {
  type: 'module';
  moduleName: string;           // e.g., 'crm', 'sales'
  endpoint: string;             // e.g., '/api/metrics/daily-summary'
  params?: Record<string, any>; // Optional query params
}

interface ExternalAPIDataSource {
  type: 'external_api';
  apiName: string;              // e.g., 'stripe', 'sendgrid'
  endpoint: string;             // e.g., '/v1/charges'
  credentials?: string;         // Reference to stored credentials
  params?: Record<string, any>;
}

interface SystemDataSource {
  type: 'system';
  metric: string;               // e.g., 'cpu_usage', 'db_connections'
  params?: Record<string, any>;
}

type WidgetType =
  | 'stat'      // Single metric with optional trend
  | 'chart'     // Charts (line, bar, pie, area, donut)
  | 'table'     // Data table
  | 'gauge'     // Gauge/meter
  | 'map'       // Geographic map
  | 'list'      // List of items
  | 'custom';   // Custom component

type WidgetSize =
  | 'small'      // 1x1 grid units
  | 'medium'     // 2x1 grid units
  | 'large'      // 2x2 grid units
  | 'wide'       // 4x1 grid units
  | 'full-width';// Full row width
```

### Widget Examples

#### Example 1: Sales Summary Widget (Module Data Source)

```typescript
const salesSummaryWidget: CCMWidget = {
  id: 'sales-summary',
  title: 'Daily Sales Summary',
  description: 'Total sales, orders, and average order value for today',
  icon: 'TrendingUp',

  dataSource: {
    type: 'module',
    moduleName: 'sales',
    endpoint: '/api/metrics/daily-summary',
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
      showPercentage: true,
    },
    secondaryMetrics: [
      { value: 'order_count', label: 'Orders', format: 'number' },
      { value: 'avg_order_value', label: 'AOV', format: 'currency' },
    ],
  },

  permissions: ['sales.view_metrics'],
  roles: ['user', 'moderator', 'admin'],
  category: 'Sales',
  tags: ['sales', 'revenue', 'orders'],
};
```

**Data Response Example:**
```json
{
  "total_sales": 15234.50,
  "order_count": 47,
  "avg_order_value": 324.14,
  "trend": {
    "direction": "up",
    "percentage": 12.5,
    "comparison": "yesterday"
  },
  "timestamp": "2025-10-19T14:30:00Z"
}
```

#### Example 2: Stripe Payments Widget (External API)

```typescript
const stripePaymentsWidget: CCMWidget = {
  id: 'stripe-payments',
  title: 'Payment Activity',
  description: 'Recent Stripe payment transactions',
  icon: 'CreditCard',

  dataSource: {
    type: 'external_api',
    apiName: 'stripe',
    endpoint: '/v1/charges',
    credentials: 'stripe_api_key',
    params: {
      limit: 100,
      created: { gte: 'today' },
    },
  },
  refreshInterval: 60, // 1 minute

  type: 'chart',
  size: 'large',

  chartConfig: {
    chartType: 'line',
    xAxis: 'created',
    yAxis: 'amount',
    series: [
      { name: 'Successful', dataKey: 'amount', filter: { status: 'succeeded' } },
      { name: 'Failed', dataKey: 'amount', filter: { status: 'failed' } },
    ],
    timeRange: '24h',
    aggregation: 'hourly',
  },

  permissions: ['finance.view_payments'],
  roles: ['admin', 'moderator'],
  category: 'Finance',
  tags: ['payments', 'stripe', 'transactions'],
};
```

#### Example 3: System Health Widget

```typescript
const systemHealthWidget: CCMWidget = {
  id: 'system-health',
  title: 'System Health',
  description: 'Platform health metrics',
  icon: 'Activity',

  dataSource: {
    type: 'system',
    metric: 'health_overview',
  },
  refreshInterval: 30, // 30 seconds

  type: 'gauge',
  size: 'small',

  gaugeConfig: {
    value: 'health_score',
    min: 0,
    max: 100,
    thresholds: [
      { value: 0, color: 'red', label: 'Critical' },
      { value: 50, color: 'yellow', label: 'Warning' },
      { value: 80, color: 'green', label: 'Healthy' },
    ],
    showLabels: true,
  },

  permissions: ['system.view'],
  roles: ['admin'],
  category: 'System',
  tags: ['health', 'monitoring', 'system'],
};
```

#### Example 4: Inventory Low Stock Alert Widget

```typescript
const lowStockWidget: CCMWidget = {
  id: 'low-stock-alert',
  title: 'Low Stock Alert',
  description: 'Products with stock below threshold',
  icon: 'AlertTriangle',

  dataSource: {
    type: 'module',
    moduleName: 'inventory',
    endpoint: '/api/alerts/low-stock',
    params: {
      threshold: 10,
    },
  },
  refreshInterval: 120, // 2 minutes

  type: 'list',
  size: 'medium',

  listConfig: {
    itemTemplate: {
      title: 'product_name',
      subtitle: 'sku',
      badge: 'stock_level',
      badgeColor: 'red',
    },
    maxItems: 10,
    sortBy: 'stock_level',
    sortOrder: 'asc',
  },

  alerts: {
    enabled: true,
    conditions: [
      {
        field: 'stock_level',
        operator: '<',
        value: 5,
        severity: 'critical',
      },
    ],
    notifications: ['dashboard', 'email'],
  },

  permissions: ['inventory.view_stock'],
  roles: ['user', 'moderator', 'admin'],
  category: 'Inventory',
  tags: ['inventory', 'stock', 'alerts'],
};
```

---

## Data Flow

### Widget Data Fetching Flow

```
┌─────────────────┐
│  CCMDashboard   │
│   Component     │
└────────┬────────┘
         │
         │ 1. Renders widgets based on user layout
         │
         ▼
┌─────────────────┐
│ WidgetRenderer  │ (for each widget)
│   Component     │
└────────┬────────┘
         │
         │ 2. useWidgetData hook
         │
         ▼
┌─────────────────┐
│  React Query    │
│   (useQuery)    │
└────────┬────────┘
         │
         │ 3. Fetch data based on dataSource type
         │
         ├─────────────────┬─────────────────┬─────────────────┐
         │                 │                 │                 │
         ▼                 ▼                 ▼                 ▼
┌────────────────┐ ┌───────────────┐ ┌─────────────┐ ┌──────────────┐
│ Module Data    │ │ External API  │ │ System Data │ │ WebSocket    │
│ Fetcher        │ │ Proxy         │ │ Fetcher     │ │ (Real-time)  │
└───────┬────────┘ └───────┬───────┘ └──────┬──────┘ └──────┬───────┘
        │                  │                │                │
        │ 4. API Requests  │                │                │
        │                  │                │                │
        ▼                  ▼                ▼                ▼
┌────────────────────────────────────────────────────────────────┐
│                   BACKEND API (FastAPI)                        │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Widget API   │  │ External API │  │ System API   │        │
│  │ /widgets/*   │  │ /external/*  │  │ /system/*    │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          │ 5. Fetch from data sources         │
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐ ┌───────────────┐ ┌──────────────┐
│  Module APIs    │ │ External APIs │ │ System       │
│                 │ │               │ │ Metrics      │
│  - CRM          │ │ - Stripe      │ │              │
│  - Sales        │ │ - SendGrid    │ │ - CPU/Memory │
│  - Inventory    │ │ - Analytics   │ │ - DB Stats   │
└─────────────────┘ └───────────────┘ └──────────────┘
```

### Data Fetching Services

**Frontend Service:**

```typescript
// frontend/shared/src/services/widget.service.ts
class WidgetService {
  async fetchModuleData(dataSource: ModuleDataSource): Promise<any> {
    const response = await api.get(
      `/modules/${dataSource.moduleName}/widget-data`,
      {
        params: {
          endpoint: dataSource.endpoint,
          ...dataSource.params,
        },
      }
    );
    return response.data;
  }

  async fetchExternalAPIData(dataSource: ExternalAPIDataSource): Promise<any> {
    const response = await api.post('/external-api/proxy', {
      apiName: dataSource.apiName,
      endpoint: dataSource.endpoint,
      credentials: dataSource.credentials,
      params: dataSource.params,
    });
    return response.data;
  }

  async fetchSystemMetric(dataSource: SystemDataSource): Promise<any> {
    const response = await api.get('/system/metrics', {
      params: {
        metric: dataSource.metric,
        ...dataSource.params,
      },
    });
    return response.data;
  }
}
```

**Backend Service:**

```python
# src/services/widget_service.py
class WidgetService:
    async def fetch_widget_data(
        self,
        widget: CCMWidget,
        user_id: str
    ) -> Dict[str, Any]:
        """Fetch data for a widget based on its data source"""

        if widget.data_source.type == "module":
            return await self._fetch_module_data(widget, user_id)
        elif widget.data_source.type == "external_api":
            return await self._fetch_external_api_data(widget, user_id)
        elif widget.data_source.type == "system":
            return await self._fetch_system_data(widget, user_id)

    async def _fetch_module_data(
        self,
        widget: CCMWidget,
        user_id: str
    ) -> Dict[str, Any]:
        """Fetch data from installed module"""
        module_name = widget.data_source.module_name
        endpoint = widget.data_source.endpoint

        # Verify module is installed and running
        module = await module_manager.get_module(module_name)
        if not module or module.status != "running":
            raise ValueError(f"Module '{module_name}' not available")

        # Make HTTP request to module
        url = f"http://a64core-{module_name}:8080{endpoint}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=widget.data_source.params)
            return response.json()

    async def _fetch_external_api_data(
        self,
        widget: CCMWidget,
        user_id: str
    ) -> Dict[str, Any]:
        """Fetch data from external API via proxy"""
        return await external_api_service.fetch_data(
            api_name=widget.data_source.api_name,
            endpoint=widget.data_source.endpoint,
            user_id=user_id,
            params=widget.data_source.params
        )

    async def _fetch_system_data(
        self,
        widget: CCMWidget,
        user_id: str
    ) -> Dict[str, Any]:
        """Fetch system metrics"""
        metric = widget.data_source.metric

        if metric == "health_overview":
            return await self._get_health_metrics()
        elif metric == "cpu_usage":
            return await self._get_cpu_metrics()
        # ... other system metrics
```

---

## Dashboard Layouts

### Layout Storage Schema

```typescript
interface DashboardLayout {
  userId: string;
  layoutId: string;
  name: string;
  isDefault: boolean;
  widgets: WidgetLayoutItem[];
  createdAt: Date;
  updatedAt: Date;
}

interface WidgetLayoutItem {
  widgetId: string;
  position: {
    x: number;      // Grid column
    y: number;      // Grid row
    w: number;      // Width in grid units
    h: number;      // Height in grid units
  };
  config?: Record<string, any>; // Widget-specific config overrides
}
```

### MongoDB Schema

```javascript
// Collection: dashboard_layouts
{
  _id: ObjectId("..."),
  user_id: "uuid",
  layout_id: "default",
  name: "My Dashboard",
  is_default: true,
  widgets: [
    {
      widget_id: "sales-summary",
      position: { x: 0, y: 0, w: 2, h: 1 },
      config: { refreshInterval: 300 }
    },
    {
      widget_id: "inventory-alerts",
      position: { x: 2, y: 0, w: 2, h: 2 },
    },
    // ... more widgets
  ],
  created_at: ISODate("2025-10-19T..."),
  updated_at: ISODate("2025-10-19T...")
}
```

### Layout API Endpoints

```
GET    /api/v1/dashboards/layouts          # Get user's layouts
POST   /api/v1/dashboards/layouts          # Create new layout
GET    /api/v1/dashboards/layouts/:id      # Get specific layout
PATCH  /api/v1/dashboards/layouts/:id      # Update layout
DELETE /api/v1/dashboards/layouts/:id      # Delete layout
POST   /api/v1/dashboards/layouts/:id/duplicate  # Duplicate layout
```

---

## Real-Time Updates

### WebSocket Architecture

**Connection Flow:**

```
┌──────────────┐                    ┌──────────────┐
│   Frontend   │                    │   Backend    │
│   (User)     │                    │  (FastAPI)   │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │ 1. Connect to WebSocket           │
       ├──────────────────────────────────>│
       │   ws://api/ws/dashboard           │
       │                                   │
       │ 2. Authentication (JWT in query)  │
       ├──────────────────────────────────>│
       │                                   │
       │ 3. Subscribe to widgets           │
       ├──────────────────────────────────>│
       │   { action: "subscribe",          │
       │     widgets: ["sales-summary",    │
       │               "inventory-alerts"] }│
       │                                   │
       │ 4. Receive real-time updates      │
       │<──────────────────────────────────┤
       │   { widget_id: "sales-summary",   │
       │     data: {...},                  │
       │     timestamp: "..." }            │
       │                                   │
       │ 5. Widget data push (on change)   │
       │<──────────────────────────────────┤
       │                                   │
```

**WebSocket Implementation:**

```python
# src/api/v1/websocket.py
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set

class WebSocketManager:
    def __init__(self):
        # user_id -> WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}
        # user_id -> set of subscribed widget IDs
        self.subscriptions: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.subscriptions[user_id] = set()

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.subscriptions:
            del self.subscriptions[user_id]

    async def subscribe_to_widgets(self, user_id: str, widget_ids: List[str]):
        """Subscribe user to widget updates"""
        if user_id in self.subscriptions:
            self.subscriptions[user_id].update(widget_ids)

    async def broadcast_widget_update(self, widget_id: str, data: dict):
        """Send widget update to all subscribed users"""
        for user_id, subscribed_widgets in self.subscriptions.items():
            if widget_id in subscribed_widgets:
                websocket = self.active_connections.get(user_id)
                if websocket:
                    await websocket.send_json({
                        "widget_id": widget_id,
                        "data": data,
                        "timestamp": datetime.utcnow().isoformat()
                    })

@router.websocket("/ws/dashboard")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    # Authenticate
    user = await verify_token(token)

    await ws_manager.connect(websocket, user.id)

    try:
        while True:
            message = await websocket.receive_json()

            if message["action"] == "subscribe":
                await ws_manager.subscribe_to_widgets(
                    user.id,
                    message["widgets"]
                )
            elif message["action"] == "unsubscribe":
                # Handle unsubscribe
                pass

    except WebSocketDisconnect:
        ws_manager.disconnect(user.id)
```

**Frontend Implementation:**

```typescript
// frontend/shared/src/hooks/useRealtimeWidget.ts
export function useRealtimeWidget(widgetId: string) {
  const [data, setData] = useState(null);
  const { token } = useAuth();

  useEffect(() => {
    const ws = new WebSocket(
      `ws://localhost/api/ws/dashboard?token=${token}`
    );

    ws.onopen = () => {
      ws.send(JSON.stringify({
        action: 'subscribe',
        widgets: [widgetId]
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.widget_id === widgetId) {
        setData(message.data);
      }
    };

    return () => {
      ws.send(JSON.stringify({
        action: 'unsubscribe',
        widgets: [widgetId]
      }));
      ws.close();
    };
  }, [widgetId, token]);

  return data;
}
```

---

## Alert System

### Alert Configuration

```typescript
interface AlertConfig {
  enabled: boolean;
  conditions: AlertCondition[];
  notifications: NotificationType[];
  cooldown?: number; // seconds between alerts (default: 300)
}

interface AlertCondition {
  field: string;
  operator: '>' | '<' | '=' | '>=' | '<=' | '!=' | 'contains';
  value: any;
  severity: 'info' | 'warning' | 'critical';
}

type NotificationType = 'dashboard' | 'email' | 'sms' | 'webhook';
```

### Alert Processing

```python
# src/services/alert_service.py
class AlertService:
    async def check_widget_alerts(
        self,
        widget: CCMWidget,
        data: Dict[str, Any],
        user_id: str
    ):
        """Check if widget data triggers any alerts"""

        if not widget.alerts or not widget.alerts.enabled:
            return

        for condition in widget.alerts.conditions:
            if self._evaluate_condition(condition, data):
                await self._trigger_alert(
                    widget,
                    condition,
                    data,
                    user_id
                )

    def _evaluate_condition(
        self,
        condition: AlertCondition,
        data: Dict[str, Any]
    ) -> bool:
        """Evaluate if condition is met"""
        value = data.get(condition.field)

        if condition.operator == '>':
            return value > condition.value
        elif condition.operator == '<':
            return value < condition.value
        # ... other operators

    async def _trigger_alert(
        self,
        widget: CCMWidget,
        condition: AlertCondition,
        data: Dict[str, Any],
        user_id: str
    ):
        """Trigger alert notifications"""

        # Check cooldown
        if await self._is_in_cooldown(widget.id, user_id):
            return

        # Create alert record
        alert = await self._create_alert_record(
            widget, condition, data, user_id
        )

        # Send notifications
        for notification_type in widget.alerts.notifications:
            if notification_type == 'dashboard':
                await self._send_dashboard_notification(alert)
            elif notification_type == 'email':
                await self._send_email_notification(alert, user_id)
            elif notification_type == 'sms':
                await self._send_sms_notification(alert, user_id)
            elif notification_type == 'webhook':
                await self._send_webhook_notification(alert, user_id)
```

---

## Role-Based Views

### Dashboard Presets by Role

```typescript
interface DashboardPreset {
  role: string;
  name: string;
  description: string;
  widgets: string[]; // Widget IDs
  layout: WidgetLayoutItem[];
}

// Example: Admin Dashboard Preset
const adminDashboardPreset: DashboardPreset = {
  role: 'admin',
  name: 'Admin Overview',
  description: 'System-wide monitoring dashboard for administrators',
  widgets: [
    'system-health',
    'user-activity',
    'module-status',
    'api-performance',
    'database-stats',
    'error-logs',
  ],
  layout: [
    { widgetId: 'system-health', position: { x: 0, y: 0, w: 1, h: 1 } },
    { widgetId: 'user-activity', position: { x: 1, y: 0, w: 2, h: 1 } },
    // ... more widgets
  ],
};

// Example: Sales Manager Dashboard Preset
const salesManagerPreset: DashboardPreset = {
  role: 'sales_manager',
  name: 'Sales Overview',
  description: 'Sales performance and pipeline monitoring',
  widgets: [
    'sales-summary',
    'revenue-chart',
    'sales-pipeline',
    'top-products',
    'customer-acquisition',
  ],
  layout: [
    { widgetId: 'sales-summary', position: { x: 0, y: 0, w: 2, h: 1 } },
    { widgetId: 'revenue-chart', position: { x: 2, y: 0, w: 2, h: 2 } },
    // ... more widgets
  ],
};
```

---

## Security Architecture

### Widget Access Control

1. **Permission-Based Access**
   - Each widget requires specific permissions
   - User must have all required permissions to view widget

2. **Role-Based Access**
   - Widgets can be restricted to specific roles
   - Hierarchical role inheritance

3. **Data Isolation**
   - Multi-tenant data isolation
   - Users only see data from their organization

### External API Security

1. **Credential Storage**
   - Encrypted at rest (Fernet encryption)
   - Per-user credential storage
   - Never sent to frontend

2. **API Proxy**
   - All external API calls go through backend proxy
   - Rate limiting per API
   - Request validation

3. **Audit Logging**
   - All external API calls logged
   - User tracking
   - Anomaly detection

---

## Performance Considerations

### Caching Strategy

**1. Widget Data Caching**
- Cache widget data in Redis
- TTL based on widget refresh interval
- Invalidate on data change

**2. Layout Caching**
- Cache user layouts in memory
- Update on layout change

**3. External API Response Caching**
- Cache external API responses
- Configurable TTL per API
- Reduce API quota usage

### Optimization Techniques

**1. Lazy Loading**
- Load widgets only when visible
- Pagination for large datasets

**2. Data Aggregation**
- Pre-aggregate metrics
- Background jobs for heavy calculations

**3. Real-Time Updates**
- Use WebSockets (not polling)
- Only push changed data

**4. Frontend Optimization**
- Virtualization for large lists
- Debounce layout updates
- Memoization of expensive renders

---

## Scalability

### Horizontal Scaling

**1. Stateless Backend**
- WebSocket connections can be distributed
- Use Redis for session storage

**2. Database Optimization**
- Index frequently queried fields
- Partition large collections

**3. External API Management**
- Rate limiting per user
- Queue external API requests

### Capacity Planning

**Expected Load:**
- 100+ concurrent users
- 20 widgets per dashboard
- 30-60 second refresh intervals
- 10,000+ widget data fetches/minute

**Infrastructure Requirements:**
- Load balancer for API instances
- Redis cluster for caching
- MongoDB replica set
- WebSocket server cluster

---

## Future Enhancements

### Planned Features (v2.0)

1. **AI-Powered Insights**
   - Anomaly detection
   - Predictive analytics
   - Automated recommendations

2. **Advanced Visualizations**
   - 3D charts
   - Heatmaps
   - Network graphs

3. **Collaboration Features**
   - Shared dashboards
   - Comments on widgets
   - Dashboard templates

4. **Mobile App**
   - Native iOS/Android apps
   - Push notifications
   - Offline mode

5. **Widget Marketplace**
   - Public widget registry
   - Community-contributed widgets
   - Paid widgets

---

## References

- [Widget Development Guide](./Widget-Development-Guide.md)
- [External API Integration](./External-API-Integration.md)
- [Dashboard Customization](./Dashboard-Customization.md)
- [Frontend Architecture](./Frontend-Architecture.md)
- [Frontend Implementation Plan](./Frontend-Implementation-Plan.md)

---

**End of CCM Architecture Documentation**
