"""Courses management routes."""
from fastapi import APIRouter, HTTPException, status

from data import store
from app.schemas.course import CourseIn, CourseUpdateIn
from app.state import seating_cache

router = APIRouter(prefix="/api/courses", tags=["Courses Management"])


@router.get("")
def list_courses():
    return store.get_courses()


@router.get("/{code}")
def get_course(code: str):
    c = store.get_course(code)
    if not c:
        raise HTTPException(status_code=404, detail=f"Course '{code}' not found.")
    return c


@router.post("", status_code=status.HTTP_201_CREATED)
def create_course(course: CourseIn):
    try:
        new_course = store.add_course(
            code=course.code,
            title=course.title,
            credit_hours=course.credit_hours,
            is_lab=course.is_lab,
        )
        seating_cache.clear()
        return new_course
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{code}")
def update_course(code: str, course: CourseUpdateIn):
    try:
        updated = store.update_course(
            code=code,
            title=course.title,
            credit_hours=course.credit_hours,
            is_lab=course.is_lab,
        )
        if not updated:
            raise HTTPException(status_code=404, detail=f"Course '{code}' not found.")
        seating_cache.clear()
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{code}")
def delete_course(code: str):
    deleted = store.delete_course(code)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Course '{code}' not found.")
    seating_cache.clear()
    return {"message": f"Course '{code}' deleted successfully."}
