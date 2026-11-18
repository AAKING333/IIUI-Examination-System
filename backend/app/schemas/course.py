"""Pydantic schemas for Courses."""
from typing import Optional
from pydantic import BaseModel, Field, field_validator


def validate_course_code(v: str) -> str:
    cleaned = (v or "").strip().upper()
    if len(cleaned) < 2 or len(cleaned) > 20:
        raise ValueError("Validation Error: Course code must be between 2 and 20 characters (e.g. CS101, IT202).")
    if not any(c.isalpha() for c in cleaned):
        raise ValueError("Validation Error: Course code must contain letters (e.g. CS101).")
    return cleaned


def validate_course_title(v: str) -> str:
    cleaned = (v or "").strip()
    if len(cleaned) < 3 or len(cleaned) > 150:
        raise ValueError("Validation Error: Course title must be between 3 and 150 characters.")
    if not any(c.isalpha() for c in cleaned):
        raise ValueError("Validation Error: Course title must contain letters and cannot be purely numeric or symbols.")
    return cleaned


class CourseIn(BaseModel):
    code: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "CS101"})
    title: str = Field(..., min_length=2, max_length=150, json_schema_extra={"example": "Introduction to Programming"})
    credit_hours: int = Field(3, ge=1, le=6, json_schema_extra={"example": 3})
    is_lab: bool = Field(False, description="Practical examination requiring a dedicated computer lab.")

    @field_validator("code")
    @classmethod
    def check_code(cls, v: str) -> str:
        return validate_course_code(v)

    @field_validator("title")
    @classmethod
    def check_title(cls, v: str) -> str:
        return validate_course_title(v)


class CourseUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=150)
    credit_hours: Optional[int] = Field(None, ge=1, le=6)
    is_lab: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def check_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_course_title(v)
        return v
