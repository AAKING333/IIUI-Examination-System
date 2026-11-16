"""Pydantic schemas for Examination Rooms."""
from typing import Optional
from pydantic import BaseModel, Field


class RoomIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "Room A"})
    rows: int = Field(..., gt=0, le=50, json_schema_extra={"example": 6})
    columns: int = Field(..., gt=0, le=50, json_schema_extra={"example": 10})
    capacity: Optional[int] = Field(None, gt=0, le=2500, description="Optional override. Defaults to rows * columns.")
    room_type: Optional[str] = Field("hall", description="Room category: 'hall' (Examination Hall) or 'lab' (Computer Lab)")
    department: Optional[str] = Field("CS", description="Department e.g. 'CS' or 'IT'")
    reserve_capacity: Optional[int] = Field(0, ge=0, description="Extra reserve seats for the room.")
    invigilators_required: Optional[int] = Field(1, ge=1, le=10, description="Required invigilators for this room.")
    total_usable_seats: Optional[int] = Field(None, ge=0, description="Total usable seats = capacity + reserve_capacity.")
