"""Time Slots and Exam Session Scheduling routes."""
import copy
import datetime
import json
from pathlib import Path
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, status

from data import store
from app.schemas.time_slot import (
    TimeSlotIn,
    AutoGenerateSlotsIn,
    SlotPresetIn,
    PresetTemplateIn,
    BulkDeleteSlotsIn,
    BulkShiftSlotsIn,
)
from app.state import seating_cache

router = APIRouter(prefix="/api/time-slots", tags=["Time Slots Management"])

PRESETS_FILE = Path(__file__).resolve().parent.parent.parent / "presets_config.json"

DEFAULT_PRESET_TEMPLATES = {
    "midterm": {
        "name": "Midterm Examination",
        "days": 8,
        "sessions": [
            {"start_time": "08:45", "end_time": "10:15", "label": "Morning 1", "slot_type": "written"},
            {"start_time": "10:30", "end_time": "12:00", "label": "Morning 2", "slot_type": "written"},
            {"start_time": "14:30", "end_time": "16:00", "label": "Afternoon 1", "slot_type": "written"},
            {"start_time": "16:15", "end_time": "17:45", "label": "Afternoon 2", "slot_type": "written"},
        ],
        "friday_sessions": [
            {"start_time": "08:45", "end_time": "10:15", "label": "Morning 1", "slot_type": "written"},
            {"start_time": "10:30", "end_time": "12:00", "label": "Morning 2", "slot_type": "written"},
            {"start_time": "14:45", "end_time": "16:15", "label": "Afternoon 1", "slot_type": "written"},
            {"start_time": "16:30", "end_time": "18:00", "label": "Afternoon 2", "slot_type": "written"},
        ],
    },
    "terminal": {
        "name": "Terminal Examination",
        "days": 18,
        "sessions": [
            {"start_time": "08:45", "end_time": "11:45", "label": "Morning", "slot_type": "written"},
            {"start_time": "14:30", "end_time": "17:30", "label": "Afternoon", "slot_type": "written"},
        ],
        "friday_sessions": [
            {"start_time": "08:45", "end_time": "11:45", "label": "Morning", "slot_type": "written"},
            {"start_time": "14:45", "end_time": "17:45", "label": "Afternoon", "slot_type": "written"},
        ],
    },
}


def get_preset_templates() -> dict:
    if PRESETS_FILE.exists():
        try:
            with open(PRESETS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                return {**DEFAULT_PRESET_TEMPLATES, **saved}
        except Exception:
            pass
    return copy.deepcopy(DEFAULT_PRESET_TEMPLATES)


def save_preset_templates(templates: dict) -> None:
    try:
        with open(PRESETS_FILE, "w", encoding="utf-8") as f:
            json.dump(templates, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not persist presets: {e}")


@router.get("/presets/templates")
def get_presets_endpoint():
    return get_preset_templates()


@router.put("/presets/templates")
def save_presets_endpoint(templates: Dict[str, PresetTemplateIn]):
    clean = {k: v.dict() for k, v in templates.items()}
    save_preset_templates(clean)
    return {"message": "Preset templates updated successfully.", "templates": clean}



@router.get("")
def list_time_slots():
    return store.get_time_slots()


@router.get("/{slot_id}")
def get_time_slot(slot_id: str):
    slot = store.get_time_slot(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
    return slot


@router.post("", status_code=status.HTTP_201_CREATED)
def create_time_slot(slot: TimeSlotIn):
    try:
        created = store.add_time_slot(slot.date, slot.start_time, slot.end_time, slot.label, slot.slot_type)
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{slot_id}")
def update_time_slot(slot_id: str, slot: TimeSlotIn):
    try:
        updated = store.update_time_slot(slot_id, slot.date, slot.start_time, slot.end_time, slot.label, slot.slot_type)
        if not updated:
            raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
        seating_cache.pop(slot_id, None)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{slot_id}")
def delete_time_slot(slot_id: str):
    deleted = store.delete_time_slot(slot_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
    seating_cache.pop(slot_id, None)
    return {"message": f"Time slot '{slot_id}' deleted successfully."}


@router.delete("")
def clear_all_time_slots():
    count = store.clear_time_slots()
    seating_cache.clear()
    return {"message": f"Cleared {count} time slots."}


@router.post("/generate")
def auto_generate_time_slots_endpoint(params: AutoGenerateSlotsIn):
    try:
        new_slots = store.auto_generate_time_slots(
            from_date=params.from_date,
            to_date=params.to_date,
            start_time=params.start_time,
            end_time=params.end_time,
            duration_minutes=params.duration_minutes,
            break_minutes=params.break_minutes,
            skip_weekends=params.skip_weekends,
            replace_existing=params.replace_existing,
        )
        seating_cache.clear()
        return {
            "message": f"Successfully generated {len(new_slots)} time slots.",
            "generated_count": len(new_slots),
            "slots": new_slots,
            "total_slots": len(store.get_time_slots()),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/presets")
def create_exam_preset(params: SlotPresetIn):
    try:
        first_date = datetime.date.fromisoformat(params.from_date)
        holidays = {datetime.date.fromisoformat(value) for value in params.study_holidays}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid preset date: {e}")

    templates = get_preset_templates()
    template = templates.get(params.preset)
    if not template:
        raise HTTPException(status_code=400, detail=f"Unknown preset '{params.preset}'.")

    if params.custom_sessions:
        regular_times = [(s.start_time, s.end_time, s.label or f"Session {i+1}", s.slot_type) for i, s in enumerate(params.custom_sessions)]
        friday_times = regular_times
    else:
        regular_times = [(s["start_time"], s["end_time"], s.get("label", ""), s.get("slot_type", "written")) for s in template["sessions"]]
        friday_sessions = template.get("friday_sessions") or template["sessions"]
        friday_times = [(s["start_time"], s["end_time"], s.get("label", ""), s.get("slot_type", "written")) for s in friday_sessions]

    requested_days = params.requested_days or template.get("days", 8 if params.preset == "midterm" else 18)

    candidates = []
    current_date = first_date
    while len({item[0] for item in candidates}) < requested_days:
        if current_date.weekday() < 5 and current_date not in holidays:
            times = friday_times if current_date.weekday() == 4 else regular_times
            for start, end, label, slot_type in times:
                candidates.append((current_date.isoformat(), start, end, label, slot_type))
        current_date += datetime.timedelta(days=1)
        if (current_date - first_date).days > 366:
            raise HTTPException(status_code=400, detail="Preset could not find enough exam days in the next year.")

    existing_slots = [] if params.replace_existing else list(store.time_slots)
    if params.replace_existing:
        store.clear_time_slots()
    existing_keys = {
        (slot["date"], slot["start_time"], slot["end_time"]) for slot in existing_slots
    }
    proposed = []
    for candidate in candidates:
        date, start, end, label, slot_type = candidate
        if (date, start, end) in existing_keys:
            continue
        proposed.append(candidate)

    all_times = [
        (slot["date"], store._time_to_minutes(slot["start_time"]), store._time_to_minutes(slot["end_time"]))
        for slot in existing_slots
    ]
    for date, start, end, _, _ in proposed:
        start_min = store._time_to_minutes(start)
        end_min = store._time_to_minutes(end)
        if any(day == date and start_min < other_end and other_start < end_min for day, other_start, other_end in all_times):
            raise HTTPException(status_code=400, detail=f"Preset slot {date} {start}-{end} overlaps an existing time slot.")
        all_times.append((date, start_min, end_min))

    existing_ids = [
        int(slot["id"][1:]) for slot in existing_slots
        if slot["id"].startswith("S") and slot["id"][1:].isdigit()
    ]
    next_id = max(existing_ids) + 1 if existing_ids else 1
    created = []
    for date, start, end, label, slot_type in proposed:
        slot = {
            "id": f"S{next_id}", "date": date, "start_time": start,
            "end_time": end, "label": label, "slot_type": slot_type,
        }
        store.time_slots.append(slot)
        created.append(slot)
        next_id += 1
    seating_cache.clear()
    return {
        "message": f"Created {len(created)} slots for the {params.preset} preset.",
        "generated_count": len(created),
        "slots": created,
        "total_slots": len(store.get_time_slots()),
    }


@router.post("/bulk-delete")
def bulk_delete_time_slots_endpoint(payload: BulkDeleteSlotsIn):
    count = store.bulk_delete_time_slots(payload.slot_ids)
    seating_cache.clear()
    return {"message": f"Deleted {count} time slots.", "count": count}


@router.post("/bulk-shift")
def bulk_shift_time_slots_endpoint(payload: BulkShiftSlotsIn):
    count = store.bulk_shift_time_slots(payload.slot_ids, payload.shift_days)
    seating_cache.clear()
    return {"message": f"Shifted {count} time slots by {payload.shift_days} days.", "count": count}
