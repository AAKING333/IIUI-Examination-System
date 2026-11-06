"""
seating_engine.py
-----------------
Seating Plan Generator with the IIUI Teacher-Differentiated Two-Column Rule.

Clarified rule (per exam-cell decision):
  1. PRIMARY: adjacent columns in the same room must not carry the same course.
  2. SECONDARY: if no other course has candidates left, adjacent columns may
     carry the same course only when they belong to different teachers/sections,
     and only when leaving the column empty would make some candidates unseated.
  3. If enough capacity exists, an empty column is left between columns of the
     same course, even when the teachers differ.
  4. A single-teacher, single-course room therefore uses columns A, C, E...
     (15 seats in a 5x6 room), never adjacent columns.
  5. If any candidate cannot be seated, SeatingError is raised. The engine never
     silently drops students.

The scheduler also calls `can_seat_slot()` so a slot is only accepted when the
seating rule can actually seat every candidate in that slot.
"""

from __future__ import annotations
from typing import List, Dict, Optional, Set, Tuple
from collections import defaultdict
from dataclasses import dataclass

from instructor_utils import normalize_instructor


class SeatingError(Exception):
    """Raised when the seating rule cannot seat every enrolled candidate."""


@dataclass
class SeatingContext:
    """Mutable capacity bookkeeping for one exam slot."""

    remaining_seats: int
    remaining_students: int
    fallback_columns: int = 0


def _room_order(rooms: List[Dict]) -> List[Dict]:
    """Largest rooms first, then deterministic room-id order."""
    return sorted(rooms, key=lambda r: (-(r["rows"] * r["cols"]), r["room_id"]))


def build_enrollment_index(
    enrollments: List[Dict],
) -> Dict[int, Dict[str, List[Dict]]]:
    """Group enrollments by course_id, then by canonical instructor name."""
    index: Dict[int, Dict[str, List[Dict]]] = defaultdict(lambda: defaultdict(list))
    for e in enrollments:
        inst = normalize_instructor(e.get("instructor", ""))
        index[e["course_id"]][inst].append(e)
    return index


def _clone_queues(
    course_ids: Set[int],
    enrollment_index: Dict[int, Dict[str, List[Dict]]],
) -> Dict[int, Dict[str, List[Dict]]]:
    """Deep-copy the queues so seating does not mutate the source enrollments."""
    queues: Dict[int, Dict[str, List[Dict]]] = {}
    for cid in course_ids:
        queues[cid] = {
            inst: list(q)
            for inst, q in enrollment_index.get(cid, {}).items()
        }
    return queues


def _available_units(
    entries: List[Dict],
    slot_queues: Dict[int, Dict[str, List[Dict]]],
) -> List[Dict]:
    """One unit = one course + one teacher, with candidates still to seat."""
    units: List[Dict] = []
    for entry in entries:
        cid = entry["course_id"]
        for inst, q in slot_queues.get(cid, {}).items():
            if q:
                units.append({
                    "course_id": cid,
                    "course_code": entry["course_code"],
                    "course_name": entry["course_name"],
                    "instructor": inst,
                    "unit_key": (cid, inst),
                    "queue_len": len(q),
                })
    return units


def _choose_unit(
    units: List[Dict],
    prev_course_id: Optional[int],
    prev_unit_key: Optional[Tuple[int, str]],
    ctx: SeatingContext,
    rows: int,
) -> Tuple[Optional[Dict], bool]:
    """
    Choose the unit for the next column.

    Returns (unit_or_none, used_fallback). None means leave the column empty.
    """
    if not units:
        return None, False

    if prev_course_id is None:
        return max(units, key=lambda u: u["queue_len"]), False

    # Primary rule: prefer a different course in the adjacent column.
    different_course = [u for u in units if u["course_id"] != prev_course_id]
    if different_course:
        return max(different_course, key=lambda u: u["queue_len"]), False

    # Only the same course remains. A different teacher/section is allowed only
    # as a fallback when skipping this column would leave candidates unseated.
    same_course_diff_teacher = [
        u for u in units
        if u["course_id"] == prev_course_id and u["unit_key"] != prev_unit_key
    ]
    if not same_course_diff_teacher:
        return None, False

    # Enough spare capacity? Leave the column empty to preserve the paper-level
    # rule. Otherwise use the same-course/different-teacher fallback.
    if ctx.remaining_students <= ctx.remaining_seats - rows:
        return None, False

    return max(same_course_diff_teacher, key=lambda u: u["queue_len"]), True


def _fill_room(
    rid: str,
    rows: int,
    cols: int,
    entries: List[Dict],
    slot_queues: Dict[int, Dict[str, List[Dict]]],
    student_map: Optional[Dict[int, Dict]],
    slot_id: int,
    slot_info: Dict,
    ctx: SeatingContext,
    record: bool = True,
) -> Optional[Dict]:
    """
    Fill one room column by column.

    When record=False the function only updates the context (used by the
    scheduler's feasibility check) and returns None.
    """
    grid = [[None] * cols for _ in range(rows)] if record else None
    seats: List[Dict] = []
    column_headers: List[Dict] = []
    prev_course_id: Optional[int] = None
    prev_unit_key: Optional[Tuple[int, str]] = None
    used_fallback = False
    fallback_columns = 0

    for c_idx in range(cols):
        units = _available_units(entries, slot_queues)
        if not units:
            break

        chosen, is_fallback = _choose_unit(
            units, prev_course_id, prev_unit_key, ctx, rows
        )

        if chosen is None:
            # Deliberately empty column breaks same-course adjacency.
            ctx.remaining_seats -= rows
            prev_course_id = None
            prev_unit_key = None
            continue

        cid = chosen["course_id"]
        inst = chosen["instructor"]
        queue = slot_queues[cid][inst]

        # The whole column is consumed, even if the queue has fewer than `rows`
        # candidates. Column purity is intentional.
        ctx.remaining_seats -= rows
        if is_fallback:
            used_fallback = True
            fallback_columns += 1
            ctx.fallback_columns += 1

        column_headers.append({
            "col_index": c_idx,
            "col_label": chr(ord("A") + c_idx),
            "course_code": chosen["course_code"],
            "instructor": inst,
        })

        for r_idx in range(rows):
            if not queue:
                break
            item = queue.pop(0)
            sid = item["student_id"]
            ctx.remaining_students -= 1

            if record:
                st = student_map[sid]
                cell = {
                    "row": r_idx + 1,
                    "col": c_idx + 1,
                    "col_label": chr(ord("A") + c_idx),
                    "student_id": sid,
                    "roll_no": st["roll_no"],
                    "name": st["name"],
                    "batch": st["batch"],
                    "course_id": cid,
                    "course_code": item["course_code"],
                    "instructor": inst,
                    "section": item.get("section_code", ""),
                }
                grid[r_idx][c_idx] = cell
                seats.append(cell)

        prev_course_id = cid
        prev_unit_key = chosen["unit_key"]

    if not record:
        return None
    if not seats:
        return None

    courses_in_room = list(dict.fromkeys(s["course_code"] for s in seats))
    instructors_in_room = list(dict.fromkeys(s["instructor"] for s in seats))

    return {
        "slot_id": slot_id,
        "date": slot_info["date"],
        "day_label": slot_info["day_label"],
        "slot_name": slot_info["slot_name"],
        "time": slot_info["time"],
        "room_id": rid,
        "rows": rows,
        "cols": cols,
        "courses_in_room": courses_in_room,
        "instructors_in_room": instructors_in_room,
        "column_headers": column_headers,
        "grid": grid,
        "seats": seats,
        "rule_mode": "fallback" if used_fallback else "paper-level",
        "fallback_columns": fallback_columns,
    }


def can_seat_slot(
    course_ids: Set[int],
    courses_by_id: Dict[int, Dict],
    enrollment_index: Dict[int, Dict[str, List[Dict]]],
    rooms: List[Dict],
) -> bool:
    """
    Return True if every candidate in this slot can be seated under the rule.

    This uses the exact same column-choice logic as generate_seating_plans(),
    so the scheduler cannot accept a slot that the seating engine cannot fill.
    """
    if not course_ids:
        return True

    entries = [
        {
            "course_id": cid,
            "course_code": courses_by_id[cid]["code"],
            "course_name": courses_by_id[cid]["name"],
        }
        for cid in course_ids
    ]
    slot_queues = _clone_queues(course_ids, enrollment_index)
    ordered_rooms = _room_order(rooms)

    ctx = SeatingContext(
        remaining_seats=sum(r["rows"] * r["cols"] for r in ordered_rooms),
        remaining_students=sum(
            len(q) for cid in slot_queues for q in slot_queues[cid].values()
        ),
    )

    if ctx.remaining_students == 0:
        return True
    if ctx.remaining_students > ctx.remaining_seats:
        return False

    for room in ordered_rooms:
        if ctx.remaining_students <= 0:
            return True
        _fill_room(
            rid=room["room_id"],
            rows=room["rows"],
            cols=room["cols"],
            entries=entries,
            slot_queues=slot_queues,
            student_map=None,
            slot_id=0,
            slot_info={},
            ctx=ctx,
            record=False,
        )

    return ctx.remaining_students <= 0


def generate_seating_plans(
    schedule: List[Dict],
    enrollments: List[Dict],
    students: List[Dict],
    rooms: List[Dict],
) -> List[Dict]:
    """Generate room plans and synchronise the actual rooms back to schedule."""
    student_map: Dict[int, Dict] = {s["student_id"]: s for s in students}
    enrollment_index = build_enrollment_index(enrollments)
    ordered_rooms = _room_order(rooms)

    slot_entries: Dict[int, List[Dict]] = defaultdict(list)
    for entry in schedule:
        slot_entries[entry["slot_id"]].append(entry)

    seating_plans: List[Dict] = []

    for slot_id, entries in sorted(slot_entries.items()):
        slot_info = entries[0]
        course_ids = {e["course_id"] for e in entries}
        slot_queues = _clone_queues(course_ids, enrollment_index)

        ctx = SeatingContext(
            remaining_seats=sum(r["rows"] * r["cols"] for r in ordered_rooms),
            remaining_students=sum(
                len(q) for cid in slot_queues for q in slot_queues[cid].values()
            ),
        )

        for room in ordered_rooms:
            if ctx.remaining_students <= 0:
                break
            plan = _fill_room(
                rid=room["room_id"],
                rows=room["rows"],
                cols=room["cols"],
                entries=entries,
                slot_queues=slot_queues,
                student_map=student_map,
                slot_id=slot_id,
                slot_info=slot_info,
                ctx=ctx,
                record=True,
            )
            if plan:
                seating_plans.append(plan)

        if ctx.remaining_students > 0:
            cid_to_code = {e["course_id"]: e["course_code"] for e in entries}
            remaining = []
            for cid, inst_map in slot_queues.items():
                for inst, q in inst_map.items():
                    if q:
                        remaining.append(
                            f"{cid_to_code.get(cid, cid)} / {inst} ({len(q)})"
                        )
            raise SeatingError(
                f"Could not seat {ctx.remaining_students} candidate(s) in "
                f"{slot_info['date']} {slot_info['slot_name']}. "
                f"Remaining queues: {', '.join(remaining)}. "
                "Add more rooms or move the course to another session."
            )

    seating_plans.sort(key=lambda p: (p["date"], p["slot_id"], p["room_id"]))

    # Synchronise the EXACT rooms used by each course back into the datesheet.
    course_actual_rooms: Dict[Tuple[int, int], List[str]] = defaultdict(list)
    for plan in seating_plans:
        for seat in plan["seats"]:
            key = (plan["slot_id"], seat["course_id"])
            if plan["room_id"] not in course_actual_rooms[key]:
                course_actual_rooms[key].append(plan["room_id"])

    for entry in schedule:
        entry["allocated_rooms"] = course_actual_rooms.get(
            (entry["slot_id"], entry["course_id"]), []
        )

    return seating_plans
