"""
Core Finance Utilities

Cross-cutting helpers that both ops-side modules (sales, purchasing) use when
they need to interact with finance-owned data without introducing a direct
dependency on the finance microservice's internal code.

Modules
-------
company_resolver  — resolve the effective companyCode for an operation from
                    the user's org context via the finance microservice HTTP API.
"""
