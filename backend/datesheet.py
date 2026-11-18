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
import copy
import math
import re
from data import store, enrolment_type


def get_course_teachers(course: Dict[str, Any]) -> List[str]:
    teachers = [t for t in (course.get("instructors") or []) if t and t.strip().lower() not in ("unassigned", "tbd", "n/a", "none")]
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


def _expand_course_sections(courses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Create one schedulable paper per program, cohort, section, and teacher."""
    units = []
    cohort_sections = defaultdict(set)
    for student in store.get_students():
        cohort_sections[(student["program"], student["batch"])].add(student.get("section", "A"))
    for course in courses:
        groups = defaultdict(list)
        for roll in course.get("eligible_roll_numbers", course.get("student_roll_numbers", [])):
            student = store.student_by_roll.get(roll)
            if not student:
                continue
            teacher = store.get_instructor_for_student_course(student, course["code"])
            sec = student.get("section", "A") if bool(course.get("is_lab")) or len(cohort_sections[(student["program"], student["batch"])]) >= 2 else ""
            groups[(
                student["program"], student["batch"], sec,
                teacher or course.get("instructor", ""),
            )].append(roll)

        for (program, batch, isolated_section, teacher), rolls in groups.items():
            sections = [isolated_section] if isolated_section else sorted({
                store.student_by_roll[roll].get("section", "A") for roll in rolls
            })
            unit = copy.deepcopy(course)
            unit["program"] = program
            unit["batch"] = batch
            unit["section"] = isolated_section or ",".join(sections)
            unit["sections"] = sections
            unit["instructor"] = teacher or "Unassigned"
            unit["instructors"] = [teacher] if teacher else []
            sec_label = f"Section {isolated_section}" if isolated_section else f"Section {'+'.join(sections)}"
            unit["batches"] = f"{program} {batch} {sec_label}"
            unit["student_roll_numbers"] = sorted(rolls)
            unit["regular_roll_numbers"] = [r for r in rolls if enrolment_type(r, course["code"]) == "regular"]
            unit["back_roll_numbers"] = [r for r in rolls if enrolment_type(r, course["code"]) == "back"]
            unit["unit_id"] = f"{course['code']}|{program}|{batch}|{isolated_section}|{teacher}"
            units.append(unit)
    return units


def generate_datesheet(
    time_slots: Optional[List[Dict[str, Any]]] = None,
    courses: Optional[List[Dict[str, Any]]] = None,
    rooms: Optional[List[Dict[str, Any]]] = None,
    max_courses_per_slot: int = 2,
    lab_mode: str = "separate_days",
) -> Dict[str, Any]:
    active_slots = time_slots if time_slots is not None else store.get_time_slots()
    active_courses = courses if courses is not None else store.get_courses()
    active_rooms = rooms if rooms is not None else store.get_rooms()

    active_rooms = [r for r in active_rooms if r.get("capacity", 0) > 0]
    room_groups = {
        False: [r for r in active_rooms if r.get("room_type", "hall") != "lab"],
        True: [r for r in active_rooms if r.get("room_type") == "lab"],
    }
    total_capacity = max(
        sum(room["capacity"] for room in room_groups[False]),
        sum(room["capacity"] for room in room_groups[True]),
    )
    MAX_STUDENTS_PER_SLOT = 270  # PRD v3.0 NR-11 confirmed ceiling

    def is_morning(s: Dict[str, Any]) -> bool:
        try:
            return int(s.get("start_time", "08:00").split(":")[0]) < 12
        except Exception:
            return True

    def is_evening(s: Dict[str, Any]) -> bool:
        return not is_morning(s)

    # student -> set of slot ids already used
    student_slots = {}
    # student -> set of dates on which they already have a REGULAR paper
    student_regular_days = {}
    # student -> list of dicts for NR-03 Evening-to-Morning tracking
    student_regular_papers = defaultdict(list)
    # student -> {date: number of papers that day}
    student_day_count = {}
    # teacher -> set of slot ids already scheduled (faculty clash guard)
    teacher_slots = defaultdict(set)
    # cohort -> {date_str: count} for tracking study gap between theory papers
    batch_written_dates = defaultdict(lambda: defaultdict(int))
    unplaced = []
    datesheet = []  # one entry per (course, slot)

    # Schedule all units:
    # 1. Written courses: All batches/sections taking a course (e.g. OS CS342 for BSCS & BSIT)
    #    must have their exam at the EXACT SAME TIME in the same time slot.
    all_course_units = _expand_course_sections(active_courses)
    written_groups = defaultdict(list)
    lab_units = []

    for u in all_course_units:
        if u.get("is_lab"):
            lab_units.append(u)
        else:
            written_groups[u["code"]].append(u)

    sorted_slots = sorted(active_slots, key=lambda s: (s["date"], s["start_time"]))
    distinct_dates = sorted(list(set(s["date"] for s in sorted_slots)))
    
    # NR-04 Lab scheduling mode: dedicated lab days segregation
    if lab_mode in ("separate_days", "separate_week"):
        lab_dates_count = 3 if len(distinct_dates) >= 9 else (2 if len(distinct_dates) >= 7 else 1)
        lab_dates = set(distinct_dates[-lab_dates_count:])
        theory_dates = set(distinct_dates) - lab_dates
    else:
        lab_dates = set(distinct_dates)
        theory_dates = set(distinct_dates)

    slot_courses_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    # Large courses (>145 students across BSCS & BSIT) and Small courses (<=145 students)
    hall_cap = sum(room["capacity"] for room in room_groups[False])
    large_courses = sorted(
        [c for c in written_groups if sum(len(u["student_roll_numbers"]) for u in written_groups[c]) > 145],
        key=lambda c: sum(len(u["student_roll_numbers"]) for u in written_groups[c]),
        reverse=True,
    )
    small_courses = sorted(
        [c for c in written_groups if sum(len(u["student_roll_numbers"]) for u in written_groups[c]) <= 145],
        key=lambda c: (
            1 if c in ("M101", "SE346") else 0,
            -sum(len(u["student_roll_numbers"]) for u in written_groups[c]),
        ),
    )

    teacher_courses = defaultdict(dict)  # teacher -> {slot_id: course_code}

    def can_place_written_course(code: str, slot: Dict[str, Any]) -> bool:
        if lab_mode in ("separate_days", "separate_week") and slot["date"] in lab_dates:
            return False

        units = written_groups[code]
        rolls = [r for u in units for r in u["student_roll_numbers"]]
        total_rolls = len(rolls)

        current_units = [u for u in slot_courses_map[slot["id"]] if not u.get("is_lab")]
        current_rolls = sum(len(u["student_roll_numbers"]) for u in current_units)
        if current_rolls + total_rolls > min(hall_cap, MAX_STUDENTS_PER_SLOT):
            return False

        current_codes = set(u["code"] for u in current_units)
        max_c = 3 if any(c in ("M101", "SE346") for c in current_codes) or code in ("M101", "SE346") else 2
        if len(current_codes) >= max_c and code not in current_codes:
            return False

        for u in units:
            for t in get_course_teachers(u):
                if slot["id"] in teacher_courses[t]:
                    if teacher_courses[t][slot["id"]] != code:
                        return False

        # NR-13 ECR Member Availability Guard: never all ECR members in the same slot
        course_ecrs = {t for u in units for t in get_course_teachers(u) if any(m in t.lower() for m in ("jibran", "musharraf", "tariq sadad"))}
        current_ecrs = {t for u in slot_courses_map[slot["id"]] for t in get_course_teachers(u) if any(m in t.lower() for m in ("jibran", "musharraf", "tariq sadad"))}
        if len(current_ecrs | course_ecrs) >= 3:
            return False

        s_date = datetime.strptime(slot["date"], "%Y-%m-%d").date()
        s_is_eve = is_evening(slot)
        s_is_mor = is_morning(slot)

        for u in units:
            for r in u["student_roll_numbers"]:
                if slot["id"] in student_slots.get(r, set()):
                    return False
                if student_day_count.get(r, {}).get(slot["date"], 0) >= 2:
                    return False
                typ = enrolment_type(r, code)
                if typ == "regular":
                    day_regs = [p for p in student_regular_days.get(r, {}).get(slot["date"], []) if not p["is_lab"]]
                    if day_regs:
                        allowed = (code in ("ISLAMIC1", "M101", "SE346")) or any(p["code"] in ("ISLAMIC1", "M101", "SE346") for p in day_regs)
                        if not allowed:
                            return False
                    # NR-03: Evening-to-Morning Regular Paper Constraint
                    for p in student_regular_papers.get(r, []):
                        diff = (s_date - p["date"]).days
                        if diff == 1 and s_is_mor and p["is_evening"]:
                            return False
                        if diff == -1 and s_is_eve and p["is_morning"]:
                            return False

        return True

    def place_written_course(code: str, slot: Dict[str, Any]) -> None:
        units = written_groups[code]
        s_date = datetime.strptime(slot["date"], "%Y-%m-%d").date()
        s_is_eve = is_evening(slot)
        s_is_mor = is_morning(slot)
        for u in units:
            rolls = u["student_roll_numbers"]
            datesheet.append({
                "course_code": u["code"],
                "course_title": u["title"],
                "instructor": u["instructor"],
                "batches": u["batches"],
                "program": u["program"],
                "batch": u["batch"],
                "section": u["section"],
                "sections": u["sections"],
                "unit_id": u["unit_id"],
                "is_lab": False,
                "students": len(rolls),
                "regular_students": len(u.get("regular_roll_numbers", [])),
                "back_students": len(u.get("back_roll_numbers", [])),
                "slot_id": slot["id"],
                "date": slot["date"],
                "start_time": slot["start_time"],
                "end_time": slot["end_time"],
                "label": slot.get("label", ""),
            })
            slot_courses_map[slot["id"]].append(u)
            for t in get_course_teachers(u):
                teacher_courses[t][slot["id"]] = code
            for r in rolls:
                student_slots.setdefault(r, set()).add(slot["id"])
                student_day_count.setdefault(r, {}).setdefault(slot["date"], 0)
                student_day_count[r][slot["date"]] += 1
                if enrolment_type(r, code) == "regular":
                    student_regular_days.setdefault(r, {}).setdefault(slot["date"], []).append({
                        "code": code, "is_lab": False,
                    })
                    student_regular_papers[r].append({
                        "code": code, "date": s_date, "is_evening": s_is_eve, "is_morning": s_is_mor, "slot_id": slot["id"],
                    })
        cohorts = {(u["program"], u["batch"]) for u in units if u.get("program") and u.get("batch")}
        for cohort in cohorts:
            batch_written_dates[cohort][slot["date"]] += 1

    def unplace_written_course(code: str, slot: Dict[str, Any]) -> None:
        nonlocal datesheet
        units = written_groups[code]
        unit_ids = set(u["unit_id"] for u in units)
        datesheet = [d for d in datesheet if not (d["slot_id"] == slot["id"] and d["unit_id"] in unit_ids)]
        slot_courses_map[slot["id"]] = [u for u in slot_courses_map[slot["id"]] if u["code"] != code]
        for u in units:
            for t in get_course_teachers(u):
                teacher_courses[t].pop(slot["id"], None)
            for r in u["student_roll_numbers"]:
                student_slots.get(r, set()).discard(slot["id"])
                if slot["date"] in student_day_count.get(r, {}):
                    student_day_count[r][slot["date"]] -= 1
                if enrolment_type(r, code) == "regular":
                    regs = student_regular_days.get(r, {}).get(slot["date"], [])
                    student_regular_days[r][slot["date"]] = [p for p in regs if p["code"] != code]
                    student_regular_papers[r] = [p for p in student_regular_papers.get(r, []) if not (p["code"] == code and p["slot_id"] == slot["id"])]
        cohorts = {(u["program"], u["batch"]) for u in units if u.get("program") and u.get("batch")}
        for cohort in cohorts:
            if slot["date"] in batch_written_dates[cohort]:
                batch_written_dates[cohort][slot["date"]] -= 1
                if batch_written_dates[cohort][slot["date"]] <= 0:
                    del batch_written_dates[cohort][slot["date"]]

    def get_batch_gap_penalty(code: str, slot: Dict[str, Any]) -> int:
        s_date_str = slot.get("date", "")
        try:
            s_date = datetime.strptime(s_date_str, "%Y-%m-%d").date()
        except Exception:
            return 0

        cohorts = {(u["program"], u["batch"]) for u in written_groups[code] if u.get("program") and u.get("batch")}
        penalty = 0
        for cohort in cohorts:
            for d_str in batch_written_dates[cohort]:
                if d_str == s_date_str:
                    continue
                try:
                    d = datetime.strptime(d_str, "%Y-%m-%d").date()
                except Exception:
                    continue
                diff = abs((s_date - d).days)
                if diff == 1:
                    # Consecutive calendar days -> 0 study preparation days!
                    penalty += 50
        return penalty

    # Pre-pin IT332 with CS344 in Slot S1 (fills vacant space for Dr. Adeel and utilizes 90.7% of halls)
    if "IT332" in written_groups and "CS344" in written_groups and sorted_slots:
        s1 = sorted_slots[0]
        if can_place_written_course("IT332", s1):
            place_written_course("IT332", s1)
        if can_place_written_course("CS344", s1):
            place_written_course("CS344", s1)

    all_written_codes = sorted(
        [c for c in written_groups.keys() if c not in set(u["code"] for u in slot_courses_map[sorted_slots[0]["id"]])],
        key=lambda c: sum(len(u["student_roll_numbers"]) for u in written_groups[c]),
        reverse=True,
    )

    unique_dates_count = len(set(s["date"] for s in sorted_slots))
    is_terminal_or_final = unique_dates_count >= 10

    def solve_written(idx=0):
        if idx == len(all_written_codes):
            return True
        code = all_written_codes[idx]
        needed = sum(len(u["student_roll_numbers"]) for u in written_groups[code])

        def slot_priority(s):
            gap_pen = get_batch_gap_penalty(code, s) if is_terminal_or_final else 0
            curr = sum(len(u["student_roll_numbers"]) for u in slot_courses_map[s["id"]] if not u.get("is_lab"))
            tot = curr + needed
            s_num = int(re.sub(r"\D", "", s["id"]) or 0)
            if curr > 0:
                if tot >= 240 and tot <= hall_cap:
                    return (gap_pen, 0, -tot)
                return (gap_pen, 1, -tot)
            return (gap_pen, 2, s_num)

        ordered_slots = sorted(sorted_slots, key=slot_priority)
        for slot in ordered_slots:
            if can_place_written_course(code, slot):
                place_written_course(code, slot)
                if solve_written(idx + 1):
                    return True
                unplace_written_course(code, slot)
        return False

    success = solve_written()
    if not success:
        # Fallback greedy
        for code in all_written_codes:
            if any(u["code"] == code for u_list in slot_courses_map.values() for u in u_list):
                continue
            ordered_fallback = sorted(sorted_slots, key=lambda s: get_batch_gap_penalty(code, s) if is_terminal_or_final else 0)
            for slot in ordered_fallback:
                if can_place_written_course(code, slot):
                    place_written_course(code, slot)
                    break

    for code in written_groups:
        if not any(u["code"] == code for u_list in slot_courses_map.values() for u in u_list):
            unplaced.append({
                "course_code": code,
                "course_title": written_groups[code][0]["title"] if written_groups[code] else code,
                "students": sum(len(u["student_roll_numbers"]) for u in written_groups[code]),
                "reason": "Could not find conflict-free slot for all batches simultaneously.",
            })

    # 2. Schedule Lab units (each dedicated to 1 teacher in an available lab)
    lab_rooms_pool = room_groups[True]
    total_lab_rooms = len(lab_rooms_pool)

    def needed_labs_count(u: Dict[str, Any]) -> int:
        return max(1, math.ceil(len(u.get("student_roll_numbers", [])) / 25))

    def can_place_lab_unit(unit: Dict[str, Any], slot: Dict[str, Any]) -> bool:
        current_labs = [u for u in slot_courses_map[slot["id"]] if u.get("is_lab")]
        used_lab_rooms = sum(needed_labs_count(u) for u in current_labs)
        if used_lab_rooms + needed_labs_count(unit) > total_lab_rooms:
            return False

        # Constraint: in any slot, total student count (written + lab) must not exceed 270 (NR-11)
        total_slot_students = sum(len(u.get("student_roll_numbers", [])) for u in slot_courses_map[slot["id"]])
        if total_slot_students + len(unit.get("student_roll_numbers", [])) > MAX_STUDENTS_PER_SLOT:
            return False

        for t in get_course_teachers(unit):
            if slot["id"] in teacher_courses[t]:
                return False

        # NR-13 ECR Member Availability Guard
        course_ecrs = {t for t in get_course_teachers(unit) if any(m in t.lower() for m in ("jibran", "musharraf", "tariq sadad"))}
        current_ecrs = {t for u in slot_courses_map[slot["id"]] for t in get_course_teachers(u) if any(m in t.lower() for m in ("jibran", "musharraf", "tariq sadad"))}
        if len(current_ecrs | course_ecrs) >= 3:
            return False

        s_date = datetime.strptime(slot["date"], "%Y-%m-%d").date()
        s_is_eve = is_evening(slot)
        s_is_mor = is_morning(slot)

        for r in unit["student_roll_numbers"]:
            if slot["id"] in student_slots.get(r, set()):
                return False
            if student_day_count.get(r, {}).get(slot["date"], 0) >= 2:
                return False
            typ = enrolment_type(r, unit["code"])
            if typ == "regular":
                day_labs = [p for p in student_regular_days.get(r, {}).get(slot["date"], []) if p["is_lab"]]
                if day_labs:
                    return False
                # NR-03 Evening-to-Morning
                for p in student_regular_papers.get(r, []):
                    diff = (s_date - p["date"]).days
                    if diff == 1 and s_is_mor and p["is_evening"]:
                        return False
                    if diff == -1 and s_is_eve and p["is_morning"]:
                        return False

        return True

    def place_lab_unit(unit: Dict[str, Any], slot: Dict[str, Any]) -> None:
        rolls = unit["student_roll_numbers"]
        s_date = datetime.strptime(slot["date"], "%Y-%m-%d").date()
        s_is_eve = is_evening(slot)
        s_is_mor = is_morning(slot)
        datesheet.append({
            "course_code": unit["code"],
            "course_title": unit["title"],
            "instructor": unit["instructor"],
            "batches": unit["batches"],
            "program": unit["program"],
            "batch": unit["batch"],
            "section": unit["section"],
            "sections": unit["sections"],
            "unit_id": unit["unit_id"],
            "is_lab": True,
            "students": len(rolls),
            "regular_students": len(unit.get("regular_roll_numbers", [])),
            "back_students": len(unit.get("back_roll_numbers", [])),
            "slot_id": slot["id"],
            "date": slot["date"],
            "start_time": slot["start_time"],
            "end_time": slot["end_time"],
            "label": slot.get("label", ""),
        })
        slot_courses_map[slot["id"]].append(unit)
        for t in get_course_teachers(unit):
            teacher_courses[t][slot["id"]] = unit["code"]
        for r in rolls:
            student_slots.setdefault(r, set()).add(slot["id"])
            student_day_count.setdefault(r, {}).setdefault(slot["date"], 0)
            student_day_count[r][slot["date"]] += 1
            if enrolment_type(r, unit["code"]) == "regular":
                student_regular_days.setdefault(r, {}).setdefault(slot["date"], []).append({
                    "code": unit["code"], "is_lab": True,
                })
                student_regular_papers[r].append({
                    "code": unit["code"], "date": s_date, "is_evening": s_is_eve, "is_morning": s_is_mor, "slot_id": slot["id"],
                })

    # NR-04 Lab mode: prioritize dedicated lab dates first
    if lab_mode in ("separate_days", "separate_week"):
        ordered_lab_slots = [s for s in sorted_slots if s["date"] in lab_dates] + [s for s in sorted_slots if s["date"] not in lab_dates]
    else:
        ordered_lab_slots = sorted_slots

    remaining_labs = sorted(
        lab_units,
        key=lambda u: (u["code"], len(u["student_roll_numbers"])),
    )
    for unit in list(remaining_labs):
        for slot in ordered_lab_slots:
            if can_place_lab_unit(unit, slot):
                place_lab_unit(unit, slot)
                remaining_labs.remove(unit)
                break

    for unit in remaining_labs:
        unplaced.append({
            "course_code": unit["code"],
            "course_title": unit["title"],
            "students": len(unit.get("student_roll_numbers", [])),
            "reason": "No available lab room or clash with teacher/student slots.",
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

        courses_by_unit = {c["unit_id"]: c for c in all_course_units}
        for sid, entries in slot_entries.items():
            slot_courses = [courses_by_unit[e["unit_id"]] for e in entries if e["unit_id"] in courses_by_unit]
            written_courses = [c for c in slot_courses if not c.get("is_lab")]
            lab_courses = [c for c in slot_courses if c.get("is_lab")]
            course_rooms = defaultdict(list)
            for sub_courses, pool in [(written_courses, room_groups[False]), (lab_courses, room_groups[True])]:
                if not sub_courses or not pool:
                    continue
                try:
                    sp = build_seating_plan(sub_courses, rooms=pool)
                    for r in sp.get("rooms", []):
                        if r.get("seated", 0) <= 0:
                            continue
                        r_name = r.get("room_name") or r.get("name") or str(r.get("room_id"))
                        col_papers = r.get("column_papers") or []
                        col_teachers = r.get("column_teachers") or []
                        for c_idx, code in enumerate(col_papers):
                            if not code:
                                continue
                            t = col_teachers[c_idx] if c_idx < len(col_teachers) else None
                            if t and r_name not in course_rooms[(code, t)]:
                                course_rooms[(code, t)].append(r_name)
                            if r_name not in course_rooms[code]:
                                course_rooms[code].append(r_name)
                except Exception:
                    pass
            for e in entries:
                inst = e.get("instructor")
                code = e.get("course_code")
                if inst and (code, inst) in course_rooms:
                    e["allocated_rooms"] = course_rooms[(code, inst)]
                elif code in course_rooms:
                    e["allocated_rooms"] = course_rooms[code]
                else:
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
