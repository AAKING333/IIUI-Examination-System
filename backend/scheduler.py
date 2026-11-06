"""
scheduler.py
------------
Clash-Free Datesheet Generator for IIUI CS&IT (Male Campus).

Hard constraints:
  H1. Two courses sharing any enrolled student cannot share a slot.
  H2. Two courses taught by the same instructor cannot share a slot.
  H3. Every candidate in a slot must be seatable under the two-column rule.
      The scheduler calls the seating engine's `can_seat_slot()` before
      accepting a slot, so a published datesheet can never contain students
      who have no seat.

Soft constraint:
  S1. One exam per student per day, with a graceful global relaxation when the
      conflict graph is too dense.

Room allocation is intentionally left to the seating engine. The old
magic-number / room-pointer logic has been removed; it produced duplicate room
assignments and ignored the alternating-column capacity loss.
"""

from __future__ import annotations
from typing import List, Dict, Set, Optional, Tuple
from collections import defaultdict

from instructor_utils import normalize_instructor
from seating_engine import build_enrollment_index, can_seat_slot


class SchedulingError(Exception):
    pass


def _build_conflict_graph(
    courses: List[Dict],
    enrollments: List[Dict],
) -> Tuple[Dict[int, Set[int]], Dict[int, Set[int]]]:
    """Build the student-sharing conflict graph between courses."""
    course_students: Dict[int, Set[int]] = defaultdict(set)
    for e in enrollments:
        course_students[e["course_id"]].add(e["student_id"])

    course_ids = [c["course_id"] for c in courses]
    graph: Dict[int, Set[int]] = {cid: set() for cid in course_ids}

    for i in range(len(course_ids)):
        for j in range(i + 1, len(course_ids)):
            ci, cj = course_ids[i], course_ids[j]
            if course_students[ci] & course_students[cj]:
                graph[ci].add(cj)
                graph[cj].add(ci)

    return graph, course_students


def _build_course_teachers(courses: List[Dict]) -> Dict[int, Set[str]]:
    return {
        c["course_id"]: {
            normalize_instructor(i) for i in c.get("instructors", [])
        }
        for c in courses
    }


def _busy_students_on_day(
    scheduled: Dict[int, int],
    slot_map: Dict[int, Dict],
    course_students: Dict[int, Set[int]],
    day: str,
) -> Set[int]:
    """Return student_ids already scheduled on `day`."""
    busy: Set[int] = set()
    for cid, sid in scheduled.items():
        if slot_map[sid]["date"] == day:
            busy |= course_students[cid]
    return busy


def find_teacher_conflicts(schedule: List[Dict]) -> List[Dict]:
    """Return any instructor double-bookings in a generated schedule."""
    slot_teachers: Dict[int, Dict[str, str]] = defaultdict(dict)
    conflicts: List[Dict] = []

    for entry in schedule:
        sid = entry["slot_id"]
        for instructor in entry.get("instructors", []):
            instructor = normalize_instructor(instructor)
            if instructor in slot_teachers[sid]:
                conflicts.append({
                    "slot_id": sid,
                    "date": entry["date"],
                    "slot_name": entry["slot_name"],
                    "instructor": instructor,
                    "course_a": slot_teachers[sid][instructor],
                    "course_b": entry["course_code"],
                })
            else:
                slot_teachers[sid][instructor] = entry["course_code"]

    return conflicts


def _try_schedule(
    sorted_courses: List[Dict],
    slots: List[Dict],
    slot_map: Dict[int, Dict],
    conflict_graph: Dict[int, Set[int]],
    course_students: Dict[int, Set[int]],
    course_teachers: Dict[int, Set[str]],
    courses_by_id: Dict[int, Dict],
    enrollment_index: Dict[int, Dict[str, List[Dict]]],
    rooms: List[Dict],
    enforce_one_per_day: bool,
    seat_cache: Dict[frozenset, bool],
) -> Optional[Dict[int, int]]:
    """Greedy slot assignment honouring H1, H2, H3 and optionally S1."""
    slot_courses: Dict[int, Set[int]] = defaultdict(set)
    slot_teachers: Dict[int, Set[str]] = defaultdict(set)
    scheduled: Dict[int, int] = {}

    for course in sorted_courses:
        cid = course["course_id"]
        placed = False

        for slot in slots:
            sid = slot["slot_id"]
            day = slot["date"]

            # H1: no shared students in the same slot
            if any(conflict_cid in slot_courses[sid] for conflict_cid in conflict_graph[cid]):
                continue

            # S1: one exam per student per day
            if enforce_one_per_day:
                busy_today = _busy_students_on_day(
                    scheduled, slot_map, course_students, day
                )
                if busy_today & course_students[cid]:
                    continue

            # H2: no instructor in two rooms at the same time
            if course_teachers[cid] & slot_teachers[sid]:
                continue

            # H3: the seating rule must be able to seat every candidate
            candidate_cids = slot_courses[sid] | {cid}
            cache_key = frozenset(candidate_cids)
            if cache_key not in seat_cache:
                seat_cache[cache_key] = can_seat_slot(
                    candidate_cids,
                    courses_by_id,
                    enrollment_index,
                    rooms,
                )
            if not seat_cache[cache_key]:
                continue

            scheduled[cid] = sid
            slot_courses[sid].add(cid)
            slot_teachers[sid] |= course_teachers[cid]
            placed = True
            break

        if not placed:
            return None

    return scheduled


def generate_datesheet(
    courses: List[Dict],
    enrollments: List[Dict],
    slots: List[Dict],
    rooms: List[Dict],
) -> List[Dict]:
    """Generate a clash-free, seatable datesheet."""
    conflict_graph, course_students = _build_conflict_graph(courses, enrollments)

    enroll_count: Dict[int, int] = defaultdict(int)
    for e in enrollments:
        enroll_count[e["course_id"]] += 1

    sorted_courses = sorted(
        courses,
        key=lambda c: (
            -len(conflict_graph[c["course_id"]]),
            -enroll_count[c["course_id"]],
        ),
    )

    slot_map: Dict[int, Dict] = {s["slot_id"]: s for s in slots}
    course_teachers = _build_course_teachers(courses)
    courses_by_id = {c["course_id"]: c for c in courses}
    enrollment_index = build_enrollment_index(enrollments)
    seat_cache: Dict[frozenset, bool] = {}

    # Pass 1: strict one-exam-per-day
    scheduled = _try_schedule(
        sorted_courses,
        slots,
        slot_map,
        conflict_graph,
        course_students,
        course_teachers,
        courses_by_id,
        enrollment_index,
        rooms,
        enforce_one_per_day=True,
        seat_cache=seat_cache,
    )
    one_per_day_met = True

    # Pass 2: relax one-per-day if the conflict graph is too dense
    if scheduled is None:
        scheduled = _try_schedule(
            sorted_courses,
            slots,
            slot_map,
            conflict_graph,
            course_students,
            course_teachers,
            courses_by_id,
            enrollment_index,
            rooms,
            enforce_one_per_day=False,
            seat_cache=seat_cache,
        )
        one_per_day_met = False

    if scheduled is None:
        raise SchedulingError(
            "No feasible clash-free, seatable schedule found. "
            "Add more exam slots or rooms, or reduce the number of courses."
        )

    slot_to_cids: Dict[int, List[int]] = defaultdict(list)
    for cid, sid in scheduled.items():
        slot_to_cids[sid].append(cid)

    schedule: List[Dict] = []
    for sid, cids in slot_to_cids.items():
        slot = slot_map[sid]
        for cid in cids:
            course = courses_by_id[cid]
            instructors = [
                normalize_instructor(i) for i in course.get("instructors", [])
            ]
            schedule.append({
                "course_id": cid,
                "course_code": course["code"],
                "course_name": course["name"],
                "instructors": instructors,
                "instructor_str": ", ".join(instructors),
                "slot_id": sid,
                "date": slot["date"],
                "day_label": slot["day_label"],
                "slot_name": slot["slot_name"],
                "time": slot["time"],
                "enrolled_count": enroll_count[cid],
                # Filled by generate_seating_plans() with the exact rooms used.
                "allocated_rooms": [],
                "one_per_day_enforced": one_per_day_met,
            })

    schedule.sort(key=lambda x: (x["date"], x["slot_id"]))
    return schedule
