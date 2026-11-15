"""Pydantic schemas for Unfair Means Case (UMC) Reports."""
from typing import List, Optional
from pydantic import BaseModel, Field


class UMCReportIn(BaseModel):
    slot_id: str = Field(..., min_length=1)
    room_id: str = Field(..., min_length=1)
    roll_no: str = Field(..., min_length=3, max_length=30)
    course_code: str = Field(..., min_length=2, max_length=20)
    invigilator: str = Field(..., min_length=2, max_length=120)
    details: str = Field(..., min_length=5, max_length=4000)
    evidence: List[str] = Field(..., min_length=1, max_length=10)
    signature_data: str = Field(..., min_length=16, max_length=2_000_000)


class UMCReportUpdateIn(BaseModel):
    student_statement: Optional[str] = Field(None, max_length=4000)
    invigilator_remarks: Optional[str] = Field(None, max_length=4000)
    instructor_comments: Optional[str] = Field(None, max_length=4000)
    status: Optional[str] = Field(None, pattern="^(statement_recorded|instructor_reviewed|approved)$")
