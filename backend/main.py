"""Exam Management Portal — FastAPI Production Backend.

Provides full RESTful CRUD operations and scheduling engines:
- Rooms Management & Capacity
- Courses Management & Batches
- Students & Enrolments (Regular & Back-paper status)
- Exam Time Slots Management
- Back-paper conflict-free Datesheet Generation & IIUI Excel Export
- Paper-aware best-fit Seating Plan Matrix & DCS Seating Sheet Excel Export
- Student Examination Verification & Audit
"""
import copy
import datetime
import io
import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from data import store, enrolment_type
from datesheet import generate_datesheet
from seating import build_seating_plan
from exports import datesheet_xlsx, seating_xlsx
from exports import datesheet_xlsx, seating_xlsx, roll_slip_pdf, roll_slips_pdf

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("exam_portal")

app = FastAPI(
    title="IIUI Exam Management Portal API",
    description="Administrative API for managing exam datesheets, rooms, student enrolments, and seating arrangements.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory execution state
datesheet_state = {"datesheet": [], "unplaced": [], "total_capacity_per_slot": 0}
seating_cache = {}  # slot_id -> seating plan dict


# --------------------------------------------------------------------------
# Request & Response Schemas
# --------------------------------------------------------------------------
class RoomIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, example="Room A")
    rows: int = Field(..., gt=0, le=50, example=6)
    columns: int = Field(..., gt=0, le=50, example=10)
    capacity: Optional[int] = Field(None, gt=0, le=2500, description="Optional override. Defaults to rows * columns.")


class CourseIn(BaseModel):
    code: str = Field(..., min_length=2, max_length=20, example="CS101")
    title: str = Field(..., min_length=2, max_length=150, example="Introduction to Programming")
    credit_hours: int = Field(3, ge=1, le=6, example=3)


class CourseUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=150)
    credit_hours: Optional[int] = Field(None, ge=1, le=6)


class InstructorAssignmentIn(BaseModel):
    program: str = Field(..., min_length=2, max_length=50, example="BSIT")
    batch: str = Field(..., min_length=2, max_length=20, example="F23")
    section: str = Field(..., min_length=1, max_length=10, example="A")
    course_code: str = Field(..., min_length=2, max_length=20, example="CS201")
    instructor: str = Field(..., min_length=2, max_length=120, example="Dr. Adeel")


class InstructorAssignmentUpdateIn(BaseModel):
    program: Optional[str] = Field(None, min_length=2, max_length=50)
    batch: Optional[str] = Field(None, min_length=2, max_length=20)
    section: Optional[str] = Field(None, min_length=1, max_length=10)
    course_code: Optional[str] = Field(None, min_length=2, max_length=20)
    instructor: Optional[str] = Field(None, min_length=2, max_length=120)


class EnrolmentItem(BaseModel):
    course: str = Field(..., min_length=2, max_length=20, example="CS101")
    type: str = Field("regular", pattern="^(regular|back)$", example="regular")


class StudentIn(BaseModel):
    roll_no: str = Field(..., min_length=3, max_length=30, example="2024-CS-097")
    name: str = Field(..., min_length=2, max_length=100, example="Tariq Mansoor")
    father_name: str = Field(..., min_length=2, max_length=100, example="Mansoor Ahmed")
    program: str = Field("BSIT", min_length=2, max_length=50, example="BSIT")
    batch: str = Field("F23", min_length=2, max_length=20, example="F23")
    section: str = Field("A", min_length=1, max_length=10, example="A")
    faculty: str = Field("Computing and Information Technology", min_length=2, max_length=120)
    enrolments: List[EnrolmentItem] = Field(default_factory=list)


class StudentUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    father_name: Optional[str] = Field(None, min_length=2, max_length=100)
    program: Optional[str] = Field(None, min_length=2, max_length=50)
    batch: Optional[str] = Field(None, min_length=2, max_length=20)
    section: Optional[str] = Field(None, min_length=1, max_length=10)
    faculty: Optional[str] = Field(None, min_length=2, max_length=120)
    enrolments: Optional[List[EnrolmentItem]] = None


class TimeSlotIn(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", example="2026-11-10")
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", example="08:45")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", example="10:15")
    label: str = Field("", max_length=80, example="Morning 1")


class AutoGenerateSlotsIn(BaseModel):
    from_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", example="2026-11-10")
    to_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", example="2026-11-12")
    start_time: str = Field("08:30", pattern=r"^\d{2}:\d{2}$", example="08:30")
    end_time: str = Field("17:40", pattern=r"^\d{2}:\d{2}$", example="17:40")
    duration_minutes: int = Field(90, ge=15, le=360, example=90)
    break_minutes: int = Field(15, ge=0, le=180, example=15)
    skip_weekends: bool = Field(True, example=True)
    replace_existing: bool = Field(False, example=False)



# --------------------------------------------------------------------------
# System & Health
# --------------------------------------------------------------------------
@app.get("/api/health")
def get_health():
    rooms = store.get_rooms()
    courses = store.get_courses()
    students = store.get_students()
    slots = store.get_time_slots()
    assignments = store.get_instructor_assignments()

    total_capacity = sum(r["capacity"] for r in rooms)
    back_papers = sum(1 for s in students for e in s.get("enrolments", []) if e.get("type") == "back")

    return {
        "status": "healthy",
        "system": "IIUI Examination Management System",
        "environment": "production-ready",
        "timestamp": datetime.datetime.now().isoformat(),
        "students": len(students),
        "courses": len(courses),
        "rooms": len(rooms),
        "instructor_assignments": len(assignments),
        "total_capacity_per_slot": total_capacity,
        "time_slots": len(slots),
        "back_paper_students": back_papers,
        "datesheet_scheduled_count": len(datesheet_state["datesheet"]),
        "datesheet_unplaced_count": len(datesheet_state["unplaced"]),
    }


@app.post("/api/reset-data")
def reset_system_data():
    """Restores database to initial seed state."""
    global datesheet_state, seating_cache
    store.reset_to_seed()
    datesheet_state = {"datesheet": [], "unplaced": [], "total_capacity_per_slot": 0}
    seating_cache.clear()
    logger.info("System state restored to factory seed data.")
    return {"message": "Data restored to initial factory seed state successfully."}


# --------------------------------------------------------------------------
# Rooms CRUD
# --------------------------------------------------------------------------
@app.get("/api/rooms")
def list_rooms():
    return store.get_rooms()


@app.get("/api/rooms/{room_id}")
def get_room(room_id: str):
    room = store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")
    return room


@app.post("/api/rooms", status_code=status.HTTP_201_CREATED)
def create_room(room: RoomIn):
    try:
        new_room = store.add_room(room.name, room.rows, room.columns, room.capacity)
        seating_cache.clear()
        return new_room
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/rooms/{room_id}")
def update_room(room_id: str, room: RoomIn):
    updated = store.update_room(room_id, room.name, room.rows, room.columns, room.capacity)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")
    seating_cache.clear()
    return updated


@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: str):
    if len(store.get_rooms()) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only remaining examination room.")
    deleted = store.delete_room(room_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")
    seating_cache.clear()
    return {"message": f"Room '{room_id}' deleted successfully."}


# --------------------------------------------------------------------------
# Courses CRUD (purely code, title, credit_hours)
# --------------------------------------------------------------------------
@app.get("/api/courses")
def list_courses():
    return store.get_courses()


@app.get("/api/courses/{code}")
def get_course(code: str):
    c = store.get_course(code)
    if not c:
        raise HTTPException(status_code=404, detail=f"Course '{code}' not found.")
    return c


@app.post("/api/courses", status_code=status.HTTP_201_CREATED)
def create_course(course: CourseIn):
    try:
        new_course = store.add_course(
            code=course.code,
            title=course.title,
            credit_hours=course.credit_hours,
        )
        seating_cache.clear()
        return new_course
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/courses/{code}")
def update_course(code: str, course: CourseUpdateIn):
    updated = store.update_course(
        code=code,
        title=course.title,
        credit_hours=course.credit_hours,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Course '{code}' not found.")
    seating_cache.clear()
    return updated


@app.delete("/api/courses/{code}")
def delete_course(code: str):
    deleted = store.delete_course(code)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Course '{code}' not found.")
    seating_cache.clear()
    return {"message": f"Course '{code}' deleted successfully."}


# --------------------------------------------------------------------------
# Instructor Course Assignments CRUD (Program, Batch, Section, Course, Instructor)
# --------------------------------------------------------------------------
@app.get("/api/instructor-assignments")
def list_instructor_assignments(
    course_code: Optional[str] = Query(None, description="Filter by Course Code"),
    program: Optional[str] = Query(None, description="Filter by Degree Program"),
    batch: Optional[str] = Query(None, description="Filter by Batch"),
    section: Optional[str] = Query(None, description="Filter by Section"),
    instructor: Optional[str] = Query(None, description="Search by Instructor Name"),
):
    return store.get_instructor_assignments(
        course_code=course_code,
        program=program,
        batch=batch,
        section=section,
        instructor=instructor,
    )


@app.get("/api/instructor-assignments/{assignment_id}")
def get_instructor_assignment(assignment_id: str):
    item = store.get_instructor_assignment(assignment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Instructor assignment not found.")
    return item


@app.post("/api/instructor-assignments", status_code=status.HTTP_201_CREATED)
def create_instructor_assignment(assignment: InstructorAssignmentIn):
    try:
        new_item = store.add_instructor_assignment(
            program=assignment.program,
            batch=assignment.batch,
            section=assignment.section,
            course_code=assignment.course_code,
            instructor=assignment.instructor,
        )
        seating_cache.clear()
        return new_item
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/instructor-assignments/{assignment_id}")
def update_instructor_assignment(assignment_id: str, assignment: InstructorAssignmentUpdateIn):
    try:
        updated = store.update_instructor_assignment(
            assignment_id=assignment_id,
            program=assignment.program,
            batch=assignment.batch,
            section=assignment.section,
            course_code=assignment.course_code,
            instructor=assignment.instructor,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Instructor assignment not found.")
        seating_cache.clear()
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/instructor-assignments/{assignment_id}")
def delete_instructor_assignment(assignment_id: str):
    deleted = store.delete_instructor_assignment(assignment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Instructor assignment not found.")
    seating_cache.clear()
    return {"message": "Instructor assignment deleted successfully."}


# --------------------------------------------------------------------------
# Students & Enrolments CRUD (Program, Batch, Section)
# --------------------------------------------------------------------------
@app.get("/api/students")
def list_students(
    search: Optional[str] = Query(None, description="Search by Roll No or Student Name"),
    batch: Optional[str] = Query(None, description="Filter by Batch (e.g. F23)"),
    program: Optional[str] = Query(None, description="Filter by Program (e.g. BSIT)"),
    section: Optional[str] = Query(None, description="Filter by Section (e.g. A)"),
    course: Optional[str] = Query(None, description="Filter by enrolled course code"),
):
    return store.get_students(search=search, batch=batch, program=program, section=section, course=course)


@app.get("/api/students/{roll_no}")
def get_student(roll_no: str):
    student = store.get_student(roll_no)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student '{roll_no}' not found.")
    return student


@app.post("/api/students", status_code=status.HTTP_201_CREATED)
def create_student(student: StudentIn):
    try:
        enrols = [e.model_dump() for e in student.enrolments]
        created = store.add_student(
            roll_no=student.roll_no,
            name=student.name,
            father_name=student.father_name,
            program=student.program,
            batch=student.batch,
            section=student.section,
            faculty=student.faculty,
            enrolments=enrols,
        )
        seating_cache.clear()
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/students/{roll_no}")
def update_student(roll_no: str, student: StudentUpdateIn):
    enrols = [e.model_dump() for e in student.enrolments] if student.enrolments is not None else None
    updated = store.update_student(
        roll_no,
        name=student.name,
        father_name=student.father_name,
        program=student.program,
        batch=student.batch,
        section=student.section,
        faculty=student.faculty,
        enrolments=enrols,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Student '{roll_no}' not found.")
    seating_cache.clear()
    return updated


@app.delete("/api/students/{roll_no}")
def delete_student(roll_no: str):
    deleted = store.delete_student(roll_no)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Student '{roll_no}' not found.")
    seating_cache.clear()
    return {"message": f"Student '{roll_no}' deleted successfully."}


# --------------------------------------------------------------------------
# Time Slots CRUD
# --------------------------------------------------------------------------
@app.get("/api/time-slots")
def list_time_slots():
    return store.get_time_slots()


@app.get("/api/time-slots/{slot_id}")
def get_time_slot(slot_id: str):
    slot = store.get_time_slot(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
    return slot


@app.post("/api/time-slots", status_code=status.HTTP_201_CREATED)
def create_time_slot(slot: TimeSlotIn):
    try:
        created = store.add_time_slot(slot.date, slot.start_time, slot.end_time, slot.label)
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/time-slots/{slot_id}")
def update_time_slot(slot_id: str, slot: TimeSlotIn):
    try:
        updated = store.update_time_slot(slot_id, slot.date, slot.start_time, slot.end_time, slot.label)
        if not updated:
            raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
        seating_cache.pop(slot_id, None)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/time-slots/{slot_id}")
def delete_time_slot(slot_id: str):
    deleted = store.delete_time_slot(slot_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
    seating_cache.pop(slot_id, None)
    return {"message": f"Time slot '{slot_id}' deleted successfully."}


@app.post("/api/time-slots/generate")
def auto_generate_time_slots_endpoint(params: AutoGenerateSlotsIn):
    try:
        new_slots = store.auto_generate_time_slots(
            from_date=params.from_date,
            to_date=params.to_date,
            start_time=params.start_time,
            end_time=params.end_time,
            duration_minutes=params.duration_minutes,
            break_minutes=params.break_minutes,
            skip_weekends=params.skip_weekends,
            replace_existing=params.replace_existing,
        )
        seating_cache.clear()
        return {
            "message": f"Successfully generated {len(new_slots)} time slots.",
            "generated_count": len(new_slots),
            "slots": new_slots,
            "total_slots": len(store.get_time_slots()),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/time-slots")
def clear_all_time_slots():
    count = store.clear_time_slots()
    seating_cache.clear()
    return {"message": f"Cleared {count} time slots."}


class BulkDeleteSlotsIn(BaseModel):
    slot_ids: List[str]


class BulkShiftSlotsIn(BaseModel):
    slot_ids: List[str]
    shift_days: int


@app.post("/api/time-slots/bulk-delete")
def bulk_delete_time_slots_endpoint(payload: BulkDeleteSlotsIn):
    count = store.bulk_delete_time_slots(payload.slot_ids)
    seating_cache.clear()
    return {"message": f"Deleted {count} time slots.", "count": count}


@app.post("/api/time-slots/bulk-shift")
def bulk_shift_time_slots_endpoint(payload: BulkShiftSlotsIn):
    count = store.bulk_shift_time_slots(payload.slot_ids, payload.shift_days)
    seating_cache.clear()
    return {"message": f"Shifted {count} time slots by {payload.shift_days} days.", "count": count}




# --------------------------------------------------------------------------
# Datesheet Engine & Export
# --------------------------------------------------------------------------
@app.post("/api/datesheet/generate")
def generate_datesheet_endpoint():
    global datesheet_state, seating_cache
    slots = store.get_time_slots()
    if not slots:
        raise HTTPException(status_code=400, detail="Cannot generate datesheet: No time slots defined.")
    if not store.get_courses():
        raise HTTPException(status_code=400, detail="Cannot generate datesheet: No courses defined.")

    result = generate_datesheet(slots, store.get_courses(), store.get_rooms())

    # CRITICAL CHECK: If any course cannot be placed without conflict, abort and DO NOT generate a partial schedule!
    if result.get("unplaced") and len(result["unplaced"]) > 0:
        unplaced_count = len(result["unplaced"])
        unplaced_codes = [u["course_code"] for u in result["unplaced"]]
        sample_codes = ", ".join(unplaced_codes[:5])
        if unplaced_count > 5:
            sample_codes += f" (+{unplaced_count - 5} more)"

        err_msg = (
            f"Scheduling Conflict: {unplaced_count} course(s) ({sample_codes}) could not be placed due to date limits. "
            f"Under IIUI policy, each student can sit at most 1 regular exam per day. "
            f"Please configure at least 5 separate exam dates in Time Slots Management."
        )
        logger.error(err_msg)
        raise HTTPException(
            status_code=422,
            detail=err_msg,
        )

    datesheet_state = result
    seating_cache.clear()
    logger.info(
        "Datesheet successfully generated: all %d papers scheduled.",
        len(datesheet_state["datesheet"]),
    )
    return datesheet_state


@app.get("/api/datesheet")
def get_current_datesheet():
    return datesheet_state


@app.get("/api/datesheet/export.xlsx")
def export_datesheet_xlsx():
    if not datesheet_state["datesheet"]:
        raise HTTPException(status_code=404, detail="Generate the datesheet first before exporting.")
    seating_by_slot = {}
    for entry in datesheet_state["datesheet"]:
        sid = entry["slot_id"]
        if sid not in seating_by_slot:
            try:
                seating_by_slot[sid] = _resolve_seating_plan(sid)
            except HTTPException:
                seating_by_slot[sid] = {}
    buf = datesheet_xlsx(datesheet_state["datesheet"], seating_by_slot)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="IIUI_Midterm_Exam_Datesheet_Fall_2026.xlsx"'},
    )


# --------------------------------------------------------------------------
# Seating Plan Matrix & Export
# --------------------------------------------------------------------------
def _resolve_seating_plan(slot_id: str):
    if slot_id in seating_cache:
        return seating_cache[slot_id]

    slot = store.get_time_slot(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")

    entries = [d for d in datesheet_state["datesheet"] if d["slot_id"] == slot_id]
    if not entries:
        raise HTTPException(
            status_code=404,
            detail="No courses scheduled in this slot yet. Generate the datesheet first.",
        )

    slot_courses = []
    for e in entries:
        c = store.get_course(e["course_code"])
        if c:
            slot_courses.append(c)

    plan = build_seating_plan(slot_courses, store.get_rooms(), store.student_by_roll)
    plan["slot_id"] = slot_id
    plan["date"] = slot["date"]
    plan["start_time"] = slot["start_time"]
    plan["end_time"] = slot["end_time"]
    plan["label"] = slot.get("label", "")
    plan["courses"] = [{"code": c["code"], "title": c["title"]} for c in slot_courses]

    seating_cache[slot_id] = plan
    return plan


@app.get("/api/seating-plan")
def get_seating_plan(slot_id: str = Query(..., description="ID of the time slot")):
    return _resolve_seating_plan(slot_id)


@app.post("/api/seating-plan/generate")
def regenerate_seating_plan(slot_id: str = Query(..., description="ID of the time slot")):
    seating_cache.pop(slot_id, None)
    return _resolve_seating_plan(slot_id)


@app.get("/api/seating-plan/export.xlsx")
def export_seating_plan_xlsx(slot_id: str = Query(..., description="ID of the time slot")):
    plan = _resolve_seating_plan(slot_id)
    buf = seating_xlsx(plan)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="IIUI_Seating_Arrangement_{slot_id}.xlsx"'},
    )


# --------------------------------------------------------------------------
# Student Exam Verification (Admin Audit — Strictly view-only, NO downloads)
# --------------------------------------------------------------------------
def _compile_student_exam_allocations():
    """Builds the comprehensive administrative verification roster of all student exam placements."""
    seat_of = {}
    for entry in datesheet_state["datesheet"]:
        sid = entry["slot_id"]
        if sid not in seating_cache:
            try:
                _resolve_seating_plan(sid)
            except HTTPException:
                continue
        plan = seating_cache.get(sid)
        if not plan:
            continue
        for room in plan.get("rooms", []):
            for r, row in enumerate(room.get("grid", [])):
                for c, cell in enumerate(row):
                    if cell:
                        seat_of[(cell["roll_no"], cell["course_code"])] = {
                            "room": room["room_name"],
                            "seat": cell["seat"],
                        }

    records = []
    for student in store.get_students():
        papers = []
        for entry in datesheet_state["datesheet"]:
            code = entry["course_code"]
            c_info = store.get_course(code)
            if c_info and student["roll_no"] in c_info.get("student_roll_numbers", []):
                seat = seat_of.get((student["roll_no"], code), {})
                typ = enrolment_type(student["roll_no"], code)
                papers.append({
                    "course_code": code,
                    "course_title": entry["course_title"],
                    "date": entry["date"],
                    "start_time": entry["start_time"],
                    "end_time": entry["end_time"],
                    "room": seat.get("room", "Allocated"),
                    "seat": seat.get("seat", "Assigned"),
                    "type": typ,
                    "remarks": "Back Paper" if typ == "back" else "Regular",
                })
        if papers:
            papers.sort(key=lambda p: (p["date"], p["start_time"]))
            records.append({
                "roll_no": student["roll_no"],
                "name": student["name"],
                "father_name": student["father_name"],
                "batch": student["batch"],
                "program": student["program"],
                "section": student.get("section", "A"),
                "faculty": student["faculty"],
                "papers": papers,
            })
    return records


@app.get("/api/student-verifications")
def get_student_verifications(search: Optional[str] = Query(None)):
    """Administrative verification list of student exam allocations.
    Note: As per requirements, roll no slip downloads are disabled in admin portal.
    """
    """Administrative verification list of student exam allocations."""
    if not datesheet_state["datesheet"]:
        return []
    records = _compile_student_exam_allocations()
    if search:
        q = search.lower().strip()
        records = [r for r in records if q in r["roll_no"].lower() or q in r["name"].lower()]
    return records


# --------------------------------------------------------------------------
# Student Roll Number Slips Module (AAKING333 style)
# --------------------------------------------------------------------------
@app.get("/api/roll-slip/{roll_no}")
def get_student_roll_slip(roll_no: str):
    """Retrieve full official roll number slip details with assigned seats for a student."""
    clean_roll = roll_no.strip()
    student = store.get_student(clean_roll)
    if not student:
        for s in store.get_students():
            if s["roll_no"].lower() == clean_roll.lower():
                student = s
                break
    if not student:
        raise HTTPException(status_code=404, detail=f"No student found with roll number '{roll_no}'.")

    if not datesheet_state["datesheet"]:
        slots = store.get_time_slots()
        if slots and store.get_courses():
            generate_datesheet_endpoint()

    records = _compile_student_exam_allocations()
    matched = next((r for r in records if r["roll_no"].lower() == clean_roll.lower()), None)
    papers = matched["papers"] if matched else []

    from datetime import datetime
    for p in papers:
        try:
            p["day_name"] = datetime.strptime(p["date"], "%Y-%m-%d").strftime("%A")
        except Exception:
            p["day_name"] = ""

    halls = sorted(list(set(p["room"] for p in papers if p.get("room"))))

    return {
        "institution": {
            "name": "International Islamic University, Islamabad",
            "department": "Department of Computer Science & Information Technology",
            "faculty": "Faculty of Computing and Information Technology",
            "campus": "Male Campus, Sector H-10, Islamabad",
            "session": "Midterm Examination Fall-2026",
            "branch": "Examination Branch",
        },
        "student": {
            "roll_no": student["roll_no"],
            "name": student["name"],
            "father_name": student.get("father_name", "—"),
            "batch": student["batch"],
            "program": student["program"],
            "faculty": student.get("faculty", "Computing and Information Technology"),
            "campus": "Male Campus",
        },
        "exams": papers,
        "summary": {
            "total_exams": len(papers),
            "total_halls": len(halls),
            "halls": halls,
        },
        "notes": [
            "Bring this official Roll No. Slip and University Student ID Card into the Examination Hall.",
            "Possession of cell phones, smartwatches, or programmable electronic devices in the exam hall is strictly prohibited.",
            "Candidate must be seated in their assigned room and desk at least 15 minutes before the exam commences.",
            "Students having attendance less than 75% are ineligible to sit in examinations as per university regulations.",
        ],
    }


@app.get("/api/roll-slip/{roll_no}/pdf")
def export_student_roll_slip_pdf(roll_no: str):
    """Download official university PDF roll number slip."""
    clean_roll = roll_no.strip()
    student = store.get_student(clean_roll)
    if not student:
        for s in store.get_students():
            if s["roll_no"].lower() == clean_roll.lower():
                student = s
                break
    if not student:
        raise HTTPException(status_code=404, detail=f"No student found with roll number '{roll_no}'.")

    if not datesheet_state["datesheet"]:
        slots = store.get_time_slots()
        if slots and store.get_courses():
            generate_datesheet_endpoint()

    records = _compile_student_exam_allocations()
    matched = next((r for r in records if r["roll_no"].lower() == clean_roll.lower()), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No examination allocations found for '{roll_no}'.")

    from datetime import datetime
    matched["issue_date"] = datetime.now().strftime("%d-%b-%Y")
    buf = roll_slip_pdf(matched)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Roll_No_Slip_{clean_roll}.pdf"'},
    )


@app.get("/api/roll-slips/all-pdf")
def export_all_students_roll_slips_pdf():
    """Download single consolidated PDF containing official roll number slips for ALL enrolled students."""
    if not datesheet_state["datesheet"]:
        slots = store.get_time_slots()
        if slots and store.get_courses():
            generate_datesheet_endpoint()

    records = _compile_student_exam_allocations()
    if not records:
        raise HTTPException(
            status_code=404,
            detail="No examination allocations found. Please generate the datesheet first.",
        )

    from datetime import datetime
    issue_date = datetime.now().strftime("%d-%b-%Y")
    for r in records:
        r["issue_date"] = issue_date

    buf = roll_slips_pdf(records)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="IIUI_All_Students_Roll_Number_Slips.pdf"'},
    )
