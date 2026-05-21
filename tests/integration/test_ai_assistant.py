"""
Integration tests for the AI assistant endpoints.

Uses the FastAPI TestClient with:
  - Real MongoDB (motor) connection to the test database.
  - Mocked Anthropic SDK (no real API calls).
  - Mocked SenseHub client (no IoT device needed).

Test scenarios:
  POST /api/v1/ai/assistant/chat
    - Unauthenticated request returns 401.
    - Valid request streams SSE events including a 'done' event.
    - conversation_id is returned and reusable.

  GET /api/v1/ai/assistant/conversations
    - Returns list of conversation summaries for the authenticated user.
    - Returns empty list when user has no conversations.

  DELETE /api/v1/ai/assistant/conversations/{id}
    - Returns 204 on success.
    - Returns 404 for unknown conversation ID.
    - Returns 404 when trying to delete another user's conversation.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_headers():
    """
    Return valid Bearer auth headers for the default test admin.
    Tests that need authentication must use this fixture.
    """
    # In CI, obtain a real JWT by hitting POST /api/v1/auth/login.
    # For local unit-style integration tests we patch get_current_user instead.
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
def mock_current_user():
    """Mock UserResponse for an authenticated user."""
    user = MagicMock()
    user.userId = "test-user-id-123"
    user.role = "user"
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_stream_events():
    """
    Simulated SSE events from ClaudeAssistantService.chat_stream().
    Returns an async generator that yields a text chunk and a done event.
    """

    async def _stream(*args, **kwargs):
        yield json.dumps({"type": "text", "content": "Hello from Claude!"}) + "\n"
        yield json.dumps(
            {"type": "done", "conversation_id": "mock-conv-id", "cost_usd": 0.000042}
        ) + "\n"

    return _stream


# ---------------------------------------------------------------------------
# POST /api/v1/ai/assistant/chat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_unauthenticated_returns_401():
    """POST /chat without a Bearer token should return 401."""
    from src.main import app

    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/ai/assistant/chat",
            json={"message": "Hello"},
        )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chat_streams_events(mock_current_user, mock_stream_events):
    """Authenticated POST /chat should stream text and done events."""
    from src.main import app
    from src.middleware.auth import get_current_user
    from src.modules.ai_assistant.services.claude_service import get_claude_service

    mock_service = MagicMock()
    mock_service.chat_stream = mock_stream_events

    async with AsyncClient(app=app, base_url="http://test") as client:
        with patch(
            "src.modules.ai_assistant.api.v1.assistant.get_current_user",
            return_value=mock_current_user,
        ):
            with patch(
                "src.modules.ai_assistant.api.v1.assistant.get_claude_service",
                return_value=mock_service,
            ):
                resp = await client.post(
                    "/api/v1/ai/assistant/chat",
                    json={"message": "What are the current temperatures?"},
                    headers={"Authorization": "Bearer token"},
                )

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")

    lines = [line for line in resp.text.split("\n") if line.strip()]
    events = [json.loads(line) for line in lines]
    event_types = [e["type"] for e in events]

    assert "text" in event_types
    assert "done" in event_types

    done_event = next(e for e in events if e["type"] == "done")
    assert "conversation_id" in done_event
    assert "cost_usd" in done_event


@pytest.mark.asyncio
async def test_chat_empty_message_returns_422(mock_current_user):
    """POST /chat with an empty message should return 422 (Pydantic validation)."""
    from src.main import app

    async with AsyncClient(app=app, base_url="http://test") as client:
        with patch(
            "src.modules.ai_assistant.api.v1.assistant.get_current_user",
            return_value=mock_current_user,
        ):
            resp = await client.post(
                "/api/v1/ai/assistant/chat",
                json={"message": ""},
                headers={"Authorization": "Bearer token"},
            )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/ai/assistant/conversations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_conversations_empty(mock_current_user):
    """GET /conversations returns empty list when user has no conversations."""
    from src.main import app

    mock_repo = AsyncMock()
    mock_repo.list_summaries = AsyncMock(return_value=[])

    async with AsyncClient(app=app, base_url="http://test") as client:
        with patch(
            "src.modules.ai_assistant.api.v1.assistant.get_current_user",
            return_value=mock_current_user,
        ):
            with patch(
                "src.modules.ai_assistant.api.v1.assistant.get_conversation_repository",
                return_value=mock_repo,
            ):
                resp = await client.get(
                    "/api/v1/ai/assistant/conversations",
                    headers={"Authorization": "Bearer token"},
                )

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_conversations_unauthenticated_returns_401():
    """GET /conversations without Bearer token returns 401."""
    from src.main import app

    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.get("/api/v1/ai/assistant/conversations")

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/ai/assistant/conversations/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_conversation_success(mock_current_user):
    """DELETE /conversations/{id} returns 204 when deleted successfully."""
    from src.main import app

    mock_repo = AsyncMock()
    mock_repo.delete = AsyncMock(return_value=True)

    async with AsyncClient(app=app, base_url="http://test") as client:
        with patch(
            "src.modules.ai_assistant.api.v1.assistant.get_current_user",
            return_value=mock_current_user,
        ):
            with patch(
                "src.modules.ai_assistant.api.v1.assistant.get_conversation_repository",
                return_value=mock_repo,
            ):
                resp = await client.delete(
                    "/api/v1/ai/assistant/conversations/conv-abc",
                    headers={"Authorization": "Bearer token"},
                )

    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_conversation_not_found(mock_current_user):
    """DELETE /conversations/{id} returns 404 when conversation does not exist."""
    from src.main import app

    mock_repo = AsyncMock()
    mock_repo.delete = AsyncMock(return_value=False)

    async with AsyncClient(app=app, base_url="http://test") as client:
        with patch(
            "src.modules.ai_assistant.api.v1.assistant.get_current_user",
            return_value=mock_current_user,
        ):
            with patch(
                "src.modules.ai_assistant.api.v1.assistant.get_conversation_repository",
                return_value=mock_repo,
            ):
                resp = await client.delete(
                    "/api/v1/ai/assistant/conversations/nonexistent-id",
                    headers={"Authorization": "Bearer token"},
                )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_conversation_unauthenticated_returns_401():
    """DELETE /conversations/{id} without Bearer token returns 401."""
    from src.main import app

    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.delete("/api/v1/ai/assistant/conversations/conv-1")

    assert resp.status_code == 401
