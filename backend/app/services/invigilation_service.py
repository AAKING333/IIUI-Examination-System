"""Invigilation duty roster generation and assignment service."""
import datetime
import re
import uuid
from typing import List, Optional

from fastapi import HTTPException

from data import store
from database import database
from app.config import ECR_MARKERS, SENIOR_MARKERS, MAX_EXTRA_DUTIES
from app.state import datesheet_state
from app.services.seating_service import resolve_seating_plan


def normalize_name(name: str) -> str:
    """Normalize instructor name for robust comparison."""
    return re.sub(r"[^a-z]", "", name.lower())


def generate_duties(slot_ids_filter: Optional[List[str]] = None) -> dict:
    """Generates invigilation duties enforcing all IIUI departmental rules."""
    if not datesheet_state.get("datesheet") or datesheet_state.get("status") != "PUBLISHED":
        raise HTTPException(status_code=409, detail="Publish a valid datesheet before generating invigilation duties.")

    active_entries = datesheet_state["datesheet"]
    slot_ids = set(slot_ids_filter) if slot_ids_filter else {entry["slot_id"] for entry in active_entries}
    known_slots = {slot["id"] for slot in store.get_time_slots()}
    missing_slots = slot_ids - known_slots
    if missing_slots:
        raise HTTPException(status_code=400, detail=f"Unknown time slot(s): {', '.join(sorted(missing_slots))}.")

    existing = database.get_invigilation_duties()
    existing = [duty for duty in existing if duty["slot_id"] not in slot_ids]
    duty_counts = {}
    for duty in existing:
        if duty["duty_type"] == "extra":
            duty_counts[duty["instructor"]] = duty_counts.get(duty["instructor"], 0) + 1

    faculty = sorted({
        item["instructor"].strip()
        for item in store.get_instructor_assignments()
        if item.get("instructor", "").strip()
    })
    eligible_faculty = [
        name for name in faculty
        if not any(marker in normalize_name(name) for marker in ECR_MARKERS)
    ]
    proposed = []
    ordered_slots = sorted(
        (slot for slot in store.get_time_slots() if slot["id"] in slot_ids),
        key=lambda slot: (slot["date"], slot["start_time"]),
    )
    for slot in ordered_slots:
        slot_entries = [entry for entry in active_entries if entry["slot_id"] == slot["id"]]
        if not slot_entries:
            continue
        try:
            plan = resolve_seating_plan(slot["id"])
        except HTTPException as exc:
            if exc.status_code == 404:
                continue
            raise
        courses_in_slot = {
            normalize_name(entry.get("instructor", ""))
            for entry in slot_entries
        }
        used_this_slot = set()
        is_morning = store._time_to_minutes(slot["start_time"]) < 12 * 60
        for room in plan.get("rooms", []):
            room_source = store.get_room(room["room_id"]) or {}
            is_lab = room_source.get("room_type") == "lab" or "Lab" in room.get("room_name", "")

            if is_lab:
                # Labs require exactly 1 invigilator, who is strictly the course instructor
                lab_teacher = next((t for t in (room.get("column_teachers") or []) if t), None)
                if not lab_teacher:
                    for entry in slot_entries:
                        if room.get("room_name") in entry.get("allocated_rooms", []):
                            lab_teacher = entry.get("instructor")
                            break
                if lab_teacher:
                    used_this_slot.add(lab_teacher)
                    proposed.append({
                        "id": str(uuid.uuid4()),
                        "slot_id": slot["id"],
                        "room_id": room["room_id"],
                        "instructor": lab_teacher,
                        "duty_type": "own_subject",
                        "status": "assigned",
                        "created_at": datetime.datetime.now().isoformat(),
                    })
                    continue

            required = int(room_source.get("invigilators_required", 1))
            for _ in range(required):
                candidates = [
                    name for name in eligible_faculty
                    if name not in used_this_slot
                    and (
                        any(
                            normalized and normalized in normalize_name(name)
                            for normalized in courses_in_slot if normalized
                        )
                        or duty_counts.get(name, 0) < MAX_EXTRA_DUTIES
                    )
                ]
                candidates.sort(key=lambda name: (
                    0 if any(marker in normalize_name(name) for marker in SENIOR_MARKERS) == is_morning else 1,
                    duty_counts.get(name, 0),
                    normalize_name(name),
                ))
                if not candidates:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"Invigilation roster could not staff {room['room_name']} "
                            f"for slot {slot['id']}; {required} invigilator(s) are required "
                            "and eligible faculty have reached the 4-duty cap."
                        ),
                    )
                instructor = candidates[0]
                used_this_slot.add(instructor)
                own_subject = any(
                    normalized and normalized in normalize_name(instructor)
                    for normalized in courses_in_slot if normalized
                )
                if not own_subject:
                    duty_counts[instructor] = duty_counts.get(instructor, 0) + 1
                proposed.append({
                    "id": str(uuid.uuid4()),
                    "slot_id": slot["id"],
                    "room_id": room["room_id"],
                    "instructor": instructor,
                    "duty_type": "own_subject" if own_subject else "extra",
                    "status": "assigned",
                    "created_at": datetime.datetime.now().isoformat(),
                })

    all_duties = existing + proposed
    database.replace_invigilation_duties(all_duties)
    return {
        "generated_count": len(proposed),
        "duties": proposed,
        "extra_duty_cap": MAX_EXTRA_DUTIES,
        "ecr_exemptions_applied": True,
    }
