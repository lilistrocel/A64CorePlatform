"""
Unit tests for ai_assistant.services.conversation_repository.

Tests:
  - _make_title truncates long messages correctly.
  - create() inserts a document and returns a Conversation.
  - get() returns None for wrong user (cross-user isolation).
  - append_messages() calls update_one with correct push.
  - delete() returns True on success and False when not found.
  - _evict_if_needed() deletes the oldest conversation when at limit.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# _make_title
# ---------------------------------------------------------------------------


def test_make_title_short_message():
    """Short messages should be returned verbatim."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    title = ConversationRepository._make_title("Hello there")
    assert title == "Hello there"


def test_make_title_long_message():
    """Messages over 80 chars should be truncated with ellipsis."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    long_msg = "A" * 100
    title = ConversationRepository._make_title(long_msg)
    assert len(title) <= 80
    assert title.endswith("…")


def test_make_title_multiline_uses_first_line():
    """Only the first line of the message should be used as the title."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    msg = "First line\nSecond line\nThird line"
    title = ConversationRepository._make_title(msg)
    assert title == "First line"


def test_make_title_empty_message():
    """An empty or whitespace-only message should return the default title."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    title = ConversationRepository._make_title("   ")
    assert title == "New conversation"


# ---------------------------------------------------------------------------
# create()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_inserts_document():
    """create() should insert a document and return a Conversation with correct user_id."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    mock_collection = AsyncMock()
    mock_collection.count_documents = AsyncMock(return_value=0)
    mock_collection.insert_one = AsyncMock()

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    repo = ConversationRepository()

    with patch(
        "src.modules.ai_assistant.services.conversation_repository.mongodb"
    ) as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        conv = await repo.create(
            user_id="user-42",
            opening_message="What is the temperature in Block A?",
            context={"scope": "global"},
        )

    assert conv.user_id == "user-42"
    assert conv.title == "What is the temperature in Block A?"
    mock_collection.insert_one.assert_awaited_once()


# ---------------------------------------------------------------------------
# get() — cross-user isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_returns_none_for_wrong_user():
    """get() should return None when the conversation belongs to another user."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    mock_collection = AsyncMock()
    # Simulate MongoDB returning nothing for wrong user
    mock_collection.find_one = AsyncMock(return_value=None)

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    repo = ConversationRepository()

    with patch(
        "src.modules.ai_assistant.services.conversation_repository.mongodb"
    ) as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        result = await repo.get("conv-1", "wrong-user")

    assert result is None


# ---------------------------------------------------------------------------
# append_messages()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_append_messages_calls_update_one():
    """append_messages() should call update_one with $push for both messages."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    mock_collection = AsyncMock()
    mock_collection.update_one = AsyncMock()

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    repo = ConversationRepository()

    with patch(
        "src.modules.ai_assistant.services.conversation_repository.mongodb"
    ) as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        await repo.append_messages(
            conversation_id="conv-1",
            user_id="user-1",
            user_message="Hello",
            assistant_message="Hi there",
        )

    mock_collection.update_one.assert_awaited_once()
    update_call = mock_collection.update_one.call_args
    assert "$push" in update_call[0][1]


# ---------------------------------------------------------------------------
# delete()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_returns_true_on_success():
    """delete() should return True when a document is deleted."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    mock_result = MagicMock()
    mock_result.deleted_count = 1

    mock_collection = AsyncMock()
    mock_collection.delete_one = AsyncMock(return_value=mock_result)

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    repo = ConversationRepository()

    with patch(
        "src.modules.ai_assistant.services.conversation_repository.mongodb"
    ) as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        result = await repo.delete("conv-1", "user-1")

    assert result is True


@pytest.mark.asyncio
async def test_delete_returns_false_when_not_found():
    """delete() should return False when no document matched."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    mock_result = MagicMock()
    mock_result.deleted_count = 0

    mock_collection = AsyncMock()
    mock_collection.delete_one = AsyncMock(return_value=mock_result)

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    repo = ConversationRepository()

    with patch(
        "src.modules.ai_assistant.services.conversation_repository.mongodb"
    ) as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        result = await repo.delete("conv-nonexistent", "user-1")

    assert result is False


# ---------------------------------------------------------------------------
# _evict_if_needed() — last-3 eviction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evict_if_needed_deletes_oldest_when_at_limit():
    """_evict_if_needed() should delete the oldest conversation when at the limit."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    mock_collection = AsyncMock()
    mock_collection.count_documents = AsyncMock(return_value=3)
    mock_collection.find = MagicMock(
        return_value=MagicMock(
            sort=MagicMock(
                return_value=MagicMock(
                    limit=MagicMock(
                        return_value=MagicMock(
                            to_list=AsyncMock(return_value=[{"conversation_id": "oldest-id"}])
                        )
                    )
                )
            )
        )
    )
    mock_collection.delete_one = AsyncMock()

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    repo = ConversationRepository()

    with patch(
        "src.modules.ai_assistant.services.conversation_repository.mongodb"
    ) as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        await repo._evict_if_needed("user-1", limit=3)

    mock_collection.delete_one.assert_awaited_once_with(
        {"conversation_id": "oldest-id", "user_id": "user-1"}
    )


@pytest.mark.asyncio
async def test_evict_if_needed_noop_below_limit():
    """_evict_if_needed() should not delete anything if under the limit."""
    from src.modules.ai_assistant.services.conversation_repository import (
        ConversationRepository,
    )

    mock_collection = AsyncMock()
    mock_collection.count_documents = AsyncMock(return_value=2)
    mock_collection.delete_one = AsyncMock()

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    repo = ConversationRepository()

    with patch(
        "src.modules.ai_assistant.services.conversation_repository.mongodb"
    ) as mock_mongodb:
        mock_mongodb.get_database.return_value = mock_db

        await repo._evict_if_needed("user-1", limit=3)

    mock_collection.delete_one.assert_not_awaited()
