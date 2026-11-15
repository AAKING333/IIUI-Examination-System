"""Pydantic schemas for Students and Enrolments."""
from typing import List, Optional
from pydantic import BaseModel, Field


class EnrolmentItem(BaseModel):
    course: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "CS101"})
    type: str = Field("regular", pattern="^(regular|back)$", json_schema_extra={"example": "regular"})
    attendance_percent: float = Field(100, ge=0, le=100)


class StudentIn(BaseModel):
    roll_no: str = Field(..., min_length=3, max_length=30, json_schema_extra={"example": "2024-CS-097"})
    name: str = Field(..., min_length=2, max_length=100, json_schema_extra={"example": "Tariq Mansoor"})
    father_name: str = Field(..., min_length=2, max_length=100, json_schema_extra={"example": "Mansoor Ahmed"})
    program: str = Field("BSIT", min_length=2, max_length=50, json_schema_extra={"example": "BSIT"})
    batch: str = Field("F23", min_length=2, max_length=20, json_schema_extra={"example": "F23"})
    section: str = Field("A", min_length=1, max_length=10, json_schema_extra={"example": "A"})
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
