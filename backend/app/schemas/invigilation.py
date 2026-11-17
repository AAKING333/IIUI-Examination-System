"""Pydantic schemas for Invigilation Duties."""
from typing import List, Optional
from pydantic import BaseModel, Field


class DutyGenerationIn(BaseModel):
    slot_ids: List[str] = Field(default_factory=list)
    preserve_manual: bool = True
    duty_cap: int = Field(default=4, ge=3, le=4)
    release_invalid_manual: bool = False


class DutyCreateIn(BaseModel):
    slot_id: str = Field(min_length=1)
    room_id: str = Field(min_length=1)
    instructor: str = Field(min_length=1)
    status: str = "assigned"
    notes: str = ""


class DutyUpdateIn(BaseModel):
    instructor: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class FacultyPolicyIn(BaseModel):
    instructor: str = Field(min_length=1)
    role: str = "regular"
    max_extra_duties: Optional[int] = Field(default=None, ge=0, le=20)
    notes: str = ""
