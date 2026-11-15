"""Pydantic schemas for Invigilation Duties."""
from typing import List
from pydantic import BaseModel, Field


class DutyGenerationIn(BaseModel):
    slot_ids: List[str] = Field(default_factory=list)
