"""Seating Plan Matrix and DCS Seating Sheet routes."""
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from exports import seating_xlsx
from app.services.seating_service import (
    resolve_seating_plan,
    save_custom_seating_plan as save_plan_service,
    regenerate_seating_plan as regenerate_plan_service,
)

router = APIRouter(prefix="/api/seating-plan", tags=["Seating Plan Management"])


@router.get("")
def get_seating_plan(slot_id: str = Query(..., description="ID of the time slot")):
    """Resolves and returns the seating plan matrix for an examination slot."""
    return resolve_seating_plan(slot_id)


@router.put("")
def save_custom_seating_plan(payload: dict):
    """Saves interactive manual adjustments to the seating plan in SQLite and synchronizes datesheet."""
    return save_plan_service(payload)


@router.post("/generate")
def regenerate_seating_plan(slot_id: str = Query(..., description="ID of the time slot")):
    """Clears custom seating overrides for the slot and recalculates algorithmic layout."""
    return regenerate_plan_service(slot_id)


@router.get("/export.xlsx")
def export_seating_plan_xlsx(slot_id: str = Query(..., description="ID of the time slot")):
    """Downloads official DCS Seating Sheet in Excel format."""
    plan = resolve_seating_plan(slot_id)
    buf = seating_xlsx(plan)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="IIUI_Seating_Arrangement_{slot_id}.xlsx"'},
    )
