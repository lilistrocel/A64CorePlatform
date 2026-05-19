# A64 Finance Contracts

Shared Pydantic event schemas for the outbox bridge between the main A64 app
(MongoDB) and the finance service (MySQL).

## Installation

Both the main app and the finance service install this as an editable package:

```bash
pip install -e ./contracts
```

In Docker, add to pyproject.toml dependencies:

```toml
"a64-finance-contracts @ file:///app/contracts",
```

Or use a volume mount + editable install in the Dockerfile.

## How to add a new event type

1. Open `contracts/finance_events.py`.

2. Define the payload class:

```python
class MyNewEventPayload(BaseModel):
    """Describe what this event represents."""
    someField: str
    amount: Decimal
```

3. Add it to the `EventPayload` union:

```python
EventPayload = Union[
    ...,
    MyNewEventPayload,
]
```

4. Register it in `EVENT_TYPE_REGISTRY`:

```python
EVENT_TYPE_REGISTRY = {
    ...,
    "my_new_event": MyNewEventPayload,
}
```

5. Bump the package version in `pyproject.toml`.

6. The OutboxWriter (main app) and the finance ingest endpoint both pick it up
   automatically on next restart — no other changes needed for Week 3
   infrastructure. The actual posting logic lives in the finance service
   (Week 4+).

## Package layout

```
contracts/
├── __init__.py
├── pyproject.toml          # installable package, version 0.1.0
├── finance_events.py       # all event schemas + EVENT_TYPE_REGISTRY
└── README.md               # this file
```
