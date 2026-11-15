"""Instructor Course Assignments management routes."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from data import store
from app.schemas.assignment import InstructorAssignmentIn, InstructorAssignmentUpdateIn
from app.state import seating_cache

router = APIRouter(prefix="/api/instructor-assignments", tags=["Instructor Assignments"])


@router.get("")
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


@router.get("/{assignment_id}")
def get_instructor_assignment(assignment_id: str):
    item = store.get_instructor_assignment(assignment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Instructor assignment not found.")
    return item


@router.post("", status_code=status.HTTP_201_CREATED)
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


@router.put("/{assignment_id}")
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


@router.delete("/{assignment_id}")
def delete_instructor_assignment(assignment_id: str):
    deleted = store.delete_instructor_assignment(assignment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Instructor assignment not found.")
    seating_cache.clear()
    return {"message": "Instructor assignment deleted successfully."}
