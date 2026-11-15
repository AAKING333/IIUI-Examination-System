"""Students and enrolments management routes."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from data import store
from app.schemas.student import StudentIn, StudentUpdateIn
from app.state import seating_cache

router = APIRouter(prefix="/api/students", tags=["Students Management"])


@router.get("")
def list_students(
    search: Optional[str] = Query(None, description="Search by Roll No or Student Name"),
    batch: Optional[str] = Query(None, description="Filter by Batch (e.g. F23)"),
    program: Optional[str] = Query(None, description="Filter by Program (e.g. BSIT)"),
    section: Optional[str] = Query(None, description="Filter by Section (e.g. A)"),
    course: Optional[str] = Query(None, description="Filter by enrolled course code"),
):
    return store.get_students(search=search, batch=batch, program=program, section=section, course=course)


@router.get("/{roll_no}")
def get_student(roll_no: str):
    student = store.get_student(roll_no)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student '{roll_no}' not found.")
    return student


@router.post("", status_code=status.HTTP_201_CREATED)
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


@router.put("/{roll_no}")
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


@router.delete("/{roll_no}")
def delete_student(roll_no: str):
    deleted = store.delete_student(roll_no)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Student '{roll_no}' not found.")
    seating_cache.clear()
    return {"message": f"Student '{roll_no}' deleted successfully."}
