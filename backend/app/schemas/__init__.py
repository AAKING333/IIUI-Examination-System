"""Schema exports for clean centralized importing."""
from app.schemas.room import RoomIn
from app.schemas.course import CourseIn, CourseUpdateIn
from app.schemas.assignment import InstructorAssignmentIn, InstructorAssignmentUpdateIn
from app.schemas.student import EnrolmentItem, StudentIn, StudentUpdateIn
from app.schemas.time_slot import (
    TimeSlotIn,
    AutoGenerateSlotsIn,
    SlotPresetIn,
    BulkDeleteSlotsIn,
    BulkShiftSlotsIn,
)
from app.schemas.invigilation import DutyCreateIn, DutyGenerationIn, DutyUpdateIn
from app.schemas.umc import UMCReportIn, UMCReportUpdateIn

__all__ = [
    "RoomIn",
    "CourseIn",
    "CourseUpdateIn",
    "InstructorAssignmentIn",
    "InstructorAssignmentUpdateIn",
    "EnrolmentItem",
    "StudentIn",
    "StudentUpdateIn",
    "TimeSlotIn",
    "AutoGenerateSlotsIn",
    "SlotPresetIn",
    "BulkDeleteSlotsIn",
    "BulkShiftSlotsIn",
    "DutyGenerationIn",
    "DutyCreateIn",
    "DutyUpdateIn",
    "UMCReportIn",
    "UMCReportUpdateIn",
]
