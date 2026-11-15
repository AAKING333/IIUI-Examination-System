"""Unfair Means Case (UMC) reporting and disciplinary workflow routes."""
import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from data import store
from database import database
from exports import umc_report_pdf
from app.schemas.umc import UMCReportIn, UMCReportUpdateIn
from app.state import datesheet_state
from app.services.seating_service import resolve_seating_plan

router = APIRouter(prefix="/api/umc", tags=["UMC Reports"])


@router.get("")
def list_umc_reports(
    report_status: Optional[str] = Query(None, alias="status"),
    roll_no: Optional[str] = Query(None),
):
    """Lists UMC reports with optional status and roll number filters."""
    return database.get_umc_reports(status=report_status, roll_no=roll_no)


@router.get("/{report_id}")
def get_umc_report(report_id: int):
    """Retrieves single UMC report case by ID."""
    report = database.get_umc_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="UMC report not found.")
    return report


@router.post("", status_code=status.HTTP_201_CREATED)
def create_umc_report(report: UMCReportIn):
    """Files a new disciplinary UMC report verifying scheduling, assigned room, and invigilator."""
    if datesheet_state.get("status") != "PUBLISHED":
        raise HTTPException(status_code=409, detail="A published, current datesheet is required to file a UMC report.")
    if not report.evidence:
        raise HTTPException(status_code=400, detail="At least one evidence photo or evidence reference is required.")
    student = store.get_student(report.roll_no)
    if not student:
        student = next((item for item in store.get_students() if item["roll_no"].lower() == report.roll_no.lower()), None)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student '{report.roll_no}' was not found.")
    matching_entry = next((
        entry for entry in datesheet_state.get("datesheet", [])
        if entry["slot_id"] == report.slot_id
        and entry["course_code"] == report.course_code.strip().upper()
        and entry.get("program") == student["program"]
        and entry.get("batch") == student["batch"]
        and student.get("section") in entry.get("sections", [entry.get("section")])
    ), None)
    course = store.get_course(report.course_code)
    if not matching_entry or not course or student["roll_no"] not in course["student_roll_numbers"]:
        raise HTTPException(status_code=400, detail="The student is not scheduled for this course and slot.")
    if not any(
        duty["slot_id"] == report.slot_id
        and duty["room_id"] == report.room_id
        and duty["instructor"] == report.invigilator
        for duty in database.get_invigilation_duties(slot_id=report.slot_id)
    ):
        raise HTTPException(status_code=403, detail="The reporting invigilator is not assigned to this hall and slot.")
    plan = resolve_seating_plan(report.slot_id)
    seated_in_room = any(
        room["room_id"] == report.room_id
        and any(cell and cell["roll_no"] == student["roll_no"] for row in room.get("grid", []) for cell in row)
        for room in plan.get("rooms", [])
    )
    if not seated_in_room:
        raise HTTPException(status_code=400, detail="The student is not seated in the reported room for this slot.")
    values = report.model_dump()
    values["roll_no"] = student["roll_no"]
    values["course_code"] = report.course_code.strip().upper()
    created = database.create_umc_report(values, datetime.datetime.now().isoformat())
    return {**created, "alert": "UMC report is available to the ECR desk."}


@router.patch("/{report_id}")
def update_umc_report(report_id: int, update: UMCReportUpdateIn):
    """Progresses UMC report through departmental workflow."""
    current = database.get_umc_report(report_id)
    if not current:
        raise HTTPException(status_code=404, detail="UMC report not found.")
    values = update.model_dump(exclude_unset=True)
    next_status = values.get("status")
    if next_status:
        allowed_transitions = {
            "reported": "statement_recorded",
            "statement_recorded": "instructor_reviewed",
            "instructor_reviewed": "approved",
        }
        if allowed_transitions.get(current["status"]) != next_status:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot move a {current['status']} report directly to {next_status}.",
            )
        if next_status == "statement_recorded" and not (
            values.get("student_statement", current["student_statement"]).strip()
            and values.get("invigilator_remarks", current["invigilator_remarks"]).strip()
        ):
            raise HTTPException(status_code=400, detail="Record both the student statement and invigilator remarks first.")
        if next_status == "instructor_reviewed" and not values.get("instructor_comments", current["instructor_comments"]).strip():
            raise HTTPException(status_code=400, detail="Instructor comments are required for course review.")
        values["status"] = next_status
    return database.update_umc_report(report_id, values, datetime.datetime.now().isoformat())


@router.get("/{report_id}/pdf")
def export_umc_report_pdf(report_id: int):
    """Exports approved UMC dossier to official printable PDF."""
    report = database.get_umc_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="UMC report not found.")
    if report["status"] != "approved":
        raise HTTPException(status_code=409, detail="The UMC dossier can be exported after departmental approval.")
    student = store.get_student(report["roll_no"])
    report["student_name"] = student["name"] if student else "Unknown"
    buffer = umc_report_pdf(report)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="IIUI_UMC_Case_{report_id}.pdf"'},
    )
