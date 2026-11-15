"""Pydantic schemas for Examination Rooms."""
from typing import Optional
from pydantic import BaseModel, Field


class RoomIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "Room A"})
    rows: int = Field(..., gt=0, le=50, json_schema_extra={"example": 6})
    columns: int = Field(..., gt=0, le=50, json_schema_extra={"example": 10})
    capacity: Optional[int] = Field(None, gt=0, le=2500, description="Optional override. Defaults to rows * columns.")
    room_type: Optional[str] = Field("hall", description="Room category: 'hall' (Examination Hall) or 'lab' (Computer Lab)")
