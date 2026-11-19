"""Datesheet Generation, Inspection, and Export routes."""
from typing import Optional
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from database import database
from app.routers.time_slots import get_lab_mode
from app.services.datesheet_service import (
    generate_datesheet_schedule,
    get_datesheet_with_synced_rooms,
    compile_datesheet_xlsx_buffer,
    compile_datesheet_pdf_buffer,
)

router = APIRouter(prefix="/api/datesheet", tags=["Datesheet Management"])


@router.post("/generate")
def generate_datesheet_endpoint(
    lab_mode: Optional[str] = Query(
        None,
        description="Lab scheduling mode: separate_days or concurrent. Defaults to the choice saved when slots were generated.",
    ),
):
    """Generates the clash-free exam schedule and synchronizes active room allocations."""
    return generate_datesheet_schedule(lab_mode=lab_mode or get_lab_mode())


@router.get("")
def get_current_datesheet():
    """Retrieves current datesheet with real-time room synchronization."""
    return get_datesheet_with_synced_rooms()


@router.get("/versions")
def get_datesheet_versions():
    """Lists published datesheet version history from database."""
    return database.get_datesheet_versions()


@router.get("/export.xlsx")
def export_datesheet_xlsx():
    """Downloads official IIUI examination datesheet in Excel format."""
    buf = compile_datesheet_xlsx_buffer()
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="IIUI_Midterm_Exam_Datesheet_Fall_2026.xlsx"'},
    )


@router.get("/export.pdf")
def export_datesheet_pdf():
    """Downloads official IIUI examination datesheet in PDF format."""
    buf = compile_datesheet_pdf_buffer()
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="IIUI_Midterm_Exam_Datesheet_Fall_2026.pdf"'},
    )
