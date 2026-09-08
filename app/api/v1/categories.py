"""Public category taxonomy for the directory."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.visibility import visible_businesses
from app.models.business import Business
from app.models.category import Category
from app.schemas.directory import CategoryOut

router = APIRouter(prefix="/categories", tags=["directory"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    parent_id: int | None = Query(
        default=None,
        description=(
            "Return the children of this category. Omit for the root level."
        ),
    ),
    db: Session = Depends(get_db),
) -> list[CategoryOut]:
    """List categories, with a count of the active listings in each.

    Public: the directory has to be browsable before anyone signs in.
    """
    # Counted in one grouped subquery rather than per-row correlated counts.
    #
    # Counts the listings search would actually return, not merely the active
    # ones: a tile promising "7 listings" that opens onto 5 results is a bug
    # report, and the two numbers drift the moment the visibility rule changes
    # in one place and not the other.
    counts = (
        visible_businesses(
            Business.category_id.label("category_id"),
            func.count(Business.id).label("n"),
        )
        .group_by(Business.category_id)
        .subquery()
    )

    stmt = (
        select(Category, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.category_id == Category.id)
        .order_by(Category.sort_order, Category.name)
    )
    # IS NULL rather than == None: the root level is "has no parent".
    stmt = stmt.where(
        Category.parent_id.is_(None)
        if parent_id is None
        else Category.parent_id == parent_id
    )

    return [
        CategoryOut(
            id=c.id,
            name=c.name,
            slug=c.slug,
            parent_id=c.parent_id,
            description=c.description,
            icon=c.icon,
            business_count=n,
        )
        for c, n in db.execute(stmt).all()
    ]
