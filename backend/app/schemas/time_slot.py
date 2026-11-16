"""Pydantic schemas for Time Slots."""
from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class TimeSlotIn(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", json_schema_extra={"example": "2026-11-10"})
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "08:45"})
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "10:15"})
    label: str = Field("", max_length=80, json_schema_extra={"example": "Morning 1"})
    slot_type: str = Field("written", pattern="^(written|lab)$")


class AutoGenerateSlotsIn(BaseModel):
    from_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", json_schema_extra={"example": "2026-11-10"})
    to_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", json_schema_extra={"example": "2026-11-12"})
    start_time: str = Field("08:30", pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "08:30"})
    end_time: str = Field("17:40", pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "17:40"})
    duration_minutes: int = Field(90, ge=15, le=360, json_schema_extra={"example": 90})
    break_minutes: int = Field(15, ge=0, le=180, json_schema_extra={"example": 15})
    skip_weekends: bool = Field(True, json_schema_extra={"example": True})
    replace_existing: bool = False


class PresetSessionIn(BaseModel):
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    label: str = Field("", max_length=80)
    slot_type: str = Field("written", pattern="^(written|lab)$")


class PresetTemplateIn(BaseModel):
    name: str = Field(..., max_length=120)
    days: int = Field(..., ge=1, le=60)
    sessions: List[PresetSessionIn]
    friday_sessions: Optional[List[PresetSessionIn]] = None


class SlotPresetIn(BaseModel):
    preset: str = Field(..., pattern="^(midterm|terminal)$")
    from_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    study_holidays: List[str] = Field(default_factory=list)
    replace_existing: bool = False
    requested_days: Optional[int] = None
    custom_sessions: Optional[List[PresetSessionIn]] = None


class BulkDeleteSlotsIn(BaseModel):
    slot_ids: List[str]


class BulkShiftSlotsIn(BaseModel):
    slot_ids: List[str]
    shift_days: int

