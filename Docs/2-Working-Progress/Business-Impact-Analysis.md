# Business Impact Analysis (BIA)

**Document Status:** TEMPLATE - Requires organizational review and approval
**Last Updated:** 2026-02-04
**Owner:** [Assign responsible person]
**Review Cycle:** Annually or after significant platform changes

---

## 1. Purpose

This document identifies critical business processes supported by the A64 Core Platform, assesses the impact of their disruption, and establishes recovery priorities to guide disaster recovery planning.

---

## 2. Critical Business Processes

### 2.1 Process-to-Component Mapping

| # | Business Process | Platform Component(s) | Priority | Max Tolerable Downtime |
|---|------------------|-----------------------|----------|------------------------|
| 1 | User Authentication & Access | API (auth service), MongoDB, Redis, Nginx | **CRITICAL** | 1 hour |
| 2 | Farm Operations Management | API (farm module), MongoDB | **CRITICAL** | 2 hours |
| 3 | Block Monitoring & Alerts | API (alerts), MongoDB, Cron service | **HIGH** | 4 hours |
| 4 | Harvest Data Recording | API (harvests), MongoDB | **HIGH** | 4 hours |
| 5 | Sales & Order Management | API (sales module), MongoDB | **HIGH** | 4 hours |
| 6 | Inventory Tracking | API (inventory module), MongoDB | **MEDIUM** | 8 hours |
| 7 | HR & Employee Management | API (HR module), MongoDB | **MEDIUM** | 8 hours |
| 8 | Logistics & Shipments | API (logistics module), MongoDB | **MEDIUM** | 12 hours |
| 9 | Weather Data Integration | API (weather service), WeatherBit API | **LOW** | 24 hours |
| 10 | User Portal (Frontend) | Nginx, User Portal container | **HIGH** | 2 hours |
| 11 | Administrative Dashboard | API (dashboard), Frontend | **MEDIUM** | 8 hours |
| 12 | Module Management | API (modules), Docker Registry | **LOW** | 24 hours |

### 2.2 Priority Definitions

| Priority | Definition | Recovery Target |
|----------|-----------|-----------------|
| **CRITICAL** | Core platform functionality; business cannot operate without it | RTO: 1 hour, RPO: 15 minutes |
| **HIGH** | Important daily operations; significant impact if unavailable | RTO: 4 hours, RPO: 1 hour |
| **MEDIUM** | Regular business functions; workarounds may exist | RTO: 8 hours, RPO: 4 hours |
| **LOW** | Non-essential; can tolerate extended outage | RTO: 24 hours, RPO: 24 hours |

---

## 3. Impact Assessment

### 3.1 Financial Impact

| Downtime Duration | Estimated Impact | Affected Areas |
|-------------------|-----------------|----------------|
| 0-1 hours | Low | Minor delays in data entry |
| 1-4 hours | Moderate | [Quantify: missed orders, delayed harvests] |
| 4-8 hours | Significant | [Quantify: lost sales, operational delays] |
| 8-24 hours | Severe | [Quantify: full day of lost productivity] |
| >24 hours | Critical | [Quantify: contract penalties, spoilage] |

> **ACTION REQUIRED:** Fill in financial estimates based on actual business data.

### 3.2 Operational Impact

- **Farm Operations:** Inability to record harvests, monitor blocks, or respond to alerts
- **Sales:** Cannot process orders or track returns
- **Compliance:** Loss of traceability data may affect regulatory requirements
- **Customer Relations:** Service degradation visible to end users

### 3.3 Reputational Impact

| Scenario | Risk Level | Mitigation |
|----------|-----------|------------|
| Brief outage (<1 hour) | Low | Status page notification |
| Extended outage (1-8 hours) | Medium | Customer communication, post-incident report |
| Data loss event | High | Immediate disclosure, recovery plan execution |
| Security breach | Critical | Incident response plan, regulatory notification |

---

## 4. Infrastructure Dependencies

### 4.1 Internal Dependencies

```
User Portal (Frontend)
  └── Nginx (Reverse Proxy)
       └── API (FastAPI Backend)
            ├── MongoDB (Primary Database)
            ├── Redis (Cache & Rate Limiting)
            └── Docker Engine (Module Management)
                 └── Local Registry (Module Images)

Cron Service
  └── API (Health checks, automated tasks)
       └── MongoDB

Backup Service
  └── MongoDB
```

### 4.2 External Dependencies

| Service | Purpose | Impact if Unavailable | SLA |
|---------|---------|----------------------|-----|
| WeatherBit API | Agricultural weather data | Degraded (cached data used) | [Check vendor SLA] |
| Let's Encrypt | SSL certificate renewal | None (90-day validity) | N/A |
| Docker Hub | Base image pulls | None (images cached locally) | 99.9% |
| GitHub | Source code, CI/CD | Cannot deploy updates | 99.9% |
| Cloud Provider (Azure/AWS) | VM hosting | Full platform outage | [Check hosting SLA] |

### 4.3 Single Points of Failure

| Component | Risk | Mitigation Status |
|-----------|------|-------------------|
| MongoDB (single instance) | Database failure = full outage | **TODO:** Implement replica set |
| Single VM deployment | Server failure = full outage | **TODO:** Multi-AZ deployment |
| Nginx (single instance) | Proxy failure = frontend outage | Docker auto-restart configured |
| SSL certificates | Expiry = HTTPS failure | Auto-renewal via certbot |

---

## 5. Recovery Priority Order

When recovering from a full platform outage, restore in this order:

1. **MongoDB** - All services depend on it
2. **Redis** - Required for auth and rate limiting
3. **API** - Core backend services
4. **Nginx** - Reverse proxy and SSL termination
5. **User Portal** - Frontend access
6. **Cron Service** - Automated tasks
7. **Backup Service** - Backup schedule
8. **IoT Simulator** - Testing only (skip in emergency recovery)

---

## 6. Action Items

- [ ] Complete financial impact estimates with actual business data
- [ ] Validate MTD (Max Tolerable Downtime) values with stakeholders
- [ ] Implement MongoDB replica set for high availability
- [ ] Evaluate multi-region deployment options
- [ ] Set up external monitoring (uptime checks)
- [ ] Schedule quarterly BIA review meetings
- [ ] Create status page for incident communication

---

## 7. Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Platform Owner | | | |
| Operations Lead | | | |
| IT Security | | | |
