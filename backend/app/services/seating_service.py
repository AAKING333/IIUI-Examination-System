"""Seating Plan Matrix generation, custom plan overrides, and datesheet synchronization service."""
import copy
import datetime
import logging
import re
from collections import defaultdict

from fastapi import HTTPException

from data import store, enrolment_type
from database import database
from seating import build_seating_plan
from app.state import datesheet_state, seating_cache

logger = logging.getLogger("exam_portal.seating_service")


def sync_datesheet_rooms(state: dict) -> None:
    """Enriches datesheet entries in real-time from active seating plan allocations."""
    if not state or not state.get("datesheet"):
        return
    entries = state["datesheet"]
    slot_entries = defaultdict(list)
    for e in entries:
        sid = e.get("slot_id")
        if sid:
            slot_entries[sid].append(e)

    for sid, s_entries in slot_entries.items():
        try:
            plan = resolve_seating_plan(sid)
        except Exception:
            continue
        allocated_by_entry = defaultdict(list)
        for r in plan.get("rooms", []):
            if r.get("seated", 0) <= 0:
                continue
            r_name = r.get("room_name") or r.get("name") or str(r.get("room_id"))
            r_source = store.get_room(r.get("room_id")) or {}
            is_lab_room = r_source.get("room_type") == "lab" or "lab" in r_name.lower()
            col_papers = [re.sub(r"-T\d+$", "", p) for p in (r.get("column_papers") or []) if p]
            col_teachers = [t for t in (r.get("column_teachers") or []) if t]

            seated_rolls_by_course = defaultdict(set)
            for row in r.get("grid", []):
                for seat in row:
                    if seat and seat.get("roll_no") and seat.get("course_code"):
                        code_clean = re.sub(r"-T\d+$", "", seat["course_code"])
                        seated_rolls_by_course[code_clean].add(seat["roll_no"])

            sheet = r.get("seating_sheet")
            if sheet and sheet.get("columns"):
                for col in sheet["columns"]:
                    paper_raw = col.get("paper") or ""
                    code_clean = re.sub(r"-T\d+$", "", paper_raw.strip())
                    for roll in col.get("roll_nos", []):
                        if roll and str(roll).strip():
                            seated_rolls_by_course[code_clean].add(str(roll).strip())

            for e in s_entries:
                e_is_lab = bool(e.get("is_lab"))
                # STRICT CONSTRAINT: Lab papers only get Lab rooms; Written papers only get Hall rooms!
                if e_is_lab != is_lab_room:
                    continue

                e_code = e.get("course_code", "")
                e_inst = e.get("instructor", "")
                c = store.get_course(e_code)
                e_rolls = set(c.get("student_roll_numbers", [])) if c else set()

                matched = False
                course_seated_rolls = seated_rolls_by_course.get(e_code, set())
                if e_rolls and course_seated_rolls and (e_rolls & course_seated_rolls):
                    matched = True
                elif e_code in col_papers:
                    if not e_inst or e_inst in col_teachers or len(col_teachers) == 0:
                        matched = True

                if matched and r_name not in allocated_by_entry[id(e)]:
                    allocated_by_entry[id(e)].append(r_name)

        for e in s_entries:
            e["allocated_rooms"] = allocated_by_entry.get(id(e), [])


def _mark_repeater_seats(plan: dict) -> None:
    """Flags repeater (back-paper) seats and columns so the UI can colour them."""
    for room in plan.get("rooms", []) or []:
        for row in room.get("grid") or []:
            for seat in row or []:
                if not seat or seat.get("is_buffer"):
                    continue
                roll = str(seat.get("roll_no") or "").strip()
                code = re.sub(r"-T\d+$", "", str(seat.get("course_code") or ""))
                seat["is_back"] = bool(roll and code and enrolment_type(roll, code) == "back")
        sheet = room.get("seating_sheet") or {}
        for col in sheet.get("columns") or []:
            code = re.sub(r"-T\d+$", "", str(col.get("paper") or ""))
            back_rolls = []
            if code:
                for roll in col.get("roll_nos") or []:
                    roll_text = str(roll or "").strip()
                    if roll_text and roll_text.lower() != "buffer" and enrolment_type(roll_text, code) == "back":
                        back_rolls.append(roll_text)
            col["repeater_rolls"] = back_rolls


def _attach_invigilators(plan: dict, slot_id: str) -> dict:
    """Attach current invigilation assignments to each room in a seating plan."""
    _mark_repeater_seats(plan)
    duties = database.get_invigilation_duties(slot_id=slot_id)
    by_room = defaultdict(list)
    for duty in duties:
        room_id = duty.get("room_id")
        if room_id:
            by_room[room_id].append(duty)

    for room in plan.get("rooms", []):
        room_duties = sorted(
            by_room.get(room.get("room_id"), []),
            key=lambda d: (d.get("instructor") or "").lower(),
        )
        room["invigilators"] = [d.get("instructor") for d in room_duties if d.get("instructor")]
        room["invigilation"] = [
            {
                "id": d.get("id", ""),
                "instructor": d.get("instructor", ""),
                "status": d.get("status", "assigned"),
                "source": d.get("source", "auto"),
                "duty_type": d.get("duty_type", ""),
            }
            for d in room_duties
        ]

    unique = sorted({d.get("instructor") for d in duties if d.get("instructor")})
    plan["invigilators"] = unique
    plan["invigilator_count"] = len(unique)
    plan["invigilation_duty_count"] = len(duties)
    plan["assigned_room_count"] = sum(1 for room in plan.get("rooms", []) if room.get("invigilators"))
    plan["unassigned_room_count"] = sum(1 for room in plan.get("rooms", []) if not room.get("invigilators"))
    return plan


def _roll_belongs_to_entry(roll: str, code: str, entry: dict) -> bool:
    """Matches a student to a datesheet paper, honouring repeater paper sections."""
    student = store.student_by_roll.get(roll)
    if not student:
        return False
    paper = store.get_paper_section(roll, code)
    if paper:
        return (
            paper.get("program") == entry.get("program")
            and paper.get("batch") == entry.get("batch")
            and paper.get("section") in entry.get("sections", [entry.get("section")])
        )
    return (
        student.get("program") == entry.get("program")
        and student.get("batch") == entry.get("batch")
        and student.get("section") in entry.get("sections", [entry.get("section")])
    )


def _paper_teacher(entry: dict, code: str) -> str:
    sections = entry.get("sections") or [entry.get("section", "")]
    return store.get_instructor_for_paper(
        entry.get("program", ""), entry.get("batch", ""), sections[0] if sections else "", code,
    )


def resolve_seating_plan(slot_id: str):
    """Resolves the seating plan for a time slot: custom DB override or algorithmic generator."""
    if datesheet_state.get("status") == "SUPERSEDED":
        raise HTTPException(
            status_code=409,
            detail=f"Datesheet version {datesheet_state.get('version')} is superseded; regenerate it before using seating plans.",
        )
    if slot_id in seating_cache:
        return _attach_invigilators(seating_cache[slot_id], slot_id)

    custom = database.get_custom_seating_plan(slot_id)
    if custom:
        custom = _attach_invigilators(custom, slot_id)
        seating_cache[slot_id] = custom
        return custom

    slot = store.get_time_slot(slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail=f"Time slot '{slot_id}' not found.")

    entries = [d for d in datesheet_state["datesheet"] if d["slot_id"] == slot_id]
    if not entries:
        raise HTTPException(
            status_code=404,
            detail="No courses scheduled in this slot yet. Generate the datesheet first.",
        )

    slot_courses = []
    for e in entries:
        course = store.get_course(e["course_code"])
        if not course:
            continue
        course = copy.deepcopy(course)
        if e.get("program") and e.get("batch") and e.get("section"):
            teacher = _paper_teacher(e, e["course_code"])
            group_rolls = [
                roll for roll in course.get("student_roll_numbers", [])
                if _roll_belongs_to_entry(roll, e["course_code"], e)
                and store.get_attendance_percent(roll, e["course_code"]) >= 75
                and teacher == e.get("instructor")
            ]
            group_rolls.sort(key=lambda r: (0 if enrolment_type(r, e["course_code"]) == "regular" else 1, r))
            course["student_roll_numbers"] = group_rolls
            course["regular_roll_numbers"] = [
                roll for roll in group_rolls if enrolment_type(roll, e["course_code"]) == "regular"
            ]
            course["back_roll_numbers"] = [
                roll for roll in group_rolls if enrolment_type(roll, e["course_code"]) == "back"
            ]
            course["instructor"] = e.get("instructor", course.get("instructor", ""))
            course["instructors"] = [course["instructor"]] if course["instructor"] else []
            course["batches"] = e.get("batches", course.get("batches", ""))
            course["is_lab"] = bool(e.get("is_lab"))
        slot_courses.append(course)

    written_papers = []
    written_entries_by_code = defaultdict(list)
    for e in entries:
        if not e.get("is_lab"):
            written_entries_by_code[e["course_code"]].append(e)

    for code, e_list in written_entries_by_code.items():
        course = store.get_course(code)
        if not course:
            continue

        teacher_rolls = defaultdict(list)
        for e in e_list:
            teacher = _paper_teacher(e, code)
            group_rolls = [
                roll for roll in course.get("student_roll_numbers", [])
                if _roll_belongs_to_entry(roll, code, e)
                and store.get_attendance_percent(roll, code) >= 75
                and teacher == e.get("instructor")
            ]
            group_rolls.sort(key=lambda r: (0 if enrolment_type(r, code) == "regular" else 1, r))
            inst = e.get("instructor") or course.get("instructor", "")
            teacher_rolls[inst].extend(group_rolls)

        # Repeaters must sit after every regular student of the paper, across
        # all sections/turn groups that share the same teacher.
        for inst in teacher_rolls:
            teacher_rolls[inst].sort(
                key=lambda roll: (0 if enrolment_type(roll, code) == "regular" else 1, roll)
            )

        if len(teacher_rolls) >= 2:
            for t_idx, (inst, rolls) in enumerate(teacher_rolls.items(), start=1):
                if rolls:
                    written_papers.append({
                        "code": f"{code}-T{t_idx}",
                        "title": course["title"],
                        "instructor": inst,
                        "student_roll_numbers": rolls,
                    })
        else:
            all_rolls = [r for rolls in teacher_rolls.values() for r in rolls]
            inst = next(iter(teacher_rolls.keys()), course.get("instructor", ""))
            written_papers.append({
                "code": code,
                "title": course["title"],
                "instructor": inst,
                "student_roll_numbers": all_rolls,
            })

    lab_courses = [c for c in slot_courses if c.get("is_lab")]
    hall_rooms = [r for r in store.get_rooms() if r.get("room_type", "hall") != "lab" and r.get("capacity", 0) > 0]
    lab_rooms = [r for r in store.get_rooms() if r.get("room_type") == "lab" and r.get("capacity", 0) > 0]

    rooms_out = []
    if written_papers:
        sp_written = build_seating_plan(written_papers, hall_rooms, store.student_by_roll)
        rooms_out.extend(sp_written.get("rooms", []))
    if lab_courses:
        sp_labs = build_seating_plan(lab_courses, lab_rooms, store.student_by_roll)
        rooms_out.extend(sp_labs.get("rooms", []))

    rooms_out = [r for r in rooms_out if r.get("seated", 0) > 0]
    total_seated = sum(r["seated"] for r in rooms_out)
    total_usable = sum(r["usable_capacity"] for r in rooms_out)
    total_physical = sum(r["capacity"] for r in rooms_out)
    util_pct = round((total_seated / total_usable * 100), 1) if total_usable else 0.0

    # NR-08 & Sir Imran Discussion: Assign and display ECR Slot Incharge
    ECR_MEMBERS = ["Dr. Tariq Sadad", "Mr. Jibran Mir", "Mr. Musharraf"]
    busy_teachers = {t.lower() for c in slot_courses for t in (c.get("instructors") or [c.get("instructor")]) if t}
    free_ecrs = [m for m in ECR_MEMBERS if not any(part in m.lower() for part in busy_teachers)]
    slot_num = int(re.sub(r"\D", "", slot_id) or 0)
    ecr_slot_incharge = free_ecrs[slot_num % len(free_ecrs)] if free_ecrs else ECR_MEMBERS[0]

    plan = {
        "rooms": rooms_out,
        "total_students": total_seated,
        "total_capacity": total_usable,
        "physical_capacity": total_physical,
        "utilisation_pct": util_pct,
        "adjacent_rule_pass": all(r.get("adjacent_rule_pass", True) for r in rooms_out),
        "extra_empty_chairs": 0,
        "empty_chairs_rule_pass": True,
        "slot_id": slot_id,
        "date": slot["date"],
        "start_time": slot["start_time"],
        "end_time": slot["end_time"],
        "label": slot.get("label", ""),
        "ecr_slot_incharge": ecr_slot_incharge,
        "ecr_incharge": ecr_slot_incharge,
        "courses": [{"code": c["code"], "title": c["title"]} for c in slot_courses],
    }

    plan = _attach_invigilators(plan, slot_id)
    seating_cache[slot_id] = plan
    return plan


def save_custom_seating_plan(payload: dict) -> dict:
    """Saves custom edited seating plan, updates datesheet allocations, and publishes state."""
    global datesheet_state
    slot_id = payload.get("slot_id")
    if not slot_id:
        raise HTTPException(status_code=400, detail="Missing slot_id in seating plan payload.")

    rooms = payload.get("rooms", [])
    seen_rolls = set()
    for r in rooms:
        r_name = r.get("room_name") or r.get("name") or str(r.get("room_id"))
        sheet = r.get("seating_sheet")
        if sheet and sheet.get("columns"):
            if len(sheet["columns"]) > 11:
                raise HTTPException(
                    status_code=400,
                    detail=f"Validation Error: Room '{r_name}' seating plan exceeds maximum allowed columns (11). Found: {len(sheet['columns'])}.",
                )
            count = 0
            for col_idx, col in enumerate(sheet["columns"], start=1):
                col_rolls = [str(roll).strip() for roll in col.get("roll_nos", []) if roll and str(roll).strip()]
                if len(col_rolls) > 15:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Validation Error: Column {col_idx} in Room '{r_name}' exceeds maximum allowed rows (15). Found: {len(col_rolls)} seats.",
                    )
                for roll in col_rolls:
                    if roll in seen_rolls:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Validation Error: Student '{roll}' is allocated to multiple desks in time slot '{slot_id}'.",
                        )
                    seen_rolls.add(roll)
                count += len(col_rolls)
            r["seated"] = count
            if count > 165:
                raise HTTPException(
                    status_code=400,
                    detail=f"Validation Error: Room '{r_name}' seating count ({count}) exceeds maximum capacity ceiling of 165 seats.",
                )
            max_c_rows = max([r.get("rows", 0)] + [len(col.get("roll_nos", [])) for col in sheet["columns"]], default=0)
            r["rows"] = max_c_rows

    active_rooms = [r for r in rooms if r.get("seated", 0) > 0]
    total_seated = sum(r.get("seated", 0) for r in active_rooms)
    total_usable = sum(r.get("usable_capacity", 0) for r in active_rooms)
    total_physical = sum(r.get("capacity", 0) for r in active_rooms)
    util_pct = round((total_seated / total_usable * 100), 1) if total_usable else 0.0

    plan = {
        **payload,
        "rooms": active_rooms,
        "total_students": total_seated,
        "total_capacity": total_usable,
        "physical_capacity": total_physical,
        "utilisation_pct": util_pct,
    }

    timestamp = datetime.datetime.now().isoformat()
    _mark_repeater_seats(plan)
    database.save_custom_seating_plan(slot_id, plan, timestamp)
    database.delete_invigilation_duties_for_slot(slot_id)
    plan = _attach_invigilators(plan, slot_id)
    seating_cache[slot_id] = plan

    # Synchronize datesheet state so any vacated rooms (like Lab 4) are removed from datesheet
    sync_datesheet_rooms(datesheet_state)
    database.publish_datesheet(datesheet_state, timestamp)

    logger.info("Custom seating plan saved for slot %s (%d rooms, %d students).", slot_id, len(active_rooms), total_seated)
    return {
        "status": "success",
        "message": "Seating plan saved and datesheet synchronized.",
        "plan": plan,
    }


def regenerate_seating_plan(slot_id: str) -> dict:
    """Clears custom overrides for a slot and regenerates algorithmic plan."""
    database.delete_custom_seating_plan(slot_id)
    seating_cache.pop(slot_id, None)
    database.delete_invigilation_duties_for_slot(slot_id)
    plan = resolve_seating_plan(slot_id)
    # Rebuild this slot's invigilation duties to match the new room layout.
    try:
        from app.services.invigilation_service import generate_duties

        generate_duties(slot_ids_filter=[slot_id], preserve_manual=True)
        plan = resolve_seating_plan(slot_id)
    except Exception:
        logger.exception("Automatic invigilation generation failed for slot %s.", slot_id)
    sync_datesheet_rooms(datesheet_state)
    database.publish_datesheet(datesheet_state, datetime.datetime.now().isoformat())
    return plan
