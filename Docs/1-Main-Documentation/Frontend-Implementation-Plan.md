# Frontend Implementation Plan
## CCM (Centralized Controls Monitoring) + Modular ERP Platform

**Version:** 1.0.0
**Status:** Planning
**Created:** 2025-10-19
**Platform:** A64 Core Platform

---

## 🎯 Vision

### CCM (Centralized Controls Monitoring)
A **universal monitoring dashboard** that aggregates data from:
- Installed ERP modules (CRM, Inventory, Accounting, HR, Sales)
- External APIs (payment gateways, shipping APIs, analytics, IoT sensors, etc.)
- System metrics (server health, database stats, module performance)

**Key Features:**
- Real-time monitoring with widgets, charts, and alerts
- Customizable layouts - users can arrange their dashboard
- Role-based views - different dashboards for different roles
- Cross-module insights - correlate data across modules

### Modular ERP
- Install/uninstall functional modules (CRM, Inventory, Accounting, etc.)
- Modules contribute data to CCM dashboard
- Cross-module workflows and queries
- Multi-tenant architecture

---

## 🏗️ Architecture Overview

### Two Frontends Architecture

**1. Admin Portal** (Technical/Internal)
- **URL:** `/admin` or `admin.a64core.com`
- **Port:** 3001
- **Users:** Super Admin, Admin roles only
- **Purpose:** Platform administration and system management

**Features:**
- User & role management
- Module installation/uninstallation
- System configuration (database, email, integrations)
- Server health monitoring
- License key management
- Audit logs & security
- Performance metrics
- Backup & restore

**2. User Portal** (Business/End-User)
- **URL:** `/` (root) or `app.a64core.com`
- **Port:** 3000
- **Users:** All authenticated users (user, moderator roles)
- **Purpose:** Business operations and customer-facing functionality

**Features:**
- Login/Register/Profile
- **CCM Dashboard** (universal monitoring)
- Module marketplace (install user-level modules)
- Module applications (CRM, Inventory, Accounting, etc.)
- Cross-module workflows
- Reports & analytics
- Notifications
- Settings & preferences

---

## 💻 Technology Stack

### Core Technologies
- **Framework:** React 18 + TypeScript 5
- **Build Tool:** Vite 5 (fast HMR, optimized builds)
- **Styling:** styled-components + Centralized Theme
- **State Management:** Zustand (lightweight)
- **Routing:** React Router v6
- **API Client:** Axios + React Query
- **Forms:** React Hook Form + Zod validation
- **UI Components:** Custom + shadcn/ui (optional)
- **Icons:** Lucide React
- **Module Loading:** Webpack Module Federation
- **Mobile:** PWA + Responsive Design
- **Testing:** Vitest + React Testing Library + Playwright

### Monorepo Structure
- **Workspaces:** npm/yarn workspaces
- **Shared Library:** `@a64core/shared` package
- **Packages:**
  - `frontend/shared` - Shared components, theme, services
  - `frontend/admin-portal` - Admin frontend
  - `frontend/user-portal` - User frontend

---

## 📁 Project Structure

```
c:/Code/A64CorePlatform/
├── frontend/
│   ├── shared/                          # Shared component library
│   │   ├── src/
│   │   │   ├── components/             # Reusable UI components
│   │   │   │   ├── common/             # Button, Input, Card, Modal, etc.
│   │   │   │   └── widgets/            # CCM Widget components
│   │   │   ├── theme/                  # Centralized design system
│   │   │   ├── services/               # API client services
│   │   │   ├── hooks/                  # Shared React hooks
│   │   │   ├── types/                  # TypeScript types
│   │   │   └── utils/                  # Utility functions
│   │   └── package.json
│   │
│   ├── admin-portal/                    # Admin frontend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── users/              # User management
│   │   │   │   ├── modules/            # Module installation
│   │   │   │   ├── system/             # System configuration
│   │   │   │   └── monitoring/         # Logs & analytics
│   │   │   └── components/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── user-portal/                     # User frontend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── auth/               # Authentication
│       │   │   ├── dashboard/          # CCM Dashboard
│       │   │   ├── profile/            # User profile
│       │   │   ├── modules/            # Module marketplace & apps
│       │   │   └── integrations/       # External API management
│       │   └── components/
│       ├── Dockerfile
│       └── package.json
│
├── modules/
│   ├── core-modules/                    # Built-in ERP modules
│   │   ├── crm/                        # CRM module
│   │   │   ├── frontend/
│   │   │   │   └── src/
│   │   │   │       ├── widgets/        # CCM widgets
│   │   │   │       └── module.config.ts
│   │   │   └── backend/
│   │   ├── sales/                      # Sales module
│   │   ├── inventory/                  # Inventory module
│   │   ├── accounting/                 # Accounting module
│   │   └── hr/                         # HR module
│   │
│   └── external-api-connectors/        # Pre-built API connectors
│       ├── stripe/
│       ├── sendgrid/
│       └── google-analytics/
│
├── src/                                # Backend API (FastAPI)
│   ├── api/v1/
│   │   ├── external_api.py            # External API proxy
│   │   └── widgets.py                 # Widget management
│   └── services/
│       ├── external_api_service.py
│       └── widget_service.py
│
└── Docs/1-Main-Documentation/
    ├── Frontend-Implementation-Plan.md  # THIS FILE
    ├── CCM-Architecture.md
    ├── Widget-Development-Guide.md
    ├── External-API-Integration.md
    ├── Dashboard-Customization.md
    ├── UI-Standards.md
    └── Frontend-Architecture.md
```

---

## 🎨 CCM Dashboard Architecture

### Widget System

**Widget Types:**

1. **Module Widgets** - Data from installed ERP modules
2. **External API Widgets** - Data from external services
3. **System Widgets** - Platform health monitoring

**Widget Configuration Schema:**

```typescript
interface CCMWidget {
  id: string;
  title: string;
  description?: string;

  // Data source
  dataSource:
    | { type: 'module'; moduleName: string; endpoint: string }
    | { type: 'external_api'; apiName: string; endpoint: string }
    | { type: 'system'; metric: string };

  refreshInterval?: number; // seconds

  // Display
  type: 'chart' | 'stat' | 'table' | 'gauge' | 'map' | 'list';
  size: 'small' | 'medium' | 'large' | 'full-width';

  // Configuration
  chartConfig?: ChartConfig;
  statConfig?: StatConfig;

  // Permissions
  permissions: string[];
  roles: string[];
}
```

**Key Features:**
- Drag-and-drop grid layout
- Real-time data updates (WebSocket)
- Widget marketplace
- User-customizable dashboards
- Role-based views
- Alert system
- Cross-module correlation

---

## 🚀 Implementation Roadmap (18 Weeks)

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Infrastructure and shared library

**Tasks:**
- Initialize monorepo structure
- Create `frontend/shared` package
- Implement theme system
- Build core components
- Build widget base components
- Write documentation

**Deliverables:**
- [ ] Monorepo configured
- [ ] Shared library functional
- [ ] Theme system implemented
- [ ] Documentation complete

---

### Phase 2: Admin Portal (Weeks 3-4)
**Goal:** Complete admin interface

**Tasks:**
- Initialize admin portal project
- Implement authentication
- Build admin layout
- User management features
- Module installation interface
- System configuration
- Monitoring dashboard
- Docker containerization

**Deliverables:**
- [ ] Admin portal functional
- [ ] All features migrated from vanilla JS
- [ ] Docker image ready
- [ ] Admin documentation complete

---

### Phase 3: User Portal + CCM Dashboard (Weeks 5-7)
**Goal:** User-facing application with CCM

**Tasks:**
- Initialize user portal project
- Implement authentication flow
- Build user layout
- **Implement CCM Dashboard**
- **Grid layout system (drag-drop)**
- **Widget renderer**
- Widget marketplace UI
- Dashboard customization
- PWA configuration
- Docker containerization

**Deliverables:**
- [ ] User portal functional
- [ ] CCM Dashboard working
- [ ] Widget system operational
- [ ] PWA configured
- [ ] Docker image ready
- [ ] User documentation complete

---

### Phase 4: External API Integration (Week 8)
**Goal:** Connect external services to CCM

**Tasks:**
- External API proxy service (backend)
- External API configuration UI
- Pre-built connectors (Stripe, SendGrid, Google Analytics)
- API credential management
- Testing external API widgets

**Deliverables:**
- [ ] External API proxy functional
- [ ] 3+ pre-built connectors
- [ ] Credential management secure
- [ ] External API documentation complete

---

### Phase 5: Module System + Widgets (Weeks 9-11)
**Goal:** Dynamic module loading and widgets

**Tasks:**
- Module loader service
- Cross-module communication API
- Module widget system
- Example module widgets
- Module-to-module queries
- Dashboard widget system

**Deliverables:**
- [ ] Dynamic module loading works
- [ ] Modules can query each other
- [ ] Dashboard widgets from modules
- [ ] Example modules with widgets
- [ ] Module developer docs complete

---

### Phase 6: ERP Core Modules (Weeks 12-16)
**Goal:** Build foundational ERP modules

**Tasks:**
- **Week 12:** CRM module + widgets
- **Week 13:** Sales module + widgets
- **Week 14:** Inventory module + widgets
- **Week 15:** Accounting module + widgets
- **Week 16:** HR module + widgets
- Cross-module correlation widgets

**Deliverables:**
- [ ] 5 core ERP modules functional
- [ ] Each module provides CCM widgets
- [ ] Cross-module integration tested
- [ ] ERP module standards documented

---

### Phase 7: Real-Time & Alerts (Week 17)
**Goal:** Real-time updates and alerting

**Tasks:**
- WebSocket infrastructure
- Real-time widget updates
- Alert system
- Notification center
- Email/SMS notifications

**Deliverables:**
- [ ] Real-time updates working
- [ ] Alert system functional
- [ ] Notification center complete

---

### Phase 8: Polish & Production (Week 18)
**Goal:** Optimize and deploy

**Tasks:**
- Performance optimization
- Testing (unit, integration, E2E)
- Accessibility audit (WCAG 2.1 AA)
- Security review
- Production deployment
- User training

**Deliverables:**
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Accessibility compliant
- [ ] Production deployment complete
- [ ] User documentation finalized

---

## 📖 Documentation Deliverables

### 1. CCM-Architecture.md
- CCM system overview
- Widget architecture
- Data source types
- Real-time data flow
- Dashboard customization
- Role-based dashboards

### 2. Widget-Development-Guide.md
- Widget types and components
- Widget configuration schema
- Creating module widgets
- Creating external API widgets
- Testing widgets
- Publishing to marketplace

### 3. External-API-Integration.md
- Supported authentication types
- API proxy architecture
- Credential management
- Pre-built connectors
- Creating custom connectors
- Security considerations

### 4. Dashboard-Customization.md
- Adding widgets to dashboard
- Layout customization
- Saving layouts
- Role-based views
- Sharing dashboards
- Export/import configurations

### 5. UI-Standards.md
- Design principles
- Color palette & usage
- Typography guidelines
- Component guidelines
- Accessibility standards
- Responsive design patterns

### 6. Frontend-Architecture.md
- Technology stack
- Monorepo structure
- Build & deployment
- State management
- API integration
- Performance optimization
- Security

### 7. Module-UI-Development.md
- Module UI requirements
- Module configuration schema
- Using shared components
- Module routing
- State management
- Deployment process

---

## 🎯 Success Criteria

### CCM Dashboard
- [ ] Universal dashboard displays data from modules AND external APIs
- [ ] Drag-and-drop widget layout functional
- [ ] Real-time data updates (WebSocket)
- [ ] Widget marketplace functional
- [ ] Users can add/remove widgets
- [ ] Dashboard layouts saved per user
- [ ] Role-based dashboard views
- [ ] Alert system functional

### External API Integration
- [ ] Proxy system for external APIs
- [ ] Secure credential storage
- [ ] Pre-built connectors (Stripe, SendGrid, Analytics)
- [ ] Custom API connector support
- [ ] Rate limiting and caching

### Module Widgets
- [ ] All ERP modules provide dashboard widgets
- [ ] Cross-module correlation widgets
- [ ] Widget data standardized

### Technical
- [ ] Two frontends (Admin + User) running independently
- [ ] Shared component library reused
- [ ] Dynamic module loading/unloading
- [ ] Cross-module queries functional
- [ ] PWA works on mobile devices
- [ ] Performance: Admin < 2s, User < 3s, Modules < 1s
- [ ] Accessibility: WCAG 2.1 AA compliant
- [ ] Cross-platform tested (Windows, Linux, browsers, mobile)

### Business
- [ ] Admin portal replaces vanilla JS
- [ ] Users can self-register and manage profile
- [ ] Module marketplace for discovering modules
- [ ] 5 core ERP modules functional
- [ ] Cross-module workflows demonstrated
- [ ] Multi-tenant ready architecture

---

## 🐳 Docker Configuration

### Updated docker-compose.yml

```yaml
version: '3.8'

services:
  # Admin Portal Frontend
  admin-portal:
    container_name: a64core-admin-portal-dev
    build:
      context: ./frontend/admin-portal
      dockerfile: Dockerfile
    ports:
      - "3001:80"
    networks:
      - a64core-network
    depends_on:
      - api
    environment:
      - VITE_API_URL=http://localhost/api/v1
      - VITE_APP_MODE=admin

  # User Portal Frontend
  user-portal:
    container_name: a64core-user-portal-dev
    build:
      context: ./frontend/user-portal
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    networks:
      - a64core-network
    depends_on:
      - api
    environment:
      - VITE_API_URL=http://localhost/api/v1
      - VITE_APP_MODE=user

  # ... existing services (api, mongodb, mysql, redis, nginx, etc.)
```

---

## 💰 Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 2 weeks | Foundation, shared library, docs |
| Phase 2 | 2 weeks | Admin portal complete |
| Phase 3 | 3 weeks | User portal + CCM dashboard |
| Phase 4 | 1 week | External API integration |
| Phase 5 | 3 weeks | Module system + widgets |
| Phase 6 | 5 weeks | 5 core ERP modules |
| Phase 7 | 1 week | Real-time & alerts |
| Phase 8 | 1 week | Testing & production |
| **Total** | **18 weeks** | **Production CCM/ERP platform** |

---

## 🔐 Security Considerations

### Frontend Security
- JWT token storage (httpOnly cookies recommended)
- CSRF protection
- XSS prevention
- Content Security Policy (CSP)
- Input validation
- Secure API communication (HTTPS)

### External API Security
- Encrypted credential storage
- API key rotation
- Rate limiting
- Request validation
- Audit logging

### Widget Security
- Sandbox widget execution
- Permission-based data access
- Validate all widget configurations
- Prevent XSS in custom widgets

---

## 📊 Performance Targets

### Load Times
- Admin Portal: < 2 seconds
- User Portal: < 3 seconds
- Module Loading: < 1 second
- Widget Rendering: < 500ms

### Bundle Sizes
- Shared Library: < 200KB gzipped
- Admin Portal: < 500KB gzipped
- User Portal: < 800KB gzipped
- Individual Modules: < 300KB gzipped

### Runtime Performance
- 60 FPS animations
- Real-time updates: < 100ms latency
- Widget refresh: configurable (default 60s)

---

## 🧪 Testing Strategy

### Unit Tests
- Component testing (React Testing Library)
- Hook testing
- Utility function testing
- Service layer testing
- Target: 80%+ code coverage

### Integration Tests
- API integration testing
- Module loading testing
- Cross-module communication
- Widget data fetching

### E2E Tests
- User flows (Playwright)
- Authentication flow
- Dashboard customization
- Module installation
- Widget management

### Performance Tests
- Lighthouse CI
- Bundle size monitoring
- Load testing
- Real-time update stress testing

---

## 📝 Next Steps

### Immediate Actions
1. ✅ Save this implementation plan
2. 🔄 Write all CCM documentation (Option A)
3. Review and approve documentation
4. Build CCM proof-of-concept (Week 3)
5. Begin Phase 1 implementation (Week 1-2)

### Decision Points
- Finalize technology choices
- Approve architecture design
- Assign development resources
- Set milestones and deadlines
- Establish code review process

---

## 📚 References

- [System Architecture](./System-Architecture.md)
- [API Structure](./API-Structure.md)
- [User Structure](./User-Structure.md)
- [Module Management System](./Module-Management-System.md)
- [Port Management System](./Port-Management-System.md)
- [Versioning](./Versioning.md)
- [CLAUDE.md Development Guidelines](../../CLAUDE.md)

---

**End of Implementation Plan**
