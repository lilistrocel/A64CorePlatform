"""
Division-Scoped Repository Base

Provides a base class for repositories that automatically applies
divisionId filtering to all queries when a division context is active.
"""

import logging
from typing import Optional, Dict, Any, List

from ..middleware.division_context import get_current_division_id

logger = logging.getLogger(__name__)


class DivisionScopedRepository:
    """
    Base repository that auto-injects divisionId into query filters.

    When a division context is active (X-Division-Id header present),
    all find/count operations automatically filter by divisionId.
    When no division context is active, queries run without scoping (global).

    Subclasses should use self._scoped_filter(filter_dict) to wrap
    their query filters.
    """

    def __init__(self, collection):
        """
        Args:
            collection: MongoDB collection (motor async collection)
        """
        self.collection = collection

    def _scoped_filter(self, filter_dict: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Wrap a query filter with division scoping.

        If a division context is active, adds divisionId to the filter.
        If no context, returns the filter unchanged (global scope).

        Args:
            filter_dict: The original MongoDB query filter

        Returns:
            Filter dict with divisionId added if applicable
        """
        result = dict(filter_dict) if filter_dict else {}
        division_id = get_current_division_id()

        if division_id is not None:
            result["divisionId"] = division_id

        return result

    def _with_division(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add divisionId to a document before insert.

        Args:
            doc: Document dict to enrich

        Returns:
            Document with divisionId added if context is active
        """
        division_id = get_current_division_id()
        if division_id is not None and "divisionId" not in doc:
            doc["divisionId"] = division_id
        return doc

    async def find_one(self, filter_dict: Dict[str, Any], **kwargs) -> Optional[Dict[str, Any]]:
        """Find a single document with division scoping."""
        return await self.collection.find_one(self._scoped_filter(filter_dict), **kwargs)

    async def find_many(
        self,
        filter_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[List] = None,
        skip: int = 0,
        limit: int = 0,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Find multiple documents with division scoping."""
        cursor = self.collection.find(self._scoped_filter(filter_dict), **kwargs)
        if sort:
            cursor = cursor.sort(sort)
        if skip:
            cursor = cursor.skip(skip)
        if limit:
            cursor = cursor.limit(limit)
        return await cursor.to_list(length=limit or None)

    async def count(self, filter_dict: Optional[Dict[str, Any]] = None) -> int:
        """Count documents with division scoping."""
        return await self.collection.count_documents(self._scoped_filter(filter_dict))

    async def insert_one(self, doc: Dict[str, Any]) -> Any:
        """Insert a document with division context."""
        return await self.collection.insert_one(self._with_division(doc))

    async def update_one(self, filter_dict: Dict[str, Any], update: Dict[str, Any], **kwargs) -> Any:
        """Update a document with division scoping on the filter."""
        return await self.collection.update_one(self._scoped_filter(filter_dict), update, **kwargs)

    async def update_many(self, filter_dict: Dict[str, Any], update: Dict[str, Any], **kwargs) -> Any:
        """Update multiple documents with division scoping."""
        return await self.collection.update_many(self._scoped_filter(filter_dict), update, **kwargs)

    async def delete_one(self, filter_dict: Dict[str, Any]) -> Any:
        """Delete a document with division scoping."""
        return await self.collection.delete_one(self._scoped_filter(filter_dict))

    async def aggregate(self, pipeline: List[Dict[str, Any]], **kwargs) -> List[Dict[str, Any]]:
        """
        Run an aggregation pipeline with division scoping.

        Prepends a $match stage with divisionId if context is active.
        """
        division_id = get_current_division_id()
        if division_id is not None:
            match_stage = {"$match": {"divisionId": division_id}}
            pipeline = [match_stage] + list(pipeline)
        cursor = self.collection.aggregate(pipeline, **kwargs)
        return await cursor.to_list(length=None)
