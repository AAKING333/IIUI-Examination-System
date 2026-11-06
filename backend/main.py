"""
main.py
-------
FastAPI backend for International Islamic University, Islamabad (IIUI)
Department of Computer Science & Information Technology (Male Campus).
Phase 1 Examination Management Portal.
"""

from __future__ import annotations
import sys
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_SITE = os.path.join(_HERE, "site-packages")
if _SITE not in sys.path:
    sys.path.insert(0, _SITE)

import io
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from data_generator import (
    generate_rooms,
    generate_students,
    generate_courses_and_enrollments,
    generate_time_slots,
)
from scheduler import generate_datesheet, find_teacher_conflicts, SchedulingError
from seating_engine import generate_seating_plans, SeatingError
from excel_exporter import generate_excel

_DATA: Dict[str, Any] = {}


def _load_data() -> None:
    """Populates IIUI dummy data on startup."""
    rooms = generate_rooms()
    students = generate_students(count=240)
    courses, enrollments = generate_courses_and_enrollments(students)
    slots = generate_time_slots()

    _DATA.update(
        rooms=rooms,
        students=students,
        courses=courses,
        enrollments=enrollments,
        slots=slots,
        schedule=None,
        seating_plans=None,
        generated_at=None,
    )
    print(
        f"[IIUI Startup] Loaded {len(rooms)} Halls | {len(students)} Male Students | "
        f"{len(courses)} Courses | {len(enrollments)} Enrollments"
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_data()
    try:
        yield
    finally:
        _DATA.clear()


app = FastAPI(
    title="IIUI CS&IT Exam Management Portal",
    version="1.2.0",
    description="Automated Datesheet & Seating Plan System (Male Campus).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_generation() -> None:
    """Generates the clash-free datesheet and synchronized seating plans."""
    try:
        schedule = generate_datesheet(
            courses=_DATA["courses"],
            enrollments=_DATA["enrollments"],
            slots=_DATA["slots"],
            rooms=_DATA["rooms"],
        )
    except SchedulingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        seating = generate_seating_plans(
            schedule=schedule,
            enrollments=_DATA["enrollments"],
            students=_DATA["students"],
            rooms=_DATA["rooms"],
        )
    except SeatingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Post-generation safety check: the scheduler already guards against this,
    # but a real conflict here means a scheduling bug and must never be shipped.
    teacher_conflicts = find_teacher_conflicts(schedule)
    if teacher_conflicts:
        detail = "; ".join(
            f"{c['instructor']} on {c['date']} {c['slot_name']} "
            f"({c['course_a']} vs {c['course_b']})"
            for c in teacher_conflicts
        )
        raise HTTPException(
            status_code=500,
            detail=f"Generated datesheet has instructor double-booking: {detail}",
        )

    missing_rooms = [
        f"{e['course_code']} ({e['date']} {e['slot_name']})"
        for e in schedule
        if not e.get("allocated_rooms")
    ]
    if missing_rooms:
        raise HTTPException(
            status_code=500,
            detail="Seating engine did not allocate rooms for: " + ", ".join(missing_rooms),
        )

    _DATA["schedule"] = schedule
    _DATA["seating_plans"] = seating
    _DATA["generated_at"] = datetime.now(timezone.utc).isoformat()


def _build_warnings(schedule: List[Dict], seating: List[Dict]) -> List[str]:
    warnings: List[str] = []
    fallback_plans = [p for p in seating if p.get("rule_mode") == "fallback"]
    if fallback_plans:
        total_cols = sum(int(p.get("fallback_columns", 0)) for p in fallback_plans)
        warnings.append(
            f"{len(fallback_plans)} seating plan(s) used the constrained fallback rule "
            f"({total_cols} column(s) with the same course and a different instructor)."
        )
    if schedule and not all(e.get("one_per_day_enforced", True) for e in schedule):
        warnings.append(
            "The strict one-exam-per-day rule could not be satisfied; some students "
            "may have more than one exam on the same day."
        )
    return warnings


@app.get("/api/generate", summary="Run Clash-Free Scheduling & Seating Engine")
def api_generate() -> JSONResponse:
    _run_generation()

    schedule = _DATA["schedule"]
    seating = _DATA["seating_plans"]

    slim_seating = []
    for plan in seating:
        slim_seating.append({
            k: v for k, v in plan.items() if k != "grid"
        })

    teacher_conflicts = find_teacher_conflicts(schedule)
    expected_seats = sum(int(e.get("enrolled_count", 0)) for e in schedule)
    seated = sum(len(p["seats"]) for p in seating)
    unseated_students = max(expected_seats - seated, 0)
    fallback_plans = [
        {
            "date": p["date"],
            "slot_name": p["slot_name"],
            "room_id": p["room_id"],
            "fallback_columns": int(p.get("fallback_columns", 0)),
        }
        for p in seating
        if p.get("rule_mode") == "fallback"
    ]

    return JSONResponse({
        "institution": {
            "name": "International Islamic University, Islamabad",
            "department": "Department of Computer Science & Information Technology",
            "campus": "Male Campus",
            "session": "Midterm Exams - Fall 2026",
            "version": "1.2",
        },
        "meta": {
            "rooms": len(_DATA["rooms"]),
            "students": len(_DATA["students"]),
            "courses": len(_DATA["courses"]),
            "enrollments": len(_DATA["enrollments"]),
            "slots": len(_DATA["slots"]),
            "scheduled_courses": len(schedule),
            "seating_plans": len(seating),
            "fallback_plans": len(fallback_plans),
            "unseated_students": unseated_students,
            "teacher_conflicts": len(teacher_conflicts),
        },
        "generated_at": _DATA.get("generated_at"),
        "warnings": _build_warnings(schedule, seating),
        "fallback_plans": fallback_plans,
        "teacher_conflicts": teacher_conflicts,
        "courses": _DATA["courses"],
        "rooms": _DATA["rooms"],
        "schedule": schedule,
        "seating_plans": slim_seating,
    })


@app.get("/api/download-excel", summary="Download Official IIUI Examination Excel Workbook")
def api_download_excel() -> StreamingResponse:
    if _DATA.get("schedule") is None:
        _run_generation()

    xlsx_bytes = generate_excel(
        schedule=_DATA["schedule"],
        seating_plans=_DATA["seating_plans"],
        students=_DATA["students"],
    )

    headers = {
        "Content-Disposition": 'attachment; filename="IIUI_Exam_Schedule_Seating_Report.xlsx"',
    }
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.get("/api/health", summary="Health Check")
def api_health():
    return {"status": "ok", "campus": "IIUI Male Campus", "version": "1.2.0"}


# ── Student Roll Number Slips ───────────────────────────────────────────────

def _ensure_data() -> None:
    """Guarantee the in-memory dataset exists (useful outside the lifespan)."""
    if not _DATA:
        _load_data()


def _program_from_batch(batch: str) -> str:
    if batch.startswith("BSCS"):
        return "BS Computer Science"
    if batch.startswith("BSIT"):
        return "BS Information Technology"
    return batch


@app.get("/api/students", summary="List Students for the Roll Slip Picker")
def api_students():
    _ensure_data()
    return {
        "students": [
            {
                "student_id": s["student_id"],
                "roll_no": s["roll_no"],
                "name": s["name"],
                "batch": s["batch"],
            }
            for s in _DATA["students"]
        ]
    }


@app.get("/api/roll-slip/{roll_no}", summary="Generate a Student Roll Number Slip")
def api_roll_slip(roll_no: str):
    _ensure_data()

    student = next(
        (
            s
            for s in _DATA["students"]
            if s["roll_no"].lower() == roll_no.strip().lower()
        ),
        None,
    )
    if student is None:
        raise HTTPException(
            status_code=404,
            detail=f"No student found with roll number {roll_no!r}.",
        )

    if _DATA.get("schedule") is None:
        _run_generation()

    courses_by_id = {c["course_id"]: c for c in _DATA["courses"]}
    exams = []
    for plan in _DATA["seating_plans"]:
        for seat in plan["seats"]:
            if seat["student_id"] != student["student_id"]:
                continue
            course = courses_by_id.get(seat["course_id"], {})
            seat_no = (seat["row"] - 1) * plan["cols"] + seat["col"]
            exams.append({
                "course_id": seat["course_id"],
                "course_code": seat["course_code"],
                "course_name": course.get("name", seat["course_code"]),
                "instructor": seat.get("instructor", ""),
                "section": seat.get("section", ""),
                "slot_id": plan["slot_id"],
                "date": plan["date"],
                "day_label": plan["day_label"],
                "slot_name": plan["slot_name"],
                "time": plan["time"],
                "room_id": plan["room_id"],
                "room_rows": plan["rows"],
                "room_cols": plan["cols"],
                "seat_row": seat["row"],
                "seat_col": seat["col"],
                "seat_label": f"Row {seat['row']}, Col {seat['col_label']}",
                "seat_no": seat_no,
            })

    exams.sort(key=lambda e: (e["date"], e["slot_id"], e["room_id"]))

    halls = list(dict.fromkeys(e["room_id"] for e in exams))
    return {
        "institution": {
            "name": "International Islamic University, Islamabad",
            "department": "Department of Computer Science & Information Technology",
            "campus": "Male Campus",
            "session": "Midterm Exams - Fall 2026",
        },
        "generated_at": _DATA.get("generated_at"),
        "student": {
            "student_id": student["student_id"],
            "roll_no": student["roll_no"],
            "name": student["name"],
            "batch": student["batch"],
            "program": _program_from_batch(student["batch"]),
            "campus": student.get("campus", "Male Campus, IIUI"),
        },
        "exams": exams,
        "summary": {
            "total_exams": len(exams),
            "total_halls": len(halls),
            "halls": halls,
            "first_exam": exams[0] if exams else None,
            "last_exam": exams[-1] if exams else None,
        },
    }



# Mount production React build if present
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="spa")
