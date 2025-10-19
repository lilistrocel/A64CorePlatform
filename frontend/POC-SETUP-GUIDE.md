# CCM POC Setup Guide

## What's Been Created

✅ **Monorepo Structure** - Root package.json with workspaces
✅ **Shared Library** - Package configuration and build setup
✅ **Theme System** - Complete design system (colors, typography, spacing)
✅ **Basic Components** - Button, Card, Spinner with styled-components

## Next Steps to Complete POC

### Step 1: Install Dependencies (5 minutes)

```bash
cd c:/Code/A64CorePlatform/frontend
npm install
```

This will install all dependencies for shared library and set up workspaces.

### Step 2: Complete Shared Library (Manual)

You need to create these remaining files in `frontend/shared/src/`:

#### A. TypeScript Types (`types/widget.types.ts`)
```typescript
export interface CCMWidget {
  id: string;
  title: string;
  description?: string;
  dataSource: WidgetDataSource;
  type: 'stat' | 'chart';
  size: 'small' | 'medium' | 'large';
}

export type WidgetDataSource =
  | { type: 'module'; moduleName: string; endpoint: string }
  | { type: 'system'; metric: string }
  | { type: 'external_api'; apiName: string; endpoint: string };

export interface WidgetProps {
  widget: CCMWidget;
  data: any;
  loading: boolean;
  error: Error | null;
}
```

#### B. Stat Widget (`components/widgets/StatWidget.tsx`)
```typescript
import styled from 'styled-components';
import { WidgetProps } from '../../types/widget.types';
import { Card } from '../common/Card';
import { Spinner } from '../common/Spinner';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function StatWidget({ widget, data, loading, error }: WidgetProps) {
  if (loading) return <Card title={widget.title}><Spinner /></Card>;
  if (error) return <Card title={widget.title}><ErrorText>Failed to load</ErrorText></Card>;

  return (
    <Card title={widget.title} subtitle={widget.description}>
      <StatContainer>
        <StatValue>{data?.value || '0'}</StatValue>
        <StatLabel>{data?.label || 'Total'}</StatLabel>
        {data?.trend && (
          <TrendIndicator positive={data.trend > 0}>
            {data.trend > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            <span>{Math.abs(data.trend)}%</span>
          </TrendIndicator>
        )}
      </StatContainer>
    </Card>
  );
}

const StatContainer = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg} 0;
`;

const StatValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.primary[500]};
`;

const StatLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const TrendIndicator = styled.div<{ positive: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-top: ${({ theme }) => theme.spacing.md};
  color: ${({ theme, positive }) => (positive ? theme.colors.success : theme.colors.error)};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
`;
```

#### C. Main Index (`index.ts`)
```typescript
// Theme
export { theme, GlobalStyles } from './theme';
export type { Theme } from './theme';

// Components
export { Button, Card, Spinner } from './components/common';
export { StatWidget } from './components/widgets/StatWidget';

// Types
export type { CCMWidget, WidgetDataSource, WidgetProps } from './types/widget.types';
```

### Step 3: Create User Portal

```bash
cd c:/Code/A64CorePlatform/frontend
npm create vite@latest user-portal -- --template react-ts
```

Then update `user-portal/package.json` to add:
```json
{
  "dependencies": {
    "@a64core/shared": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-grid-layout": "^1.4.4",
    "styled-components": "^6.1.8"
  }
}
```

### Step 4: Create CCM Dashboard

In `user-portal/src/App.tsx`:
```typescript
import { ThemeProvider } from 'styled-components';
import { theme, GlobalStyles, StatWidget } from '@a64core/shared';
import type { CCMWidget } from '@a64core/shared';
import { useState } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

const mockWidgets: CCMWidget[] = [
  {
    id: 'sales-summary',
    title: 'Sales Today',
    description: 'Total sales for today',
    dataSource: { type: 'module', moduleName: 'sales', endpoint: '/api/metrics/summary' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'system-health',
    title: 'System Health',
    description: 'Overall system status',
    dataSource: { type: 'system', metric: 'health_score' },
    type: 'stat',
    size: 'small',
  },
];

const mockData = {
  'sales-summary': { value: '$15,234', label: 'Total Sales', trend: 12.5 },
  'system-health': { value: '98%', label: 'Health Score', trend: 2.1 },
};

function App() {
  const layout = mockWidgets.map((w, i) => ({
    i: w.id,
    x: i * 2,
    y: 0,
    w: 2,
    h: 1,
  }));

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <div style={{ padding: '20px' }}>
        <h1>CCM Dashboard - Proof of Concept</h1>
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={200}
          width={1200}
          isDraggable
          isResizable
        >
          {mockWidgets.map((widget) => (
            <div key={widget.id}>
              <StatWidget
                widget={widget}
                data={mockData[widget.id]}
                loading={false}
                error={null}
              />
            </div>
          ))}
        </GridLayout>
      </div>
    </ThemeProvider>
  );
}

export default App;
```

### Step 5: Run the POC

```bash
# In frontend directory
npm install

# Build shared library
npm run build:shared

# Run user portal
npm run dev:user
```

Then open http://localhost:5173

## Expected Result

You should see:
- ✅ Two widget cards (Sales Today, System Health)
- ✅ Drag-and-drop functionality
- ✅ Styled with theme system
- ✅ Mock data displaying correctly

## POC Demonstrates

1. **Monorepo Setup** - Workspaces with shared library
2. **Theme System** - Centralized design tokens
3. **Component Library** - Reusable UI components
4. **Widget System** - Stat widget with Card wrapper
5. **Grid Layout** - Drag-and-drop dashboard
6. **TypeScript** - Full type safety

## What's Not Included (Future Work)

- Real API integration (mock data only)
- WebSocket real-time updates
- Widget marketplace UI
- External API integration
- Chart widgets
- Docker configuration

## Next Steps After POC

1. Review POC with stakeholders
2. Get feedback on UX and architecture
3. Decide: proceed with Phase 1 or iterate on POC
4. If approved, follow the 18-week implementation plan

## Troubleshooting

**Error: Module not found '@a64core/shared'**
- Run `npm run build:shared` first
- Then restart dev server

**Grid layout not showing**
- Check `react-grid-layout` CSS is imported
- Verify layout array has correct structure

**Styling not applied**
- Ensure ThemeProvider wraps entire app
- Check GlobalStyles is rendered

## Files Created So Far

```
frontend/
├── package.json              ✅
├── tsconfig.json             ✅
├── .gitignore                ✅
├── README.md                 ✅
├── POC-SETUP-GUIDE.md        ✅ (this file)
│
└── shared/
    ├── package.json          ✅
    ├── tsconfig.json         ✅
    ├── vite.config.ts        ✅
    └── src/
        ├── theme/
        │   ├── theme.ts      ✅
        │   ├── GlobalStyles.tsx ✅
        │   └── index.ts      ✅
        └── components/
            └── common/
                ├── Button.tsx    ✅
                ├── Card.tsx      ✅
                ├── Spinner.tsx   ✅
                └── index.ts      ✅
```

## Time Estimate to Complete

- Creating remaining shared library files: 30 minutes
- Setting up user portal: 15 minutes
- Creating CCM Dashboard: 30 minutes
- Testing and debugging: 30 minutes

**Total: ~2 hours**

## Questions?

Refer to the comprehensive documentation:
- [Frontend Implementation Plan](../Docs/1-Main-Documentation/Frontend-Implementation-Plan.md)
- [Frontend Architecture](../Docs/1-Main-Documentation/Frontend-Architecture.md)
- [Widget Development Guide](../Docs/1-Main-Documentation/Widget-Development-Guide.md)
