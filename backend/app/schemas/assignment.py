"""Pydantic schemas for Instructor Course Assignments."""
import re
from typing import Optional
from pydantic import BaseModel, Field, field_validator


def validate_instructor_name(v: str) -> str:
    cleaned = (v or "").strip()
    if len(cleaned) < 2:
        raise ValueError("Validation Error: Instructor name must have at least 2 characters.")
    if not any(c.isalpha() for c in cleaned):
        raise ValueError("Validation Error: Instructor name must contain letters and cannot be purely numeric or symbols.")
    return cleaned


def validate_batch_format(v: str) -> str:
    cleaned = (v or "").strip().upper()
    if len(cleaned) < 2:
        raise ValueError("Validation Error: Batch identifier must have at least 2 characters (e.g., F23, S24).")
    return cleaned


def validate_section_format(v: str) -> str:
    cleaned = (v or "").strip().upper()
    if not cleaned or len(cleaned) > 5:
        raise ValueError("Validation Error: Section must be between 1 and 5 characters (e.g., A, B, C).")
    return cleaned


def validate_program_format(v: str) -> str:
    cleaned = (v or "").strip().upper()
    if len(cleaned) < 2 or len(cleaned) > 20:
        raise ValueError("Validation Error: Degree program code must be between 2 and 20 characters (e.g., BSCS, BSIT).")
    return cleaned


def validate_course_code_format(v: str) -> str:
    cleaned = (v or "").strip().upper()
    if len(cleaned) < 2 or len(cleaned) > 20:
        raise ValueError("Validation Error: Course code must be between 2 and 20 characters (e.g., CS101, IT202).")
    return cleaned


class InstructorAssignmentIn(BaseModel):
    program: str = Field(..., min_length=2, max_length=50, json_schema_extra={"example": "BSIT"})
    batch: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "F23"})
    section: str = Field(..., min_length=1, max_length=10, json_schema_extra={"example": "A"})
    course_code: str = Field(..., min_length=2, max_length=20, json_schema_extra={"example": "CS201"})
    instructor: str = Field(..., min_length=2, max_length=120, json_schema_extra={"example": "Dr. Adeel"})

    @field_validator("instructor")
    @classmethod
    def check_instructor(cls, v: str) -> str:
        return validate_instructor_name(v)

    @field_validator("batch")
    @classmethod
    def check_batch(cls, v: str) -> str:
        return validate_batch_format(v)

    @field_validator("section")
    @classmethod
    def check_section(cls, v: str) -> str:
        return validate_section_format(v)

    @field_validator("program")
    @classmethod
    def check_program(cls, v: str) -> str:
        return validate_program_format(v)

    @field_validator("course_code")
    @classmethod
    def check_course_code(cls, v: str) -> str:
        return validate_course_code_format(v)


class InstructorAssignmentUpdateIn(BaseModel):
    program: Optional[str] = Field(None, min_length=2, max_length=50)
    batch: Optional[str] = Field(None, min_length=2, max_length=20)
    section: Optional[str] = Field(None, min_length=1, max_length=10)
    course_code: Optional[str] = Field(None, min_length=2, max_length=20)
    instructor: Optional[str] = Field(None, min_length=2, max_length=120)

    @field_validator("instructor")
    @classmethod
    def check_instructor(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_instructor_name(v)
        return v

    @field_validator("batch")
    @classmethod
    def check_batch(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_batch_format(v)
        return v

    @field_validator("section")
    @classmethod
    def check_section(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_section_format(v)
        return v

    @field_validator("program")
    @classmethod
    def check_program(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_program_format(v)
        return v

    @field_validator("course_code")
    @classmethod
    def check_course_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_course_code_format(v)
        return v
