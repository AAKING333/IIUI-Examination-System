"""Invigilation duty roster management and auto-generation routes."""
from typing import Optional
from fastapi import APIRouter, Query

from database import database
from app.schemas.invigilation import DutyGenerationIn
from app.services.invigilation_service import generate_duties

router = APIRouter(prefix="/api/invigilation", tags=["Invigilation Management"])


@router.get("/duties")
def list_invigilation_duties(
    slot_id: Optional[str] = Query(None),
    instructor: Optional[str] = Query(None),
):
    """Lists current invigilation duties optionally filtered by slot or instructor."""
    return database.get_invigilation_duties(slot_id=slot_id, instructor=instructor)


@router.post("/generate")
def generate_invigilation_duties(payload: DutyGenerationIn):
    """Auto-generates duties enforcing 4-duty cap, ECR exemptions, and lab ownership."""
    return generate_duties(payload.slot_ids)
