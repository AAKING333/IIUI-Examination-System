"""
verify.py - standalone integrity check (no FastAPI/uvicorn needed).

Run from the backend directory:
    python verify.py

Exit code is 0 only when every hard constraint passes. Warnings are reported
but do not fail the run. Output is ASCII-only so it works on Windows cp1252.
"""

from __future__ import annotations

import io
import os
import sys
from collections import defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
_SITE = os.path.join(_HERE, "site-packages")
if _SITE not in sys.path:
    sys.path.insert(0, _SITE)

import openpyxl

from data_generator import (
    generate_rooms,
    generate_students,
    generate_courses_and_enrollments,
    generate_time_slots,
)
from scheduler import generate_datesheet, find_teacher_conflicts, SchedulingError
from seating_engine import generate_seating_plans, SeatingError
from excel_exporter import generate_excel

FAILURES: list[str] = []
WARNINGS: list[str] = []


def ok(msg: str) -> None:
    print(f"[ OK ] {msg}")


def info(msg: str) -> None:
    print(f"[INFO] {msg}")


def fail(msg: str) -> None:
    FAILURES.append(msg)
    print(f"[FAIL] {msg}")


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print(f"[WARN] {msg}")


def section(title: str) -> None:
    print(f"\n-- {title} " + "-" * max(0, 58 - len(title)))


def main() -> int:
    section("Generating dummy data")
    rooms = generate_rooms()
    students = generate_students(count=240)
    courses, enrollments = generate_courses_and_enrollments(students)
    slots = generate_time_slots()

    info(
        f"Rooms: {len(rooms)} | Students: {len(students)} | "
        f"Courses: {len(courses)} | Enrollments: {len(enrollments)} | "
        f"Slots: {len(slots)}"
    )

    section("Running scheduler")
    try:
        schedule = generate_datesheet(courses, enrollments, slots, rooms)
    except SchedulingError as exc:
        fail(f"Scheduler could not produce a datesheet: {exc}")
        return _finish()

    info(f"Scheduled {len(schedule)} course(s)")

    section("Schedule integrity")
    scheduled_ids = [e["course_id"] for e in schedule]
    expected_ids = {c["course_id"] for c in courses}
    if len(scheduled_ids) != len(set(scheduled_ids)):
        fail("A course appears more than once in the datesheet")
    if set(scheduled_ids) != expected_ids:
        missing = expected_ids - set(scheduled_ids)
        fail(f"Unscheduled course id(s): {sorted(missing)}")
    else:
        ok("Every course is scheduled exactly once")

    enroll_map: dict[int, set[int]] = defaultdict(set)
    for e in enrollments:
        enroll_map[e["course_id"]].add(e["student_id"])

    slot_students: dict[int, set[int]] = defaultdict(set)
    clashes = 0
    for entry in schedule:
        sid = entry["slot_id"]
        shared = slot_students[sid] & enroll_map[entry["course_id"]]
        if shared:
            clashes += 1
            fail(
                f"Student clash: {entry['course_code']} in slot {sid} "
                f"shares {len(shared)} student(s) with another course"
            )
        slot_students[sid] |= enroll_map[entry["course_id"]]
    if clashes == 0:
        ok("No student is scheduled for two courses in the same slot")

    day_students: dict[str, set[int]] = defaultdict(set)
    day_clashes = 0
    for entry in schedule:
        shared = day_students[entry["date"]] & enroll_map[entry["course_id"]]
        if shared:
            day_clashes += 1
        day_students[entry["date"]] |= enroll_map[entry["course_id"]]
    if day_clashes == 0:
        ok("No student has two exams on the same day")
    elif all(e.get("one_per_day_enforced", True) for e in schedule):
        fail(f"One-exam-per-day was enforced but {day_clashes} day clash(es) exist")
    else:
        warn(
            f"One-exam-per-day was relaxed; {day_clashes} course(s) share a day "
            "with another course taken by the same student"
        )

    teacher_conflicts = find_teacher_conflicts(schedule)
    if teacher_conflicts:
        for c in teacher_conflicts:
            fail(
                f"Teacher double-booking: {c['instructor']} on {c['date']} "
                f"{c['slot_name']} ({c['course_a']} vs {c['course_b']})"
            )
    else:
        ok("No instructor is double-booked in any slot")

    section("Generating seating plans")
    try:
        seating = generate_seating_plans(schedule, enrollments, students, rooms)
    except SeatingError as exc:
        fail(f"Seating engine could not seat every candidate: {exc}")
        return _finish()

    info(
        f"Generated {len(seating)} plan(s) across "
        f"{len({p['room_id'] for p in seating})} room(s)"
    )

    section("Seating integrity")
    # 1) No candidate left unseated, per course.
    enrolled_counts: dict[int, int] = defaultdict(int)
    for e in enrollments:
        enrolled_counts[e["course_id"]] += 1
    seated_counts: dict[int, int] = defaultdict(int)
    for plan in seating:
        for seat in plan["seats"]:
            seated_counts[seat["course_id"]] += 1

    unseated_total = 0
    for c in courses:
        cid = c["course_id"]
        diff = enrolled_counts[cid] - seated_counts[cid]
        if diff > 0:
            unseated_total += diff
            fail(
                f"{c['code']}: {diff} enrolled candidate(s) were not seated "
                f"({seated_counts[cid]}/{enrolled_counts[cid]})"
            )
        elif diff < 0:
            fail(
                f"{c['code']}: seated {seated_counts[cid]} but only "
                f"{enrolled_counts[cid]} enrolled"
            )
    if unseated_total == 0:
        ok(f"All {sum(enrolled_counts.values())} candidate(s) are seated")

    # 2) No duplicate seat positions or duplicate students within a slot.
    for plan in seating:
        capacity = plan["rows"] * plan["cols"]
        if len(plan["seats"]) > capacity:
            fail(
                f"{plan['room_id']} {plan['date']} {plan['slot_name']}: "
                f"{len(plan['seats'])} seats exceed capacity {capacity}"
            )
        positions = set()
        for seat in plan["seats"]:
            pos = (seat["row"], seat["col"])
            if pos in positions:
                fail(
                    f"{plan['room_id']} {plan['date']} {plan['slot_name']}: "
                    f"duplicate seat position {pos}"
                )
            positions.add(pos)
            if not (1 <= seat["row"] <= plan["rows"]):
                fail(f"{plan['room_id']}: row {seat['row']} outside 1..{plan['rows']}")
            if not (1 <= seat["col"] <= plan["cols"]):
                fail(f"{plan['room_id']}: col {seat['col']} outside 1..{plan['cols']}")

    slot_seen: dict[int, set[int]] = defaultdict(set)
    for plan in seating:
        for seat in plan["seats"]:
            if seat["student_id"] in slot_seen[plan["slot_id"]]:
                fail(
                    f"Student {seat['roll_no']} appears twice in slot "
                    f"{plan['slot_id']}"
                )
            slot_seen[plan["slot_id"]].add(seat["student_id"])
    if not any("twice" in f for f in FAILURES):
        ok("No duplicate seat positions or duplicate students within a slot")

    # 3) Two-column rule. Adjacent same-course columns are only acceptable when
    #    the instructors differ AND the plan explicitly used the fallback.
    adjacent_same_course = 0
    adjacent_same_teacher = 0
    for plan in seating:
        for row in plan["grid"]:
            for idx in range(len(row) - 1):
                left, right = row[idx], row[idx + 1]
                if not left or not right:
                    continue
                if left["course_id"] == right["course_id"]:
                    adjacent_same_course += 1
                    if left["instructor"] == right["instructor"]:
                        adjacent_same_teacher += 1
                        fail(
                            f"{plan['room_id']} row {left['row']} col "
                            f"{idx + 1}<->{idx + 2}: same course and same teacher "
                            f"({left['course_code']})"
                        )
                    elif plan.get("rule_mode") != "fallback":
                        fail(
                            f"{plan['room_id']} row {left['row']} col "
                            f"{idx + 1}<->{idx + 2}: same course in adjacent "
                            "columns without the fallback rule"
                        )
    if adjacent_same_teacher == 0:
        ok("No adjacent columns share the same course and teacher")
    if adjacent_same_course == 0:
        ok("Paper-level rule satisfied: no adjacent columns share a course")
    else:
        warn(
            f"{adjacent_same_course} adjacent same-course pair(s) used the "
            "constrained fallback (different teachers)"
        )

    # 4) Datesheet rooms must exactly match the rooms actually used, keyed by
    #    course_id so duplicate course codes cannot hide a mismatch.
    actual_rooms: dict[tuple[int, int], set[str]] = defaultdict(set)
    for plan in seating:
        for seat in plan["seats"]:
            actual_rooms[(plan["slot_id"], seat["course_id"])].add(plan["room_id"])

    consistency_errors = 0
    for entry in schedule:
        expected = actual_rooms.get((entry["slot_id"], entry["course_id"]), set())
        reported = set(entry.get("allocated_rooms", []))
        if reported != expected:
            consistency_errors += 1
            fail(
                f"Datesheet/seating mismatch for {entry['course_code']} "
                f"({entry['date']} {entry['slot_name']}): "
                f"reported {sorted(reported)} vs actual {sorted(expected)}"
            )
        if not reported:
            consistency_errors += 1
            fail(
                f"{entry['course_code']} ({entry['date']} {entry['slot_name']}) "
                "has no allocated room"
            )
    if consistency_errors == 0:
        ok("Datesheet rooms match the seating plans exactly")

    section("Excel export")
    try:
        xlsx_bytes = generate_excel(schedule, seating, students)
    except Exception as exc:  # noqa: BLE001 - report any exporter failure
        fail(f"Excel export failed: {exc}")
        return _finish()

    if len(xlsx_bytes) < 1000:
        fail(f"Excel workbook is suspiciously small ({len(xlsx_bytes)} bytes)")
    else:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
        except Exception as exc:  # noqa: BLE001
            fail(f"Excel workbook could not be reopened: {exc}")
            return _finish()

        if len(wb.sheetnames) != len(set(wb.sheetnames)):
            fail("Excel workbook contains duplicate sheet names")
        if "Datesheet" not in wb.sheetnames:
            fail("Excel workbook is missing the Datesheet sheet")
        if "Roll Number Slips" not in wb.sheetnames:
            fail("Excel workbook is missing the Roll Number Slips sheet")
        if len(wb.sheetnames) < 3:
            fail("Excel workbook is missing seating-chart sheets")

        ws = wb["Datesheet"]
        data_rows = sum(
            1 for r in range(6, ws.max_row + 1) if ws.cell(row=r, column=1).value
        )
        if data_rows != len(schedule):
            fail(
                f"Datesheet sheet has {data_rows} data row(s) but the schedule "
                f"has {len(schedule)}"
            )
        else:
            ok(f"Excel workbook valid: {len(wb.sheetnames)} sheet(s), "
               f"{data_rows} datesheet row(s)")

    out_path = os.path.abspath(os.path.join(_HERE, "..", "Exam_Schedule_Report.xlsx"))
    with open(out_path, "wb") as fh:
        fh.write(xlsx_bytes)
    info(f"Excel written -> {out_path} ({len(xlsx_bytes) / 1024:.1f} KB)")

    return _finish()


def _finish() -> int:
    section("Summary")
    if WARNINGS:
        print(f"{len(WARNINGS)} warning(s):")
        for w in WARNINGS:
            print(f"  - {w}")
    if FAILURES:
        print(f"{len(FAILURES)} failure(s):")
        for f in FAILURES:
            print(f"  - {f}")
        print("\nRESULT: FAILED")
        return 1
    print("RESULT: PASSED - all hard constraints satisfied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
