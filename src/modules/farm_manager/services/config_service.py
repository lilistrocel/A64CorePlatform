"""
Farm Management Module - Configuration Service

Service for managing system configuration, including spacing standards.
"""

from datetime import datetime
from typing import Dict, Optional
from uuid import UUID, uuid4
import logging

from .database import farm_db
from ..models.spacing_standards import (
    SpacingCategory,
    SpacingStandardsConfig,
    DEFAULT_SPACING_DENSITIES,
)

logger = logging.getLogger(__name__)


class ConfigService:
    """Service for managing farm module configuration."""

    COLLECTION_NAME = "system_config"
    SPACING_STANDARDS_TYPE = "spacing_standards"

    def __init__(self):
        self.db = farm_db.get_database()
        self.collection = self.db[self.COLLECTION_NAME]

    async def get_spacing_standards(self) -> SpacingStandardsConfig:
        """
        Get the current spacing standards configuration.

        If no configuration exists, creates and returns the default configuration.

        Returns:
            SpacingStandardsConfig with current densities
        """
        try:
            # Find existing configuration
            config_doc = await self.collection.find_one({
                "configType": self.SPACING_STANDARDS_TYPE
            })

            if config_doc:
                # Convert MongoDB document to Pydantic model
                return SpacingStandardsConfig(
                    configId=UUID(config_doc["configId"]) if isinstance(config_doc.get("configId"), str) else config_doc.get("configId", uuid4()),
                    configType=config_doc.get("configType", self.SPACING_STANDARDS_TYPE),
                    densities=config_doc.get("densities", {}),
                    updatedAt=config_doc.get("updatedAt", datetime.utcnow()),
                    updatedBy=UUID(config_doc["updatedBy"]) if config_doc.get("updatedBy") else None,
                    updatedByEmail=config_doc.get("updatedByEmail")
                )

            # No configuration exists - create default
            logger.info("No spacing standards configuration found, creating defaults")
            return await self._create_default_spacing_standards()

        except Exception as e:
            logger.error(f"Error getting spacing standards: {e}")
            # Return defaults on error
            return SpacingStandardsConfig(
                configId=uuid4(),
                configType=self.SPACING_STANDARDS_TYPE,
                densities={cat.value: density for cat, density in DEFAULT_SPACING_DENSITIES.items()},
                updatedAt=datetime.utcnow()
            )

    async def _create_default_spacing_standards(self) -> SpacingStandardsConfig:
        """Create the default spacing standards configuration."""
        config = SpacingStandardsConfig(
            configId=uuid4(),
            configType=self.SPACING_STANDARDS_TYPE,
            densities={cat.value: density for cat, density in DEFAULT_SPACING_DENSITIES.items()},
            updatedAt=datetime.utcnow()
        )

        try:
            await self.collection.insert_one({
                "configId": str(config.configId),
                "configType": config.configType,
                "densities": config.densities,
                "updatedAt": config.updatedAt,
                "updatedBy": None,
                "updatedByEmail": None
            })
            logger.info("Created default spacing standards configuration")
        except Exception as e:
            logger.error(f"Error creating default spacing standards: {e}")
            # Return the config even if save failed

        return config

    async def update_spacing_standards(
        self,
        densities: Dict[str, int],
        user_id: UUID,
        user_email: str
    ) -> SpacingStandardsConfig:
        """
        Update the spacing standards configuration.

        Args:
            densities: New density values keyed by spacing category
            user_id: ID of user making the update
            user_email: Email of user making the update

        Returns:
            Updated SpacingStandardsConfig
        """
        try:
            now = datetime.utcnow()

            # Try to update existing config
            result = await self.collection.update_one(
                {"configType": self.SPACING_STANDARDS_TYPE},
                {
                    "$set": {
                        "densities": densities,
                        "updatedAt": now,
                        "updatedBy": str(user_id),
                        "updatedByEmail": user_email
                    },
                    "$setOnInsert": {
                        "configId": str(uuid4()),
                        "configType": self.SPACING_STANDARDS_TYPE
                    }
                },
                upsert=True
            )

            logger.info(f"Updated spacing standards configuration by {user_email}")

            # Return updated config
            return await self.get_spacing_standards()

        except Exception as e:
            logger.error(f"Error updating spacing standards: {e}")
            raise

    async def reset_spacing_standards(
        self,
        user_id: UUID,
        user_email: str
    ) -> SpacingStandardsConfig:
        """
        Reset spacing standards to default values.

        Args:
            user_id: ID of user making the reset
            user_email: Email of user making the reset

        Returns:
            Reset SpacingStandardsConfig with default values
        """
        default_densities = {
            cat.value: density for cat, density in DEFAULT_SPACING_DENSITIES.items()
        }

        return await self.update_spacing_standards(
            densities=default_densities,
            user_id=user_id,
            user_email=user_email
        )

    async def get_density_for_category(
        self,
        spacing_category: SpacingCategory
    ) -> int:
        """
        Get the density (plants per 100 m²) for a specific spacing category.

        Args:
            spacing_category: The spacing category

        Returns:
            Number of plants per 100 m²
        """
        config = await self.get_spacing_standards()
        return config.densities.get(
            spacing_category.value,
            DEFAULT_SPACING_DENSITIES[spacing_category]
        )
