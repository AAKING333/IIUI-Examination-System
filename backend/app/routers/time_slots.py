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

# Lab scheduling preference chosen when slots are generated.
LAB_MODES = ("separate_days", "concurrent")
DEFAULT_LAB_MODE = "separate_days"
LAB_MODE_KEY = "lab_mode"

# Fixed session rules: midterms run 4 sessions per day, terminal/final exams run 2.
EXPECTED_DAILY_SESSIONS = {"midterm": 4, "terminal": 2}
# Number of sessions before the long morning-to-afternoon break.
MORNING_SESSIONS = {"midterm": 2, "terminal": 1}


def _time_to_minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def _minutes_to_time(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def _validate_session_times(times: list) -> None:
    previous_end = -1
    for start, end, _, _ in times:
        start_min = _time_to_minutes(start)
        end_min = _time_to_minutes(end)
        if not (0 <= start_min < end_min <= 24 * 60):
            raise HTTPException(
                status_code=400,
                detail=f"Preset session {start}-{end} must start and end within the same day.",
            )
        if start_min < previous_end:
            raise HTTPException(
                status_code=400,
                detail=f"Preset session {start}-{end} overlaps the session before it.",
            )
        previous_end = end_min


def _apply_long_break(times: list, long_break_minutes: Optional[int], preset: str) -> list:
    """Shift every afternoon session so the morning-to-afternoon gap is exactly the requested break."""
    split = MORNING_SESSIONS.get(preset)
    if not long_break_minutes or split is None or len(times) <= split:
        return times
    current_gap = _time_to_minutes(times[split][0]) - _time_to_minutes(times[split - 1][1])
    delta = long_break_minutes - current_gap
    if delta == 0:
        return times
    shifted = []
    for index, (start, end, label, slot_type) in enumerate(times):
        if index >= split:
            start = _minutes_to_time(_time_to_minutes(start) + delta)
            end = _minutes_to_time(_time_to_minutes(end) + delta)
        shifted.append((start, end, label, slot_type))
    _validate_session_times(shifted)
    return shifted


def _validate_session_count(preset: str, sessions: list) -> None:
    expected = EXPECTED_DAILY_SESSIONS.get(preset)
    if expected and len(sessions) != expected:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The {preset.title()} preset must have exactly {expected} daily sessions "
                f"(currently {len(sessions)}). Midterms are 4 sessions and terminal exams are 2 sessions."
            ),
        )

DEFAULT_PRESET_TEMPLATES = {
    "midterm": {
        "name": "Midterm Examination",
        "days": 8,
        "long_break_minutes": 120,
        "sessions": [
            {"start_time": "08:45", "end_time": "10:15", "label": "Morning 1", "slot_type": "written"},
            {"start_time": "10:30", "end_time": "12:00", "label": "Morning 2", "slot_type": "written"},
            {"start_time": "14:00", "end_time": "15:30", "label": "Afternoon 1", "slot_type": "written"},
            {"start_time": "15:45", "end_time": "17:15", "label": "Afternoon 2", "slot_type": "written"},
        ],
        "friday_sessions": [
            {"start_time": "08:45", "end_time": "10:15", "label": "Morning 1", "slot_type": "written"},
            {"start_time": "10:30", "end_time": "12:00", "label": "Morning 2", "slot_type": "written"},
            {"start_time": "14:00", "end_time": "15:30", "label": "Afternoon 1", "slot_type": "written"},
            {"start_time": "15:45", "end_time": "17:15", "label": "Afternoon 2", "slot_type": "written"},
        ],
    },
    "terminal": {
        "name": "Terminal Examination",
        "days": 18,
        "long_break_minutes": 120,
        "sessions": [
            {"start_time": "08:45", "end_time": "11:45", "label": "Morning", "slot_type": "written"},
            {"start_time": "13:45", "end_time": "16:45", "label": "Afternoon", "slot_type": "written"},
        ],
        "friday_sessions": [
            {"start_time": "08:45", "end_time": "11:45", "label": "Morning", "slot_type": "written"},
            {"start_time": "13:45", "end_time": "16:45", "label": "Afternoon", "slot_type": "written"},
        ],
    },
}


def _read_config() -> dict:
    if PRESETS_FILE.exists():
        try:
            with open(PRESETS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def get_lab_mode() -> str:
    mode = _read_config().get(LAB_MODE_KEY)
    return mode if mode in LAB_MODES else DEFAULT_LAB_MODE


def save_lab_mode(mode: str) -> None:
    if mode not in LAB_MODES:
        raise HTTPException(
            status_code=400,
            detail="Lab days must be either separate_days or concurrent.",
        )
    config = _read_config()
    config[LAB_MODE_KEY] = mode
    try:
        with open(PRESETS_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not persist lab days setting: {e}")


def apply_lab_days(lab_mode: str) -> None:
    """Stamps every slot with its type: last 2 exam days are lab-only, or all days stay written."""
    dates = sorted({slot["date"] for slot in store.time_slots})
    lab_dates = set()
    if lab_mode == "separate_days":
        lab_days = 2 if len(dates) >= 7 else (1 if len(dates) >= 3 else 0)
        if lab_days:
            lab_dates = set(dates[-lab_days:])
    for slot in store.time_slots:
        slot["slot_type"] = "lab" if slot["date"] in lab_dates else "written"


def get_preset_templates() -> dict:
    templates = copy.deepcopy(DEFAULT_PRESET_TEMPLATES)
    saved = _read_config()
    if saved:
        templates.update({key: value for key, value in saved.items() if key != LAB_MODE_KEY})
    return templates


def save_preset_templates(templates: dict) -> None:
    config = _read_config()
    config.update(templates)
    try:
        with open(PRESETS_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not persist presets: {e}")


@router.get("/presets/templates")
def get_presets_endpoint():
    return get_preset_templates()


@router.get("/lab-mode")
def get_lab_mode_endpoint():
    return {"lab_mode": get_lab_mode()}


@router.put("/presets/templates")
def save_presets_endpoint(templates: Dict[str, PresetTemplateIn]):
    for key, tpl in templates.items():
        if key == "midterm" and (tpl.days < 7 or tpl.days > 10):
            raise HTTPException(
                status_code=400,
                detail=f"Midterm exam days threshold must be between 7 and 10 days. (Provided: {tpl.days} days)",
            )
        if key == "terminal" and (tpl.days < 7 or tpl.days > 18):
            raise HTTPException(
                status_code=400,
                detail=f"Terminal/Final exam days threshold cannot exceed 18 days (must be between 7 and 18 days). (Provided: {tpl.days} days)",
            )
        if tpl.days > 18:
            raise HTTPException(
                status_code=400,
                detail=f"Exam duration cannot exceed the maximum threshold of 18 days. (Provided: {tpl.days} days)",
            )
        if key in EXPECTED_DAILY_SESSIONS:
            _validate_session_count(key, tpl.sessions)
            if tpl.friday_sessions is not None:
                _validate_session_count(key, tpl.friday_sessions)
            _validate_session_times(
                [(s.start_time, s.end_time, s.label, s.slot_type) for s in tpl.sessions]
            )
            if tpl.friday_sessions is not None:
                _validate_session_times(
                    [(s.start_time, s.end_time, s.label, s.slot_type) for s in tpl.friday_sessions]
                )
    clean = {k: v.model_dump() for k, v in templates.items()}
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
    mode = params.lab_mode or get_lab_mode()
    if params.lab_mode:
        save_lab_mode(mode)
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
            sessions_per_day=params.sessions_per_day,
            long_break_minutes=params.long_break_minutes,
        )
        apply_lab_days(mode)
        seating_cache.clear()
        return {
            "message": f"Successfully generated {len(new_slots)} time slots.",
            "generated_count": len(new_slots),
            "lab_mode": mode,
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

    today = datetime.date.today()
    if first_date < today:
        raise HTTPException(
            status_code=400,
            detail=f"Preset start date {params.from_date} is in the past. Only today ({today.isoformat()}) or future dates are allowed.",
        )
    past_holidays = sorted(value for value in holidays if value < today)
    if past_holidays:
        raise HTTPException(
            status_code=400,
            detail=f"Study holiday {past_holidays[0].isoformat()} is in the past. Only today ({today.isoformat()}) or future dates are allowed.",
        )

    templates = get_preset_templates()
    template = templates.get(params.preset)
    if not template:
        raise HTTPException(status_code=400, detail=f"Unknown preset '{params.preset}'.")

    if params.custom_sessions:
        _validate_session_count(params.preset, params.custom_sessions)
        regular_times = [(s.start_time, s.end_time, s.label or f"Session {i+1}", s.slot_type) for i, s in enumerate(params.custom_sessions)]
        _validate_session_times(regular_times)
        friday_times = regular_times
    else:
        sessions = template["sessions"]
        _validate_session_count(params.preset, sessions)
        regular_times = [(s["start_time"], s["end_time"], s.get("label", ""), s.get("slot_type", "written")) for s in sessions]
        friday_sessions = template.get("friday_sessions") or sessions
        _validate_session_count(params.preset, friday_sessions)
        friday_times = [(s["start_time"], s["end_time"], s.get("label", ""), s.get("slot_type", "written")) for s in friday_sessions]
        long_break = params.long_break_minutes or template.get("long_break_minutes") or 120
        regular_times = _apply_long_break(regular_times, long_break, params.preset)
        friday_times = _apply_long_break(friday_times, long_break, params.preset)
        _validate_session_times(friday_times)

    requested_days = params.requested_days or template.get("days", 8 if params.preset == "midterm" else 18)
    if requested_days > 18:
        raise HTTPException(
            status_code=400,
            detail=f"Exam duration exceeds the maximum allowed threshold of 18 days (requested: {requested_days} days).",
        )
    if params.preset == "midterm" and (requested_days < 7 or requested_days > 10):
        raise HTTPException(
            status_code=400,
            detail=f"Midterm examination days threshold must be between 7 and 10 days (requested: {requested_days} days).",
        )
    if params.preset == "terminal" and (requested_days < 7 or requested_days > 18):
        raise HTTPException(
            status_code=400,
            detail=f"Terminal/Final examination days threshold cannot exceed 18 days (must be between 7 and 18 days, requested: {requested_days} days).",
        )

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
    mode = params.lab_mode or get_lab_mode()
    if params.lab_mode:
        save_lab_mode(mode)
    apply_lab_days(mode)
    seating_cache.clear()
    return {
        "message": f"Created {len(created)} slots for the {params.preset} preset.",
        "generated_count": len(created),
        "lab_mode": mode,
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
    try:
        count = store.bulk_shift_time_slots(payload.slot_ids, payload.shift_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    seating_cache.clear()
    return {"message": f"Shifted {count} time slots by {payload.shift_days} days.", "count": count}
