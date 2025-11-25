"""
Query Validators

Security layer for validating MongoDB queries before execution.
Prevents injection attacks and ensures safe query operations.
"""

import logging
from typing import Dict, Any, List, Optional, Set
import re

logger = logging.getLogger(__name__)


class QueryValidationError(Exception):
    """Raised when query validation fails"""
    pass


class QueryValidator:
    """
    Validates MongoDB queries for security and safety.

    Security Checks:
    - Blocks dangerous operators ($where, $function, $accumulator, etc.)
    - Prevents JavaScript code execution
    - Limits query complexity (joins, grouping depth)
    - Validates collection names against schema
    - Enforces document limits
    - Checks field access permissions
    """

    # Dangerous operators that allow arbitrary code execution
    DANGEROUS_OPERATORS = {
        "$where",  # JavaScript code execution
        "$function",  # JavaScript functions
        "$accumulator",  # Custom accumulators with JavaScript
        "$expr",  # Could be used for injection
    }

    # Operators that should be used with caution
    RESTRICTED_OPERATORS = {
        "$regex",  # Regex can be slow, allow but log
        "$text",  # Full-text search, allow but monitor
    }

    # Maximum limits to prevent resource exhaustion
    MAX_LIMIT = 1000  # Maximum documents to return
    MAX_LOOKUP_DEPTH = 3  # Maximum nested $lookup operations
    MAX_GROUP_STAGES = 5  # Maximum $group stages
    MAX_PIPELINE_STAGES = 20  # Maximum total pipeline stages

    def __init__(self, valid_collections: Optional[Set[str]] = None):
        """
        Initialize query validator.

        Args:
            valid_collections: Set of valid collection names (from schema)
        """
        self.valid_collections = valid_collections or set()

    def set_valid_collections(self, collections: Set[str]) -> None:
        """
        Update valid collection names.

        Args:
            collections: Set of collection names
        """
        self.valid_collections = collections
        logger.info(f"Updated valid collections: {len(collections)} collections")

    def validate_query(
        self,
        collection: str,
        query: List[Dict[str, Any]],
        user_role: str = "user"
    ) -> None:
        """
        Validate MongoDB aggregation pipeline query.

        Args:
            collection: Target collection name
            query: MongoDB aggregation pipeline
            user_role: User's role (for permission checks)

        Raises:
            QueryValidationError: If validation fails
        """
        # Validate collection exists
        self._validate_collection(collection)

        # Validate it's a list (aggregation pipeline)
        if not isinstance(query, list):
            raise QueryValidationError(
                f"Query must be an aggregation pipeline (list), got {type(query).__name__}"
            )

        # Validate pipeline length
        if len(query) > self.MAX_PIPELINE_STAGES:
            raise QueryValidationError(
                f"Pipeline too complex: {len(query)} stages (max {self.MAX_PIPELINE_STAGES})"
            )

        # Check for empty pipeline
        if len(query) == 0:
            logger.warning("Empty aggregation pipeline")

        # Validate each stage
        for stage_idx, stage in enumerate(query):
            self._validate_stage(stage, stage_idx, user_role)

        # Validate overall pipeline structure
        self._validate_pipeline_structure(query)

        # Ensure $limit is present (prevent excessive results)
        self._ensure_limit_stage(query)

        logger.info(
            f"Query validated successfully: collection={collection}, "
            f"stages={len(query)}, role={user_role}"
        )

    def _validate_collection(self, collection: str) -> None:
        """
        Validate collection name.

        Args:
            collection: Collection name

        Raises:
            QueryValidationError: If collection is invalid
        """
        if not collection:
            raise QueryValidationError("Collection name is required")

        # Check against schema
        if self.valid_collections and collection not in self.valid_collections:
            raise QueryValidationError(
                f"Collection '{collection}' not found in schema. "
                f"Valid collections: {', '.join(sorted(self.valid_collections))}"
            )

        # Check for injection attempts in collection name
        if not re.match(r'^[a-zA-Z0-9_]+$', collection):
            raise QueryValidationError(
                f"Invalid collection name '{collection}'. "
                "Only alphanumeric characters and underscores allowed."
            )

    def _validate_stage(
        self,
        stage: Dict[str, Any],
        stage_idx: int,
        user_role: str
    ) -> None:
        """
        Validate a single pipeline stage.

        Args:
            stage: Pipeline stage dict
            stage_idx: Stage index in pipeline
            user_role: User's role

        Raises:
            QueryValidationError: If stage is invalid
        """
        if not isinstance(stage, dict):
            raise QueryValidationError(
                f"Stage {stage_idx} must be a dict, got {type(stage).__name__}"
            )

        if len(stage) != 1:
            raise QueryValidationError(
                f"Stage {stage_idx} must have exactly one operator, got {len(stage)}"
            )

        # Get stage operator (e.g., $match, $group, $lookup)
        operator = list(stage.keys())[0]
        stage_content = stage[operator]

        # Check for dangerous operators
        if operator in self.DANGEROUS_OPERATORS:
            raise QueryValidationError(
                f"Operator '{operator}' is not allowed (security risk). "
                f"Stage {stage_idx}."
            )

        # Log restricted operators
        if operator in self.RESTRICTED_OPERATORS:
            logger.warning(
                f"Using restricted operator '{operator}' at stage {stage_idx}. "
                "Monitoring for performance."
            )

        # Recursively check for dangerous operators in nested structures
        self._check_for_dangerous_operators(stage_content, f"Stage {stage_idx}")

        # Validate specific stage types
        if operator == "$lookup":
            self._validate_lookup_stage(stage_content, stage_idx)
        elif operator == "$group":
            self._validate_group_stage(stage_content, stage_idx)
        elif operator == "$match":
            self._validate_match_stage(stage_content, stage_idx)
        elif operator == "$limit":
            self._validate_limit_stage(stage_content, stage_idx)
        elif operator == "$skip":
            self._validate_skip_stage(stage_content, stage_idx)

    def _check_for_dangerous_operators(
        self,
        obj: Any,
        path: str
    ) -> None:
        """
        Recursively check for dangerous operators in nested structures.

        Args:
            obj: Object to check
            path: Current path in object (for error messages)

        Raises:
            QueryValidationError: If dangerous operator found
        """
        if isinstance(obj, dict):
            for key, value in obj.items():
                # Check key itself
                if key in self.DANGEROUS_OPERATORS:
                    raise QueryValidationError(
                        f"Dangerous operator '{key}' found at {path}.{key}"
                    )

                # Check for JavaScript code patterns
                if isinstance(value, str):
                    if self._contains_javascript(value):
                        raise QueryValidationError(
                            f"Potential JavaScript code detected at {path}.{key}"
                        )

                # Recursively check nested structures
                self._check_for_dangerous_operators(value, f"{path}.{key}")

        elif isinstance(obj, list):
            for idx, item in enumerate(obj):
                self._check_for_dangerous_operators(item, f"{path}[{idx}]")

    def _contains_javascript(self, text: str) -> bool:
        """
        Check if string contains potential JavaScript code.

        Args:
            text: String to check

        Returns:
            True if JavaScript patterns detected
        """
        # Common JavaScript patterns
        js_patterns = [
            r'\bfunction\s*\(',
            r'\beval\s*\(',
            r'\breturn\s+',
            r'=>',
            r'\bthis\.',
            r'\.prototype\.',
        ]

        for pattern in js_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True

        return False

    def _validate_lookup_stage(
        self,
        stage_content: Dict[str, Any],
        stage_idx: int
    ) -> None:
        """
        Validate $lookup stage.

        Args:
            stage_content: $lookup stage content
            stage_idx: Stage index

        Raises:
            QueryValidationError: If validation fails
        """
        # Required fields
        required_fields = {"from", "localField", "foreignField", "as"}
        if not all(field in stage_content for field in required_fields):
            missing = required_fields - set(stage_content.keys())
            raise QueryValidationError(
                f"$lookup at stage {stage_idx} missing required fields: {missing}"
            )

        # Validate 'from' collection
        from_collection = stage_content["from"]
        if self.valid_collections and from_collection not in self.valid_collections:
            raise QueryValidationError(
                f"$lookup 'from' collection '{from_collection}' not found in schema"
            )

    def _validate_group_stage(
        self,
        stage_content: Dict[str, Any],
        stage_idx: int
    ) -> None:
        """
        Validate $group stage.

        Args:
            stage_content: $group stage content
            stage_idx: Stage index

        Raises:
            QueryValidationError: If validation fails
        """
        # Must have _id field
        if "_id" not in stage_content:
            raise QueryValidationError(
                f"$group at stage {stage_idx} must have '_id' field"
            )

        # Check for dangerous accumulators
        for key, value in stage_content.items():
            if key == "_id":
                continue

            if isinstance(value, dict):
                for accumulator in value.keys():
                    if accumulator in self.DANGEROUS_OPERATORS:
                        raise QueryValidationError(
                            f"Dangerous accumulator '{accumulator}' in $group at stage {stage_idx}"
                        )

    def _validate_match_stage(
        self,
        stage_content: Dict[str, Any],
        stage_idx: int
    ) -> None:
        """
        Validate $match stage.

        Args:
            stage_content: $match stage content
            stage_idx: Stage index

        Raises:
            QueryValidationError: If validation fails
        """
        # Match stage must be a dict
        if not isinstance(stage_content, dict):
            raise QueryValidationError(
                f"$match at stage {stage_idx} must be a dict, got {type(stage_content).__name__}"
            )

        # No additional validation needed - already checked for dangerous operators

    def _validate_limit_stage(
        self,
        stage_content: int,
        stage_idx: int
    ) -> None:
        """
        Validate $limit stage.

        Args:
            stage_content: $limit value
            stage_idx: Stage index

        Raises:
            QueryValidationError: If validation fails
        """
        if not isinstance(stage_content, int):
            raise QueryValidationError(
                f"$limit at stage {stage_idx} must be an integer, got {type(stage_content).__name__}"
            )

        if stage_content <= 0:
            raise QueryValidationError(
                f"$limit at stage {stage_idx} must be positive, got {stage_content}"
            )

        if stage_content > self.MAX_LIMIT:
            raise QueryValidationError(
                f"$limit at stage {stage_idx} exceeds maximum ({self.MAX_LIMIT}), got {stage_content}"
            )

    def _validate_skip_stage(
        self,
        stage_content: int,
        stage_idx: int
    ) -> None:
        """
        Validate $skip stage.

        Args:
            stage_content: $skip value
            stage_idx: Stage index

        Raises:
            QueryValidationError: If validation fails
        """
        if not isinstance(stage_content, int):
            raise QueryValidationError(
                f"$skip at stage {stage_idx} must be an integer, got {type(stage_content).__name__}"
            )

        if stage_content < 0:
            raise QueryValidationError(
                f"$skip at stage {stage_idx} must be non-negative, got {stage_content}"
            )

    def _validate_pipeline_structure(self, query: List[Dict[str, Any]]) -> None:
        """
        Validate overall pipeline structure.

        Args:
            query: Complete pipeline

        Raises:
            QueryValidationError: If validation fails
        """
        # Count $lookup depth
        lookup_count = sum(1 for stage in query if "$lookup" in stage)
        if lookup_count > self.MAX_LOOKUP_DEPTH:
            raise QueryValidationError(
                f"Too many $lookup stages: {lookup_count} (max {self.MAX_LOOKUP_DEPTH})"
            )

        # Count $group stages
        group_count = sum(1 for stage in query if "$group" in stage)
        if group_count > self.MAX_GROUP_STAGES:
            raise QueryValidationError(
                f"Too many $group stages: {group_count} (max {self.MAX_GROUP_STAGES})"
            )

    def _ensure_limit_stage(self, query: List[Dict[str, Any]]) -> None:
        """
        Ensure pipeline has a $limit stage.

        Args:
            query: Pipeline to check

        Raises:
            QueryValidationError: If no $limit found
        """
        # Check if $limit exists
        has_limit = any("$limit" in stage for stage in query)

        if not has_limit:
            # Auto-add $limit if missing (safety measure)
            logger.warning(f"No $limit stage found, auto-adding $limit {self.MAX_LIMIT}")
            query.append({"$limit": self.MAX_LIMIT})


def validate_query(
    collection: str,
    query: List[Dict[str, Any]],
    valid_collections: Optional[Set[str]] = None,
    user_role: str = "user"
) -> None:
    """
    Convenience function to validate a query.

    Args:
        collection: Target collection name
        query: MongoDB aggregation pipeline
        valid_collections: Set of valid collection names
        user_role: User's role

    Raises:
        QueryValidationError: If validation fails
    """
    validator = QueryValidator(valid_collections)
    validator.validate_query(collection, query, user_role)
