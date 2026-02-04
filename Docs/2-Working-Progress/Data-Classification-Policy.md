# Data Classification Policy

**Document Status:** TEMPLATE - Requires organizational review and approval
**Last Updated:** 2026-02-04
**Owner:** [Assign responsible person]
**Review Cycle:** Annually or after significant data model changes

---

## 1. Purpose

This document defines data classification tiers for all information processed by the A64 Core Platform. It establishes handling requirements for each classification level to ensure appropriate protection of sensitive data, compliance with UAE data protection regulations, and alignment with organizational security policies.

---

## 2. Classification Tiers

| Tier | Label | Description | Examples |
|------|-------|-------------|----------|
| **T1** | **RESTRICTED** | Highly sensitive data; unauthorized disclosure causes severe harm. Regulatory or legal obligations apply. | Passwords, JWT tokens, encryption keys, Emirates ID, salary data |
| **T2** | **CONFIDENTIAL** | Sensitive business or personal data; disclosure causes significant harm. | PII (names, emails, phones), financial transactions, HR records, GPS coordinates |
| **T3** | **INTERNAL** | Internal operational data; not intended for public access but low impact if disclosed. | Farm metrics, harvest quantities, inventory counts, system configurations |
| **T4** | **PUBLIC** | Non-sensitive data safe for public access. | Plant reference data, API documentation, public status pages |

### 2.1 Handling Requirements

| Requirement | T1 - RESTRICTED | T2 - CONFIDENTIAL | T3 - INTERNAL | T4 - PUBLIC |
|-------------|-----------------|-------------------|----------------|-------------|
| **Encryption at rest** | MANDATORY (AES-256 or Fernet) | MANDATORY (database-level) | Recommended | Not required |
| **Encryption in transit** | MANDATORY (TLS 1.2+) | MANDATORY (TLS 1.2+) | MANDATORY (TLS 1.2+) | Recommended |
| **Access control** | Role-based, need-to-know, MFA | Role-based, need-to-know | Role-based | Open |
| **Audit logging** | Full audit trail, immutable | Access logging | Standard logging | Not required |
| **Data masking in logs** | MANDATORY | MANDATORY | Recommended | Not required |
| **Retention policy** | Minimum required by law | Business need + legal minimum | Business need | No limit |
| **Backup encryption** | MANDATORY | MANDATORY | Recommended | Not required |
| **Disposal method** | Cryptographic erasure | Secure deletion | Standard deletion | Standard deletion |

---

## 3. PII Inventory

### 3.1 User Authentication & Access (Collection: `users`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `passwordHash` | **T1 - RESTRICTED** | Credential | Bcrypt-hashed password; compromise enables account takeover |
| `email` | **T2 - CONFIDENTIAL** | Direct PII | Personally identifiable; used for authentication |
| `firstName` | **T2 - CONFIDENTIAL** | Direct PII | Personal name |
| `lastName` | **T2 - CONFIDENTIAL** | Direct PII | Personal name |
| `phone` | **T2 - CONFIDENTIAL** | Direct PII | Personal contact number |
| `userId` | **T3 - INTERNAL** | Pseudonymous ID | UUID; not directly identifying without lookup |
| `role`, `isActive`, `isEmailVerified` | **T3 - INTERNAL** | Operational | Account state metadata |
| `lastLoginAt`, `createdAt`, `updatedAt` | **T3 - INTERNAL** | Operational | Timestamps |

### 3.2 Tokens (Collections: `refresh_tokens`, `verification_tokens`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `token` / `refreshToken` | **T1 - RESTRICTED** | Credential | JWT bearer tokens; compromise enables impersonation |
| `accessToken` | **T1 - RESTRICTED** | Credential | Short-lived but grants full session access |
| `email` (in verification_tokens) | **T2 - CONFIDENTIAL** | Direct PII | Links token to person |

### 3.3 HR Module - Employee Data (Collection: `employees`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `emiratesId` | **T1 - RESTRICTED** | Government ID | UAE national identifier; highly sensitive under UAE law |
| `firstName`, `lastName` | **T2 - CONFIDENTIAL** | Direct PII | Personal names |
| `arabicFirstName`, `arabicMiddleName`, `arabicLastName` | **T2 - CONFIDENTIAL** | Direct PII | Personal names in Arabic |
| `email` | **T2 - CONFIDENTIAL** | Direct PII | Personal or work email |
| `phone` | **T2 - CONFIDENTIAL** | Direct PII | Personal contact |
| `gender` | **T2 - CONFIDENTIAL** | Sensitive PII | Protected characteristic |
| `nationality` | **T2 - CONFIDENTIAL** | Sensitive PII | Protected characteristic |
| `maritalStatus` | **T2 - CONFIDENTIAL** | Sensitive PII | Protected characteristic |
| `emergencyContact.name` | **T2 - CONFIDENTIAL** | Direct PII | Third-party personal name |
| `emergencyContact.phone` | **T2 - CONFIDENTIAL** | Direct PII | Third-party contact |
| `department`, `position`, `hireDate` | **T3 - INTERNAL** | Employment data | Organizational info |

### 3.4 HR Module - Contracts & Compensation (Collection: `contracts`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `salary` | **T1 - RESTRICTED** | Financial PII | Compensation data; high sensitivity |
| `benefits` | **T1 - RESTRICTED** | Financial PII | Compensation details |
| `type`, `startDate`, `endDate` | **T2 - CONFIDENTIAL** | Employment data | Contract terms |
| `documentUrl` | **T2 - CONFIDENTIAL** | Document link | May reference PII documents |

### 3.5 HR Module - Insurance (Collection: `insurance`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `policyNumber` | **T2 - CONFIDENTIAL** | Financial PII | Insurance policy identifier |
| `coverage`, `monthlyCost` | **T1 - RESTRICTED** | Financial PII | Coverage and premium amounts |
| `provider`, `type` | **T3 - INTERNAL** | Operational | Insurance provider info |

### 3.6 HR Module - Performance Reviews (Collection: `performance_reviews`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `rating`, `happinessScore` | **T2 - CONFIDENTIAL** | Subjective PII | Personal assessment scores |
| `strengths`, `areasForImprovement` | **T2 - CONFIDENTIAL** | Subjective PII | Personal evaluations |
| `goals`, `notes` | **T2 - CONFIDENTIAL** | Subjective PII | Personal goals and comments |
| `reviewerId` | **T3 - INTERNAL** | Pseudonymous ID | Links to reviewer |

### 3.7 HR Module - Visas (Collection: `visas`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `visaType` | **T2 - CONFIDENTIAL** | Immigration PII | Visa classification |
| `documentUrl` | **T2 - CONFIDENTIAL** | Document link | May reference scanned visa documents |
| `issueDate`, `expiryDate`, `status` | **T2 - CONFIDENTIAL** | Immigration PII | Visa validity |

### 3.8 CRM Module - Customer Data (Collection: `customers`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `name` | **T2 - CONFIDENTIAL** | Direct PII | Customer name |
| `email` | **T2 - CONFIDENTIAL** | Direct PII | Customer email |
| `phone` | **T2 - CONFIDENTIAL** | Direct PII | Customer phone |
| `address` (street, city, postalCode) | **T2 - CONFIDENTIAL** | Direct PII | Physical location |
| `company`, `type`, `tags` | **T3 - INTERNAL** | Business data | Customer classification |

### 3.9 Sales Module - Orders (Collections: `sales_orders`, `return_orders`, `purchase_orders`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `customerName` | **T2 - CONFIDENTIAL** | Direct PII | Customer reference in orders |
| `shippingAddress` | **T2 - CONFIDENTIAL** | Direct PII | Delivery location |
| `total`, `subtotal`, `tax`, `discount` | **T2 - CONFIDENTIAL** | Financial data | Transaction amounts |
| `unitPrice`, `totalPrice` (in items) | **T2 - CONFIDENTIAL** | Financial data | Product pricing |
| `totalRefundAmount` | **T2 - CONFIDENTIAL** | Financial data | Refund amounts |
| `paymentStatus`, `paymentTerms` | **T3 - INTERNAL** | Financial operational | Payment state |
| `items`, `quantity`, `productName` | **T3 - INTERNAL** | Operational | Order contents |

### 3.10 Logistics Module (Collections: `vehicles`, `routes`, `shipments`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `licensePlate` | **T2 - CONFIDENTIAL** | Indirect PII | Vehicle identifier |
| `origin.coordinates`, `destination.coordinates` | **T2 - CONFIDENTIAL** | Location PII | GPS coordinates enable tracking |
| `origin.address`, `destination.address` | **T2 - CONFIDENTIAL** | Location PII | Physical addresses |
| `driverId` | **T2 - CONFIDENTIAL** | Pseudonymous PII | Links to employee for tracking |
| `purchaseCost`, `costPerKm`, `rentalCostPerDay` | **T2 - CONFIDENTIAL** | Financial data | Asset costs |
| `totalCost` (shipment) | **T2 - CONFIDENTIAL** | Financial data | Shipment costs |

### 3.11 Farm Module (Collections: `farms`, `plantings`, `block_cycles`, `block_alerts`, `farm_tasks`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `owner` (farm) | **T2 - CONFIDENTIAL** | Direct PII | Farm owner name |
| `managerEmail` (farm) | **T2 - CONFIDENTIAL** | Direct PII | Manager email |
| `location.latitude`, `location.longitude` | **T2 - CONFIDENTIAL** | Location PII | Farm GPS coordinates |
| `location.address` | **T2 - CONFIDENTIAL** | Location PII | Farm physical address |
| `boundary` (GeoJSON) | **T2 - CONFIDENTIAL** | Location PII | Farm boundary polygon |
| `reportedByEmail`, `assignedToEmail`, `resolvedByEmail` | **T2 - CONFIDENTIAL** | Direct PII | Personnel in alerts |
| `comments[].userEmail`, `comments[].message` | **T2 - CONFIDENTIAL** | Direct PII + Content | User communications |
| `harvestEntries[].userEmail` | **T2 - CONFIDENTIAL** | Direct PII | Personnel in harvests |
| `plantedByEmail`, `completedByEmail` | **T2 - CONFIDENTIAL** | Direct PII | Personnel tracking |
| `plantName`, `quantity`, `qualityGrade` | **T3 - INTERNAL** | Operational | Harvest data |

### 3.12 Module Management (Collections: `installed_modules`, `module_audit_log`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `license_key_encrypted` | **T1 - RESTRICTED** | Secret | Fernet-encrypted license key |
| `environment` (module config) | **T1 - RESTRICTED** | Secret | May contain API keys, credentials |
| `installed_by_email`, `user_email` | **T2 - CONFIDENTIAL** | Direct PII | Administrative user tracking |
| `ip_address` | **T2 - CONFIDENTIAL** | Indirect PII | Network identifier |
| `user_agent` | **T3 - INTERNAL** | Technical | Browser/client info |

### 3.13 Plant Reference Data (Collections: `plant_data`, `plant_data_enhanced`)

| Field | Classification | PII Type | Justification |
|-------|---------------|----------|---------------|
| `contributor.email` | **T2 - CONFIDENTIAL** | Direct PII | Contributor contact |
| `contributor.name` | **T2 - CONFIDENTIAL** | Direct PII | Contributor name |
| `plantName`, `scientificName`, growth parameters | **T4 - PUBLIC** | Reference data | General agricultural data |

---

## 4. Classification Summary by Collection

| Collection | Highest Classification | RESTRICTED Fields | CONFIDENTIAL Fields | INTERNAL Fields |
|------------|----------------------|-------------------|--------------------|-----------------|
| `users` | T1 | passwordHash | email, names, phone | userId, role, timestamps |
| `refresh_tokens` | T1 | token | - | tokenId, timestamps |
| `verification_tokens` | T1 | token | email | tokenId, timestamps |
| `employees` | T1 | emiratesId | names, email, phone, gender, nationality | department, position |
| `contracts` | T1 | salary, benefits | dates, documentUrl | type, status |
| `insurance` | T1 | coverage, monthlyCost | policyNumber | provider, type |
| `installed_modules` | T1 | license_key_encrypted, environment | installed_by_email | module_name, status |
| `performance_reviews` | T2 | - | ratings, goals, notes | reviewId, timestamps |
| `visas` | T2 | - | visaType, dates, documentUrl | status |
| `customers` | T2 | - | name, email, phone, address | type, tags |
| `sales_orders` | T2 | - | customerName, address, amounts | items, status |
| `return_orders` | T2 | - | customerName, refundAmount | items, status |
| `purchase_orders` | T2 | - | amounts, pricing | items, status |
| `vehicles` | T2 | - | licensePlate, costs | type, capacity |
| `routes` | T2 | - | coordinates, addresses | distance, duration |
| `shipments` | T2 | - | driverId, totalCost | cargo, status |
| `farms` | T2 | - | owner, email, location, boundary | area, staffCount |
| `block_alerts` | T2 | - | emails, comments | category, severity |
| `block_cycles` | T2 | - | emails | yields, metrics |
| `farm_tasks` | T2 | - | emails, harvest entries | type, status |
| `plantings` | T2 | - | emails | plants, yields |
| `module_audit_log` | T2 | - | user_email, ip_address | operation, timestamps |
| `harvests` | T2 | - | emails | quantities, grades |
| `stock_inventory` | T3 | - | - | quantities, dates |
| `plant_data` | T2 | - | contributor email/name | plant parameters |
| `weather_cache` | T3 | - | - | weather metrics |
| `system_config` | T3 | - | - | configuration |

---

## 5. UAE Regulatory Considerations

### 5.1 Emirates ID Data

Emirates ID numbers (`emiratesId` field in `employees` collection) are governed by **UAE Federal Decree-Law No. 45 of 2021** on the Protection of Personal Data (PDPL). Requirements:

- **Must not** be stored unless operationally necessary
- **Must be** encrypted at rest (T1 classification)
- **Must not** be transmitted in plaintext
- **Must be** accessible only to authorized HR personnel
- **Retention:** Only for duration of employment + legal retention period
- **Cross-border transfer:** Requires adequacy assessment or explicit consent

### 5.2 Employee Financial Data

Salary, benefits, and insurance data are subject to:
- UAE Labor Law confidentiality requirements
- Access restricted to HR and authorized management
- Must not be disclosed to other employees

### 5.3 Customer Data

Customer PII (names, emails, phones, addresses) must comply with:
- UAE PDPL consent requirements for data collection
- Right to access, correction, and erasure
- Data minimization principles

---

## 6. Current Gaps and Remediation

| Gap | Severity | Remediation | Status |
|-----|----------|-------------|--------|
| Emirates ID not encrypted at field level | **CRITICAL** | Implement field-level encryption for `emiratesId` | TODO |
| Salary data not encrypted at field level | **HIGH** | Implement field-level encryption for financial fields | TODO |
| No data masking in API responses | **HIGH** | Add masking middleware for T1/T2 fields in logs | TODO |
| Email addresses visible in multiple collections | **MEDIUM** | Audit and minimize email duplication across collections | TODO |
| GPS coordinates stored without consent tracking | **MEDIUM** | Add consent tracking for location data | TODO |
| No data retention policy enforcement | **MEDIUM** | Implement automated data retention/purge jobs | TODO |
| Performance review access not role-restricted | **MEDIUM** | Add RBAC for performance review endpoints | TODO |
| Module environment variables may contain secrets | **HIGH** | Encrypt all module environment variables | TODO |

---

## 7. Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-04 | 1.0 | [Author] | Initial policy and PII inventory created |

---

## 8. Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Data Protection Officer | | | |
| Platform Owner | | | |
| IT Security | | | |
| HR Representative | | | |
