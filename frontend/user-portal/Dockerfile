# ================================
# Multi-stage Dockerfile for User Portal
# Supports both development and production builds
# ================================

# ================================
# Stage 1: Base - Dependencies
# ================================
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies for both shared and user-portal
COPY frontend/package*.json ./
COPY frontend/tsconfig.json ./
COPY frontend/shared/package*.json ./shared/
COPY frontend/user-portal/package*.json ./user-portal/

# Install all dependencies
RUN npm install

# ================================
# Stage 2: Development
# ================================
FROM base AS development

# Copy source code
COPY frontend/shared ./shared
COPY frontend/user-portal ./user-portal

# Expose Vite dev server port
EXPOSE 5173

# Set working directory to user-portal
WORKDIR /app/user-portal

# Start Vite dev server with hot-reload
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ================================
# Stage 3: Build - Production Build
# ================================
FROM base AS build

# Copy source code
COPY frontend/shared ./shared
COPY frontend/user-portal ./user-portal

# Build shared library first
WORKDIR /app/shared
RUN npm run build

# Build user-portal
WORKDIR /app/user-portal
RUN npm run build

# ================================
# Stage 4: Production - Nginx Serve
# ================================
FROM nginx:1.25-alpine AS production

# Copy custom nginx config
COPY frontend/user-portal/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from build stage
COPY --from=build /app/user-portal/dist /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
