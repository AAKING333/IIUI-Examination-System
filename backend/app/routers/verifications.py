"""Student examination verification roster routes."""
from typing import Optional
from fastapi import APIRouter, Query

from app.state import datesheet_state
from app.services.verification_service import compile_student_exam_allocations

router = APIRouter(prefix="/api/student-verifications", tags=["Student Verification"])


@router.get("")
def get_student_verifications(search: Optional[str] = Query(None)):
    """Administrative verification list of student exam allocations."""
    if not datesheet_state.get("datesheet"):
        return []
    records = compile_student_exam_allocations()
    if search:
        q = search.lower().strip()
        records = [r for r in records if q in r["roll_no"].lower() or q in r["name"].lower()]
    return records
