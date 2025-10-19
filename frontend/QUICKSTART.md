# CCM POC - Quick Start Guide

## 🎉 POC is Ready!

The Proof-of-Concept for the CCM (Centralized Controls Monitoring) dashboard is complete and ready to run!

## What's Included

### ✅ Shared Component Library
- **Theme System**: Complete design tokens (colors, typography, spacing)
- **UI Components**: Button, Card, Spinner
- **Widget Components**: StatWidget with trends and secondary metrics
- **TypeScript Types**: Full type safety

### ✅ User Portal (CCM Dashboard)
- **3 Demo Widgets**:
  - Sales Summary (with secondary metrics)
  - System Health (with trend indicator)
  - Inventory Alerts (negative trend example)
- **Drag-and-Drop Grid**: Powered by react-grid-layout
- **Responsive Design**: Mobile-friendly
- **Mock Data**: Realistic sample data

## 📦 Installation & Setup

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Step 1: Install Dependencies

```bash
cd c:/Code/A64CorePlatform/frontend
npm install
```

This will install all dependencies for:
- Root workspace
- Shared library
- User portal

**Expected time:** 2-3 minutes

### Step 2: Build Shared Library

```bash
npm run build:shared
```

This compiles the shared component library that the user-portal depends on.

**Expected time:** 10-20 seconds

### Step 3: Run User Portal

```bash
npm run dev:user
```

This starts the development server for the user portal.

**Expected time:** 5-10 seconds

### Step 4: Open Browser

Navigate to: **http://localhost:5173**

You should see the CCM Dashboard with 3 widgets!

## 🎨 What You'll See

### CCM Dashboard
- **Header**: "CCM Dashboard - Proof of Concept"
- **3 Interactive Widgets**:

  **1. Sales Today**
  - Value: $15,234
  - Trend: ↑ 12.5% vs yesterday
  - Secondary metrics: 47 Orders, $324 Avg Order

  **2. System Health**
  - Value: 98%
  - Trend: ↑ 2.1% vs last hour

  **3. Inventory Alerts**
  - Value: 12 Low Stock Items
  - Trend: ↓ 8.3% vs last week

### Interactive Features
- **Drag widgets** to rearrange them
- **Resize widgets** using the handle in bottom-right corner
- **Responsive** - try resizing your browser window

## 🧪 Testing the POC

### Test Drag-and-Drop
1. Click and hold a widget header
2. Drag to a new position
3. Release to drop
4. Layout automatically adjusts

### Test Resize
1. Hover over bottom-right corner of a widget
2. Drag the resize handle
3. Widget resizes smoothly

### Test Responsiveness
1. Open browser DevTools (F12)
2. Toggle device toolbar
3. Try different screen sizes
4. Layout adapts automatically

## 📂 Project Structure

```
frontend/
├── shared/                    # Shared Component Library
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/       # Button, Card, Spinner
│   │   │   └── widgets/      # StatWidget
│   │   ├── theme/            # Design system
│   │   ├── types/            # TypeScript types
│   │   └── index.ts          # Barrel exports
│   └── package.json
│
├── user-portal/               # User-Facing App
│   ├── src/
│   │   ├── App.tsx           # Main dashboard component
│   │   ├── App.css           # Dashboard styles
│   │   └── main.tsx          # Entry point
│   └── package.json
│
├── package.json               # Root workspace config
└── QUICKSTART.md              # This file
```

## 🔧 Development Scripts

### Run All Apps
```bash
npm run dev:all
```
Runs both shared library watch mode and user portal.

### Build All
```bash
npm run build:all
```
Builds shared library and user portal for production.

### Type Check
```bash
npm run type-check
```
Runs TypeScript type checking across all workspaces.

## 🎯 POC Demonstrates

### ✅ Architecture
- Monorepo with npm workspaces
- Shared component library pattern
- Type-safe development with TypeScript

### ✅ Design System
- Centralized theme (colors, typography, spacing)
- Consistent styling across components
- styled-components for scoped CSS

### ✅ Widget System
- Reusable widget components
- Standard widget interface (CCMWidget type)
- Loading and error states
- Trend indicators
- Secondary metrics

### ✅ Dashboard
- Grid-based layout
- Drag-and-drop positioning
- Resize widgets
- Responsive design

### ✅ Developer Experience
- Hot Module Replacement (HMR)
- Fast build times with Vite
- Full TypeScript support
- Clear component structure

## 🐛 Troubleshooting

### Error: Module '@a64core/shared' not found

**Solution:**
```bash
npm run build:shared
```
The shared library must be built before the user-portal can use it.

### Error: Port 5173 already in use

**Solution:**
```bash
# Kill the existing process or use a different port
npm run dev:user -- --port 5174
```

### TypeScript errors in VS Code

**Solution:**
1. Restart VS Code TypeScript server: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"
2. Ensure shared library is built: `npm run build:shared`

### Grid layout not showing

**Solution:**
Check that `react-grid-layout/css/styles.css` is imported in App.tsx.

## 📊 Mock Data

The POC uses hardcoded mock data in `App.tsx`. In production, this will come from:
- **Module APIs**: `/api/v1/modules/{moduleName}/widget-data`
- **System Metrics**: `/api/v1/system/metrics`
- **External APIs**: `/api/v1/external-api/proxy`

## 🚀 Next Steps

### Phase 1: Real Data Integration
- Connect to actual backend APIs
- Implement data fetching with React Query
- Add loading states
- Error handling

### Phase 2: More Widget Types
- Chart widgets (line, bar, pie)
- Table widgets
- Gauge widgets
- Custom widgets

### Phase 3: Real-Time Updates
- WebSocket integration
- Live data streaming
- Auto-refresh intervals

### Phase 4: Widget Marketplace
- Browse available widgets
- Add/remove widgets dynamically
- Save dashboard layouts
- User preferences

## 📖 Documentation

See the comprehensive documentation in `Docs/1-Main-Documentation/`:

- **[Frontend Implementation Plan](../Docs/1-Main-Documentation/Frontend-Implementation-Plan.md)** - 18-week roadmap
- **[CCM Architecture](../Docs/1-Main-Documentation/CCM-Architecture.md)** - System architecture
- **[Widget Development Guide](../Docs/1-Main-Documentation/Widget-Development-Guide.md)** - Create widgets
- **[UI Standards](../Docs/1-Main-Documentation/UI-Standards.md)** - Design guidelines
- **[Frontend Architecture](../Docs/1-Main-Documentation/Frontend-Architecture.md)** - Technical docs

## 🎓 Learning Resources

### React Grid Layout
- [Documentation](https://github.com/react-grid-layout/react-grid-layout)
- [Examples](https://react-grid-layout.github.io/react-grid-layout/examples/0-showcase.html)

### Styled Components
- [Documentation](https://styled-components.com/docs)
- [Best Practices](https://styled-components.com/docs/basics#best-practices)

### TypeScript
- [Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)

## 💬 Questions?

Refer to:
1. **POC-SETUP-GUIDE.md** - Detailed setup instructions
2. **Frontend documentation** - Complete technical reference
3. **Code comments** - Inline documentation in source files

## 🎉 Success!

If you can see the dashboard with 3 draggable widgets, the POC is working perfectly!

**Time to demo:** Show stakeholders the CCM concept
**Time to iterate:** Get feedback and refine
**Time to build:** Proceed with Phase 1 implementation

Congratulations! 🚀
