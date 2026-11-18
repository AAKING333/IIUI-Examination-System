"""Pydantic schemas for Unfair Means Case (UMC) Reports."""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class UMCReportIn(BaseModel):
    slot_id: str = Field(..., min_length=1)
    room_id: str = Field(..., min_length=1)
    roll_no: str = Field(..., min_length=3, max_length=30)
    course_code: str = Field(..., min_length=2, max_length=20)
    invigilator: str = Field(..., min_length=2, max_length=120)
    details: str = Field(..., min_length=5, max_length=4000)
    evidence: List[str] = Field(..., min_length=1, max_length=10)
    signature_data: str = Field(..., min_length=16, max_length=2_000_000)

    @field_validator("roll_no")
    @classmethod
    def check_roll(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if len(cleaned) < 3:
            raise ValueError("Validation Error: Roll Number must have at least 3 characters.")
        return cleaned

    @field_validator("course_code")
    @classmethod
    def check_course(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if len(cleaned) < 2:
            raise ValueError("Validation Error: Course code must have at least 2 characters.")
        return cleaned

    @field_validator("invigilator")
    @classmethod
    def check_invigilator(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if len(cleaned) < 2 or not any(c.isalpha() for c in cleaned):
            raise ValueError("Validation Error: Invigilator name must contain letters and be at least 2 characters.")
        return cleaned

    @field_validator("details")
    @classmethod
    def check_details(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if len(cleaned) < 5:
            raise ValueError("Validation Error: Case incident details must be at least 5 characters long.")
        return cleaned

    @field_validator("evidence")
    @classmethod
    def check_evidence(cls, v: List[str]) -> List[str]:
        if not v or len(v) == 0:
            raise ValueError("Validation Error: At least one evidence item is required.")
        return v


class UMCReportUpdateIn(BaseModel):
    student_statement: Optional[str] = Field(None, max_length=4000)
    invigilator_remarks: Optional[str] = Field(None, max_length=4000)
    instructor_comments: Optional[str] = Field(None, max_length=4000)
    status: Optional[str] = Field(None, pattern="^(statement_recorded|instructor_reviewed|approved)$")
