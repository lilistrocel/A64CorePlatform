"""
A64 Finance Contracts Package

Shared Pydantic event schemas for the outbox bridge between the main
A64 app (MongoDB) and the finance service (MySQL).

Both the main app and the finance service install this as an editable
package (-e ./contracts) so the schemas stay in sync across services.
"""
