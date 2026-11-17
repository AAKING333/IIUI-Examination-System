"""Invigilation duty roster generation, validation, and manual override service.

The service deliberately keeps all hard departmental rules in one place:

* Room 26 always needs three invigilators, Room 18 needs two, and the
  standard halls need one.  Computer labs need one course instructor.
* Faculty roles drive who may be allotted which duty.  The defaults come
  from the department's rulings and every role can be overridden (or new
  faculty added) by the admin through the faculty-policy table:

  - ``ecr`` (Tariq Sadad, Jibran Mir, Musharraf): relief/rotation staff.
    Exactly one ECR teacher is placed per slot, cycling round-robin across
    slots (Jibran → Musharraf → Tariq → …).  The duty is a relief posting in
    the busiest under-staffed hall so the hall's course teacher can visit
    other rooms.  ECR rotation duties are exempt from the extra-duty cap,
    and a teacher with their own paper in a slot never takes ECR duty.
  - ``chairman`` (Dr. Muhammad Nazir, the HOD): one duty only — his own exam.
  - ``senior`` (Dr. Qaisar Javaid ["Dr. Qaiser Javed" in the rulings], Dr.
    Muhammad Majid): at most two *extra* duties, allotted only when there is
    a dire need (after all other eligible faculty); their own-paper
    availability remains mandatory.  Note: Dr. Syed Qaiser Ali Shah is a
    separate regular teacher.
  - ``visiting``: visiting faculty, own exam only (admin-managed role).
  - ``no_duty``: never assigned (admin option); they only visit their own
    exam venue for student queries.
  - ``regular``: the normal duty pool with the extra-duty cap.
* A faculty member teaching a paper in a slot must be available in the
  room / hall where their taught course is seated (``own_subject`` duty).
  When a cohort is split across halls the teacher is placed in the room
  holding the largest share of their students, and seating prioritises the
  largest rooms (26/18) for the biggest cohorts.
* A faculty member may not be assigned to two rooms in the same slot.
* Senior professors (regular role) are prioritised for morning slots.
* Manual overrides are preserved during recalculation unless explicitly
  released, and every manual change is validated before it is persisted.
"""
import datetime
import re
import sqlite3
import threading
import uuid
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException

from data import store
from database import database
from app.config import (
    CHAIRMAN_MARKERS,
    DUTY_STATUSES,
    ECR_MARKERS,
    FACULTY_ROLES,
    MAX_EXTRA_DUTIES,
    MIN_EXTRA_DUTIES,
    NO_DUTY_MARKERS,
    SENIOR_MARKERS,
    SENIOR_MAX_EXTRA_DUTIES,
    SENIOR_ROLE_MARKERS,
)
from app.state import datesheet_state
from app.services.seating_service import resolve_seating_plan

_ROSTER_LOCK = threading.RLock()


# ---------------------------------------------------------------------------
# Name and rule helpers
# ---------------------------------------------------------------------------
def normalize_name(name: str) -> str:
    """Normalize instructor name for robust comparison."""
    return re.sub(r"[^a-z]", "", (name or "").lower())


def _faculty_policy_rows() -> List[dict]:
    try:
        return database.list_faculty_policy()
    except Exception:  # pragma: no cover - policy table is optional
        return []


def _faculty_policy_map() -> Dict[str, dict]:
    """Return normalized-name -> policy row for admin overrides."""
    result: Dict[str, dict] = {}
    for row in _faculty_policy_rows():
        normalized = normalize_name(row.get("instructor_name", ""))
        if normalized:
            result.setdefault(normalized, row)
    return result


def _default_faculty_role(name: str) -> str:
    """Return the departmental default role for a teacher.

    Admin policy overrides always win (see ``_faculty_role``); these markers
    only seed the defaults documented in the rulings.
    """
    normalized = normalize_name(name)
    if any(marker in normalized for marker in CHAIRMAN_MARKERS):
        return "chairman"
    if any(marker in normalized for marker in SENIOR_ROLE_MARKERS):
        return "senior"
    if any(marker in normalized for marker in ECR_MARKERS):
        return "ecr"
    if any(marker in normalized for marker in NO_DUTY_MARKERS):
        return "no_duty"
    return "regular"


def _faculty_role(name: str) -> str:
    """Resolve a teacher's role: admin policy first, then marker defaults."""
    normalized = normalize_name(name)
    if not normalized:
        return "regular"
    policy = _faculty_policy_map().get(normalized)
    if policy and policy.get("role"):
        role = str(policy["role"]).strip().lower()
        if role in FACULTY_ROLES:
            return role
    return _default_faculty_role(name)


def is_ecr_member(name: str) -> bool:
    """Return True when the instructor is an ECR relief/rotation member."""
    return _faculty_role(name) == "ecr"


def is_no_duty_member(name: str) -> bool:
    """Return True for teachers on the no-duty list."""
    return _faculty_role(name) == "no_duty"


def is_exempt_from_extra_duty(name: str) -> bool:
    """Return True when a teacher may never be allotted extra invigilation duty.

    Chairman/HOD, visiting faculty, and no-duty teachers are
    excluded from the routine duty rotation; every such teacher still
    invigilates their own taught paper when it is scheduled.  ECR members
    *are* hall-eligible through the rotation but are not generic extras.
    """
    return _faculty_role(name) in {"no_duty", "visiting", "chairman"}


def is_senior(name: str) -> bool:
    """Return True for the senior-professor morning-priority group."""
    normalized = normalize_name(name)
    return any(marker in normalized for marker in SENIOR_MARKERS)


def is_dire_need_senior(name: str) -> bool:
    """Return True for the most-senior teachers (max two duties, dire need)."""
    return _faculty_role(name) == "senior"


def _faculty_cap(name: str, default: Optional[int] = None) -> int:
    """Return the per-teacher duty cap: admin override > role default.

    The cap applies to counted *extra* duties for every role (own-paper
    availability stays mandatory and exempt for everyone, including the
    dire-need seniors).
    """
    policy = _faculty_policy_map().get(normalize_name(name))
    if policy and policy.get("max_extra_duties") is not None:
        try:
            return max(0, int(policy["max_extra_duties"]))
        except (TypeError, ValueError):
            pass
    if _faculty_role(name) == "senior":
        return SENIOR_MAX_EXTRA_DUTIES
    return default if default is not None else MAX_EXTRA_DUTIES


def _duty_load(
    name: str, duties: Iterable[dict], ignore_id: Optional[str] = None,
) -> Tuple[int, int]:
    """Return (total_duties, counted_extra_duties) for one teacher."""
    normalized = normalize_name(name)
    total = counted = 0
    for duty in duties:
        if duty.get("id") == ignore_id:
            continue
        if normalize_name(duty.get("instructor", "")) != normalized:
            continue
        if duty.get("duty_type") == "ecr_rotation":
            # Relief rotation duties are exempt from every duty cap.
            continue
        total += 1
        if _duty_is_counted(duty):
            counted += 1
    return total, counted


def _cap_reached(
    name: str, duties: Iterable[dict], ignore_id: Optional[str] = None,
    cap: Optional[int] = None,
) -> bool:
    """Return True when a teacher has hit their per-teacher extra-duty cap.

    Own-paper duties are exempt for every role; dire-need seniors simply use
    a tighter cap and are considered last.
    """
    effective_cap = _faculty_cap(name) if cap is None else cap
    _total, counted = _duty_load(name, duties, ignore_id)
    return counted >= effective_cap


def _ecr_rotation_order(registry: Dict[str, str]) -> List[str]:
    """Return canonical ECR member names in the rotation marker order.

    The rotation cycles in the order the rulings list the teachers
    (Jibran first, then Musharraf, then Tariq Sadad); spelling variants map
    to the same member and are de-duplicated.
    """
    members: List[str] = []
    seen: set = set()
    used_normalized = set()
    for marker in ECR_MARKERS:
        match = next(
            (
                (normalized, name)
                for normalized, name in registry.items()
                if marker in normalized and normalized not in seen
            ),
            None,
        )
        if match and _faculty_role(match[1]) == "ecr" and match[0] not in used_normalized:
            seen.add(match[0])
            used_normalized.add(match[0])
            members.append(match[1])
    return members


def _now() -> str:
    return datetime.datetime.now().isoformat()


def _require_published_state() -> dict:
    if not datesheet_state.get("datesheet"):
        raise HTTPException(
            status_code=409,
            detail="Publish a valid datesheet before managing invigilation duties.",
        )
    if datesheet_state.get("status") != "PUBLISHED":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Datesheet version {datesheet_state.get('version', '?')} is "
                f"{datesheet_state.get('status', 'not published')}; regenerate it before "
                "managing invigilation duties."
            ),
        )
    return datesheet_state


def _is_morning(slot: Dict[str, Any]) -> bool:
    return store._time_to_minutes(slot["start_time"]) < 12 * 60


def _slot_sort_key(slot: Dict[str, Any]) -> Tuple[str, str, str]:
    return (slot.get("date", ""), slot.get("start_time", ""), slot.get("id", ""))


def _entries_for_slot(state: dict, slot_id: str) -> List[dict]:
    return [entry for entry in state.get("datesheet", []) if entry.get("slot_id") == slot_id]


def _is_own_subject(instructor: str, entries: Iterable[dict]) -> bool:
    normalized = normalize_name(instructor)
    return bool(normalized) and any(
        normalize_name(entry.get("instructor", "")) == normalized
        for entry in entries
        if entry.get("instructor")
    )


def _duty_is_counted(duty: Dict[str, Any]) -> bool:
    if duty.get("is_counted") is not None:
        return bool(duty["is_counted"])
    return duty.get("duty_type") == "extra"


def _extra_duty_counts(duties: Iterable[dict]) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    for duty in duties:
        if _duty_is_counted(duty):
            counts[normalize_name(duty["instructor"])] += 1
    return counts


def _used_by_slot(duties: Iterable[dict]) -> Dict[str, set]:
    used: Dict[str, set] = defaultdict(set)
    for duty in duties:
        used[duty["slot_id"]].add(normalize_name(duty["instructor"]))
    return used


def _faculty_registry() -> Tuple[Dict[str, str], Dict[str, set]]:
    """Return normalized-name -> canonical-name and course-code mappings.

    Faculty added by the admin through the faculty-policy table (teachers
    with no course assignment) are included so they can hold duties too.
    """
    by_normalized: Dict[str, str] = {}
    courses: Dict[str, set] = defaultdict(set)
    for assignment in store.get_instructor_assignments():
        name = (assignment.get("instructor") or "").strip()
        if not name:
            continue
        normalized = normalize_name(name)
        by_normalized.setdefault(normalized, name)
        if assignment.get("course_code"):
            courses[normalized].add(assignment["course_code"])
    for row in _faculty_policy_rows():
        name = (row.get("instructor_name") or "").strip()
        if not name:
            continue
        normalized = normalize_name(name)
        by_normalized.setdefault(normalized, name)
    return by_normalized, courses


def _canonical_faculty_name(name: str, registry: Dict[str, str]) -> Optional[str]:
    return registry.get(normalize_name(name))


def _room_key(room_source: dict, plan_room: dict) -> str:
    name = (room_source or {}).get("name") or (plan_room or {}).get("room_name") or ""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _room_is_lab(room_source: dict, plan_room: dict) -> bool:
    name = (room_source or {}).get("name") or (plan_room or {}).get("room_name") or ""
    room_type = (room_source or {}).get("room_type") or (plan_room or {}).get("room_type") or "hall"
    return room_type == "lab" or "lab" in name.lower()


def _room_required(room_source: dict, plan_room: dict) -> int:
    """Return the policy-mandated invigilator count for a room.

    Known rooms are pinned to the values in the business-rules document even
    if a stale or edited room record says otherwise.  New rooms may use their
    configured value.
    """
    if _room_is_lab(room_source, plan_room):
        return 1
    key = _room_key(room_source, plan_room)
    if key in {"room26", "r26"}:
        return 3
    if key in {"room18", "r18"}:
        return 2
    if key in {"room25", "r25", "room27", "r27", "room21", "r21", "room28", "r28"}:
        return 1
    try:
        configured = int((room_source or {}).get("invigilators_required", 1) or 1)
    except (TypeError, ValueError):
        configured = 1
    return max(1, configured)


def _room_teachers_for_room(context: dict, room: dict) -> List[str]:
    """Return the distinct teachers whose papers are seated in this room.

    Works for labs and halls alike: hall seating plans carry one teacher per
    column in ``column_teachers`` (a hall may mix two papers).  Falls back to
    the datesheet entries allocated to the room when the plan lacks the
    metadata.
    """
    plan_room = room.get("plan_room") or {}
    teachers = [
        teacher for teacher in (plan_room.get("column_teachers") or [])
        if teacher and str(teacher).strip()
    ]
    if not teachers:
        room_name = plan_room.get("room_name") or room.get("room_name")
        for entry in context.get("entries", []):
            if room_name in (entry.get("allocated_rooms") or []):
                teacher = entry.get("instructor")
                if teacher:
                    teachers.append(teacher)
    # Preserve first-seen order while removing duplicate names.
    seen = set()
    unique = []
    for teacher in teachers:
        normalized = normalize_name(teacher)
        if normalized and normalized not in seen:
            seen.add(normalized)
            unique.append(teacher)
    return unique


def _build_context(slot: dict, state: dict) -> dict:
    entries = _entries_for_slot(state, slot["id"])
    context = {
        "slot": slot,
        "entries": entries,
        "rooms": [],
        "is_morning": _is_morning(slot),
        "error": "",
    }
    if not entries:
        context["error"] = "No papers are scheduled in this slot."
        return context
    plan = resolve_seating_plan(slot["id"])
    for plan_room in plan.get("rooms", []):
        if plan_room.get("seated", 0) <= 0:
            continue
        room_id = plan_room.get("room_id")
        room_source = store.get_room(room_id) or {}
        room = {
            "room_id": room_id,
            "room_name": room_source.get("name") or plan_room.get("room_name") or room_id,
            "room_type": room_source.get("room_type") or plan_room.get("room_type") or "hall",
            "plan_room": plan_room,
            "room_source": room_source,
            "required": _room_required(room_source, plan_room),
            "is_lab": _room_is_lab(room_source, plan_room),
        }
        room["room_teachers"] = _room_teachers_for_room(context, room)
        room["lab_teachers"] = (
            _lab_invigilators_for_room(room) if room["is_lab"] else []
        )
        context["rooms"].append(room)
    return context


def _safe_context(slot: dict, state: dict) -> dict:
    try:
        return _build_context(slot, state)
    except HTTPException as exc:
        return {
            "slot": slot,
            "entries": _entries_for_slot(state, slot["id"]),
            "rooms": [],
            "is_morning": _is_morning(slot),
            "error": str(exc.detail),
        }


def _selected_slots(state: dict, slot_ids: Optional[List[str]] = None) -> List[dict]:
    known_slots = {slot["id"]: slot for slot in store.get_time_slots()}
    if slot_ids:
        selected_ids = set(slot_ids)
        missing = selected_ids - set(known_slots)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown time slot(s): {', '.join(sorted(missing))}.",
            )
    else:
        selected_ids = {entry["slot_id"] for entry in state.get("datesheet", [])}
    if not selected_ids:
        raise HTTPException(status_code=400, detail="No datesheet slots are available.")
    selected = [known_slots[slot_id] for slot_id in selected_ids if slot_id in known_slots]
    selected.sort(key=_slot_sort_key)
    if not selected:
        raise HTTPException(status_code=400, detail="No known datesheet slots are available.")
    return selected


def _slot_has_papers(state: dict, slot_id: str) -> bool:
    return any(entry.get("slot_id") == slot_id for entry in state.get("datesheet", []))


def _make_duty(
    slot_id: str,
    room_id: str,
    instructor: str,
    entries: Iterable[dict],
    source: str = "auto",
    status: str = "assigned",
    notes: str = "",
) -> dict:
    own_subject = _is_own_subject(instructor, entries)
    timestamp = _now()
    return {
        "id": str(uuid.uuid4()),
        "slot_id": slot_id,
        "room_id": room_id,
        "instructor": instructor,
        "duty_type": "own_subject" if own_subject else "extra",
        "status": status,
        "source": source,
        "is_counted": 0 if own_subject else 1,
        "notes": notes,
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def _room_duties(
    duties: Iterable[dict], slot_id: str, room_id: str, ignore_id: Optional[str] = None,
) -> List[dict]:
    return [
        duty for duty in duties
        if duty.get("slot_id") == slot_id
        and duty.get("room_id") == room_id
        and duty.get("id") != ignore_id
    ]


def _reserved_lab_teachers(context: dict) -> set:
    reserved = set()
    for room in context.get("rooms", []):
        if room.get("is_lab"):
            reserved.update(normalize_name(name) for name in room.get("lab_teachers", []))
    return reserved


def _lab_invigilators_for_room(room: dict) -> List[str]:
    """Return the faculty allowed to invigilate this lab room.

    A teacher on the no-duty list is never allotted an invigilation duty —
    not even for their own paper.  When such a teacher's students are seated
    in a lab, a co-instructor of the same lab course invigilates instead, so
    the one-invigilator-per-lab rule still holds.
    """
    teachers = list(room.get("room_teachers") or [])
    if not any(is_no_duty_member(teacher) for teacher in teachers):
        return teachers
    plan_room = room.get("plan_room") or {}
    course_codes = []
    for paper in plan_room.get("column_papers") or []:
        code = re.sub(r"-(T\d+|CS|IT)$", "", paper or "").strip()
        if code and code not in course_codes:
            course_codes.append(code)
    allowed = [teacher for teacher in teachers if not is_no_duty_member(teacher)]
    for code in course_codes:
        for instructor in store.get_instructors_for_course(code):
            if not is_no_duty_member(instructor) and instructor not in allowed:
                allowed.append(instructor)
    return allowed


def _own_subject_rooms(context: dict, instructor: str) -> List[dict]:
    """Return the active rooms that seat a paper taught by ``instructor``.

    Per the own-subject rule, a teacher whose paper runs in a slot must be
    available in the room / hall where their taught course is examined.
    """
    normalized = normalize_name(instructor)
    if not normalized:
        return []
    rooms = []
    for room in context.get("rooms", []):
        teachers = room.get("room_teachers") or []
        if any(normalize_name(teacher) == normalized for teacher in teachers):
            rooms.append(room)
    return rooms


def _own_subject_room_loads(room: dict) -> Dict[str, Tuple[str, int]]:
    """Return normalized teacher -> (canonical name, students seated here).

    Uses the seating sheet columns so a cohort split across halls can be
    compared room by room; the fallback credits each room teacher one seat.
    """
    plan_room = room.get("plan_room") or {}
    columns = ((plan_room.get("seating_sheet") or {}).get("columns") or [])
    loads: Dict[str, Tuple[str, int]] = {}
    for column in columns:
        seated = sum(
            1 for roll in (column.get("roll_nos") or [])
            if roll and str(roll).strip() and str(roll).strip().lower() != "buffer"
        )
        if seated <= 0:
            continue
        for part in str(column.get("instructor") or "").split("/"):
            teacher = part.strip()
            normalized = normalize_name(teacher)
            if not normalized:
                continue
            existing = loads.get(normalized)
            loads[normalized] = (teacher, (existing[1] if existing else 0) + seated)
    if not loads:
        for teacher in room.get("room_teachers") or []:
            normalized = normalize_name(teacher)
            if normalized:
                loads.setdefault(normalized, (teacher, 1))
    return loads


def _own_subject_hall_plan(context: dict) -> Dict[str, Tuple[str, str, int]]:
    """Map normalized teacher -> (room_id, canonical name, student count).

    Each own-paper teacher is aimed at the hall holding the largest share
    of their students; ties prefer the bigger room so the largest cohorts
    are watched by their own course teachers (rooms 26/18 first).
    """
    plan: Dict[str, Tuple[str, str, int, int]] = {}
    for room in context.get("rooms", []):
        if room.get("is_lab"):
            continue
        room_seated = (room.get("plan_room") or {}).get("seated", 0) or 0
        for normalized, (teacher, count) in _own_subject_room_loads(room).items():
            current = plan.get(normalized)
            if current is None or (count, room_seated) > (current[2], current[3]):
                plan[normalized] = (room["room_id"], teacher, count, room_seated)
    return {
        normalized: (room_id, teacher, count)
        for normalized, (room_id, teacher, count, _seated) in plan.items()
    }


def _ecr_relief_room(context: dict, slot_duties: Iterable[dict]) -> Optional[dict]:
    """Pick the hall where an ECR relief teacher is most valuable.

    The rotation places the relief teacher in the busiest hall that is
    still missing an invigilator, so the posted course teacher can be
    relieved to visit their students in other rooms.
    """
    duties = list(slot_duties)
    candidates = []
    for room in context.get("rooms", []):
        if room.get("is_lab"):
            continue
        assigned = sum(1 for duty in duties if duty.get("room_id") == room["room_id"])
        missing = room["required"] - assigned
        if missing <= 0:
            continue
        plan_room = room.get("plan_room") or {}
        candidates.append((
            plan_room.get("seated", 0) or 0,
            room["required"],
            room["room_name"],
            room,
        ))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (-item[0], -item[1], item[2]))
    return candidates[0][3]


def _instructor_used_in_hall(
    slot_duties: Iterable[dict], context: dict, instructor: str,
) -> bool:
    normalized = normalize_name(instructor)
    for duty in slot_duties:
        if normalize_name(duty.get("instructor", "")) != normalized:
            continue
        room = next(
            (item for item in context.get("rooms", [])
             if item["room_id"] == duty.get("room_id")),
            None,
        )
        if room is None or not room.get("is_lab"):
            return True
    return False


def _validate_duty(
    duty: dict,
    context: dict,
    all_duties: Iterable[dict],
    cap: int,
    ignore_id: Optional[str] = None,
    require_known_faculty: bool = False,
    require_room_capacity: bool = True,
) -> List[str]:
    """Validate one duty and return a list of human-readable hard errors."""
    errors: List[str] = []
    instructor = (duty.get("instructor") or "").strip()
    normalized = normalize_name(instructor)
    if not normalized:
        return ["Instructor name is required."]

    if duty.get("status", "assigned") not in DUTY_STATUSES:
        errors.append(
            f"Invalid duty status '{duty.get('status')}'. Allowed: {', '.join(DUTY_STATUSES)}."
        )
    notes = duty.get("notes") or ""
    if len(notes) > 2000:
        errors.append("Duty notes must be 2000 characters or fewer.")

    if context.get("error"):
        errors.append(context["error"])
        return errors

    room = next(
        (item for item in context.get("rooms", []) if item["room_id"] == duty.get("room_id")),
        None,
    )
    if not room:
        errors.append(
            f"Room '{duty.get('room_id')}' is not active in slot {duty.get('slot_id')}."
        )
        return errors

    if require_known_faculty:
        registry, _ = _faculty_registry()
        if normalized not in registry:
            errors.append(f"'{instructor}' is not a registered CS & IT faculty member.")

    is_lab = bool(room.get("is_lab"))
    lab_teachers = room.get("lab_teachers") or []
    if is_lab and lab_teachers:
        if normalized not in {normalize_name(name) for name in lab_teachers}:
            errors.append(
                f"Lab {room['room_name']} must be invigilated by its course instructor "
                f"({', '.join(lab_teachers)})."
            )

    own_subject = _is_own_subject(instructor, context.get("entries", []))
    role = _faculty_role(instructor)

    if role == "no_duty":
        errors.append(
            f"{instructor} has the no-duty role and cannot be allotted "
            "invigilation duties."
        )
    elif role == "visiting" and not own_subject:
        errors.append(
            f"{instructor} (visiting staff) may only invigilate their own "
            "teaching exams."
        )
    elif role == "chairman" and not own_subject:
        errors.append(
            f"{instructor} is the Chairman/HOD and may only hold the duty of "
            "their own exam."
        )

    # Own-subject placement: a teacher whose paper runs in this slot must be
    # in the room / hall where their taught course is seated.
    if own_subject and not is_lab and role != "no_duty":
        own_rooms = _own_subject_rooms(context, instructor)
        if own_rooms and room not in own_rooms:
            errors.append(
                f"{instructor} must invigilate the room where their taught "
                f"course is seated ({', '.join(item['room_name'] for item in own_rooms)})."
            )

    if not is_lab and normalized in _reserved_lab_teachers(context):
        errors.append(
            f"{instructor} is required as the course instructor for a lab in this slot."
        )

    for other in all_duties:
        if other.get("id") == ignore_id:
            continue
        if other.get("slot_id") != duty.get("slot_id"):
            continue
        if normalize_name(other.get("instructor", "")) != normalized:
            continue
        # The same lab course instructor may supervise multiple lab rooms when
        # one lab paper is split across rooms.  Halls are strictly one-per-slot,
        # and a lab instructor cannot simultaneously cover a hall.
        other_room = next(
            (item for item in context.get("rooms", [])
             if item["room_id"] == other.get("room_id")),
            None,
        )
        same_lab_split = (
            is_lab and other_room is not None and other_room.get("is_lab")
            and other.get("room_id") != duty.get("room_id")
        )
        if same_lab_split:
            continue
        errors.append(
            f"{instructor} is already assigned in slot {duty.get('slot_id')}."
        )
        break

    if require_room_capacity:
        existing = _room_duties(all_duties, duty.get("slot_id"), duty.get("room_id"), ignore_id)
        if len(existing) >= room["required"]:
            errors.append(
                f"{room['room_name']} already has {len(existing)} invigilator(s); "
                f"the policy requires {room['required']}."
            )

    effective_cap = _faculty_cap(instructor, cap)
    _total, counted = _duty_load(instructor, all_duties, ignore_id)
    if not own_subject and counted >= effective_cap:
        if role == "senior":
            errors.append(
                f"{instructor} has reached the {effective_cap}-extra-duty limit "
                "for the most-senior faculty."
            )
        else:
            errors.append(
                f"{instructor} has reached the {effective_cap}-extra-duty cap. "
                "Own-subject duties are exempt, but this assignment is an extra duty."
            )
    return errors


def _candidate_sort_key(
    name: str,
    counts: Dict[str, int],
    context: dict,
) -> tuple:
    normalized = normalize_name(name)
    role = _faculty_role(name)
    # Dire-need seniors come last: they are only allotted duties once every
    # other eligible teacher has already been considered.
    role_rank = 1 if role == "senior" else 0
    # Regular senior professors still get morning priority.
    senior_morning = is_senior(name) and role == "regular"
    # Seniors first in the morning, non-seniors first in the afternoon.
    senior_priority = 0 if senior_morning == context["is_morning"] else 1
    return (
        role_rank,
        senior_priority,
        counts.get(normalized, 0),
        normalized,
    )


def _eligible_candidates(
    context: dict,
    used_this_slot: set,
    counts: Dict[str, int],
    cap: int,
    all_duties: Optional[Iterable[dict]] = None,
    allow_ecr: bool = False,
) -> List[str]:
    """Return faculty eligible for an *extra* invigilation duty in this slot.

    Chairman/HOD, visiting faculty, and no-duty teachers are
    never allotted extra duties.  Own-subject teachers are reserved for the
    room / hall where their taught course is seated, so they are not generic
    candidates either.  ECR members are only used as a last resort here
    (their duties normally come from the rotation), and dire-need seniors
    sort after everyone else.
    """
    registry, _ = _faculty_registry()
    reserved_labs = _reserved_lab_teachers(context)
    duty_list = list(all_duties) if all_duties is not None else []
    candidates = []
    for normalized, name in registry.items():
        if normalized in used_this_slot:
            continue
        if normalized in reserved_labs:
            continue
        role = _faculty_role(name)
        if role in {"no_duty", "visiting", "chairman"}:
            continue
        if role == "ecr" and not allow_ecr:
            continue
        if _is_own_subject(name, context.get("entries", [])):
            continue
        if _cap_reached(name, duty_list, cap=_faculty_cap(name, cap)):
            continue
        candidates.append(name)
    candidates.sort(key=lambda name: _candidate_sort_key(name, counts, context))
    return candidates


# ---------------------------------------------------------------------------
# Response enrichment and health reporting
# ---------------------------------------------------------------------------
def _enrich_duty(duty: dict, context: Optional[dict] = None) -> dict:
    slot = (context or {}).get("slot") or store.get_time_slot(duty["slot_id"]) or {}
    room_source = store.get_room(duty["room_id"]) or {}
    plan_room = {}
    required = _room_required(room_source, plan_room)
    if context:
        room = next(
            (item for item in context.get("rooms", []) if item["room_id"] == duty["room_id"]),
            None,
        )
        if room:
            required = room["required"]
            plan_room = room.get("plan_room") or {}
    stored_type = duty.get("duty_type") or ""
    is_ecr_rotation = stored_type == "ecr_rotation"
    own_subject = (
        stored_type == "own_subject"
        or (stored_type != "ecr_rotation" and _is_own_subject(
            duty.get("instructor", ""), (context or {}).get("entries", [])
        ))
    )
    is_morning = _is_morning(slot) if slot else False
    warnings = []
    instructor_role = _faculty_role(duty.get("instructor", ""))
    if (
        is_senior(duty.get("instructor", ""))
        and instructor_role == "regular"
        and not is_morning
    ):
        warnings.append("Senior professor assigned outside the preferred morning slots.")
    if duty.get("source") == "manual":
        warnings.append("Manual override: preserved during recalculation unless released.")
    return {
        **duty,
        "source": duty.get("source", "auto"),
        "is_counted": 0 if is_ecr_rotation else int(not own_subject),
        "duty_type": "ecr_rotation" if is_ecr_rotation else (
            "own_subject" if own_subject else "extra"
        ),
        "notes": duty.get("notes") or "",
        "updated_at": duty.get("updated_at") or duty.get("created_at", ""),
        "slot_date": slot.get("date", ""),
        "slot_start_time": slot.get("start_time", ""),
        "slot_end_time": slot.get("end_time", ""),
        "slot_label": slot.get("label", ""),
        "slot_is_morning": is_morning,
        "room_name": room_source.get("name") or plan_room.get("room_name") or duty["room_id"],
        "room_type": room_source.get("room_type") or plan_room.get("room_type") or "hall",
        "required_invigilators": required,
        "faculty_role": instructor_role,
        "is_ecr": instructor_role == "ecr",
        "is_no_duty": instructor_role == "no_duty",
        "is_chairman": instructor_role == "chairman",
        "is_visiting": instructor_role == "visiting",
        "is_senior_role": instructor_role == "senior",
        "is_senior": instructor_role == "senior" or is_senior(duty.get("instructor", "")),
        "is_ecr_rotation": is_ecr_rotation,
        "warnings": warnings,
    }


def _issue(
    severity: str,
    code: str,
    message: str,
    duty: Optional[dict] = None,
    slot_id: str = "",
    room_id: str = "",
    instructor: str = "",
) -> dict:
    return {
        "severity": severity,
        "code": code,
        "message": message,
        "duty_id": (duty or {}).get("id", ""),
        "slot_id": (duty or {}).get("slot_id", slot_id),
        "room_id": (duty or {}).get("room_id", room_id),
        "instructor": (duty or {}).get("instructor", instructor),
    }


def _validate_roster(
    duties: List[dict],
    contexts: Dict[str, dict],
    cap: int,
    coverage_slot_ids: Optional[set] = None,
) -> List[dict]:
    issues: List[dict] = []
    by_slot: Dict[str, List[dict]] = defaultdict(list)
    for duty in duties:
        by_slot[duty["slot_id"]].append(duty)

    for duty in duties:
        context = contexts.get(duty["slot_id"])
        if not context:
            issues.append(_issue(
                "error", "unknown_slot",
                f"Duty references slot {duty['slot_id']} which is not in the active datesheet.",
                duty,
            ))
            continue
        if context.get("error"):
            issues.append(_issue("error", "slot_unavailable", context["error"], duty))
            continue
        for message in _validate_duty(
            duty, context, duties, cap, ignore_id=duty["id"],
            require_known_faculty=False, require_room_capacity=True,
        ):
            issues.append(_issue("error", "invalid_duty", message, duty))
        duty_role = _faculty_role(duty.get("instructor", ""))
        if (
            is_senior(duty.get("instructor", ""))
            and duty_role == "regular"
            and not context["is_morning"]
        ):
            issues.append(_issue(
                "warning", "senior_afternoon",
                f"Senior professor {duty['instructor']} is assigned to an afternoon slot.",
                duty,
            ))

    # Room-level coverage checks.  A targeted recalculation only validates
    # coverage for the slots it actually regenerated; duties in other slots
    # are still validated above for room, clash, ECR, and cap violations.
    for slot_id, context in contexts.items():
        if coverage_slot_ids is not None and slot_id not in coverage_slot_ids:
            continue
        if context.get("error"):
            continue
        slot_duties = by_slot.get(slot_id, [])
        for room in context.get("rooms", []):
            assigned = [
                duty for duty in slot_duties if duty["room_id"] == room["room_id"]
            ]
            if len(assigned) < room["required"]:
                issues.append(_issue(
                    "error", "understaffed_room",
                    f"{room['room_name']} in slot {slot_id} has {len(assigned)} "
                    f"invigilator(s); {room['required']} required.",
                    slot_id=slot_id, room_id=room["room_id"],
                ))
            elif len(assigned) > room["required"]:
                issues.append(_issue(
                    "error", "overstaffed_room",
                    f"{room['room_name']} in slot {slot_id} has {len(assigned)} "
                    f"invigilator(s); only {room['required']} allowed.",
                    slot_id=slot_id, room_id=room["room_id"],
                ))
        known_room_ids = {room["room_id"] for room in context.get("rooms", [])}
        for duty in slot_duties:
            if duty["room_id"] not in known_room_ids:
                issues.append(_issue(
                    "error", "inactive_room",
                    f"Room {duty['room_id']} is not active in slot {slot_id}.",
                    duty,
                ))

    # Slot-level duplicate checks are handled per duty above.  Lab instructors
    # may appear in multiple lab rooms when a lab paper is split; halls cannot.
    # Per-teacher caps (own-paper duties exempt): admin overrides replace the
    # default cap; dire-need seniors use their tighter limit.
    seen_names: Dict[str, str] = {}
    for duty in duties:
        normalized = normalize_name(duty.get("instructor", ""))
        if normalized and normalized not in seen_names:
            seen_names[normalized] = duty.get("instructor", "")
    for normalized, name in seen_names.items():
        effective_cap = _faculty_cap(name)
        _total, counted = _duty_load(name, duties)
        if counted > effective_cap:
            issues.append(_issue(
                "error", "cap_exceeded",
                f"{name} has {counted} counted extra duties; the cap is "
                f"{effective_cap}.",
                instructor=name,
            ))

    # ECR rotation: at most one relief duty (rotation or extra) per slot.
    ecr_by_slot: Dict[str, List[dict]] = defaultdict(list)
    for duty in duties:
        if duty.get("duty_type") == "ecr_rotation" or (
            _faculty_role(duty.get("instructor", "")) == "ecr"
            and duty.get("duty_type") == "extra"
        ):
            ecr_by_slot[duty["slot_id"]].append(duty)
    for slot_id, slot_ecr in ecr_by_slot.items():
        if len(slot_ecr) > 1:
            issues.append(_issue(
                "warning", "multiple_ecr_duties",
                f"Slot {slot_id} has {len(slot_ecr)} ECR relief duties; the "
                "rotation allots one ECR teacher per slot.",
                slot_id=slot_id,
            ))

    # De-duplicate identical issues while preserving order.
    unique = []
    seen_keys = set()
    for issue in issues:
        key = (
            issue["severity"], issue["code"], issue["message"],
            issue["slot_id"], issue["room_id"], issue["instructor"],
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unique.append(issue)
    return unique


def _slot_requirements(contexts: Dict[str, dict], duties: List[dict]) -> List[dict]:
    by_room: Dict[Tuple[str, str], int] = defaultdict(int)
    for duty in duties:
        by_room[(duty["slot_id"], duty["room_id"])] += 1
    result = []
    for slot_id, context in contexts.items():
        slot = context["slot"]
        rooms = []
        for room in context.get("rooms", []):
            assigned = by_room.get((slot_id, room["room_id"]), 0)
            rooms.append({
                "room_id": room["room_id"],
                "room_name": room["room_name"],
                "room_type": room["room_type"],
                "is_lab": room["is_lab"],
                "required": room["required"],
                "assigned": assigned,
                "missing": max(0, room["required"] - assigned),
                "overstaffed": max(0, assigned - room["required"]),
                "lab_teachers": room.get("lab_teachers", []),
            })
        rooms.sort(key=lambda item: (0 if item["is_lab"] else 1, item["room_name"]))
        result.append({
            "slot_id": slot_id,
            "date": slot.get("date", ""),
            "start_time": slot.get("start_time", ""),
            "end_time": slot.get("end_time", ""),
            "label": slot.get("label", ""),
            "is_morning": context.get("is_morning", False),
            "error": context.get("error", ""),
            "rooms": rooms,
        })
    result.sort(key=lambda item: (item["date"], item["start_time"], item["slot_id"]))
    return result


def _faculty_workload(duties: List[dict], cap: int = MAX_EXTRA_DUTIES) -> List[dict]:
    registry, courses = _faculty_registry()
    # Include any historical duty holder who may no longer have an assignment.
    for duty in duties:
        name = (duty.get("instructor") or "").strip()
        if name:
            registry.setdefault(normalize_name(name), name)
    extra_counts = _extra_duty_counts(duties)
    own_counts: Dict[str, int] = defaultdict(int)
    ecr_rotation_counts: Dict[str, int] = defaultdict(int)
    total_counts: Dict[str, int] = defaultdict(int)
    for duty in duties:
        normalized = normalize_name(duty.get("instructor", ""))
        total_counts[normalized] += 1
        if duty.get("duty_type") == "ecr_rotation":
            ecr_rotation_counts[normalized] += 1
        elif not _duty_is_counted(duty):
            own_counts[normalized] += 1
    result = []
    for normalized, name in registry.items():
        role = _faculty_role(name)
        extra = extra_counts.get(normalized, 0)
        own = own_counts.get(normalized, 0)
        ecr_rotation = ecr_rotation_counts.get(normalized, 0)
        effective_cap = _faculty_cap(name, cap)
        if role == "no_duty":
            reason = (
                "No-duty role: no invigilation duty is allotted; they only "
                "visit their own exam venue to handle student queries."
            )
        elif role == "chairman":
            reason = (
                "Chairman/HOD: one duty only — their own exam."
            )
        elif role == "visiting":
            reason = "Visiting faculty are only allotted duty in their own exam."
        elif role == "senior":
            reason = (
                "Most-senior faculty: at most two extra duties, allotted only "
                "when other teachers are already carrying extra load."
            )
        elif role == "ecr":
            reason = (
                "ECR relief staff: one rotation duty per slot (round-robin); "
                "no ECR duty when their own paper runs in that slot."
            )
        else:
            reason = ""
        used = extra
        result.append({
            "name": name,
            "normalized_name": normalized,
            "faculty_role": role,
            "is_ecr": role == "ecr",
            "is_no_duty": role == "no_duty",
            "is_chairman": role == "chairman",
            "is_visiting": role == "visiting",
            "is_senior_role": role == "senior",
            "is_senior": role == "senior" or is_senior(name),
            "eligible_for_hall": role in {"regular", "ecr", "senior"},
            "exemption_reason": reason,
            "max_duties": effective_cap,
            "courses": sorted(courses.get(normalized, set())),
            "total_duties": total_counts.get(normalized, 0),
            "extra_duties": extra,
            "own_subject_duties": own,
            "ecr_rotation_duties": ecr_rotation,
            "remaining_extra_capacity": max(0, effective_cap - used),
        })
    result.sort(key=lambda item: (
        item["is_no_duty"], item["is_ecr"],
        -item["extra_duties"], item["normalized_name"],
    ))
    return result


def list_duties(slot_id: Optional[str] = None, instructor: Optional[str] = None) -> List[dict]:
    """Return duties enriched with slot, room, and policy metadata."""
    duties = database.get_invigilation_duties(slot_id=slot_id, instructor=instructor)
    state = datesheet_state
    contexts: Dict[str, dict] = {}
    for duty in duties:
        sid = duty["slot_id"]
        if sid in contexts:
            continue
        slot = store.get_time_slot(sid)
        contexts[sid] = _safe_context(slot, state) if slot else {}
    enriched = [_enrich_duty(duty, contexts.get(duty["slot_id"])) for duty in duties]
    enriched.sort(key=lambda duty: (
        duty.get("slot_date", ""), duty.get("slot_start_time", ""),
        duty.get("room_name", ""), normalize_name(duty.get("instructor", "")),
    ))
    return enriched


def get_roster_summary() -> dict:
    """Return the complete roster, health issues, slot coverage, and workload."""
    state = datesheet_state
    duties = database.get_invigilation_duties()
    contexts: Dict[str, dict] = {}
    if state.get("status") == "PUBLISHED" and state.get("datesheet"):
        for slot in _selected_slots(state):
            contexts[slot["id"]] = _safe_context(slot, state)
    issues = _validate_roster(duties, contexts, MAX_EXTRA_DUTIES)
    enriched = [_enrich_duty(duty, contexts.get(duty["slot_id"])) for duty in duties]
    enriched.sort(key=lambda duty: (
        duty.get("slot_date", ""), duty.get("slot_start_time", ""),
        duty.get("room_name", ""), normalize_name(duty.get("instructor", "")),
    ))
    slots = _slot_requirements(contexts, duties)
    faculty = _faculty_workload(duties)
    own_subject_count = sum(1 for duty in duties if not _duty_is_counted(duty))
    ecr_rotation_count = sum(1 for duty in duties if duty.get("duty_type") == "ecr_rotation")
    extra_count = len(duties) - own_subject_count - ecr_rotation_count
    manual_count = sum(1 for duty in duties if duty.get("source") == "manual")
    auto_count = len(duties) - manual_count
    required_rooms = sum(len(slot["rooms"]) for slot in slots)
    staffed_rooms = sum(
        1 for slot in slots for room in slot["rooms"] if room["missing"] == 0 and not room["overstaffed"]
    )
    understaffed_rooms = sum(
        1 for slot in slots for room in slot["rooms"] if room["missing"] > 0
    )
    overstaffed_rooms = sum(
        1 for slot in slots for room in slot["rooms"] if room["overstaffed"] > 0
    )
    errors = [issue for issue in issues if issue["severity"] == "error"]
    warnings = [issue for issue in issues if issue["severity"] == "warning"]
    return {
        "datesheet_status": state.get("status", ""),
        "datesheet_version": state.get("version"),
        "duties": enriched,
        "faculty": faculty,
        "issues": issues,
        "slots": slots,
        "stats": {
            "total_duties": len(duties),
            "own_subject_count": own_subject_count,
            "extra_count": extra_count,
            "manual_count": manual_count,
            "auto_count": auto_count,
            "required_rooms": required_rooms,
            "staffed_rooms": staffed_rooms,
            "understaffed_rooms": understaffed_rooms,
            "overstaffed_rooms": overstaffed_rooms,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "ecr_rotation_count": ecr_rotation_count,
            "ecr_count": sum(1 for item in faculty if item["is_ecr"]),
            "chairman_count": sum(1 for item in faculty if item["is_chairman"]),
            "senior_role_count": sum(1 for item in faculty if item["is_senior_role"]),
            "visiting_count": sum(1 for item in faculty if item["is_visiting"]),
            "no_duty_count": sum(1 for item in faculty if item["is_no_duty"]),
            "ecr_exempt_count": sum(1 for item in faculty if item["is_ecr"]),
            "senior_count": sum(1 for item in faculty if item["is_senior"]),
        },
        "extra_duty_cap": MAX_EXTRA_DUTIES,
        "min_extra_duty_cap": MIN_EXTRA_DUTIES,
        "ecr_rotation_applied": True,
        "chairman_own_exam_only": True,
        "senior_dire_need_cap": SENIOR_MAX_EXTRA_DUTIES,
        "ecr_exemptions_applied": True,
        "no_duty_exclusions_applied": True,
        "own_subject_room_placement": True,
        "senior_morning_priority": True,
    }


def get_faculty_workload() -> List[dict]:
    return _faculty_workload(database.get_invigilation_duties())


def get_slot_requirements(slot_id: str) -> dict:
    state = _require_published_state()
    slot = store.get_time_slot(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
    if not _slot_has_papers(state, slot_id):
        raise HTTPException(status_code=404, detail="No papers are scheduled in this slot.")
    context = _build_context(slot, state)
    duties = database.get_invigilation_duties(slot_id=slot_id)
    return _slot_requirements({slot_id: context}, duties)[0]


# ---------------------------------------------------------------------------
# Manual override CRUD
# ---------------------------------------------------------------------------
def _context_for_duty(duty: dict) -> dict:
    state = _require_published_state()
    slot = store.get_time_slot(duty["slot_id"])
    if not slot:
        raise HTTPException(status_code=404, detail=f"Time slot '{duty['slot_id']}' not found.")
    context = _build_context(slot, state)
    if context.get("error"):
        raise HTTPException(status_code=409, detail=context["error"])
    return context


def _raise_validation(errors: List[str], status_code: int = 422) -> None:
    if errors:
        raise HTTPException(status_code=status_code, detail="; ".join(errors))


def create_manual_duty(payload: dict) -> dict:
    """Create a manual assignment while enforcing every hard roster rule."""
    with _ROSTER_LOCK:
        state = _require_published_state()
        slot_id = (payload.get("slot_id") or "").strip()
        room_id = (payload.get("room_id") or "").strip()
        instructor_input = (payload.get("instructor") or "").strip()
        status = payload.get("status") or "assigned"
        notes = payload.get("notes") or ""
        if not slot_id or not room_id or not instructor_input:
            raise HTTPException(
                status_code=400,
                detail="slot_id, room_id, and instructor are required.",
            )
        slot = store.get_time_slot(slot_id)
        if not slot:
            raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")
        if not _slot_has_papers(state, slot_id):
            raise HTTPException(status_code=404, detail="No papers are scheduled in this slot.")
        context = _build_context(slot, state)
        if context.get("error"):
            raise HTTPException(status_code=409, detail=context["error"])
        room = next((item for item in context["rooms"] if item["room_id"] == room_id), None)
        if not room:
            raise HTTPException(
                status_code=400,
                detail=f"Room '{room_id}' is not active in slot {slot_id}.",
            )
        registry, _ = _faculty_registry()
        instructor = _canonical_faculty_name(instructor_input, registry)
        if not instructor:
            raise HTTPException(
                status_code=400,
                detail=f"'{instructor_input}' is not a registered CS & IT faculty member.",
            )
        all_duties = database.get_invigilation_duties()
        duty = _make_duty(
            slot_id, room_id, instructor, context["entries"],
            source="manual", status=status, notes=notes,
        )
        errors = _validate_duty(
            duty, context, all_duties, MAX_EXTRA_DUTIES,
            require_known_faculty=True, require_room_capacity=True,
        )
        _raise_validation(errors)
        try:
            saved = database.add_invigilation_duty(duty)
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="That instructor is already assigned in this slot.",
            ) from exc
        return _enrich_duty(saved, context)


def update_manual_duty(duty_id: str, payload: dict) -> dict:
    """Edit a duty and mark it as a manual override preserved by recalculation."""
    with _ROSTER_LOCK:
        existing = database.get_invigilation_duty(duty_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Invigilation duty not found.")
        context = _context_for_duty(existing)
        instructor_input = payload.get("instructor")
        if instructor_input is not None:
            instructor_input = instructor_input.strip()
            if not instructor_input:
                raise HTTPException(status_code=400, detail="Instructor name cannot be empty.")
            registry, _ = _faculty_registry()
            instructor = _canonical_faculty_name(instructor_input, registry)
            if not instructor:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{instructor_input}' is not a registered CS & IT faculty member.",
                )
        else:
            instructor = existing["instructor"]
        status = payload.get("status", existing.get("status", "assigned"))
        notes = payload.get("notes", existing.get("notes", "")) or ""
        updated = {
            **existing,
            "instructor": instructor,
            "status": status,
            "notes": notes,
            "source": "manual",
            "updated_at": _now(),
        }
        updated["duty_type"] = (
            "own_subject" if _is_own_subject(instructor, context["entries"]) else "extra"
        )
        updated["is_counted"] = 0 if updated["duty_type"] == "own_subject" else 1
        all_duties = database.get_invigilation_duties()
        errors = _validate_duty(
            updated, context, all_duties, MAX_EXTRA_DUTIES,
            ignore_id=duty_id, require_known_faculty=True,
            require_room_capacity=True,
        )
        _raise_validation(errors)
        try:
            saved = database.update_invigilation_duty(duty_id, {
                "instructor": instructor,
                "status": status,
                "notes": notes,
                "source": "manual",
                "duty_type": updated["duty_type"],
                "is_counted": updated["is_counted"],
                "updated_at": updated["updated_at"],
            })
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="That instructor is already assigned in this slot.",
            ) from exc
        if not saved:
            raise HTTPException(status_code=404, detail="Invigilation duty not found.")
        return _enrich_duty(saved, context)


def delete_manual_duty(duty_id: str) -> dict:
    """Delete a duty only when the room would remain fully staffed."""
    with _ROSTER_LOCK:
        duty = database.get_invigilation_duty(duty_id)
        if not duty:
            raise HTTPException(status_code=404, detail="Invigilation duty not found.")
        try:
            context = _context_for_duty(duty)
        except HTTPException:
            # A stale duty for a superseded datesheet can always be removed.
            context = None
        if context:
            room = next(
                (item for item in context["rooms"] if item["room_id"] == duty["room_id"]),
                None,
            )
            if room:
                room_duties = [
                    item for item in database.get_invigilation_duties(slot_id=duty["slot_id"])
                    if item["room_id"] == duty["room_id"]
                ]
                if len(room_duties) - 1 < room["required"]:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Cannot remove {duty['instructor']} from {room['room_name']}: "
                            f"{room['required']} invigilator(s) are required. "
                            "Assign a replacement first, or recalculate the slot."
                        ),
                    )
        database.delete_invigilation_duty(duty_id)
        return {"deleted": True, "duty_id": duty_id}


# ---------------------------------------------------------------------------
# Generation and recalculation
# ---------------------------------------------------------------------------
def generate_duties(
    slot_ids_filter: Optional[List[str]] = None,
    preserve_manual: bool = True,
    duty_cap: int = MAX_EXTRA_DUTIES,
    release_invalid_manual: bool = False,
) -> dict:
    """Generate or recalculate duties while enforcing all departmental rules."""
    with _ROSTER_LOCK:
        state = _require_published_state()
        try:
            cap = int(duty_cap or MAX_EXTRA_DUTIES)
        except (TypeError, ValueError):
            cap = MAX_EXTRA_DUTIES
        if cap < MIN_EXTRA_DUTIES or cap > MAX_EXTRA_DUTIES:
            raise HTTPException(
                status_code=400,
                detail=f"Extra-duty cap must be between {MIN_EXTRA_DUTIES} and {MAX_EXTRA_DUTIES}.",
            )

        target_slots = _selected_slots(state, slot_ids_filter)
        target_ids = {slot["id"] for slot in target_slots}
        for slot in target_slots:
            if not _slot_has_papers(state, slot["id"]):
                raise HTTPException(
                    status_code=400,
                    detail=f"No papers are scheduled in slot {slot['id']}.",
                )

        contexts: Dict[str, dict] = {}
        for slot in target_slots:
            context = _build_context(slot, state)
            if context.get("error"):
                raise HTTPException(status_code=409, detail=context["error"])
            if not context.get("rooms"):
                raise HTTPException(
                    status_code=409,
                    detail=f"No active rooms are available for slot {slot['id']}.",
                )
            contexts[slot["id"]] = context

        # Validate retained duties against every active slot, not only the
        # target subset.  Coverage failures are still scoped to target slots
        # so a targeted recalculation can run while other slots are awaiting
        # their first generation.
        validation_contexts = dict(contexts)
        for slot in _selected_slots(state):
            if slot["id"] not in validation_contexts:
                validation_contexts[slot["id"]] = _safe_context(slot, state)

        existing = database.get_invigilation_duties()
        retained: List[dict] = []
        preserved_manual: List[dict] = []
        for duty in existing:
            if duty["slot_id"] not in target_ids:
                retained.append(duty)
            elif preserve_manual and duty.get("source") == "manual":
                preserved_manual.append(duty)

        working = retained + preserved_manual
        manual_errors: List[str] = []
        released_manual: List[dict] = []
        for duty in list(preserved_manual):
            context = contexts.get(duty["slot_id"])
            if not context:
                manual_errors.append(
                    f"Manual duty {duty['id']} references an unavailable slot."
                )
                continue
            # Keep stored classification in sync with the current datesheet.
            own_subject = _is_own_subject(duty["instructor"], context["entries"])
            duty["duty_type"] = "own_subject" if own_subject else "extra"
            duty["is_counted"] = 0 if own_subject else 1
            errors = _validate_duty(
                duty, context, working, cap,
                ignore_id=duty["id"], require_known_faculty=True,
                require_room_capacity=True,
            )
            if errors:
                manual_errors.extend(
                    f"{duty['instructor']} in {duty['room_id']} / {duty['slot_id']}: {message}"
                    for message in errors
                )
        if manual_errors and not release_invalid_manual:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Manual overrides conflict with the current datesheet or hard rules: "
                    + "; ".join(manual_errors)
                    + " Fix or release the conflicting overrides, then recalculate."
                ),
            )
        if manual_errors and release_invalid_manual:
            # Re-validate incrementally against only the overrides that have
            # already been accepted, so one bad override cannot poison the
            # validation of unrelated manual duties.
            accepted_manual: List[dict] = []
            working = retained.copy()
            for duty in preserved_manual:
                context = contexts.get(duty["slot_id"])
                errors = _validate_duty(
                    duty, context, working + [duty], cap,
                    ignore_id=duty["id"], require_known_faculty=True,
                    require_room_capacity=True,
                ) if context else ["Slot unavailable."]
                if errors:
                    released_manual.append(duty)
                else:
                    accepted_manual.append(duty)
                    working.append(duty)
            preserved_manual = accepted_manual

        counts = _extra_duty_counts(working)
        used_by_slot = _used_by_slot(working)
        new_duties: List[dict] = []
        registry_all, _ = _faculty_registry()
        ecr_members = _ecr_rotation_order(registry_all)
        # Rotation pointer persists across slots in chronological order so the
        # cycle continues from the last assigned member (one ECR per slot).
        ecr_state = {"pos": 0}
        if ecr_members and retained:
            # Targeted recalculation: resume the cycle after the last rotation
            # duty scheduled before the target slots so a partial recalc does
            # not restart the rotation from the beginning.
            first_target_key = min(_slot_sort_key(slot) for slot in target_slots)
            member_norms = [normalize_name(member) for member in ecr_members]
            last_before: Optional[Tuple[Tuple[str, str, str], str]] = None
            for duty in retained:
                if duty.get("duty_type") != "ecr_rotation":
                    continue
                prior_slot = store.get_time_slot(duty["slot_id"])
                if not prior_slot:
                    continue
                slot_key = _slot_sort_key(prior_slot)
                if slot_key < first_target_key and (
                    last_before is None or slot_key > last_before[0]
                ):
                    last_before = (slot_key, duty["instructor"])
            if last_before:
                normalized_last = normalize_name(last_before[1])
                if normalized_last in member_norms:
                    ecr_state["pos"] = (
                        member_norms.index(normalized_last) + 1
                    ) % len(ecr_members)

        for slot in target_slots:
            context = contexts[slot["id"]]
            slot_id = slot["id"]
            slot_duties = [duty for duty in working if duty["slot_id"] == slot_id]
            slot_used = used_by_slot[slot_id]
            rooms = sorted(
                context["rooms"],
                key=lambda room: (0 if room["is_lab"] else 1, room["room_name"]),
            )
            reserved_labs = _reserved_lab_teachers(context)

            def _room_missing(room: dict) -> int:
                assigned = sum(
                    1 for duty in slot_duties if duty["room_id"] == room["room_id"]
                )
                return max(0, room["required"] - assigned)

            for room in rooms:
                existing_room = [
                    duty for duty in slot_duties if duty["room_id"] == room["room_id"]
                ]
                if len(existing_room) > room["required"]:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"{room['room_name']} in slot {slot_id} already has "
                            f"{len(existing_room)} invigilator(s); only "
                            f"{room['required']} allowed."
                        ),
                    )

            def _append_duty(duty: dict, instructor: str, counted: bool):
                working.append(duty)
                slot_duties.append(duty)
                new_duties.append(duty)
                slot_used.add(normalize_name(instructor))
                if counted:
                    counts[normalize_name(instructor)] = (
                        counts.get(normalize_name(instructor), 0) + 1
                    )

            # ---- Phase 1: labs -------------------------------------------
            # Reserve the lab's own course instructor before filling halls.
            # A split lab paper may use the same instructor in several lab
            # rooms, but that instructor cannot also cover a hall.
            for room in rooms:
                if not room["is_lab"] or not room.get("lab_teachers"):
                    continue
                missing = _room_missing(room)
                if missing <= 0:
                    continue
                lab_teacher = room["lab_teachers"][0]
                if _instructor_used_in_hall(slot_duties, context, lab_teacher):
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"Lab {room['room_name']} in slot {slot_id} requires its "
                            f"course instructor ({', '.join(room['lab_teachers'])}), "
                            "but that instructor is already assigned to a hall in this slot."
                        ),
                    )
                duty = _make_duty(
                    slot_id, room["room_id"], lab_teacher,
                    context["entries"], source="auto",
                )
                _append_duty(duty, lab_teacher, False)

            # ---- Phase 2: own-subject hall placement ---------------------
            # A teacher whose paper runs must be in the hall seating their
            # course.  Each teacher is aimed at the room holding the largest
            # share of their students (rooms 26/18 for the biggest cohorts).
            own_plan = _own_subject_hall_plan(context)
            for room in rooms:
                if room["is_lab"]:
                    continue
                missing = _room_missing(room)
                if missing <= 0:
                    continue
                planned = []
                for normalized, (target_room_id, teacher, student_count) in own_plan.items():
                    if target_room_id != room["room_id"]:
                        continue
                    if normalize_name(teacher) in slot_used:
                        continue
                    if _faculty_role(teacher) == "no_duty":
                        continue
                    if not _is_own_subject(teacher, context["entries"]):
                        continue
                    planned.append((student_count, normalized, teacher))
                # The teacher with the most students in this room goes first.
                planned.sort(key=lambda item: (-item[0], item[1]))
                for _count, normalized_teacher, teacher in planned:
                    if missing <= 0:
                        break
                    duty = _make_duty(
                        slot_id, room["room_id"], teacher,
                        context["entries"], source="auto",
                    )
                    _append_duty(duty, teacher, False)
                    missing -= 1
            # Fallback: any own-paper teacher not yet placed (their
            # max-student room filled up) still covers one of their rooms.
            for room in rooms:
                if room["is_lab"]:
                    continue
                missing = _room_missing(room)
                for room_teacher in room.get("room_teachers", []):
                    if missing <= 0:
                        break
                    normalized_teacher = normalize_name(room_teacher)
                    if normalized_teacher in slot_used:
                        continue
                    if _faculty_role(room_teacher) == "no_duty":
                        continue
                    if not _is_own_subject(room_teacher, context["entries"]):
                        continue
                    duty = _make_duty(
                        slot_id, room["room_id"], room_teacher,
                        context["entries"], source="auto",
                    )
                    _append_duty(duty, room_teacher, False)
                    missing -= 1

            # ---- Phase 3: ECR relief rotation ----------------------------
            # Exactly one ECR teacher per slot, cycling round-robin in the
            # order the rulings list them; a member with their own paper in
            # the slot never takes ECR duty.  The relief posting lands in the
            # busiest hall still missing an invigilator so its course teacher
            # can be relieved to visit other rooms.  Rotation duties are
            # exempt from the extra-duty cap.
            if ecr_members:
                slot_ecr_norms = {
                    normalize_name(duty["instructor"]) for duty in slot_duties
                    if _faculty_role(duty["instructor"]) == "ecr"
                    and duty.get("duty_type") in ("extra", "ecr_rotation")
                }
                if slot_ecr_norms:
                    # A manual ECR duty already occupies this slot's turn;
                    # the rotation resumes after that member.
                    member_norms = [normalize_name(member) for member in ecr_members]
                    indexes = [
                        member_norms.index(normalized)
                        for normalized in slot_ecr_norms
                        if normalized in member_norms
                    ]
                    if indexes:
                        ecr_state["pos"] = (max(indexes) + 1) % len(ecr_members)
                else:
                    relief_room = _ecr_relief_room(context, slot_duties)
                    if relief_room is not None:
                        for offset in range(len(ecr_members)):
                            index = (ecr_state["pos"] + offset) % len(ecr_members)
                            member = ecr_members[index]
                            normalized_member = normalize_name(member)
                            if normalized_member in slot_used:
                                continue
                            if normalized_member in reserved_labs:
                                continue
                            # Own paper -> no ECR duty in that slot.
                            if _is_own_subject(member, context["entries"]):
                                continue
                            duty = _make_duty(
                                slot_id, relief_room["room_id"], member,
                                context["entries"], source="auto",
                                notes="ECR rotation relief duty.",
                            )
                            duty["duty_type"] = "ecr_rotation"
                            duty["is_counted"] = 0
                            _append_duty(duty, member, False)
                            ecr_state["pos"] = (index + 1) % len(ecr_members)
                            break

            # ---- Phase 4: generic fill -----------------------------------
            # Regular faculty first (senior professors prioritised for
            # morning slots), dire-need seniors last, and an ECR member only
            # as a last resort when the slot has no rotation duty yet.
            for room in rooms:
                if room["is_lab"]:
                    continue
                missing = _room_missing(room)
                for _ in range(missing):
                    slot_has_ecr = any(
                        _faculty_role(duty["instructor"]) == "ecr"
                        and duty.get("duty_type") in ("extra", "ecr_rotation")
                        for duty in slot_duties
                    )
                    candidates = _eligible_candidates(
                        context, slot_used, counts, cap,
                        all_duties=working, allow_ecr=not slot_has_ecr,
                    )
                    if not candidates:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                f"Invigilation roster could not staff {room['room_name']} "
                                f"for slot {slot_id}; {room['required']} invigilator(s) are "
                                "required, and eligible faculty have reached their duty "
                                "caps. Release a manual override, adjust faculty policy, "
                                "or add more faculty."
                            ),
                        )
                    instructor = candidates[0]
                    duty = _make_duty(
                        slot_id, room["room_id"], instructor,
                        context["entries"], source="auto",
                    )
                    _append_duty(duty, instructor, True)

        issues = _validate_roster(
            working, validation_contexts, cap, coverage_slot_ids=target_ids,
        )
        hard_errors = [issue for issue in issues if issue["severity"] == "error"]
        if hard_errors:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Generated roster failed hard-rule validation: "
                    + "; ".join(issue["message"] for issue in hard_errors[:8])
                ),
            )

        database.replace_invigilation_duties(working)
        enriched_new = [_enrich_duty(duty, contexts.get(duty["slot_id"])) for duty in new_duties]
        return {
            "generated_count": len(new_duties),
            "preserved_manual_count": len(preserved_manual),
            "released_manual_count": len(released_manual),
            "ecr_rotation_count": sum(
                1 for duty in new_duties if duty.get("duty_type") == "ecr_rotation"
            ),
            "duties": enriched_new,
            "extra_duty_cap": cap,
            "ecr_rotation_applied": True,
            "chairman_own_exam_only": True,
            "senior_dire_need_cap": SENIOR_MAX_EXTRA_DUTIES,
            "ecr_exemptions_applied": True,
            "no_duty_exclusions_applied": True,
            "own_subject_room_placement": True,
            "senior_morning_priority": True,
            "warnings": [issue for issue in issues if issue["severity"] == "warning"],
        }


def recalculate_duties(
    slot_ids_filter: Optional[List[str]] = None,
    preserve_manual: bool = True,
    duty_cap: int = MAX_EXTRA_DUTIES,
    release_invalid_manual: bool = False,
) -> dict:
    """Alias for generate_duties used by the explicit recalculate endpoint."""
    return generate_duties(
        slot_ids_filter=slot_ids_filter,
        preserve_manual=preserve_manual,
        duty_cap=duty_cap,
        release_invalid_manual=release_invalid_manual,
    )


# ---------------------------------------------------------------------------
# Admin faculty policy (roles, duty caps, admin-added teachers)
# ---------------------------------------------------------------------------
def _faculty_policy_view() -> List[dict]:
    registry, courses = _faculty_registry()
    overrides = {
        normalize_name(row.get("instructor_name", "")): row
        for row in _faculty_policy_rows()
        if row.get("instructor_name")
    }
    result = []
    for normalized, name in registry.items():
        row = overrides.get(normalized)
        result.append({
            "instructor": name,
            "role": _faculty_role(name),
            "max_extra_duties": _faculty_cap(name),
            "max_extra_duties_override": (
                row.get("max_extra_duties") if row else None
            ),
            "notes": (row or {}).get("notes", ""),
            "courses": sorted(courses.get(normalized, set())),
            "source": "policy" if row else "default",
        })
    for normalized, row in overrides.items():
        if normalized in registry:
            continue
        name = row["instructor_name"]
        # Admin-added teacher: lives only in the policy table until a course
        # assignment exists for them.
        result.append({
            "instructor": name,
            "role": _faculty_role(name),
            "max_extra_duties": _faculty_cap(name),
            "max_extra_duties_override": row.get("max_extra_duties"),
            "notes": row.get("notes", ""),
            "courses": [],
            "source": "policy",
        })
    result.sort(key=lambda item: normalize_name(item["instructor"]))
    return result


def list_faculty_policy() -> List[dict]:
    """Return every faculty member with their effective role and duty cap."""
    return _faculty_policy_view()


def upsert_faculty_policy(payload: dict) -> dict:
    """Create or update a faculty policy row (role / cap / new teacher)."""
    instructor = (payload.get("instructor") or "").strip()
    if not instructor:
        raise HTTPException(status_code=400, detail="Instructor name is required.")
    role = (payload.get("role") or "regular").strip().lower()
    if role not in FACULTY_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown faculty role '{role}'. Allowed: {', '.join(FACULTY_ROLES)}.",
        )
    max_extra = payload.get("max_extra_duties")
    if max_extra is not None:
        try:
            max_extra = int(max_extra)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400, detail="max_extra_duties must be a number.",
            )
        if max_extra < 0 or max_extra > 20:
            raise HTTPException(
                status_code=400,
                detail="max_extra_duties must be between 0 and 20.",
            )
    notes = (payload.get("notes") or "").strip()
    saved = database.upsert_faculty_policy({
        "instructor_name": instructor,
        "role": role,
        "max_extra_duties": max_extra,
        "notes": notes,
        "updated_at": _now(),
    })
    view = next(
        (item for item in _faculty_policy_view()
         if normalize_name(item["instructor"]) == normalize_name(instructor)),
        None,
    )
    return {
        "policy": saved,
        "faculty": view,
        "message": (
            f"{instructor} saved with role '{role}'. Recalculate the roster to "
            "apply the new policy."
        ),
    }


def delete_faculty_policy(instructor: str) -> dict:
    """Remove an override; for admin-added teachers this removes them entirely."""
    normalized = normalize_name(instructor)
    if not normalized:
        raise HTTPException(status_code=400, detail="Instructor name is required.")
    policy = database.get_faculty_policy(instructor)
    if not policy:
        # The policy may exist under a different spelling of the same name.
        policy = next(
            (row for row in _faculty_policy_rows()
             if normalize_name(row["instructor_name"]) == normalized),
            None,
        )
        if not policy:
            raise HTTPException(
                status_code=404, detail=f"No faculty policy found for '{instructor}'.",
            )
    database.delete_faculty_policy(policy["instructor_name"])
    return {
        "deleted": True,
        "instructor": policy["instructor_name"],
        "message": (
            "Policy override removed. Recalculate the roster to apply the "
            "default rules."
        ),
    }
