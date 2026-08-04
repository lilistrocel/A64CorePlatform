"""
AI Assistant — Conversation Repository (Phase C)

Persists conversations to MongoDB collection `ai_assistant_conversations`.
Enforces the last-3-per-user limit: when a 4th conversation is created,
the oldest one (by updated_at) is deleted automatically.

Document structure mirrors the Conversation Pydantic model.
All queries are user-scoped — cross-user isolation is enforced at the DB level.
"""

import logging
import uuid
from datetime import datetime
from typing import List, Optional

from src.services.database import mongodb

from ..models.conversation import (
    Conversation,
    ConversationSummary,
    Message,
    MessageRole,
)

logger = logging.getLogger(__name__)

_COLLECTION = "ai_assistant_conversations"


class ConversationRepository:
    """
    MongoDB-backed store for AI assistant conversations.

    Methods:
        create:          Create a new conversation (evicts oldest if over limit).
        get:             Load a single conversation by ID (user-scoped).
        list_summaries:  List the user's conversations as lightweight summaries.
        append_messages: Append user + assistant messages to an existing conversation.
        delete:          Delete a conversation by ID (user-scoped).
    """

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create(
        self,
        user_id: str,
        opening_message: str,
        context: dict,
        history_limit: int = 3,
    ) -> Conversation:
        """
        Create a new conversation and enforce the per-user history limit.

        If the user already has `history_limit` conversations, the oldest one
        (by updated_at) is deleted before the new one is inserted.

        Args:
            user_id:         Authenticated user ID.
            opening_message: First user message (used to generate the title).
            context:         ChatContext snapshot dict.
            history_limit:   Max conversations to keep per user.

        Returns:
            Newly created Conversation document.
        """
        db = mongodb.get_database()
        collection = db[_COLLECTION]

        # Evict oldest conversation if user is at limit
        await self._evict_if_needed(user_id, history_limit)

        now = datetime.utcnow()
        conversation = Conversation(
            conversation_id=str(uuid.uuid4()),
            user_id=user_id,
            title=self._make_title(opening_message),
            messages=[],
            context=context,
            created_at=now,
            updated_at=now,
        )

        doc = conversation.model_dump()
        await collection.insert_one(doc)
        logger.debug(
            "Created conversation %s for user %s", conversation.conversation_id, user_id
        )
        return conversation

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get(self, conversation_id: str, user_id: str) -> Optional[Conversation]:
        """
        Load a conversation by ID, enforcing user ownership.

        Args:
            conversation_id: UUID string of the conversation.
            user_id:         Must match the stored user_id field.

        Returns:
            Conversation object, or None if not found / wrong owner.
        """
        db = mongodb.get_database()
        doc = await db[_COLLECTION].find_one(
            {"conversation_id": conversation_id, "user_id": user_id},
            {"_id": 0},
        )
        if not doc:
            return None
        return Conversation(**doc)

    async def list_summaries(self, user_id: str) -> List[ConversationSummary]:
        """
        Return lightweight summaries of all conversations owned by user_id.

        Sorted by updated_at descending (most recent first).

        Args:
            user_id: Authenticated user ID.

        Returns:
            List of ConversationSummary objects (no message content).
        """
        db = mongodb.get_database()
        cursor = (
            db[_COLLECTION]
            .find(
                {"user_id": user_id},
                {
                    "_id": 0,
                    "conversation_id": 1,
                    "title": 1,
                    "messages": 1,
                    "created_at": 1,
                    "updated_at": 1,
                },
            )
            .sort("updated_at", -1)
        )
        docs = await cursor.to_list(length=50)

        summaries = []
        for doc in docs:
            summaries.append(
                ConversationSummary(
                    conversation_id=doc["conversation_id"],
                    title=doc.get("title", ""),
                    message_count=len(doc.get("messages", [])),
                    created_at=doc["created_at"],
                    updated_at=doc["updated_at"],
                )
            )
        return summaries

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def append_messages(
        self,
        conversation_id: str,
        user_id: str,
        user_message: str,
        assistant_message: str,
    ) -> None:
        """
        Append a user turn and the corresponding assistant turn to a conversation.

        Args:
            conversation_id:   UUID of the conversation.
            user_id:           Must match the stored user_id (ownership check).
            user_message:      The user's input text.
            assistant_message: The assistant's full response text.
        """
        db = mongodb.get_database()
        now = datetime.utcnow()

        user_msg = Message(
            role=MessageRole.USER,
            content=user_message,
            timestamp=now,
        )
        assistant_msg = Message(
            role=MessageRole.ASSISTANT,
            content=assistant_message,
            timestamp=now,
        )

        await db[_COLLECTION].update_one(
            {"conversation_id": conversation_id, "user_id": user_id},
            {
                "$push": {
                    "messages": {
                        "$each": [
                            user_msg.model_dump(),
                            assistant_msg.model_dump(),
                        ]
                    }
                },
                "$set": {"updated_at": now},
            },
        )

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete(self, conversation_id: str, user_id: str) -> bool:
        """
        Delete a conversation by ID.

        Args:
            conversation_id: UUID of the conversation to delete.
            user_id:         Must match the stored user_id (ownership check).

        Returns:
            True if a document was deleted, False if not found.
        """
        db = mongodb.get_database()
        result = await db[_COLLECTION].delete_one(
            {"conversation_id": conversation_id, "user_id": user_id}
        )
        deleted = result.deleted_count > 0
        if deleted:
            logger.debug(
                "Deleted conversation %s for user %s", conversation_id, user_id
            )
        return deleted

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _evict_if_needed(self, user_id: str, limit: int) -> None:
        """
        Delete the oldest conversation if the user is at or above the limit.

        Args:
            user_id: User whose conversations to check.
            limit:   Maximum number of conversations allowed.
        """
        db = mongodb.get_database()
        count = await db[_COLLECTION].count_documents({"user_id": user_id})
        if count < limit:
            return

        # Find the oldest conversation (lowest updated_at)
        oldest = await (
            db[_COLLECTION]
            .find({"user_id": user_id}, {"_id": 0, "conversation_id": 1})
            .sort("updated_at", 1)
            .limit(1)
            .to_list(length=1)
        )
        if oldest:
            old_id = oldest[0]["conversation_id"]
            await db[_COLLECTION].delete_one(
                {"conversation_id": old_id, "user_id": user_id}
            )
            logger.debug(
                "Evicted conversation %s for user %s (limit=%d)",
                old_id,
                user_id,
                limit,
            )

    @staticmethod
    def _make_title(message: str, max_length: int = 80) -> str:
        """
        Create a conversation title from the opening user message.

        Args:
            message:    Raw user message text.
            max_length: Maximum character length for the title.

        Returns:
            Truncated title string with ellipsis if needed.
        """
        lines = message.strip().splitlines()
        title = lines[0] if lines else ""  # First line only
        if len(title) > max_length:
            title = title[: max_length - 1] + "…"
        return title or "New conversation"


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_repo: Optional[ConversationRepository] = None


def get_conversation_repository() -> ConversationRepository:
    """
    Return the shared ConversationRepository singleton.

    Returns:
        ConversationRepository instance.
    """
    global _repo
    if _repo is None:
        _repo = ConversationRepository()
    return _repo
