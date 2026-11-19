"""Pydantic schemas for Time Slots with date range, break, and days threshold validations."""
import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, Field, model_validator


class TimeSlotIn(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", json_schema_extra={"example": "2026-11-10"})
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "08:45"})
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "10:15"})
    label: str = Field("", max_length=80, json_schema_extra={"example": "Morning 1"})
    slot_type: str = Field("written", pattern="^(written|lab)$")

    @model_validator(mode="after")
    def validate_slot_times(self):
        try:
            slot_date = datetime.date.fromisoformat(self.date)
        except ValueError:
            raise ValueError(f"Invalid examination date '{self.date}'. Use YYYY-MM-DD format.")

        today = datetime.date.today()
        if slot_date < today:
            raise ValueError(
                f"Examination date {self.date} is in the past. "
                f"Only today ({today.isoformat()}) or future dates are allowed."
            )

        parts_s = self.start_time.split(":")
        parts_e = self.end_time.split(":")
        s_min = int(parts_s[0]) * 60 + int(parts_s[1])
        e_min = int(parts_e[0]) * 60 + int(parts_e[1])
        if e_min <= s_min:
            raise ValueError(f"Slot end time ({self.end_time}) must be later than its start time ({self.start_time}).")
        return self


class AutoGenerateSlotsIn(BaseModel):
    from_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", json_schema_extra={"example": "2026-11-10"})
    to_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", json_schema_extra={"example": "2026-11-12"})
    start_time: str = Field("08:30", pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "08:30"})
    end_time: str = Field("17:40", pattern=r"^\d{2}:\d{2}$", json_schema_extra={"example": "17:40"})
    duration_minutes: int = Field(90, ge=15, le=360, json_schema_extra={"example": 90})
    break_minutes: int = Field(15, ge=1, le=180, description="Break cannot be zero (minimum 15 mins).", json_schema_extra={"example": 15})
    sessions_per_day: Optional[int] = Field(
        None,
        ge=2,
        le=4,
        description="Fixed number of daily sessions: 4 for midterms, 2 for terminal exams. When set, the day end time is computed automatically.",
    )
    long_break_minutes: Optional[int] = Field(
        None,
        ge=30,
        le=120,
        description="Break between the morning and afternoon sessions (30 to 120 minutes).",
    )
    skip_weekends: bool = Field(True, json_schema_extra={"example": True})
    replace_existing: bool = False
    lab_mode: Optional[str] = Field(
        None,
        pattern="^(separate_days|concurrent)$",
        description="Separate: reserve the last 2 exam days for labs. Concurrent: labs share regular paper days.",
    )

    @model_validator(mode="after")
    def validate_dates_and_times(self):
        try:
            d_start = datetime.date.fromisoformat(self.from_date.strip())
            d_end = datetime.date.fromisoformat(self.to_date.strip())
        except ValueError as e:
            raise ValueError(f"Invalid date format (must be YYYY-MM-DD): {e}")

        today = datetime.date.today()
        if d_start < today:
            raise ValueError(
                f"From Date ({self.from_date}) is in the past. "
                f"Only today ({today.isoformat()}) or future dates are allowed."
            )

        if d_start > d_end:
            raise ValueError("Start date (From Date) cannot be greater than End date (To Date). From date must be earlier than or equal to To date.")

        diff_days = (d_end - d_start).days + 1
        if diff_days > 18:
            raise ValueError(f"Exam duration exceeds the maximum allowed threshold of 18 days (selected range is {diff_days} days). Maximum allowed duration is 18 days.")

        if self.break_minutes <= 0:
            raise ValueError("Break duration between slots cannot be zero. Break must be at least 15 minutes (options: 15, 30, 45, or 60 minutes).")

        if self.sessions_per_day is not None:
            if self.sessions_per_day not in (2, 4):
                raise ValueError("Daily sessions must be 4 (midterms) or 2 (terminal exams).")
            if self.long_break_minutes is None:
                raise ValueError("A long break between the morning and afternoon sessions is required (30 to 120 minutes).")

        parts_s = self.start_time.split(":")
        parts_e = self.end_time.split(":")
        s_min = int(parts_s[0]) * 60 + int(parts_s[1])
        e_min = int(parts_e[0]) * 60 + int(parts_e[1])
        if self.sessions_per_day is None:
            if e_min <= s_min:
                raise ValueError(f"Day end time ({self.end_time}) must be later than start time ({self.start_time}).")
            if (e_min - s_min) < self.duration_minutes:
                raise ValueError(f"Daily exam window ({e_min - s_min} mins) is shorter than the paper duration ({self.duration_minutes} mins).")

        return self


class PresetSessionIn(BaseModel):
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    label: str = Field("", max_length=80)
    slot_type: str = Field("written", pattern="^(written|lab)$")


class PresetTemplateIn(BaseModel):
    name: str = Field(..., max_length=120)
    days: int = Field(..., ge=1, le=18, description="Exam days cannot exceed the maximum threshold of 18 days.")
    sessions: List[PresetSessionIn]
    friday_sessions: Optional[List[PresetSessionIn]] = None
    long_break_minutes: int = Field(
        120,
        ge=30,
        le=120,
        description="Break between the morning and afternoon sessions (30 to 120 minutes).",
    )


class SlotPresetIn(BaseModel):
    preset: str = Field(..., pattern="^(midterm|terminal)$")
    from_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    study_holidays: List[str] = Field(default_factory=list)
    replace_existing: bool = False
    requested_days: Optional[int] = Field(None, ge=1, le=18)
    custom_sessions: Optional[List[PresetSessionIn]] = None
    long_break_minutes: Optional[int] = Field(
        None,
        ge=30,
        le=120,
        description="Optional override for the morning-to-afternoon break (30 to 120 minutes).",
    )
    lab_mode: Optional[str] = Field(
        None,
        pattern="^(separate_days|concurrent)$",
        description="Separate: reserve the last 2 exam days for labs. Concurrent: labs share regular paper days.",
    )

    @model_validator(mode="after")
    def validate_preset_threshold(self):
        try:
            first_date = datetime.date.fromisoformat(self.from_date)
        except ValueError:
            raise ValueError(f"Invalid preset start date '{self.from_date}'. Use YYYY-MM-DD format.")

        today = datetime.date.today()
        if first_date < today:
            raise ValueError(
                f"Preset start date {self.from_date} is in the past. "
                f"Only today ({today.isoformat()}) or future dates are allowed."
            )

        for holiday in self.study_holidays:
            try:
                holiday_date = datetime.date.fromisoformat(holiday)
            except ValueError:
                raise ValueError(f"Invalid study holiday '{holiday}'. Use YYYY-MM-DD format.")
            if holiday_date < today:
                raise ValueError(
                    f"Study holiday {holiday} is in the past. "
                    f"Only today ({today.isoformat()}) or future dates are allowed."
                )

        if self.requested_days is not None:
            if self.requested_days > 18:
                raise ValueError(f"Exam duration exceeds the maximum allowed threshold of 18 days (requested: {self.requested_days} days).")
            if self.preset == "midterm" and (self.requested_days < 7 or self.requested_days > 10):
                raise ValueError(f"Midterm examination days threshold must be between 7 and 10 days (requested: {self.requested_days} days).")
            if self.preset == "terminal" and (self.requested_days < 7 or self.requested_days > 18):
                raise ValueError(f"Terminal/Final examination days threshold cannot exceed 18 days (must be between 7 and 18 days, requested: {self.requested_days} days).")
        return self


class BulkDeleteSlotsIn(BaseModel):
    slot_ids: List[str]


class BulkShiftSlotsIn(BaseModel):
    slot_ids: List[str]
    shift_days: int
