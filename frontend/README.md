# A64 Core Platform - Frontend

Monorepo for the A64 Core Platform frontend applications.

## Structure

```
frontend/
├── shared/         # Shared component library
├── user-portal/    # User-facing application (CCM Dashboard)
└── admin-portal/   # Admin application (coming soon)
```

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Install all dependencies
npm install

# Or install for specific workspace
npm install --workspace=shared
npm install --workspace=user-portal
```

### Development

```bash
# Run all apps in development mode
npm run dev:all

# Or run specific app
npm run dev:shared    # Shared library
npm run dev:user      # User portal
```

### Build

```bash
# Build all apps
npm run build:all

# Or build specific app
npm run build:shared
npm run build:user
```

### Testing

```bash
# Run all tests
npm test

# Run tests for specific workspace
npm test --workspace=shared
```

## Workspaces

### Shared Library (`@a64core/shared`)
Common components, theme, services, and utilities used by both portals.

### User Portal
Business-facing application with CCM dashboard and module access.

### Admin Portal (Coming Soon)
System administration interface for managing users, modules, and configuration.

## Documentation

See [Docs/1-Main-Documentation/](../Docs/1-Main-Documentation/) for complete documentation:
- [Frontend Implementation Plan](../Docs/1-Main-Documentation/Frontend-Implementation-Plan.md)
- [Frontend Architecture](../Docs/1-Main-Documentation/Frontend-Architecture.md)
- [UI Standards](../Docs/1-Main-Documentation/UI-Standards.md)
- [CCM Architecture](../Docs/1-Main-Documentation/CCM-Architecture.md)
- [Widget Development Guide](../Docs/1-Main-Documentation/Widget-Development-Guide.md)

## Technology Stack

- **React 18** - UI framework
- **TypeScript 5** - Type safety
- **Vite 5** - Build tool
- **styled-components** - CSS-in-JS
- **Zustand** - State management
- **React Query** - Server state
- **React Router** - Routing
- **Axios** - HTTP client

## License

Proprietary - A64 Core Platform
