"""Exam Management Portal — FastAPI Production Backend Entry Point.

Clean, modular, enterprise application entry point:
- Sets up FastAPI instance, OpenAPI metadata, and CORS
- Registers domain routers (Rooms, Courses, Assignments, Students, Slots, Datesheet, Seating, Duties, UMC, Roll Slips)
- Automates master data persistence middleware
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from data import store
from database import database
from exports import datesheet_xlsx, datesheet_pdf, seating_xlsx, roll_slip_pdf, roll_slips_pdf, umc_report_pdf
from app.config import logger
from app.state import datesheet_state, seating_cache, clear_cache, supersede_state
from app.routers import ALL_ROUTERS
from app.services import (
    sync_datesheet_rooms,
    resolve_seating_plan,
    save_custom_seating_plan,
    regenerate_seating_plan,
    generate_datesheet_schedule,
    get_datesheet_with_synced_rooms,
    compile_datesheet_xlsx_buffer,
    compile_datesheet_pdf_buffer,
    generate_duties,
    compile_student_exam_allocations,
    get_roll_slip_payload,
)
from app.schemas import (
    RoomIn,
    CourseIn,
    CourseUpdateIn,
    InstructorAssignmentIn,
    InstructorAssignmentUpdateIn,
    EnrolmentItem,
    StudentIn,
    StudentUpdateIn,
    TimeSlotIn,
    AutoGenerateSlotsIn,
    SlotPresetIn,
    BulkDeleteSlotsIn,
    BulkShiftSlotsIn,
    DutyGenerationIn,
    UMCReportIn,
    UMCReportUpdateIn,
)

app = FastAPI(
    title="IIUI Exam Management Portal API",
    description="Enterprise API for managing examination datesheets, rooms, student enrolments, and DCS seating arrangements.",
    version="2.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.middleware("http")
async def persist_master_data(request, call_next):
    """Automatically persists master data and supersedes schedules on CRUD alterations."""
    global datesheet_state
    response = await call_next(request)
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and response.status_code < 400:
        store.save()
        path = request.url.path
        master_data_changed = path.startswith((
            "/api/rooms", "/api/courses", "/api/instructor-assignments",
            "/api/students", "/api/time-slots",
        ))
        if master_data_changed:
            superseded = database.supersede_datesheet()
            if superseded:
                datesheet_state.clear()
                datesheet_state.update(superseded)
            clear_cache()
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all domain routers
for router in ALL_ROUTERS:
    app.include_router(router)

logger.info("Exam Management Portal API initialized with %d domain routers.", len(ALL_ROUTERS))


# --------------------------------------------------------------------------
# Backward-compatibility exports for test suites and existing script imports
# --------------------------------------------------------------------------
import sys
import app.state as app_state

_resolve_seating_plan = resolve_seating_plan
_sync_datesheet_rooms = sync_datesheet_rooms
_compile_student_exam_allocations = compile_student_exam_allocations
generate_datesheet_endpoint = generate_datesheet_schedule


def generate_invigilation_duties(payload):
    slot_ids = getattr(payload, "slot_ids", []) if hasattr(payload, "slot_ids") else payload.get("slot_ids", [])
    return generate_duties(slot_ids)


def export_datesheet_xlsx():
    buf = compile_datesheet_xlsx_buffer()
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="IIUI_Midterm_Exam_Datesheet_Fall_2026.xlsx"'},
    )


def export_datesheet_pdf():
    buf = compile_datesheet_pdf_buffer()
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="IIUI_Midterm_Exam_Datesheet_Fall_2026.pdf"'},
    )


class _MainModule(sys.modules[__name__].__class__):
    @property
    def datesheet_state(self):
        return app_state.datesheet_state

    @datesheet_state.setter
    def datesheet_state(self, val):
        app_state.datesheet_state.clear()
        if isinstance(val, dict):
            app_state.datesheet_state.update(val)

    @property
    def seating_cache(self):
        return app_state.seating_cache

    @seating_cache.setter
    def seating_cache(self, val):
        app_state.seating_cache.clear()
        if isinstance(val, dict):
            app_state.seating_cache.update(val)


sys.modules[__name__].__class__ = _MainModule

