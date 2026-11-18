"""Pydantic schemas for Students and Enrolments."""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


def validate_person_name(v: str, field_name: str) -> str:
    cleaned = (v or "").strip()
    if len(cleaned) < 2 or len(cleaned) > 100:
        raise ValueError(f"Validation Error: {field_name} must be between 2 and 100 characters.")
    if not any(c.isalpha() for c in cleaned):
        raise ValueError(f"Validation Error: {field_name} must contain letters and cannot be purely numeric or symbols.")
    return cleaned


def validate_roll_no_format(v: str) -> str:
    cleaned = (v or "").strip().upper()
    if len(cleaned) < 3 or len(cleaned) > 30:
        raise ValueError("Validation Error: Roll Number must be between 3 and 30 characters.")
    if not any(c.isalnum() for c in cleaned):
        raise ValueError("Validation Error: Roll Number must contain alphanumeric characters (e.g., 2024-CS-097).")
    return cleaned


class EnrolmentItem(BaseModel):
    course: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "CS101"})
    type: str = Field("regular", pattern="^(regular|back)$", json_schema_extra={"example": "regular"})
    attendance_percent: float = Field(100.0, ge=0.0, le=100.0)

    @field_validator("course")
    @classmethod
    def check_course(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if len(cleaned) < 2:
            raise ValueError("Validation Error: Enrolled course code must be at least 2 characters.")
        return cleaned

    @field_validator("attendance_percent")
    @classmethod
    def check_attendance(cls, v: float) -> float:
        if v < 0.0 or v > 100.0:
            raise ValueError("Validation Error: Attendance percentage must be between 0% and 100%.")
        return round(float(v), 2)


class StudentIn(BaseModel):
    roll_no: str = Field(..., min_length=3, max_length=30, json_schema_extra={"example": "2024-CS-097"})
    name: str = Field(..., min_length=2, max_length=100, json_schema_extra={"example": "Tariq Mansoor"})
    father_name: str = Field(..., min_length=2, max_length=100, json_schema_extra={"example": "Mansoor Ahmed"})
    program: str = Field("BSIT", min_length=2, max_length=50, json_schema_extra={"example": "BSIT"})
    batch: str = Field("F23", min_length=2, max_length=20, json_schema_extra={"example": "F23"})
    section: str = Field("A", min_length=1, max_length=10, json_schema_extra={"example": "A"})
    faculty: str = Field("Computing and Information Technology", min_length=2, max_length=120)
    enrolments: List[EnrolmentItem] = Field(default_factory=list)

    @field_validator("roll_no")
    @classmethod
    def check_roll(cls, v: str) -> str:
        return validate_roll_no_format(v)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return validate_person_name(v, "Student name")

    @field_validator("father_name")
    @classmethod
    def check_father(cls, v: str) -> str:
        return validate_person_name(v, "Father name")

    @field_validator("program")
    @classmethod
    def check_prog(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if len(cleaned) < 2:
            raise ValueError("Validation Error: Degree program must be at least 2 characters.")
        return cleaned

    @field_validator("batch")
    @classmethod
    def check_batch(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if len(cleaned) < 2:
            raise ValueError("Validation Error: Batch must be at least 2 characters.")
        return cleaned

    @field_validator("section")
    @classmethod
    def check_sec(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if not cleaned:
            raise ValueError("Validation Error: Section is required.")
        return cleaned

    @field_validator("enrolments")
    @classmethod
    def check_enrolments(cls, v: List[EnrolmentItem]) -> List[EnrolmentItem]:
        if len(v) > 8:
            raise ValueError(f"Validation Error: A student cannot be enrolled in more than 8 courses per semester (enrolled: {len(v)}).")
        seen = set()
        for item in v:
            c = item.course.upper()
            if c in seen:
                raise ValueError(f"Validation Error: Duplicate enrollment detected for course '{c}'.")
            seen.add(c)
        return v


class StudentUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    father_name: Optional[str] = Field(None, min_length=2, max_length=100)
    program: Optional[str] = Field(None, min_length=2, max_length=50)
    batch: Optional[str] = Field(None, min_length=2, max_length=20)
    section: Optional[str] = Field(None, min_length=1, max_length=10)
    faculty: Optional[str] = Field(None, min_length=2, max_length=120)
    enrolments: Optional[List[EnrolmentItem]] = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_person_name(v, "Student name")
        return v

    @field_validator("father_name")
    @classmethod
    def check_father(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_person_name(v, "Father name")
        return v

    @field_validator("program")
    @classmethod
    def check_prog(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().upper()
            if len(cleaned) < 2:
                raise ValueError("Validation Error: Degree program must be at least 2 characters.")
            return cleaned
        return v

    @field_validator("batch")
    @classmethod
    def check_batch(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().upper()
            if len(cleaned) < 2:
                raise ValueError("Validation Error: Batch must be at least 2 characters.")
            return cleaned
        return v

    @field_validator("section")
    @classmethod
    def check_sec(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().upper()
            if not cleaned:
                raise ValueError("Validation Error: Section is required.")
            return cleaned
        return v

    @field_validator("enrolments")
    @classmethod
    def check_enrolments(cls, v: Optional[List[EnrolmentItem]]) -> Optional[List[EnrolmentItem]]:
        if v is not None:
            if len(v) > 8:
                raise ValueError(f"Validation Error: A student cannot be enrolled in more than 8 courses per semester (enrolled: {len(v)}).")
            seen = set()
            for item in v:
                c = item.course.upper()
                if c in seen:
                    raise ValueError(f"Validation Error: Duplicate enrollment detected for course '{c}'.")
                seen.add(c)
        return v
