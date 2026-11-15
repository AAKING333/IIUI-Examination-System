"""Pydantic schemas for Instructor Course Assignments."""
from typing import Optional
from pydantic import BaseModel, Field


class InstructorAssignmentIn(BaseModel):
    program: str = Field(..., min_length=2, max_length=50, json_schema_extra={"example": "BSIT"})
    batch: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "F23"})
    section: str = Field(..., min_length=1, max_length=10, json_schema_extra={"example": "A"})
    course_code: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "CS201"})
    instructor: str = Field(..., min_length=2, max_length=120, json_schema_extra={"example": "Dr. Adeel"})


class InstructorAssignmentUpdateIn(BaseModel):
    program: Optional[str] = Field(None, min_length=2, max_length=50)
    batch: Optional[str] = Field(None, min_length=2, max_length=20)
    section: Optional[str] = Field(None, min_length=1, max_length=10)
    course_code: Optional[str] = Field(None, min_length=2, max_length=20)
    instructor: Optional[str] = Field(None, min_length=2, max_length=120)
