import os
import sys
import tempfile
import unittest
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_database_directory = tempfile.TemporaryDirectory()
os.environ["EXAM_PORTAL_DB"] = str(Path(_database_directory.name) / "exam-test.sqlite3")

import data
import datesheet
import main
import seating
from database import DATABASE_PATH, SQLiteDatabase
from fastapi import HTTPException
from app.services.invigilation_service import (
    create_manual_duty,
    delete_manual_duty,
    generate_duties,
    get_faculty_workload,
    get_roster_summary,
    is_ecr_member,
    list_duties,
    normalize_name,
    recalculate_duties,
    update_manual_duty,
)


class ExamWorkflowTests(unittest.TestCase):
    def setUp(self):
        data.store.reset_to_seed()
        main.datesheet_state = {
            "datesheet": [],
            "unplaced": [],
            "total_capacity_per_slot": 0,
        }
        main.seating_cache.clear()

    def test_seed_covers_all_requested_cohorts_and_persists(self):
        students = data.store.get_students()
        self.assertEqual(len(students), 675)
        cohort_counts = Counter((student["program"], student["batch"]) for student in students)
        self.assertEqual(cohort_counts, {
            ("BSCS", "F23"): 100,
            ("BSCS", "F24"): 65,
            ("BSCS", "F25"): 90,
            ("BSCS", "F26"): 106,
            ("BSIT", "F23"): 80,
            ("BSIT", "F24"): 77,
            ("BSIT", "F25"): 86,
            ("BSIT", "F26"): 71,
        })

        reopened = SQLiteDatabase(DATABASE_PATH).load_master_data()
        self.assertEqual(len(reopened["students"]), 675)
        self.assertEqual(len(reopened["courses"]), 46)

    def test_seed_datesheet_is_complete_and_preserves_clash_rules(self):
        published = main.generate_datesheet_endpoint()
        self.assertEqual(published["status"], "PUBLISHED")
        self.assertEqual(published["unplaced"], [])
        self.assertTrue(published["datesheet"])

        # SE346 E-Commerce taught by Mr. Abid Jamil across cohorts
        se_entries = [e for e in published["datesheet"] if e["course_code"] == "SE346"]
        self.assertTrue(len(se_entries) > 0)
        self.assertEqual(len(set(e["slot_id"] for e in se_entries)), 1)
        self.assertEqual(se_entries[0]["instructor"], "Mr. Abid Jamil")

        teachers_by_slot = defaultdict(dict)
        for entry in published["datesheet"]:
            inst = entry["instructor"]
            sid = entry["slot_id"]
            code = entry["course_code"]
            if inst in teachers_by_slot[sid]:
                self.assertEqual(
                    teachers_by_slot[sid][inst], code,
                    f"Teacher {inst} scheduled for multiple DIFFERENT courses in slot {sid}: {teachers_by_slot[sid][inst]} vs {code}"
                )
            teachers_by_slot[sid][inst] = code

        # All batches studying a written course must have their exam in the same slot
        written_codes = {e["course_code"] for e in published["datesheet"] if not e.get("is_lab")}
        for code in written_codes:
            entries = [e for e in published["datesheet"] if e["course_code"] == code]
            slots = {e["slot_id"] for e in entries}
            self.assertEqual(len(slots), 1, f"Course {code} batches scheduled in multiple slots: {slots}")

        for student in data.store.get_students():
            papers = []
            enrolment_types = {item["course"]: item["type"] for item in student["enrolments"]}
            for entry in published["datesheet"]:
                if (
                    entry["program"] == student["program"]
                    and entry["batch"] == student["batch"]
                    and student["section"] in entry["sections"]
                    and entry["course_code"] in enrolment_types
                ):
                    papers.append(entry)
            self.assertEqual(len({paper["slot_id"] for paper in papers}), len(papers))
            daily_counts = Counter(paper["date"] for paper in papers)
            self.assertTrue(all(count <= 2 for count in daily_counts.values()))
            regular_written_days = [
                paper["date"] for paper in papers
                if enrolment_types[paper["course_code"]] == "regular"
                and not paper.get("is_lab")
                and paper["course_code"] not in ("ISLAMIC1", "M101", "SE346")
            ]
            self.assertEqual(len(regular_written_days), len(set(regular_written_days)))

    def test_seating_generation_does_not_mutate_master_course_rosters(self):
        published = main.generate_datesheet_endpoint()
        course = data.store.get_course("CS342")
        original_rolls = list(course["student_roll_numbers"])
        entries = [
            entry for entry in published["datesheet"]
            if entry["course_code"] == "CS342"
        ]
        self.assertGreater(len(entries), 1)

        for entry in entries:
            main._resolve_seating_plan(entry["slot_id"])
            self.assertEqual(course["student_roll_numbers"], original_rolls)

    def test_student_below_attendance_threshold_is_not_seated(self):
        student = data.store.get_students()[0]
        enrolments = [dict(item) for item in student["enrolments"]]
        enrolments[0]["attendance_percent"] = 74
        data.store.update_student(student["roll_no"], enrolments=enrolments)

        published = main.generate_datesheet_endpoint()
        course_code = enrolments[0]["course"]
        entry = next(
            item for item in published["datesheet"]
            if item["course_code"] == course_code
            and item["program"] == student["program"]
            and item["batch"] == student["batch"]
            and student["section"] in item["sections"]
        )
        plan = main._resolve_seating_plan(entry["slot_id"])
        seated_rolls = {
            cell["roll_no"]
            for room in plan["rooms"]
            for row in room["grid"]
            for cell in row
            if cell
        }
        self.assertNotIn(student["roll_no"], seated_rolls)
        verification = main._compile_student_exam_allocations()
        record = next(item for item in verification if item["roll_no"] == student["roll_no"])
        self.assertIn(course_code, {item["course_code"] for item in record["ineligible_courses"]})

    def test_lab_seating_rules_single_teacher_and_no_alternation(self):
        published = main.generate_datesheet_endpoint()
        lab_entries = [e for e in published["datesheet"] if e.get("is_lab")]
        self.assertTrue(len(lab_entries) > 0)

        allowed_labs = {"Lab 2", "Lab 3", "Lab 4", "Lab 5"}
        for entry in lab_entries:
            for rname in entry.get("allocated_rooms", []):
                self.assertIn(rname, allowed_labs)

        slots_with_labs = set(e["slot_id"] for e in lab_entries)
        for sid in slots_with_labs:
            plan = main._resolve_seating_plan(sid)
            for room in plan["rooms"]:
                if room.get("room_name") in allowed_labs:
                    teachers = set(t for t in (room.get("column_teachers") or []) if t)
                    self.assertLessEqual(len(teachers), 1, f"Multiple teachers found in {room['room_name']}: {teachers}")

                    cols = room["seating_sheet"]["columns"]
                    occupied_indices = [idx for idx, c in enumerate(cols) if any(c["roll_nos"])]
                    if occupied_indices:
                        expected = list(range(occupied_indices[0], occupied_indices[-1] + 1))
                        self.assertEqual(occupied_indices, expected, f"Gaps found in lab {room['room_name']} columns!")

                    codes = set(c["course_code"] for c in cols if c["course_code"] and any(c["roll_nos"]))
                    self.assertLessEqual(len(codes), 1)

    def test_lab_invigilation_duty_assigned_to_course_instructor(self):
        main.generate_datesheet_endpoint()
        from pydantic import BaseModel
        class DummyPayload:
            slot_ids = []

        result = main.generate_invigilation_duties(DummyPayload())
        lab_duties = [d for d in result["duties"] if "LAB" in d["room_id"]]
        self.assertTrue(len(lab_duties) > 0)

        # For every lab duty: exactly 1 invigilator per room, and duty_type is own_subject
        room_slot_pairs = [(d["slot_id"], d["room_id"]) for d in lab_duties]
        self.assertEqual(len(room_slot_pairs), len(set(room_slot_pairs)), "A lab room has duplicate duties in same slot!")

        for d in lab_duties:
            self.assertEqual(d["duty_type"], "own_subject")
            plan = main._resolve_seating_plan(d["slot_id"])
            room = next(r for r in plan["rooms"] if r["room_id"] == d["room_id"])
            lab_teachers = set(t for t in (room.get("column_teachers") or []) if t)
            self.assertIn(d["instructor"], lab_teachers)

    def test_no_adjacent_columns_share_same_course_and_instructor_in_halls(self):
        published = main.generate_datesheet_endpoint()
        all_slots = sorted(set(e["slot_id"] for e in published["datesheet"]))
        for sid in all_slots:
            plan = main._resolve_seating_plan(sid)
            for room in plan["rooms"]:
                if room.get("room_type") == "lab" or "Lab" in room.get("room_name", ""):
                    continue
                self.assertTrue(room["adjacent_rule_pass"], f"Adjacent rule failed in slot {sid} room {room['room_name']}")
                cols = room["seating_sheet"]["columns"]
                for i in range(len(cols) - 1):
                    c1, c2 = cols[i], cols[i + 1]
                    if c1["roll_nos"] and c2["roll_nos"]:
                        same_code = (c1["course_code"] == c2["course_code"])
                        same_inst = (c1["instructor"].strip().lower() == c2["instructor"].strip().lower())
                        self.assertFalse(
                            same_code and same_inst,
                            f"Adjacent cheating hazard in slot {sid} room {room['room_name']}: "
                            f"Cols {c1['column_no']} and {c2['column_no']} both share {c1['course_code']} - {c1['instructor']}!"
                        )

    def test_datesheet_reference_layout_xlsx_and_pdf(self):
        import openpyxl
        published = main.generate_datesheet_endpoint()
        self.assertEqual(published["status"], "PUBLISHED")

        # Test XLSX export
        xlsx_res = main.export_datesheet_xlsx()
        self.assertEqual(xlsx_res.status_code, 200)

        seating_by_slot = {}
        for entry in published["datesheet"]:
            sid = entry["slot_id"]
            if sid not in seating_by_slot:
                try:
                    seating_by_slot[sid] = main._resolve_seating_plan(sid)
                except Exception:
                    seating_by_slot[sid] = {}

        buf_x = main.datesheet_xlsx(published["datesheet"], seating_by_slot, version=published.get("version", "1.2"))
        wb = openpyxl.load_workbook(buf_x)
        ws = wb.active

        # Check institutional headers (Rows 1-5 matching reference_datesheet.xlsx)
        self.assertEqual(ws.cell(1, 1).value, "INTERNATIONAL ISLAMIC UNIVERSITY")
        self.assertEqual(ws.cell(2, 1).value, "DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY")
        self.assertEqual(ws.cell(3, 1).value, "MIDTERM EXAMS DATESHEET (MALE) - FALL 2026")
        self.assertIn("Version", ws.cell(4, 1).value)

        expected_headers = [
            "Date  (Day)",
            "Course",
            "Instructor",
            "Batch(es)",
            "Room No.",
            "Students Count",
            "Total Students per Session",
        ]
        actual_headers = [ws.cell(5, c).value for c in range(1, 8)]
        self.assertEqual(actual_headers, expected_headers)

        # Verify Row 7 is a date banner
        row7_val = ws.cell(7, 1).value
        self.assertIn("2026", str(row7_val))
        self.assertIn("-", str(row7_val))

        # Verify Row 8 has 12-hour AM/PM formatted session time
        row8_time = str(ws.cell(8, 1).value)
        self.assertTrue("AM" in row8_time or "PM" in row8_time, f"Time in XLSX export must use 12-hour AM/PM: {row8_time}")

        # Test PDF export
        pdf_res = main.export_datesheet_pdf()
        self.assertEqual(pdf_res.status_code, 200)

        buf_p = main.datesheet_pdf(published["datesheet"], seating_by_slot, version=published.get("version", "1.2"))
        pdf_bytes = buf_p.getvalue()
        self.assertTrue(len(pdf_bytes) > 2000, "PDF export should produce valid document bytes")
        self.assertTrue(pdf_bytes.startswith(b"%PDF"), "Exported PDF must have valid PDF header")

    def test_invigilation_roster_enforces_staffing_ecr_and_cap(self):
        main.generate_datesheet_endpoint()
        result = generate_duties([])
        self.assertGreater(result["generated_count"], 0)

        summary = get_roster_summary()
        self.assertEqual(summary["stats"]["error_count"], 0)
        self.assertEqual(summary["stats"]["understaffed_rooms"], 0)
        self.assertEqual(summary["stats"]["overstaffed_rooms"], 0)

        for slot in summary["slots"]:
            for room in slot["rooms"]:
                if room["is_lab"]:
                    expected = 1
                elif room["room_name"] == "Room 26":
                    expected = 3
                elif room["room_name"] == "Room 18":
                    expected = 2
                else:
                    expected = 1
                self.assertEqual(room["required"], expected, room["room_name"])
                self.assertEqual(room["assigned"], expected, room["room_name"])

        hall_instructors = defaultdict(set)
        counted = Counter()
        for duty in summary["duties"]:
            self.assertEqual(
                duty["is_counted"],
                0 if duty["duty_type"] == "own_subject" else 1,
            )
            if duty["is_counted"]:
                counted[normalize_name(duty["instructor"])] += 1
            if duty["room_type"] != "lab":
                self.assertFalse(
                    is_ecr_member(duty["instructor"]),
                    f"ECR member {duty['instructor']} assigned to a hall",
                )
                normalized = normalize_name(duty["instructor"])
                self.assertNotIn(
                    normalized, hall_instructors[duty["slot_id"]],
                    f"{duty['instructor']} assigned to two halls in {duty['slot_id']}",
                )
                hall_instructors[duty["slot_id"]].add(normalized)

        self.assertTrue(
            all(value <= 4 for value in counted.values()),
            f"Extra-duty cap violated: {dict(counted)}",
        )

    def test_invigilation_recalculation_is_deterministic(self):
        main.generate_datesheet_endpoint()
        generate_duties([])
        first = sorted(
            (duty["slot_id"], duty["room_id"], normalize_name(duty["instructor"]), duty["duty_type"])
            for duty in list_duties()
        )
        generate_duties([], preserve_manual=False)
        second = sorted(
            (duty["slot_id"], duty["room_id"], normalize_name(duty["instructor"]), duty["duty_type"])
            for duty in list_duties()
        )
        self.assertEqual(first, second)

    def test_invigilation_recalculation_can_target_one_slot(self):
        main.generate_datesheet_endpoint()
        generate_duties([])
        before = list_duties()
        target_slot = before[0]["slot_id"]
        other_before = sorted(
            (duty["slot_id"], duty["room_id"], normalize_name(duty["instructor"]))
            for duty in before
            if duty["slot_id"] != target_slot
        )

        result = recalculate_duties([target_slot], preserve_manual=False)
        self.assertGreater(result["generated_count"], 0)

        after = list_duties()
        other_after = sorted(
            (duty["slot_id"], duty["room_id"], normalize_name(duty["instructor"]))
            for duty in after
            if duty["slot_id"] != target_slot
        )
        self.assertEqual(other_before, other_after)
        self.assertTrue(any(duty["slot_id"] == target_slot for duty in after))

        summary = get_roster_summary()
        self.assertEqual(summary["stats"]["error_count"], 0)
        self.assertEqual(summary["stats"]["understaffed_rooms"], 0)
        self.assertEqual(summary["stats"]["overstaffed_rooms"], 0)

    def test_manual_override_is_preserved_by_recalculation(self):
        main.generate_datesheet_endpoint()
        generate_duties([])
        summary = get_roster_summary()
        duty = next(
            item for item in summary["duties"]
            if item["room_type"] != "lab" and item["required_invigilators"] == 1
        )
        used = {
            normalize_name(item["instructor"])
            for item in summary["duties"]
            if item["slot_id"] == duty["slot_id"]
        }
        candidates = [
            faculty["name"] for faculty in get_faculty_workload()
            if not faculty["is_ecr"]
            and faculty["remaining_extra_capacity"] > 0
            and faculty["name"] != duty["instructor"]
            and normalize_name(faculty["name"]) not in used
        ]
        self.assertTrue(candidates)

        updated = None
        last_error = None
        for candidate in candidates:
            try:
                updated = update_manual_duty(
                    duty["id"], {"instructor": candidate, "notes": "manual swap"},
                )
                break
            except HTTPException as exc:
                last_error = exc
        self.assertIsNotNone(updated, f"Could not find a valid replacement: {last_error}")
        self.assertEqual(updated["source"], "manual")
        self.assertEqual(updated["instructor"], candidate)
        self.assertEqual(updated["notes"], "manual swap")

        result = recalculate_duties([], preserve_manual=True)
        self.assertGreaterEqual(result["preserved_manual_count"], 1)
        persisted = next(item for item in list_duties() if item["id"] == duty["id"])
        self.assertEqual(persisted["source"], "manual")
        self.assertEqual(persisted["instructor"], candidate)
        self.assertEqual(persisted["notes"], "manual swap")

        recalculate_duties([], preserve_manual=False)
        self.assertFalse(any(item["id"] == duty["id"] for item in list_duties()))

    def test_manual_override_rejects_hard_rule_violations(self):
        main.generate_datesheet_endpoint()
        generate_duties([])
        summary = get_roster_summary()
        duty = next(
            item for item in summary["duties"]
            if item["room_type"] != "lab" and item["required_invigilators"] == 1
        )

        ecr_name = next(item["name"] for item in get_faculty_workload() if item["is_ecr"])
        with self.assertRaises(HTTPException) as context:
            update_manual_duty(duty["id"], {"instructor": ecr_name})
        self.assertEqual(context.exception.status_code, 422)

        same_slot = next(
            item for item in summary["duties"]
            if item["slot_id"] == duty["slot_id"]
            and item["id"] != duty["id"]
            and item["room_type"] != "lab"
        )
        with self.assertRaises(HTTPException):
            update_manual_duty(duty["id"], {"instructor": same_slot["instructor"]})

        with self.assertRaises(HTTPException) as context:
            delete_manual_duty(duty["id"])
        self.assertEqual(context.exception.status_code, 409)

        full_slot = next(
            slot for slot in summary["slots"]
            if any(room["assigned"] == room["required"] for room in slot["rooms"])
        )
        full_room = next(
            room for room in full_slot["rooms"] if room["assigned"] == room["required"]
        )
        candidate = next(
            item["name"] for item in get_faculty_workload()
            if not item["is_ecr"] and item["remaining_extra_capacity"] > 0
        )
        with self.assertRaises(HTTPException):
            create_manual_duty({
                "slot_id": full_slot["slot_id"],
                "room_id": full_room["room_id"],
                "instructor": candidate,
            })

    def test_datesheet_regeneration_invalidates_invigilation_roster(self):
        main.generate_datesheet_endpoint()
        generate_duties([])
        self.assertTrue(list_duties())
        main.generate_datesheet_endpoint()
        self.assertEqual(list_duties(), [])

    def test_custom_seating_plan_edit_and_datesheet_sync(self):
        import copy
        published = main.generate_datesheet_endpoint()
        self.assertEqual(published["status"], "PUBLISHED")

        # Resolve algorithmic plan for S1
        plan_initial = main._resolve_seating_plan("S1")
        initial_room_names = [r["room_name"] for r in plan_initial["rooms"]]
        self.assertIn("Lab 4", initial_room_names)
        self.assertIn("Lab 3", initial_room_names)

        # Simulate user moving trailing students from Lab 4 to Lab 3
        plan_mod = copy.deepcopy(plan_initial)
        l3 = [r for r in plan_mod["rooms"] if r["room_name"] == "Lab 3"][0]
        l4 = [r for r in plan_mod["rooms"] if r["room_name"] == "Lab 4"][0]

        # Expand Lab 3 to 6 rows and place Lab 4's 3 students
        l3["rows"] = 6
        for col in l3["seating_sheet"]["columns"]:
            while len(col["roll_nos"]) < 6:
                col["roll_nos"].append("")
        l3["seating_sheet"]["columns"][0]["roll_nos"][5] = "2026-CS-104"
        l3["seating_sheet"]["columns"][1]["roll_nos"][5] = "2026-CS-105"
        l3["seating_sheet"]["columns"][2]["roll_nos"][5] = "2026-CS-106"

        # Empty Lab 4
        for col in l4["seating_sheet"]["columns"]:
            col["roll_nos"] = [""] * len(col["roll_nos"])
            col["paper"] = "—"
            col["paper_header"] = "— (Vacant)"
        l4["seated"] = 0

        # Save custom plan
        save_resp = main.save_custom_seating_plan(plan_mod)
        self.assertEqual(save_resp["status"], "success")

        # Verify updated plan
        plan_saved = main._resolve_seating_plan("S1")
        saved_room_names = [r["room_name"] for r in plan_saved["rooms"]]
        self.assertNotIn("Lab 4", saved_room_names, "Vacated Lab 4 must be dropped from active rooms.")
        self.assertIn("Lab 3", saved_room_names)

        # Verify datesheet room synchronization
        cs111l_entry = [e for e in main.datesheet_state["datesheet"] if e.get("slot_id") == "S1" and e.get("course_code") == "CS111L"][0]
        self.assertEqual(cs111l_entry.get("allocated_rooms"), ["Lab 2", "Lab 3"])

        # Verify regenerate clears custom override
        reg = main.regenerate_seating_plan("S1")
        reg_rooms = [r["room_name"] for r in reg["rooms"]]
        self.assertIn("Lab 4", reg_rooms)

    def test_terminal_datesheet_study_gap_rule(self):
        """Rule 9: In Final/Terminal datesheet, batches must get at least 1 day study gap between theory exams."""
        from datetime import datetime, timedelta
        base_d = datetime(2026, 12, 1)
        terminal_slots = []
        slot_num = 1
        for day_idx in range(18):
            d = (base_d + timedelta(days=day_idx)).date()
            if d.weekday() >= 5:
                continue
            d_str = d.strftime("%Y-%m-%d")
            terminal_slots.append({"id": f"S{slot_num}", "date": d_str, "start_time": "08:45", "end_time": "11:45", "label": "Morning"})
            slot_num += 1
            terminal_slots.append({"id": f"S{slot_num}", "date": d_str, "start_time": "14:30", "end_time": "17:30", "label": "Afternoon"})
            slot_num += 1

        res = datesheet.generate_datesheet(time_slots=terminal_slots)
        self.assertEqual(len(res["unplaced"]), 0, "All courses should be placed in terminal exam.")

        from collections import defaultdict
        cohort_dates = defaultdict(set)
        for e in res["datesheet"]:
            if not e.get("is_lab"):
                cohort_dates[(e.get("program"), e.get("batch"))].add(e["date"])

        for cohort, dates in cohort_dates.items():
            sorted_dates = sorted(list(dates))
            for i in range(len(sorted_dates) - 1):
                d1 = datetime.strptime(sorted_dates[i], "%Y-%m-%d").date()
                d2 = datetime.strptime(sorted_dates[i + 1], "%Y-%m-%d").date()
                diff = (d2 - d1).days
                self.assertGreaterEqual(
                    diff, 2,
                    f"Cohort {cohort} has theory exams on consecutive days {d1} and {d2} with 0 study gap days!"
                )

    def test_buffer_seats_only_for_large_rooms_and_repeater_courses(self):
        """Rule 10: Buffer seats only in 50+ cap rooms (R18 & R26) and only active for repeater courses (>=5 repeaters)."""
        # Master data check:
        for r in data.store.get_rooms():
            cap = r.get("capacity", 0)
            res_cap = r.get("reserve_capacity", 0)
            if cap >= 50 and r.get("room_type") != "lab":
                self.assertGreater(res_cap, 0, f"Large room {r['name']} must have buffer reserve capacity.")
            else:
                self.assertEqual(res_cap, 0, f"Room {r['name']} (cap {cap}) must have 0 reserve capacity.")

        # Seating plan check without repeaters:
        courses_without_repeaters = [c for c in data.store.get_courses() if c["code"] in ("CS101", "CS201")]
        plan_no_rep = seating.build_seating_plan(courses_without_repeaters)
        for r in plan_no_rep.get("rooms", []):
            self.assertEqual(
                r.get("reserve_capacity", 0), 0,
                f"Room {r['room_name']} should have 0 reserve capacity when courses have no repeaters."
            )

        # Seating plan check with repeater course GEC112 (has 6 repeaters):
        course_gec112 = [c for c in data.store.get_courses() if c["code"] == "GEC112"]
        plan_rep = seating.build_seating_plan(course_gec112)
        for r in plan_rep.get("rooms", []):
            cap = r.get("capacity", 0)
            res = r.get("reserve_capacity", 0)
            if cap >= 50:
                self.assertEqual(res, r.get("columns", 0), f"Large room {r['room_name']} must activate reserve seats for repeater course equal to columns.")
                self.assertTrue(r.get("has_buffer_row"), f"Large room {r['room_name']} must have has_buffer_row=True.")
                self.assertTrue(all(cell.get("roll_no") == "Buffer" and cell.get("is_buffer") for cell in r["grid"][-1]))
            else:
                self.assertEqual(res, 0, f"Small room {r['room_name']} must have 0 reserve seats.")
                self.assertFalse(r.get("has_buffer_row", False))


if __name__ == "__main__":
    unittest.main()
