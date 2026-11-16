"""Invigilation duty roster management, manual overrides, and recalculation routes."""
from typing import Optional

from fastapi import APIRouter, Query, status

from app.schemas.invigilation import DutyCreateIn, DutyGenerationIn, DutyUpdateIn
from app.services.invigilation_service import (
    create_manual_duty,
    delete_manual_duty,
    generate_duties,
    get_faculty_workload,
    get_roster_summary,
    get_slot_requirements,
    list_duties,
    recalculate_duties,
    update_manual_duty,
)

router = APIRouter(prefix="/api/invigilation", tags=["Invigilation Management"])


@router.get("/duties")
def list_invigilation_duties(
    slot_id: Optional[str] = Query(None),
    instructor: Optional[str] = Query(None),
):
    """Lists current invigilation duties with slot, room, and policy metadata."""
    return list_duties(slot_id=slot_id, instructor=instructor)


@router.get("/roster")
def get_invigilation_roster():
    """Returns the roster, validation health, slot coverage, and faculty workload."""
    return get_roster_summary()


@router.get("/faculty")
def get_invigilation_faculty():
    """Returns eligible faculty, ECR exemptions, and current duty counts."""
    return get_faculty_workload()


@router.get("/slots/{slot_id}/requirements")
def get_invigilation_slot_requirements(slot_id: str):
    """Returns room-by-room staffing requirements and coverage for one slot."""
    return get_slot_requirements(slot_id)


@router.post("/generate")
def generate_invigilation_duties(payload: DutyGenerationIn):
    """Auto-generates duties enforcing staffing ratios, ECR exemptions, and the cap."""
    return generate_duties(
        slot_ids_filter=payload.slot_ids,
        preserve_manual=payload.preserve_manual,
        duty_cap=payload.duty_cap,
        release_invalid_manual=payload.release_invalid_manual,
    )


@router.post("/recalculate")
def recalculate_invigilation_duties(payload: DutyGenerationIn):
    """Recalculates the roster while preserving valid manual overrides by default."""
    return recalculate_duties(
        slot_ids_filter=payload.slot_ids,
        preserve_manual=payload.preserve_manual,
        duty_cap=payload.duty_cap,
        release_invalid_manual=payload.release_invalid_manual,
    )


@router.post("/duties", status_code=status.HTTP_201_CREATED)
def create_invigilation_duty(payload: DutyCreateIn):
    """Creates a manual assignment after validating every hard roster rule."""
    return create_manual_duty(payload.model_dump())


@router.patch("/duties/{duty_id}")
def update_invigilation_duty(duty_id: str, payload: DutyUpdateIn):
    """Updates a duty (usually a teacher replacement) and preserves it on recalc."""
    return update_manual_duty(duty_id, payload.model_dump(exclude_unset=True))


@router.put("/duties/{duty_id}")
def replace_invigilation_duty(duty_id: str, payload: DutyUpdateIn):
    """PUT alias for updating a duty."""
    return update_manual_duty(duty_id, payload.model_dump(exclude_unset=True))


@router.delete("/duties/{duty_id}")
def delete_invigilation_duty(duty_id: str):
    """Deletes a duty only when its room remains fully staffed."""
    return delete_manual_duty(duty_id)
