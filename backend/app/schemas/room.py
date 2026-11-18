"""Pydantic schemas for Examination Rooms with strict capacity & dimension validations."""
from typing import Optional
from pydantic import BaseModel, Field, model_validator


class RoomIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "Room A"})
    rows: int = Field(..., ge=1, le=15, description="Number of rows (max 15).", json_schema_extra={"example": 6})
    columns: int = Field(..., ge=1, le=11, description="Number of columns (max 11).", json_schema_extra={"example": 10})
    capacity: Optional[int] = Field(None, ge=1, le=165, description="Room capacity (max 165 seats). Defaults to rows * columns.")
    room_type: Optional[str] = Field("hall", description="Room category: 'hall' (Examination Hall) or 'lab' (Computer Lab)")
    department: Optional[str] = Field("CS", description="Department e.g. 'CS' or 'IT'")
    reserve_capacity: Optional[int] = Field(0, ge=0, description="Extra reserve seats for the room.")
    invigilators_required: Optional[int] = Field(1, ge=1, le=10, description="Required invigilators for this room.")
    total_usable_seats: Optional[int] = Field(None, ge=0, description="Total usable seats = capacity + reserve_capacity.")

    @model_validator(mode="after")
    def validate_room_dimensions_and_capacity(self):
        if self.rows > 15:
            raise ValueError(f"Rows cannot be more than 15 (provided: {self.rows}).")
        if self.rows < 1:
            raise ValueError(f"Rows must be at least 1 (provided: {self.rows}).")
        if self.columns > 11:
            raise ValueError(f"Columns cannot be more than 11 (provided: {self.columns}).")
        if self.columns < 1:
            raise ValueError(f"Columns must be at least 1 (provided: {self.columns}).")

        calc_cap = self.capacity if (self.capacity is not None and self.capacity > 0) else (self.rows * self.columns)
        if calc_cap > 165:
            raise ValueError(
                f"Room capacity cannot exceed 165 seats (calculated: {calc_cap}). Maximum physical limit is 15 rows × 11 columns."
            )
        if calc_cap < 1:
            raise ValueError("Room capacity must be at least 1 seat.")
        return self
