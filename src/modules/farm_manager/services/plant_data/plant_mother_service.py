"""
PlantMother Service - Business Logic Layer (Plant Library Phase 2)

Business logic for the mother-plant (product) CRUD API and for creating
varieties underneath a mother. Phase 1 shipped the model + a minimal
repository skeleton only (see plant_mother_repository.py's module docstring)
- this is the first place mothers are created/updated/deleted through the
running app rather than only via the migration script.
"""

from typing import List, Optional, Tuple
from uuid import UUID, uuid5, NAMESPACE_OID
from fastapi import HTTPException, status
import logging

from ...models.plant_mother import (
    PlantMother,
    PlantMotherCreate,
    PlantMotherUpdate,
    PlantMotherWithVarietyCount,
    PlantMotherWithVarieties,
    VarietySummary,
    VarietyCreateForMother,
    PlantProduct,
    PlantProductCreate,
    PlantProductUpdate,
    ProductCategory,
    ProductUnit,
)
from ...models.plant_data_enhanced import PlantDataEnhanced, PlantDataEnhancedCreate
from .plant_mother_repository import PlantMotherRepository
from .plant_data_enhanced_repository import PlantDataEnhancedRepository
from .plant_data_enhanced_service import PlantDataEnhancedService

logger = logging.getLogger(__name__)


class PlantMotherService:
    """Service for mother-plant (product) business logic"""

    @staticmethod
    async def create_mother(
        data: PlantMotherCreate,
        user_id: UUID,
        user_email: str,
        organization_id: Optional[str] = None,
        division_id: Optional[str] = None,
    ) -> PlantMother:
        """
        Create a new mother plant (product).

        Enforces the "at least one active sellable product" invariant (see
        `_ensure_active_sellable_default`'s docstring) on the products the
        mother is created with: if none of `data.products` is a `sellable`
        (every product in a create payload is implicitly active — `isActive`
        isn't part of `PlantProductCreate`), the server auto-adds one named
        after `plantName` after the insert. Callers that need to know
        whether that happened can recompute it cheaply from the request —
        `not any(p.category == ProductCategory.SELLABLE for p in data.products)`
        — rather than this method returning it, so its return type stays
        the plain `PlantMother` every existing caller already expects.

        Raises:
            HTTPException: 409 if a mother with the same plantName already exists.
        """
        existing = await PlantMotherRepository.get_by_name(data.plantName)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Mother plant '{data.plantName}' already exists",
            )

        initial_products = [
            PlantProduct(name=p.name, unit=p.unit, category=p.category)
            for p in data.products
        ]

        mother = await PlantMotherRepository.create(
            data,
            created_by=user_id,
            created_by_email=user_email,
            organization_id=organization_id,
            division_id=division_id,
            products=initial_products,
        )

        mother, _auto_seeded = await PlantMotherService._ensure_active_sellable_default(
            mother
        )

        logger.info(
            f"[PlantMother Service] User {user_id} created mother plant: "
            f"{mother.plantMotherId} - {mother.plantName} "
            f"(auto-seeded default sellable product: {_auto_seeded})"
        )
        return mother

    @staticmethod
    async def list_mothers(
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> Tuple[List[PlantMotherWithVarietyCount], int, int]:
        """
        List mother plants with varietyCount, search, and pagination.

        Returns:
            Tuple of (list of mothers w/ varietyCount, total count, total pages)
        """
        if per_page > 100:
            per_page = 100
        skip = (page - 1) * per_page

        rows, total = await PlantMotherRepository.list_mothers(
            skip=skip,
            limit=per_page,
            search=search,
            organization_id=organization_id,
        )
        mothers = [PlantMotherWithVarietyCount(**row) for row in rows]
        total_pages = (total + per_page - 1) // per_page if total else 0

        return mothers, total, total_pages

    @staticmethod
    async def get_mother(plant_mother_id: UUID) -> PlantMotherWithVarieties:
        """
        Get a mother plant by ID, with its active varieties embedded.

        Raises:
            HTTPException: 404 if not found or soft-deleted.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        varieties = await PlantDataEnhancedRepository.get_by_mother(
            plant_mother_id, active_only=True
        )
        variety_summaries = [
            VarietySummary(
                plantDataId=v.plantDataId,
                varietyName=v.varietyName,
                isActive=v.isActive,
            )
            for v in varieties
        ]

        return PlantMotherWithVarieties(
            **mother.model_dump(), varieties=variety_summaries
        )

    @staticmethod
    async def update_mother(
        plant_mother_id: UUID, update_data: PlantMotherUpdate
    ) -> PlantMother:
        """
        Update a mother plant. When plantName/scientificName change, cascades
        the new values down onto its varieties (plant_data_enhanced) and
        blocks'/block_archives' denormalized productName, so downstream
        display never freezes on a stale product name.

        Raises:
            HTTPException: 404 if not found; 409 if renaming onto a name
                already used by a different mother.
        """
        current = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not current:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        if update_data.plantName and update_data.plantName != current.plantName:
            name_clash = await PlantMotherRepository.get_by_name(update_data.plantName)
            if name_clash and name_clash.plantMotherId != current.plantMotherId:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Mother plant '{update_data.plantName}' already exists",
                )

        name_changed = (
            update_data.plantName is not None
            and update_data.plantName != current.plantName
        ) or (
            update_data.scientificName is not None
            and update_data.scientificName != current.scientificName
        )

        updated = await PlantMotherRepository.update(plant_mother_id, update_data)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mother plant not found or already deleted",
            )

        if name_changed:
            cascade_counts = await PlantMotherRepository.cascade_rename(
                plant_mother_id, updated.plantName, updated.scientificName
            )
            logger.info(
                f"[PlantMother Service] Cascaded rename for mother "
                f"{plant_mother_id} ('{updated.plantName}'): {cascade_counts}"
            )

        logger.info(f"[PlantMother Service] Updated mother plant: {plant_mother_id}")
        return updated

    @staticmethod
    async def delete_mother(plant_mother_id: UUID) -> None:
        """
        Soft-delete a mother plant.

        Raises:
            HTTPException: 404 if not found; 409 if it still has active
                varieties (the user must remove/move them first — this
                endpoint deliberately does not cascade-delete varieties).
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        active_varieties = await PlantDataEnhancedRepository.get_by_mother(
            plant_mother_id, active_only=True
        )
        if active_varieties:
            count = len(active_varieties)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Cannot delete mother plant '{mother.plantName}': "
                    f"{count} active variet{'y' if count == 1 else 'ies'} still "
                    f"reference it. Deactivate or reassign them first."
                ),
            )

        deleted = await PlantMotherRepository.soft_delete(plant_mother_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mother plant not found or already deleted",
            )

        logger.info(
            f"[PlantMother Service] Soft-deleted mother plant: {plant_mother_id}"
        )

    @staticmethod
    async def list_varieties(plant_mother_id: UUID) -> List[PlantDataEnhanced]:
        """
        List active varieties belonging to a mother.

        Raises:
            HTTPException: 404 if the mother doesn't exist / is soft-deleted.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        return await PlantDataEnhancedRepository.get_by_mother(
            plant_mother_id, active_only=True
        )

    @staticmethod
    async def create_variety_for_mother(
        plant_mother_id: UUID,
        variety_data: VarietyCreateForMother,
        user_id: UUID,
        user_email: str,
    ) -> PlantDataEnhanced:
        """
        Create a new variety (plant_data_enhanced doc) under a mother.

        Basic info (plantName/scientificName) is COPIED from the mother —
        never taken from the request, even if the client sends it (see
        VarietyCreateForMother's docstring). Detailed cultivation fields
        reuse PlantDataEnhancedService's validation
        (_validate_detail_fields) so both creation paths enforce identical
        rules.

        Raises:
            HTTPException: 404 if the mother doesn't exist / is soft-deleted;
                409 if a variety with the same varietyName already exists
                under this mother.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        existing = await PlantDataEnhancedRepository.get_by_mother_and_variety_name(
            plant_mother_id, variety_data.varietyName
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Variety '{variety_data.varietyName}' already exists under "
                    f"mother plant '{mother.plantName}'"
                ),
            )

        # Build the full create payload with basic info sourced from the
        # mother, not the request (exclude the client's plantName/
        # scientificName/varietyName entirely rather than merely overwriting
        # them, so there is no ambiguity about which value wins).
        detail_fields = variety_data.model_dump(
            exclude={"plantName", "scientificName", "varietyName"}
        )
        create_payload = PlantDataEnhancedCreate(
            plantName=mother.plantName,
            scientificName=mother.scientificName,
            **detail_fields,
        )

        PlantDataEnhancedService._validate_detail_fields(create_payload)

        variety = await PlantDataEnhancedRepository.create(
            create_payload,
            user_id,
            user_email,
            mother_plant_id=plant_mother_id,
            variety_name=variety_data.varietyName,
            # Reason (design doc §9 #3): a variety belongs to the same org
            # as its mother — stamping this closes the same cross-tenant
            # gap for the mother-scoped variety-create path as the
            # standalone POST /plant-data-enhanced route.
            organization_id=mother.organizationId,
        )

        logger.info(
            f"[PlantMother Service] User {user_id} created variety "
            f"{variety.plantDataId} ('{variety_data.varietyName}') under mother "
            f"{plant_mother_id} ('{mother.plantName}')"
        )
        return variety

    # ==================== Stage 1: products[] CRUD ====================
    #
    # See Docs/2-Working-Progress/plant-library-product-extension-design.md
    # §4.1. Products are embedded in the mother document, so every method
    # here fetches the whole mother, mutates its `products` list in Python,
    # and writes the whole list back via PlantMotherRepository.set_products
    # — there is no per-product collection to query directly.

    @staticmethod
    async def add_product(
        plant_mother_id: UUID, product_data: PlantProductCreate
    ) -> PlantProduct:
        """
        Add a product to a mother's products[] list.

        Raises:
            HTTPException: 404 if the mother doesn't exist / is soft-deleted;
                409 if a product with the same name (case-insensitive)
                already exists under this mother.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        PlantMotherService._check_product_name_available(mother, product_data.name)

        new_product = PlantProduct(
            name=product_data.name,
            unit=product_data.unit,
            category=product_data.category,
        )
        updated_mother = await PlantMotherRepository.set_products(
            plant_mother_id, mother.products + [new_product]
        )
        if not updated_mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mother plant not found or already deleted",
            )

        logger.info(
            f"[PlantMother Service] Added product {new_product.productId} "
            f"('{new_product.name}') to mother {plant_mother_id}"
        )
        return new_product

    @staticmethod
    async def list_products(
        plant_mother_id: UUID, active_only: bool = False
    ) -> List[PlantProduct]:
        """
        List a mother's products.

        Raises:
            HTTPException: 404 if the mother doesn't exist / is soft-deleted.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        if active_only:
            return [p for p in mother.products if p.isActive]
        return mother.products

    @staticmethod
    async def update_product(
        plant_mother_id: UUID, product_id: UUID, update_data: PlantProductUpdate
    ) -> PlantProduct:
        """
        Update a product's name/category/isActive. `unit` is not editable
        here (see PlantProductUpdate's docstring).

        Raises:
            HTTPException: 404 if the mother or product doesn't exist; 409
                if renaming onto a name (case-insensitive) already used by
                a different product under the same mother.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        target_index: Optional[int] = None
        for i, product in enumerate(mother.products):
            if product.productId == product_id:
                target_index = i
                break
        if target_index is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product not found: {product_id}",
            )

        if update_data.name is not None:
            PlantMotherService._check_product_name_available(
                mother, update_data.name, exclude_product_id=product_id
            )

        updated_fields = update_data.model_dump(exclude_unset=True)
        updated_product = mother.products[target_index].model_copy(
            update=updated_fields
        )

        # INVARIANT: at least one active sellable product. Renaming and
        # category swaps between process/waste are unaffected — this only
        # fires when the product being edited is the mother's LAST active
        # sellable AND the edit would stop it from counting (isActive ->
        # False, or category away from sellable). Covers both mutation
        # routes into this method: PATCH directly, and DELETE via
        # `deactivate_product` (which calls this with isActive=False).
        PlantMotherService._assert_keeps_active_sellable_product(
            mother, target_index, updated_product
        )

        mother.products[target_index] = updated_product

        updated_mother = await PlantMotherRepository.set_products(
            plant_mother_id, mother.products
        )
        if not updated_mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mother plant not found or already deleted",
            )

        logger.info(
            f"[PlantMother Service] Updated product {product_id} on mother "
            f"{plant_mother_id}"
        )
        return updated_product

    @staticmethod
    async def deactivate_product(
        plant_mother_id: UUID, product_id: UUID
    ) -> PlantProduct:
        """
        Deactivate a product ("delete"). Never removes it from products[] —
        mirrors the mother-delete precedent (refuse/deactivate, don't
        cascade — see PlantMotherService.delete_mother) so any future
        history referencing this productId stays intact.

        Raises:
            HTTPException: 404 if the mother or product doesn't exist.
        """
        return await PlantMotherService.update_product(
            plant_mother_id, product_id, PlantProductUpdate(isActive=False)
        )

    @staticmethod
    def _check_product_name_available(
        mother: PlantMother,
        name: str,
        exclude_product_id: Optional[UUID] = None,
    ) -> None:
        """
        Raise 409 if `name` collides case-insensitively with an existing
        product under `mother`. `exclude_product_id` lets an update compare
        against every OTHER product without tripping on itself.
        """
        normalized = name.strip().lower()
        for product in mother.products:
            if (
                exclude_product_id is not None
                and product.productId == exclude_product_id
            ):
                continue
            if product.name.strip().lower() == normalized:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Product '{name}' already exists under mother plant "
                        f"'{mother.plantName}'"
                    ),
                )

    # ==================== "at least one active sellable product" invariant ====================
    #
    # New platform invariant (see the task that added this section): every
    # mother must always carry at least one product that is BOTH
    # `category == sellable` AND `isActive`. Without one, a block planted
    # under this mother has nothing valid to route a harvest to (design doc
    # §3: only `sellable` lines become `block_harvests` rows). The frontend
    # mirrors this same rule for pre-submit UX (grep "active sellable
    # product" there to find its half) — keep the two readable as a pair if
    # either changes.
    #
    # Two enforcement halves:
    #   - `_ensure_active_sellable_default` (create path): fills the gap by
    #     auto-adding a default sellable product — creation can never
    #     violate the invariant, it can only be satisfied automatically.
    #   - `_assert_keeps_active_sellable_product` (every later mutation
    #     path): refuses (409) any edit to an EXISTING product that would
    #     drop the mother below one active sellable product. Adding new
    #     products, renaming any product, and recategorising between
    #     process/waste are never blocked — only an edit that removes the
    #     LAST active sellable is.

    @staticmethod
    def _has_active_sellable_product(products: List[PlantProduct]) -> bool:
        """True if `products` contains at least one active sellable product."""
        return any(
            p.isActive and p.category == ProductCategory.SELLABLE for p in products
        )

    @staticmethod
    async def _ensure_active_sellable_default(
        mother: PlantMother,
    ) -> Tuple[PlantMother, bool]:
        """
        Guarantee `mother` has at least one active sellable product,
        auto-adding a default one if it doesn't. Called once, right after a
        mother is created (see `create_mother`) — this is what makes the
        invariant unconditionally true from the moment a mother exists,
        regardless of what products (if any) the client supplied.

        The auto-added product's `productId` is
        `uuid5(NAMESPACE_OID, str(mother.plantMotherId))` — deterministic,
        matching `scripts/migrations/plant_library_default_product_migration.py`'s
        `product_id_for_mother` scheme, so a mother that ends up seeded by
        either path (this auto-create, or the migration) gets the identical
        id for what is conceptually the same seeded product.

        Returns:
            Tuple of (mother with the invariant satisfied, whether a
            default product was actually added).
        """
        if PlantMotherService._has_active_sellable_product(mother.products):
            return mother, False

        default_product = PlantProduct(
            productId=uuid5(NAMESPACE_OID, str(mother.plantMotherId)),
            name=mother.plantName,
            unit=ProductUnit.KG,
            category=ProductCategory.SELLABLE,
            isActive=True,
        )
        updated_mother = await PlantMotherRepository.set_products(
            mother.plantMotherId, mother.products + [default_product]
        )
        if not updated_mother:
            # Reason: mother vanished between insert and this follow-up
            # write (soft-deleted concurrently) — extremely unlikely inside
            # a single create request, but surfacing 404 here is more
            # honest than silently returning the pre-write mother.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mother plant not found or already deleted",
            )

        logger.info(
            f"[PlantMother Service] Auto-seeded default sellable product "
            f"{default_product.productId} ('{default_product.name}') on "
            f"mother {mother.plantMotherId} — no active sellable product "
            f"was present"
        )
        return updated_mother, True

    @staticmethod
    def _assert_keeps_active_sellable_product(
        mother: PlantMother, target_index: int, updated_product: PlantProduct
    ) -> None:
        """
        Enforce the "at least one active sellable product" invariant on a
        product edit. Raises 409 if replacing
        `mother.products[target_index]` with `updated_product` would leave
        the mother with zero active sellable products.

        No-ops (never raises) unless the product being edited is CURRENTLY
        counted (active + sellable) AND the edit would stop it from
        counting (deactivated, or recategorised away from sellable) AND no
        OTHER product on the mother is active + sellable. Renaming, adding
        products, and category swaps between process/waste never trip this.
        """
        current = mother.products[target_index]
        was_active_sellable = (
            current.isActive and current.category == ProductCategory.SELLABLE
        )
        still_active_sellable = (
            updated_product.isActive
            and updated_product.category == ProductCategory.SELLABLE
        )
        if not was_active_sellable or still_active_sellable:
            return

        other_active_sellable = any(
            i != target_index and p.isActive and p.category == ProductCategory.SELLABLE
            for i, p in enumerate(mother.products)
        )
        if other_active_sellable:
            return

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot update product '{current.name}': it is the only "
                f"active sellable product on mother plant "
                f"'{mother.plantName}'. Every plant must keep at least one "
                f"active sellable product so its harvest can be recorded — "
                f"add or reactivate another sellable product before "
                f"removing this one."
            ),
        )
