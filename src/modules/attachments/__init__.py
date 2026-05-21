"""
Attachments Module

Reusable document attachment infrastructure for all five P2P document types:
PR (Purchase Request), PO (Purchase Order), GR (Goods Receipt),
AP (AP Invoice), and PAYMENT (Vendor Payment).

Provides:
- StorageBackend abstraction (local filesystem in v1; S3/MinIO ready)
- MongoDB collection: document_attachments (soft-delete, org-scoped)
- REST endpoints at /api/v1/attachments/{doc_type}/{doc_id}
- Mime whitelist: application/pdf, image/jpeg, image/png, image/webp
- 10 MB upload cap
- Read-only enforcement after approval (PAYMENT type always mutable)
- HTTP Range request support for in-browser PDF streaming
"""
