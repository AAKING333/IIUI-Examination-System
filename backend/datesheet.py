"""Datesheet generation — greedy packing algorithm (v2).

BACK-PAPER & TEACHER CLASH RULES (v2):
  Per student, per day:
    (a) never 2 papers in the same time slot,
    (b) at most 1 REGULAR paper per day,
    (c) at most 2 papers per day in total.
  Allowed per day: 1 regular alone, 1 back alone, or 1 regular + 1 back
  in DIFFERENT slots. Regular papers therefore never clash.
  A course can be regular for some students and back for others — the
  check is per student, per enrolment type (see data.enrolment_type).

  Per instructor/faculty:
    (d) Teacher Clash Guard: an instructor cannot invigilate / conduct exams
        in multiple courses in the same time slot, whether courses belong to
        same or different batches/sections.

Also: a slot's total students must fit in the total room capacity
available for that slot (sum of all rooms).
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import defaultdict
from data import store, enrolment_type


def get_course_teachers(course: Dict[str, Any]) -> List[str]:
    teachers = [t for t in (course.get("instructors") or []) if t and t.lower() not in ("unassigned", "tbd", "n/a", "none")]
    if not teachers:
        for s in course.get("sections", []):
            inst = s.get("instructor", "").strip()
            if inst and inst.lower() not in ("unassigned", "tbd", "n/a", "none"):
                teachers.append(inst)
    if not teachers:
        raw = course.get("instructor", "").strip()
        if raw and raw.lower() not in ("unassigned", "tbd", "n/a", "none"):
            teachers.append(raw)
    return list(dict.fromkeys(teachers))


def generate_datesheet(
    time_slots: Optional[List[Dict[str, Any]]] = None,
    courses: Optional[List[Dict[str, Any]]] = None,
    rooms: Optional[List[Dict[str, Any]]] = None,
    max_courses_per_slot: int = 2,
) -> Dict[str, Any]:
    active_slots = time_slots if time_slots is not None else store.get_time_slots()
    active_courses = courses if courses is not None else store.get_courses()
    active_rooms = rooms if rooms is not None else store.get_rooms()

    total_capacity = sum(r["capacity"] for r in active_rooms)
    # student -> set of slot ids already used
    student_slots = {}
    # student -> set of dates on which they already have a REGULAR paper
    student_regular_days = {}
    # student -> {date: number of papers that day}
    student_day_count = {}
    # teacher -> set of slot ids already scheduled (faculty clash guard)
    teacher_slots = defaultdict(set)
    unplaced = []
    datesheet = []  # one entry per (course, slot)

    # Only schedule courses that have active student enrolments (0-enrolment courses are excluded from examination datesheet)
    remaining = [c for c in active_courses if len(c.get("student_roll_numbers", [])) > 0]
    # Sort remaining so larger courses are paired first with complementary courses
    remaining.sort(key=lambda c: len(c.get("student_roll_numbers", [])), reverse=True)

    sorted_slots = sorted(active_slots, key=lambda s: (s["date"], s["start_time"]))
    slot_courses_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    from seating import courses_fit_in_rooms

    def _can_place(course: Dict[str, Any], slot: Dict[str, Any], slot_total: int, require_buffer: bool) -> bool:
        rolls = course.get("student_roll_numbers", [])
        if slot_total + len(rolls) > total_capacity:
            return False

        course_teachers = get_course_teachers(course)
        if any(slot["id"] in teacher_slots[t] for t in course_teachers):
            return False

        for r in rolls:
            typ = enrolment_type(r, course["code"])
            # (a) never 2 papers in the same time slot
            if slot["id"] in student_slots.get(r, set()):
                return False
            # (b) at most 1 REGULAR paper per day
            if typ == "regular" and slot["date"] in student_regular_days.get(r, set()):
                return False
            # (c) at most 2 papers per day in total
            if student_day_count.get(r, {}).get(slot["date"], 0) >= 2:
                return False

        if require_buffer and not courses_fit_in_rooms(
            slot_courses_map[slot["id"]] + [course], active_rooms, require_empty_buffer=True
        ):
            return False
        return True

    def _place(course: Dict[str, Any], slot: Dict[str, Any]) -> int:
        rolls = course.get("student_roll_numbers", [])
        datesheet.append({
            "course_code": course["code"],
            "course_title": course["title"],
            "instructor": course["instructor"],
            "batches": course["batches"],
            "students": len(rolls),
            "regular_students": len(course.get("regular_roll_numbers", [])),
            "back_students": len(course.get("back_roll_numbers", [])),
            "slot_id": slot["id"],
            "date": slot["date"],
            "start_time": slot["start_time"],
            "end_time": slot["end_time"],
            "label": slot.get("label", ""),
        })
        slot_courses_map[slot["id"]].append(course)
        for t in get_course_teachers(course):
            teacher_slots[t].add(slot["id"])
        for r in rolls:
            student_slots.setdefault(r, set()).add(slot["id"])
            student_day_count.setdefault(r, {}).setdefault(slot["date"], 0)
            student_day_count[r][slot["date"]] += 1
            if enrolment_type(r, course["code"]) == "regular":
                student_regular_days.setdefault(r, set()).add(slot["date"])
        remaining.remove(course)
        return len(rolls)

    # Pass 1: Pair courses into slots (at most max_courses_per_slot, default 2)
    # ensuring rooms can accommodate clean teacher columns + 5 empty buffer chairs.
    for slot in sorted_slots:
        if not remaining:
            break
        slot_courses_count = 0
        slot_total = 0
        for course in list(remaining):
            if slot_courses_count >= max_courses_per_slot:
                break
            if not _can_place(course, slot, slot_total, require_buffer=True):
                continue
            slot_total += _place(course, slot)
            slot_courses_count += 1

    # Pass 2 (Fallback): Place remaining courses into available capacity (preferring buffer fit first)
    for require_buffer in (True, False):
        if not remaining:
            break
        for slot in sorted_slots:
            if not remaining:
                break
            slot_entries = [d for d in datesheet if d["slot_id"] == slot["id"]]
            slot_total = sum(d["students"] for d in slot_entries)
            for course in list(remaining):
                if not _can_place(course, slot, slot_total, require_buffer=require_buffer):
                    continue
                slot_total += _place(course, slot)

    for course in remaining:
        reason = (
            "No slot left where every student passes the back-paper "
            "rule (no same-slot clash, max 1 regular/day, max 2/day) "
            "and total room capacity fits."
        )
        unplaced.append({
            "course_code": course["code"],
            "course_title": course["title"],
            "students": len(course.get("student_roll_numbers", [])),
            "reason": reason,
        })

    # Enrich each datesheet entry with day_name and allocated_rooms (AAKING333 style)
    try:
        from seating import build_seating_plan
        slot_entries = defaultdict(list)
        for entry in datesheet:
            try:
                entry["day_name"] = datetime.strptime(entry["date"], "%Y-%m-%d").strftime("%A")
            except Exception:
                entry["day_name"] = ""
            slot_entries[entry["slot_id"]].append(entry)

        courses_by_code = {c["code"]: c for c in active_courses}
        for sid, entries in slot_entries.items():
            slot_courses = [courses_by_code[e["course_code"]] for e in entries if e["course_code"] in courses_by_code]
            try:
                sp = build_seating_plan(slot_courses, rooms=active_rooms)
                course_rooms = defaultdict(list)
                for r in sp.get("rooms", []):
                    r_name = r.get("room_name") or r.get("name") or str(r.get("room_id"))
                    rcodes = set(cell["course_code"] for row in r.get("grid", []) for cell in row if cell)
                    for code in rcodes:
                        if r_name not in course_rooms[code]:
                            course_rooms[code].append(r_name)
                for e in entries:
                    e["allocated_rooms"] = course_rooms.get(e["course_code"], [])
            except Exception:
                for e in entries:
                    e["allocated_rooms"] = []
    except Exception:
        for e in datesheet:
            e.setdefault("day_name", "")
            e.setdefault("allocated_rooms", [])

    return {
        "datesheet": datesheet,
        "unplaced": unplaced,
        "total_capacity_per_slot": total_capacity,
    }
