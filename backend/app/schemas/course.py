"""Pydantic schemas for Courses."""
from typing import Optional
from pydantic import BaseModel, Field


class CourseIn(BaseModel):
    code: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "CS101"})
    title: str = Field(..., min_length=2, max_length=150, json_schema_extra={"example": "Introduction to Programming"})
    credit_hours: int = Field(3, ge=1, le=6, json_schema_extra={"example": 3})
    is_lab: bool = Field(False, description="Practical examination requiring a dedicated computer lab.")


class CourseUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=150)
    credit_hours: Optional[int] = Field(None, ge=1, le=6)
    is_lab: Optional[bool] = None
