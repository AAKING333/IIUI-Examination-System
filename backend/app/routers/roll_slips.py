"""Student Roll Number Slips API and consolidated PDF generation routes."""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from data import store
from exports import roll_slip_pdf, roll_slips_pdf
from app.state import datesheet_state
from app.services.datesheet_service import generate_datesheet_schedule
from app.services.verification_service import compile_student_exam_allocations, get_roll_slip_payload

router = APIRouter(prefix="/api", tags=["Student Roll Slips"])


@router.get("/roll-slip/{roll_no}")
def get_student_roll_slip(roll_no: str):
    """Retrieve full official roll number slip details with assigned seats for a student."""
    clean_roll = roll_no.strip()
    if not datesheet_state.get("datesheet"):
        slots = store.get_time_slots()
        if slots and store.get_courses():
            generate_datesheet_schedule()

    return get_roll_slip_payload(clean_roll)


@router.get("/roll-slip/{roll_no}/pdf")
def export_student_roll_slip_pdf(roll_no: str):
    """Download official university PDF roll number slip for a specific student."""
    clean_roll = roll_no.strip()
    student = store.get_student(clean_roll)
    if not student:
        for s in store.get_students():
            if s["roll_no"].lower() == clean_roll.lower():
                student = s
                break
    if not student:
        raise HTTPException(status_code=404, detail=f"No student found with roll number '{roll_no}'.")

    if not datesheet_state.get("datesheet"):
        slots = store.get_time_slots()
        if slots and store.get_courses():
            generate_datesheet_schedule()
    if datesheet_state.get("status") == "SUPERSEDED":
        raise HTTPException(status_code=409, detail="This slip belongs to a superseded datesheet. Generate and publish a new datesheet.")

    records = compile_student_exam_allocations()
    matched = next((r for r in records if r["roll_no"].lower() == clean_roll.lower()), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No examination allocations found for '{roll_no}'.")

    matched["issue_date"] = datetime.now().strftime("%d-%b-%Y")
    buf = roll_slip_pdf(matched)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Roll_No_Slip_{clean_roll}.pdf"'},
    )


@router.get("/roll-slips/all-pdf")
def export_all_students_roll_slips_pdf(
    program: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    course_code: Optional[str] = Query(None),
    roll_no: Optional[str] = Query(None),
):
    """Download single consolidated PDF containing official roll number slips for ALL enrolled students."""
    if not datesheet_state.get("datesheet"):
        slots = store.get_time_slots()
        if slots and store.get_courses():
            generate_datesheet_schedule()
    if datesheet_state.get("status") == "SUPERSEDED":
        raise HTTPException(status_code=409, detail="Roll slips cannot be issued from a superseded datesheet.")

    records = compile_student_exam_allocations()
    records = [
        record for record in records
        if (not program or record["program"].lower() == program.lower())
        and (not batch or record["batch"].lower() == batch.lower())
        and (not section or record["section"].lower() == section.lower())
        and (not roll_no or roll_no.lower() in record["roll_no"].lower())
        and (not course_code or any(
            paper["course_code"].lower() == course_code.lower()
            for paper in record["papers"]
        ))
    ]
    if not records:
        raise HTTPException(
            status_code=404,
            detail="No examination allocations found. Please generate the datesheet first.",
        )

    issue_date = datetime.now().strftime("%d-%b-%Y")
    for r in records:
        r["issue_date"] = issue_date

    buf = roll_slips_pdf(records)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="IIUI_All_Students_Roll_Number_Slips.pdf"'},
    )
