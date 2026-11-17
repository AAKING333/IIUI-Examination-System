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
    _is_own_subject,
    create_manual_duty,
    delete_faculty_policy,
    delete_manual_duty,
    generate_duties,
    get_faculty_workload,
    get_roster_summary,
    is_ecl_member,
    is_ecr_member,
    is_no_duty_member,
    list_duties,
    list_faculty_policy,
    normalize_name,
    recalculate_duties,
    update_manual_duty,
    upsert_faculty_policy,
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
            # The seated column teacher normally invigilates, but a teacher
            # on the no-duty list is never allotted a duty; a co-instructor
            # of the same lab course covers instead.
            allowed = set(lab_teachers)
            for code in {c["course_code"] for c in room["seating_sheet"]["columns"] if c["course_code"]}:
                allowed.update(data.store.get_instructors_for_course(code))
            self.assertIn(d["instructor"], allowed)
            self.assertFalse(is_no_duty_member(d["instructor"]))

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
        rotation_by_slot = defaultdict(int)
        counted = Counter()
        for duty in summary["duties"]:
            self.assertEqual(
                duty["is_counted"],
                0 if duty["duty_type"] in ("own_subject", "ecr_rotation") else 1,
            )
            if duty["is_counted"]:
                counted[normalize_name(duty["instructor"])] += 1
            if duty["duty_type"] == "ecr_rotation":
                rotation_by_slot[duty["slot_id"]] += 1
                self.assertLessEqual(
                    rotation_by_slot[duty["slot_id"]], 1,
                    f"Slot {duty['slot_id']} has more than one ECR rotation duty.",
                )
                # Own paper -> no ECR duty in that slot.
                slot_entries = [
                    entry for entry in main.datesheet_state["datesheet"]
                    if entry.get("slot_id") == duty["slot_id"]
                ]
                self.assertFalse(
                    _is_own_subject(duty["instructor"], slot_entries),
                    f"{duty['instructor']} holds an ECR rotation duty in a slot "
                    "where their own paper runs.",
                )
            if duty["room_type"] != "lab":
                # ECL members carry only own-subject duties; no-duty role is
                # never on the roster; the Chairman only covers own exams.
                if is_ecl_member(duty["instructor"]):
                    self.assertEqual(
                        duty["duty_type"], "own_subject",
                        f"{duty['instructor']} given an extra duty but is "
                        "ECL exempt",
                    )
                self.assertFalse(
                    is_no_duty_member(duty["instructor"]),
                    f"{duty['instructor']} has the no-duty role but was "
                    "allotted a hall duty.",
                )
                normalized = normalize_name(duty["instructor"])
                self.assertNotIn(
                    normalized, hall_instructors[duty["slot_id"]],
                    f"{duty['instructor']} assigned to two halls in {duty['slot_id']}",
                )
                hall_instructors[duty["slot_id"]].add(normalized)

        self.assertTrue(
            any(rotation_by_slot.values()),
            "Expected ECR rotation relief duties to be generated.",
        )
        self.assertTrue(
            all(value <= 4 for value in counted.values()),
            f"Extra-duty cap violated: {dict(counted)}",
        )
        for member in get_faculty_workload():
            if member["is_senior_role"]:
                self.assertLessEqual(
                    member["extra_duties"], 2,
                    f"Dire-need senior {member['name']} exceeded two extra duties.",
                )

    def test_invigilation_own_subject_room_placement(self):
        """Every own-subject hall duty sits in the room where the course is seated."""
        main.generate_datesheet_endpoint()
        generate_duties([])
        duties = list_duties()
        self.assertTrue(duties)
        checked = 0
        for duty in duties:
            if duty["duty_type"] != "own_subject" or duty["room_type"] == "lab":
                continue
            plan = main._resolve_seating_plan(duty["slot_id"])
            room = next(
                (r for r in plan["rooms"] if r["room_id"] == duty["room_id"]), None
            )
            self.assertIsNotNone(room, f"Room {duty['room_id']} missing from plan")
            seated_teachers = {
                normalize_name(t) for t in (room.get("column_teachers") or []) if t
            }
            self.assertIn(
                normalize_name(duty["instructor"]), seated_teachers,
                f"{duty['instructor']} own-subject duty is not in the hall seating "
                f"their course ({room['room_name']}, slot {duty['slot_id']})",
            )
            checked += 1
        self.assertGreater(checked, 0, "Expected at least one own-subject hall duty.")

    def test_invigilation_no_duty_list_and_ecl_members(self):
        """Role defaults match the rulings: ECL own-exams, chairman own exam,
        dire-need seniors capped, ECR rotation, and nobody on no-duty by default."""
        main.generate_datesheet_endpoint()
        generate_duties([])
        summary = get_roster_summary()

        no_duty_names = {m["name"] for m in summary["faculty"] if m["is_no_duty"]}
        ecl_names = {m["name"] for m in summary["faculty"] if m["is_ecl"]}
        chairman_names = {m["name"] for m in summary["faculty"] if m["is_chairman"]}
        senior_names = {m["name"] for m in summary["faculty"] if m["is_senior_role"]}
        ecr_names = {m["name"] for m in summary["faculty"] if m["is_ecr"]}
        # The latest ruling retired the no-duty default: the Chairman holds
        # his own exam duty and the most-senior teachers carry dire-need
        # duties, so nobody defaults to the no_duty role.
        self.assertEqual(no_duty_names, set())
        # ECL is now only Imran Saeed and Tahir Hussain; Jibran Mir moved to
        # the ECR rotation pool.
        self.assertTrue(any("imransaeed" in n for n in {normalize_name(x) for x in ecl_names}))
        self.assertTrue(any("tahirhussain" in n for n in {normalize_name(x) for x in ecl_names}))
        self.assertFalse(any("jibran" in n for n in {normalize_name(x) for x in ecl_names}))
        self.assertTrue(any("jibran" in n for n in {normalize_name(x) for x in ecr_names}))
        self.assertTrue(any("musharraf" in n or "musharaf" in n
                            for n in {normalize_name(x) for x in ecr_names}))
        self.assertTrue(any("tariqsadad" in n or "tariqsaddad" in n
                            for n in {normalize_name(x) for x in ecr_names}))
        self.assertTrue(any("muhammadnazir" in n or "muhammadnazeer" in n
                            for n in {normalize_name(x) for x in chairman_names}))
        self.assertTrue(any("muhammadmajid" in n
                            for n in {normalize_name(x) for x in senior_names}))

        for member in summary["faculty"]:
            if member["is_ecl"] or member["is_chairman"]:
                self.assertEqual(
                    member["extra_duties"], 0,
                    f"{member['name']} may only invigilate their own exams.",
                )
            if member["is_ecr"]:
                # ECR members carry rotation duties, which are exempt from
                # the extra-duty cap, and no counted extras of their own.
                self.assertEqual(
                    member["extra_duties"], 0,
                    f"ECR member {member['name']} must not carry generic "
                    "extra duties.",
                )
                self.assertGreaterEqual(member["ecr_rotation_duties"], 0)
            if member["is_senior_role"]:
                self.assertLessEqual(
                    member["extra_duties"], 2,
                    f"Dire-need senior {member['name']} exceeded two extra duties.",
                )

        for duty in summary["duties"]:
            self.assertFalse(
                is_no_duty_member(duty["instructor"]),
                f"{duty['instructor']} has the no-duty role but was "
                f"allotted a duty ({duty['slot_id']} / {duty['room_name']}).",
            )
            if is_ecl_member(duty["instructor"]):
                self.assertEqual(
                    duty["duty_type"], "own_subject",
                    f"{duty['instructor']} must only have own-subject duties.",
                )
            if duty.get("is_chairman"):
                self.assertEqual(
                    duty["duty_type"], "own_subject",
                    "The Chairman/HOD may only hold the duty of their own exam.",
                )

    def test_manual_duty_rejects_no_duty_and_ecl_members(self):
        """Manual overrides cannot allot duties to exempt roles (ECL, chairman,
        no-duty via policy)."""
        main.generate_datesheet_endpoint()
        generate_duties([])
        summary = get_roster_summary()
        duty = next(
            item for item in summary["duties"]
            if item["room_type"] != "lab" and item["required_invigilators"] == 1
        )
        plan = main._resolve_seating_plan(duty["slot_id"])
        room = next(r for r in plan["rooms"] if r["room_id"] == duty["room_id"])
        seated_teachers = {
            normalize_name(t) for t in (room.get("column_teachers") or []) if t
        }
        rejected = 0
        for member in get_faculty_workload():
            normalized = normalize_name(member["name"])
            if member["is_ecl"] or member["is_chairman"]:
                # An exempt member whose own paper is seated in this exact
                # room may be assigned there; every other placement is
                # rejected (own exams only).
                if normalized in seated_teachers:
                    continue
                with self.assertRaises(HTTPException) as context:
                    update_manual_duty(duty["id"], {"instructor": member["name"]})
                self.assertEqual(context.exception.status_code, 422)
                rejected += 1
        self.assertGreater(rejected, 0, "Expected at least one rejected exemption.")

    def test_manual_duty_rejects_policy_no_duty_member(self):
        """An admin can switch a teacher to the no-duty role; the roster and
        manual overrides must then refuse every duty for them."""
        main.generate_datesheet_endpoint()
        generate_duties([])
        summary = get_roster_summary()
        member = next(
            item for item in get_faculty_workload()
            if item["faculty_role"] == "regular" and item["courses"]
        )
        upsert_faculty_policy({
            "instructor": member["name"],
            "role": "no_duty",
        })
        self.assertTrue(is_no_duty_member(member["name"]))
        duty = next(
            item for item in summary["duties"]
            if item["room_type"] != "lab" and item["required_invigilators"] == 1
        )
        with self.assertRaises(HTTPException) as context:
            update_manual_duty(duty["id"], {"instructor": member["name"]})
        self.assertEqual(context.exception.status_code, 422)
        delete_faculty_policy(member["name"])
        self.assertFalse(is_no_duty_member(member["name"]))

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
            and not faculty["is_ecl"]
            and not faculty["is_no_duty"]
            and not faculty["is_chairman"]
            and not faculty["is_visiting"]
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

        # The Chairman/HOD may only hold the duty of their own exam: any
        # other hall posting is rejected.
        workload = get_faculty_workload()
        chairman = next((item for item in workload if item["is_chairman"]), None)
        if chairman:
            normalized_chairman = normalize_name(chairman["name"])

            def _seated_teachers(item):
                plan = main._resolve_seating_plan(item["slot_id"])
                room = next(
                    (r for r in plan["rooms"] if r["room_id"] == item["room_id"]),
                    None,
                )
                return {
                    normalize_name(t) for t in (room.get("column_teachers") or []) if t
                } if room else set()

            target = next(
                item for item in summary["duties"]
                if item["room_type"] != "lab"
                and normalized_chairman not in _seated_teachers(item)
            )
            with self.assertRaises(HTTPException) as context:
                update_manual_duty(target["id"], {"instructor": chairman["name"]})
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
            if not item["is_ecr"] and not item["is_ecl"] and not item["is_no_duty"]
            and not item["is_chairman"] and not item["is_visiting"]
            and item["remaining_extra_capacity"] > 0
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

    def test_ecr_rotation_pattern(self):
        """ECR relief rotation: one duty per slot, cycling in the documented
        order, skipping members whose own paper runs in that slot."""
        main.generate_datesheet_endpoint()
        generate_duties([])
        from app.services.invigilation_service import (
            _ecr_rotation_order,
            _faculty_registry,
        )
        registry, _ = _faculty_registry()
        cycle = [normalize_name(member) for member in _ecr_rotation_order(registry)]
        self.assertEqual(len(cycle), 4, "Expected 4 ECR rotation members (both Tariq spellings included).")

        all_duties = list_duties()
        used_by_slot = defaultdict(set)
        for duty in all_duties:
            used_by_slot[duty["slot_id"]].add(normalize_name(duty["instructor"]))
        rotation = sorted(
            (d for d in all_duties if d["duty_type"] == "ecr_rotation"),
            key=lambda d: (d["slot_date"], d["slot_start_time"]),
        )
        self.assertTrue(rotation, "Expected ECR rotation duties to be generated.")

        def _cycle_index(name):
            normalized = normalize_name(name)
            return next(i for i, marker in enumerate(cycle) if marker in normalized)

        prev_index = None
        for duty in rotation:
            index = _cycle_index(duty["instructor"])
            if prev_index is not None:
                step = (index - prev_index) % len(cycle)
                self.assertGreaterEqual(step, 1, "The same ECR member took two rotation slots in a row.")
                # Any member passed over must have been unavailable: either
                # already assigned in the slot or busy with their own paper.
                slot_entries = [
                    entry for entry in main.datesheet_state["datesheet"]
                    if entry.get("slot_id") == duty["slot_id"]
                ]
                for skipped in range(1, step):
                    member = cycle[(prev_index + skipped) % len(cycle)]
                    unavailable = member in used_by_slot[duty["slot_id"]] or _is_own_subject(
                        member, slot_entries
                    )
                    self.assertTrue(
                        unavailable,
                        f"Rotation skipped available ECR member {member} in slot "
                        f"{duty['slot_id']}.",
                    )
            prev_index = index

    def test_faculty_policy_override_and_admin_added_teacher(self):
        """Admin can add teachers and override roles / duty caps; the roster
        and validation follow the policy immediately."""
        main.generate_datesheet_endpoint()
        generate_duties([])

        # 1. Per-teacher cap override via the policy table.
        member = next(
            m for m in get_faculty_workload()
            if m["faculty_role"] == "regular" and m["courses"] and m["extra_duties"] >= 1
        )
        upsert_faculty_policy({
            "instructor": member["name"],
            "role": "regular",
            "max_extra_duties": 1,
        })
        workload = {m["name"]: m for m in get_faculty_workload()}
        self.assertEqual(workload[member["name"]]["max_duties"], 1)
        self.assertEqual(workload[member["name"]]["remaining_extra_capacity"], 0)
        # Re-assigning any further extra duty to them must now be refused.
        summary = get_roster_summary()
        member_slot = next(
            d["slot_id"] for d in summary["duties"]
            if normalize_name(d["instructor"]) == normalize_name(member["name"])
            and d["is_counted"]
        )
        target = next(
            item for item in summary["duties"]
            if item["room_type"] != "lab"
            and item["slot_id"] != member_slot
            and normalize_name(member["name"]) not in {
                normalize_name(t)
                for t in (next(
                    r for r in main._resolve_seating_plan(item["slot_id"])["rooms"]
                    if r["room_id"] == item["room_id"]
                ).get("column_teachers") or [])
            }
        )
        with self.assertRaises(HTTPException) as context:
            update_manual_duty(target["id"], {"instructor": member["name"]})
        self.assertEqual(context.exception.status_code, 422)
        delete_faculty_policy(member["name"])

        # 2. Admin-added teacher (no course assignment) joins the roster.
        added_name = "Dr. Test Added Teacher"
        upsert_faculty_policy({"instructor": added_name, "role": "visiting"})
        added = next(
            m for m in get_faculty_workload()
            if normalize_name(m["name"]) == normalize_name(added_name)
        )
        self.assertEqual(added["faculty_role"], "visiting")
        # Visiting faculty may only invigilate their own exam: hall postings
        # are rejected.
        summary = get_roster_summary()
        duty = next(
            item for item in summary["duties"]
            if item["room_type"] != "lab" and item["required_invigilators"] == 1
        )
        with self.assertRaises(HTTPException) as context:
            update_manual_duty(duty["id"], {"instructor": added_name})
        self.assertEqual(context.exception.status_code, 422)
        # Role becomes regular -> the teacher can be swapped into a hall duty.
        upsert_faculty_policy({
            "instructor": added_name, "role": "regular", "max_extra_duties": 2,
        })
        # The added teacher has no duties yet, so any free hall reassignment
        # works: pick a single-invigilator hall duty to swap onto them.
        candidate_duty = next(
            item for item in summary["duties"]
            if item["room_type"] != "lab" and item["required_invigilators"] == 1
        )
        updated = update_manual_duty(candidate_duty["id"], {"instructor": added_name})
        self.assertEqual(updated["instructor"], added_name)
        # 3. Deleting the policy removes the admin-added teacher; a clean
        # recalculation then clears any duties they were holding.
        delete_faculty_policy(added_name)
        recalculate_duties([], preserve_manual=False)
        self.assertFalse(any(
            normalize_name(m["name"]) == normalize_name(added_name)
            for m in get_faculty_workload()
        ))

    def test_own_subject_teacher_placed_in_max_student_room(self):
        """A course teacher's hall duty lands in the room holding the largest
        share of their students (rooms 26/18 first), unless that room was
        already fully staffed."""
        main.generate_datesheet_endpoint()
        generate_duties([])
        summary = get_roster_summary()
        assigned_by_room = defaultdict(int)
        required_by_room = {}
        for slot in summary["slots"]:
            for room in slot["rooms"]:
                assigned_by_room[(slot["slot_id"], room["room_id"])] = room["assigned"]
                required_by_room[(slot["slot_id"], room["room_id"])] = room["required"]
        checked = 0
        for duty in list_duties():
            if duty["duty_type"] != "own_subject" or duty["room_type"] == "lab":
                continue
            plan = main._resolve_seating_plan(duty["slot_id"])
            halls = [
                r for r in plan["rooms"]
                if r.get("room_type") != "lab" and "Lab" not in r.get("room_name", "")
            ]
            counts = {}
            seated_by_room = {}
            for room in halls:
                total = 0
                for col in room["seating_sheet"]["columns"]:
                    teachers = [
                        p.strip() for p in str(col.get("instructor") or "").split("/")
                    ]
                    if not any(
                        normalize_name(t) == normalize_name(duty["instructor"])
                        for t in teachers
                    ):
                        continue
                    total += sum(
                        1 for roll in col["roll_nos"]
                        if roll and str(roll).strip()
                        and str(roll).strip().lower() != "buffer"
                    )
                counts[room["room_id"]] = total
                seated_by_room[room["room_id"]] = room.get("seated", 0) or 0
            if not counts or not any(counts.values()):
                continue
            best = max(
                counts,
                key=lambda rid: (counts[rid], seated_by_room[rid]),
            )
            room_full = assigned_by_room[(duty["slot_id"], best)] >= required_by_room[
                (duty["slot_id"], best)
            ]
            if counts[best] > counts[duty["room_id"]] and not room_full:
                self.fail(
                    f"{duty['instructor']} own-subject duty in "
                    f"{duty['room_id']} instead of the max-student room {best} "
                    f"({duty['slot_id']})."
                )
            checked += 1
        self.assertGreater(checked, 0, "Expected own-subject hall duties to check.")

    def test_largest_cohorts_seated_in_largest_halls(self):
        """Room 26 / Room 18 (the biggest halls) hold the biggest cohorts."""
        main.generate_datesheet_endpoint()
        slots = sorted({e["slot_id"] for e in main.datesheet_state["datesheet"]})
        checked = 0
        for slot_id in slots:
            plan = main._resolve_seating_plan(slot_id)
            halls = [
                r for r in plan["rooms"]
                if r.get("room_type") != "lab"
                and "Lab" not in r.get("room_name", "")
                and r.get("seated", 0) > 0
            ]
            if len(halls) < 2:
                continue
            biggest = max(halls, key=lambda r: r["seated"])
            self.assertIn(
                biggest["room_name"], {"Room 26", "Room 18"},
                f"Slot {slot_id}: largest hall cohort seated in "
                f"{biggest['room_name']} instead of Room 26/18.",
            )
            checked += 1
        self.assertGreater(checked, 0)


if __name__ == "__main__":
    unittest.main()
