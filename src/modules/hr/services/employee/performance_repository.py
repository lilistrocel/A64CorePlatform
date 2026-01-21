"""
Performance Review Repository

Data access layer for Performance Review operations.
Handles all database interactions for employee performance reviews.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.modules.hr.models.performance import PerformanceReview, PerformanceReviewCreate, PerformanceReviewUpdate
from src.modules.hr.services.database import hr_db

logger = logging.getLogger(__name__)


class PerformanceRepository:
    """Repository for Performance Review data access"""

    def __init__(self):
        self.collection_name = "employee_performance"

    def _get_collection(self):
        """Get performance reviews collection"""
        return hr_db.get_collection(self.collection_name)

    async def create(self, review_data: PerformanceReviewCreate) -> PerformanceReview:
        """
        Create a new performance review

        Args:
            review_data: Performance review creation data

        Returns:
            Created performance review
        """
        collection = self._get_collection()

        review_dict = review_data.model_dump()
        review = PerformanceReview(
            **review_dict,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        review_doc = review.model_dump(by_alias=True)
        review_doc["reviewId"] = str(review_doc["reviewId"])
        review_doc["employeeId"] = str(review_doc["employeeId"])
        review_doc["reviewerId"] = str(review_doc["reviewerId"])

        # Convert date to datetime for MongoDB
        if "reviewDate" in review_doc:
            review_doc["reviewDate"] = datetime.combine(review_doc["reviewDate"], datetime.min.time())

        await collection.insert_one(review_doc)

        logger.info(f"Created performance review: {review.reviewId} for employee {review.employeeId}")
        return review

    async def get_by_id(self, review_id: UUID) -> Optional[PerformanceReview]:
        """
        Get performance review by ID

        Args:
            review_id: Review ID

        Returns:
            Performance review if found, None otherwise
        """
        collection = self._get_collection()
        review_doc = await collection.find_one({"reviewId": str(review_id)})

        if review_doc:
            review_doc.pop("_id", None)
            # Convert datetime back to date
            if "reviewDate" in review_doc and isinstance(review_doc["reviewDate"], datetime):
                review_doc["reviewDate"] = review_doc["reviewDate"].date()
            return PerformanceReview(**review_doc)
        return None

    async def get_by_employee_id(
        self,
        employee_id: UUID,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[PerformanceReview], int]:
        """
        Get performance reviews for a specific employee

        Args:
            employee_id: Employee ID
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of performance reviews, total count)
        """
        collection = self._get_collection()
        query = {"employeeId": str(employee_id)}

        # Get total count
        total = await collection.count_documents(query)

        # Get reviews
        cursor = collection.find(query).sort("reviewDate", -1).skip(skip).limit(limit)
        reviews = []

        async for review_doc in cursor:
            review_doc.pop("_id", None)
            # Convert datetime back to date
            if "reviewDate" in review_doc and isinstance(review_doc["reviewDate"], datetime):
                review_doc["reviewDate"] = review_doc["reviewDate"].date()
            reviews.append(PerformanceReview(**review_doc))

        return reviews, total

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[PerformanceReview], int]:
        """
        Get all performance reviews with pagination

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of performance reviews, total count)
        """
        collection = self._get_collection()
        query = {}

        # Get total count
        total = await collection.count_documents(query)

        # Get reviews
        cursor = collection.find(query).sort("reviewDate", -1).skip(skip).limit(limit)
        reviews = []

        async for review_doc in cursor:
            review_doc.pop("_id", None)
            # Convert datetime back to date
            if "reviewDate" in review_doc and isinstance(review_doc["reviewDate"], datetime):
                review_doc["reviewDate"] = review_doc["reviewDate"].date()
            reviews.append(PerformanceReview(**review_doc))

        return reviews, total

    async def get_dashboard_metrics(self) -> dict:
        """
        Get HR dashboard metrics including average ratings and happiness scores

        Returns:
            Dictionary with dashboard metrics
        """
        collection = self._get_collection()

        # Get average rating and happiness score
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "avgRating": {"$avg": "$rating"},
                    "avgHappinessScore": {"$avg": "$happinessScore"},
                    "totalReviews": {"$sum": 1}
                }
            }
        ]

        result = await collection.aggregate(pipeline).to_list(length=1)

        if result:
            return {
                "avgRating": round(result[0].get("avgRating", 0), 2),
                "avgHappinessScore": round(result[0].get("avgHappinessScore", 0), 2),
                "totalReviews": result[0].get("totalReviews", 0)
            }

        return {
            "avgRating": 0,
            "avgHappinessScore": 0,
            "totalReviews": 0
        }

    async def update(self, review_id: UUID, update_data: PerformanceReviewUpdate) -> Optional[PerformanceReview]:
        """
        Update a performance review

        Args:
            review_id: Review ID
            update_data: Fields to update

        Returns:
            Updated performance review if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(review_id)

        update_dict["updatedAt"] = datetime.utcnow()

        # Convert date to datetime for MongoDB
        if "reviewDate" in update_dict:
            update_dict["reviewDate"] = datetime.combine(update_dict["reviewDate"], datetime.min.time())

        # Convert reviewerId to string if present
        if "reviewerId" in update_dict:
            update_dict["reviewerId"] = str(update_dict["reviewerId"])

        result = await collection.update_one(
            {"reviewId": str(review_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated performance review: {review_id}")
            return await self.get_by_id(review_id)

        return None

    async def delete(self, review_id: UUID) -> bool:
        """
        Delete a performance review (hard delete)

        Args:
            review_id: Review ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"reviewId": str(review_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted performance review: {review_id}")
            return True

        return False

    async def exists(self, review_id: UUID) -> bool:
        """
        Check if performance review exists

        Args:
            review_id: Review ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"reviewId": str(review_id)})
        return count > 0
