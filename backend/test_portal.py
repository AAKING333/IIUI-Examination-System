"""
test_portal.py
--------------
Unit tests for the Exam Management Portal Phase 1 (IIUI Context).
"""

import sys
import os
import unittest
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
from scheduler import generate_datesheet, find_teacher_conflicts
from seating_engine import generate_seating_plans, SeatingError
from excel_exporter import generate_excel, _safe_value


def _synthetic_slot(
    student_count=20,
    teachers=("Teacher One",),
    room_count=2,
    rows=5,
    cols=6,
):
    """Build a minimal one-course, one-slot fixture for seating edge cases."""
    students = [
        {
            "student_id": i,
            "roll_no": f"TST-{i:03d}",
            "name": f"Test Student {i}",
            "batch": "BSCS-F26",
        }
        for i in range(1, student_count + 1)
    ]
    enrollments = []
    for i in range(1, student_count + 1):
        teacher = teachers[(i - 1) % len(teachers)]
        enrollments.append({
            "enroll_id": i,
            "student_id": i,
            "course_id": 1,
            "course_code": "TST 101",
            "course_name": "Synthetic Course",
            "section_code": "Sec-A",
            "instructor": teacher,
        })

    rooms = [
        {
            "room_id": f"R-{i}",
            "name": f"Room {i}",
            "rows": rows,
            "cols": cols,
            "capacity": rows * cols,
        }
        for i in range(1, room_count + 1)
    ]
    schedule = [{
        "course_id": 1,
        "course_code": "TST 101",
        "course_name": "Synthetic Course",
        "instructors": list(teachers),
        "instructor_str": ", ".join(teachers),
        "slot_id": 1,
        "date": "2026-10-26",
        "day_label": "Monday, 26 Oct 2026",
        "slot_name": "Session 1",
        "time": "08:45 AM - 10:15 AM",
        "enrolled_count": student_count,
        "allocated_rooms": [],
        "one_per_day_enforced": True,
    }]
    return enrollments, students, rooms, schedule



class TestExamPortal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rooms = generate_rooms()
        cls.students = generate_students(count=240)
        cls.courses, cls.enrollments = generate_courses_and_enrollments(cls.students)
        cls.slots = generate_time_slots()
        cls.schedule = generate_datesheet(
            cls.courses, cls.enrollments, cls.slots, cls.rooms
        )
        cls.seating_plans = generate_seating_plans(
            cls.schedule, cls.enrollments, cls.students, cls.rooms
        )

    def test_all_courses_scheduled_once(self):
        scheduled_cids = [entry["course_id"] for entry in self.schedule]
        self.assertEqual(len(scheduled_cids), len(self.courses))
        self.assertEqual(set(scheduled_cids), {c["course_id"] for c in self.courses})

    def test_clash_free_slots(self):
        enroll_map = defaultdict(set)
        for e in self.enrollments:
            enroll_map[e["course_id"]].add(e["student_id"])

        slot_students = defaultdict(set)
        for entry in self.schedule:
            sid = entry["slot_id"]
            c_students = enroll_map[entry["course_id"]]
            intersection = slot_students[sid] & c_students
            self.assertFalse(
                bool(intersection),
                f"Course {entry['course_code']} clashed in slot {sid} with shared students: {intersection}",
            )
            slot_students[sid] |= c_students

    def test_realtime_datesheet_seating_consistency(self):
        """Verifies datesheet allocated_rooms matches seating plan rooms exactly."""
        for e in self.schedule:
            actual_plan_rooms = {
                p["room_id"]
                for p in self.seating_plans
                if p["slot_id"] == e["slot_id"]
                and any(s["course_id"] == e["course_id"] for s in p["seats"])
            }
            self.assertEqual(
                set(e["allocated_rooms"]),
                actual_plan_rooms,
                f"Datesheet for {e['course_code']} reports rooms {e['allocated_rooms']} but seating plan has {actual_plan_rooms}"
            )

    def test_all_students_seated(self):
        """Verifies every enrolled student is seated in the seating plans."""
        enrolled_counts = {c["course_id"]: 0 for c in self.courses}
        for e in self.enrollments:
            enrolled_counts[e["course_id"]] += 1

        seated_counts = defaultdict(int)
        for p in self.seating_plans:
            for s in p["seats"]:
                seated_counts[s["course_id"]] += 1

        for c in self.courses:
            cid = c["course_id"]
            self.assertEqual(
                enrolled_counts[cid],
                seated_counts[cid],
                f"Mismatch in course {c['code']}: enrolled {enrolled_counts[cid]}, seated {seated_counts[cid]}"
            )

    def test_rooms_variety(self):
        allocated_rooms = set()
        for entry in self.schedule:
            allocated_rooms.update(entry["allocated_rooms"])
        self.assertGreater(len(allocated_rooms), 4, "Expected full roster of halls to be utilized")

    def test_no_teacher_double_booking(self):
        self.assertEqual(
            find_teacher_conflicts(self.schedule),
            [],
            "An instructor is scheduled for two courses in the same slot",
        )

    def test_teacher_conflict_detector_catches_conflict(self):
        conflicting = [
            {"slot_id": 1, "date": "2026-10-26", "slot_name": "Session 1",
             "course_code": "CS 101", "instructors": ["Dr. Same Teacher"]},
            {"slot_id": 1, "date": "2026-10-26", "slot_name": "Session 1",
             "course_code": "CS 102", "instructors": ["Dr. Same Teacher"]},
        ]
        conflicts = find_teacher_conflicts(conflicting)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["instructor"], "Dr. Same Teacher")

    def test_room_capacity_and_bounds(self):
        for plan in self.seating_plans:
            capacity = plan["rows"] * plan["cols"]
            self.assertLessEqual(
                len(plan["seats"]), capacity,
                f"{plan['room_id']} seats exceed its physical capacity",
            )
            positions = set()
            for seat in plan["seats"]:
                self.assertTrue(1 <= seat["row"] <= plan["rows"])
                self.assertTrue(1 <= seat["col"] <= plan["cols"])
                pos = (seat["row"], seat["col"])
                self.assertNotIn(pos, positions, f"Duplicate seat {pos} in {plan['room_id']}")
                positions.add(pos)

    def test_adjacent_columns_never_same_course(self):
        for plan in self.seating_plans:
            for row in plan["grid"]:
                for idx in range(len(row) - 1):
                    left, right = row[idx], row[idx + 1]
                    if left and right:
                        self.assertNotEqual(
                            left["course_id"], right["course_id"],
                            f"{plan['room_id']} row {left['row']} columns "
                            f"{idx + 1}<->{idx + 2} share course {left['course_code']}",
                        )

    def test_excel_formula_injection_is_escaped(self):
        self.assertEqual(_safe_value("=1+1"), "'=1+1")
        self.assertEqual(_safe_value("+cmd"), "'+cmd")
        self.assertEqual(_safe_value("Normal text"), "Normal text")
        self.assertEqual(_safe_value(42), 42)

    def test_excel_export_sheets(self):
        xlsx_bytes = generate_excel(
            self.schedule, self.seating_plans, self.students
        )
        self.assertGreater(len(xlsx_bytes), 1000)

        import io
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
        self.assertIn("Datesheet", wb.sheetnames)
        self.assertIn("Roll Number Slips", wb.sheetnames)
        self.assertGreaterEqual(len(wb.sheetnames), 3)


class TestSeatingEdgeCases(unittest.TestCase):
    """Synthetic scenarios that exercise the clarified two-column rule."""

    def test_single_course_needs_multiple_rooms(self):
        enrollments, students, rooms, schedule = _synthetic_slot(
            student_count=20, teachers=("Teacher One",), room_count=2
        )
        plans = generate_seating_plans(schedule, enrollments, students, rooms)

        self.assertEqual(sum(len(p["seats"]) for p in plans), 20)
        self.assertGreaterEqual(len(plans), 2, "A single-teacher course must spill into more rooms")
        for plan in plans:
            self.assertLessEqual(
                len(plan["seats"]), 15,
                "A single-teacher room may only use alternate columns (15 of 30 seats)",
            )
            self.assertEqual(plan["rule_mode"], "paper-level")
        self.assertEqual(
            set(schedule[0]["allocated_rooms"]),
            {p["room_id"] for p in plans},
        )

    def test_two_column_rule_paper_level(self):
        enrollments, students, rooms, schedule = _synthetic_slot(
            student_count=30,
            teachers=("Teacher A", "Teacher B"),
            room_count=2,
        )
        plans = generate_seating_plans(schedule, enrollments, students, rooms)

        self.assertEqual(sum(len(p["seats"]) for p in plans), 30)
        for plan in plans:
            self.assertEqual(plan["rule_mode"], "paper-level")
            for row in plan["grid"]:
                for idx in range(len(row) - 1):
                    left, right = row[idx], row[idx + 1]
                    if left and right:
                        self.assertNotEqual(
                            left["course_id"], right["course_id"],
                            "Spare capacity must leave an empty column between "
                            "same-course columns",
                        )

    def test_multi_teacher_fallback_when_capacity_constrained(self):
        enrollments, students, rooms, schedule = _synthetic_slot(
            student_count=30,
            teachers=("Teacher A", "Teacher B"),
            room_count=1,
        )
        plans = generate_seating_plans(schedule, enrollments, students, rooms)

        self.assertEqual(len(plans), 1)
        self.assertEqual(sum(len(p["seats"]) for p in plans), 30)
        self.assertEqual(plans[0]["rule_mode"], "fallback")
        self.assertGreaterEqual(plans[0]["fallback_columns"], 1)

        # Same course may be adjacent only when the teacher differs.
        for row in plans[0]["grid"]:
            for idx in range(len(row) - 1):
                left, right = row[idx], row[idx + 1]
                if left and right and left["course_id"] == right["course_id"]:
                    self.assertNotEqual(left["instructor"], right["instructor"])

    def test_unseatable_capacity_raises(self):
        enrollments, students, rooms, schedule = _synthetic_slot(
            student_count=40, teachers=("Teacher One",), room_count=1
        )
        with self.assertRaises(SeatingError):
            generate_seating_plans(schedule, enrollments, students, rooms)


class TestRollSlipAPI(unittest.TestCase):
    """Endpoint-level checks for the student directory and roll-number slip."""

    @classmethod
    def setUpClass(cls):
        import main as portal_main

        cls.portal = portal_main
        portal_main._load_data()
        portal_main._run_generation()

    def test_students_directory(self):
        payload = self.portal.api_students()
        students = payload["students"]

        self.assertEqual(len(students), 240)
        self.assertEqual(len({s["roll_no"] for s in students}), 240)
        for student in students:
            self.assertEqual(
                set(student), {"student_id", "roll_no", "name", "batch"}
            )
            self.assertTrue(student["roll_no"])
            self.assertTrue(student["name"])
            self.assertTrue(student["batch"])

    def _student_with_most_exams(self):
        counts = defaultdict(int)
        for plan in self.portal._DATA["seating_plans"]:
            for seat in plan["seats"]:
                counts[seat["student_id"]] += 1

        student_id = max(counts, key=counts.get)
        return next(
            s
            for s in self.portal._DATA["students"]
            if s["student_id"] == student_id
        )

    def test_roll_slip_multiple_exams(self):
        student = self._student_with_most_exams()
        slip = self.portal.api_roll_slip(student["roll_no"])

        self.assertEqual(slip["student"]["roll_no"], student["roll_no"])
        self.assertEqual(slip["student"]["name"], student["name"])
        self.assertIn(
            slip["student"]["program"],
            {"BS Computer Science", "BS Information Technology"},
        )
        self.assertGreaterEqual(len(slip["exams"]), 2)

        sort_keys = [(e["date"], e["slot_id"]) for e in slip["exams"]]
        self.assertEqual(sort_keys, sorted(sort_keys))

        for exam in slip["exams"]:
            self.assertTrue(exam["course_code"])
            self.assertTrue(exam["course_name"])
            self.assertTrue(exam["instructor"])
            self.assertTrue(exam["room_id"])
            self.assertTrue(1 <= exam["seat_row"] <= exam["room_rows"])
            self.assertTrue(1 <= exam["seat_col"] <= exam["room_cols"])
            self.assertEqual(
                exam["seat_no"],
                (exam["seat_row"] - 1) * exam["room_cols"] + exam["seat_col"],
            )
            self.assertTrue(
                exam["seat_label"].startswith(
                    f"Row {exam['seat_row']}, Col "
                )
            )

        # Every slip seat must exist in the generated seating plan.
        plan_seats = {}
        for plan in self.portal._DATA["seating_plans"]:
            for seat in plan["seats"]:
                if seat["student_id"] == student["student_id"]:
                    plan_seats[
                        (plan["room_id"], seat["course_id"], plan["slot_id"])
                    ] = seat

        for exam in slip["exams"]:
            key = (exam["room_id"], exam["course_id"], exam["slot_id"])
            self.assertIn(key, plan_seats)
            self.assertEqual(exam["seat_row"], plan_seats[key]["row"])
            self.assertEqual(exam["seat_col"], plan_seats[key]["col"])

        self.assertEqual(
            slip["summary"]["total_exams"], len(slip["exams"])
        )
        self.assertEqual(
            slip["summary"]["total_halls"],
            len({e["room_id"] for e in slip["exams"]}),
        )
        self.assertEqual(slip["summary"]["first_exam"], slip["exams"][0])
        self.assertEqual(slip["summary"]["last_exam"], slip["exams"][-1])

    def test_roll_slip_lookup_is_case_insensitive(self):
        student = self._student_with_most_exams()
        slip = self.portal.api_roll_slip(student["roll_no"].lower())
        self.assertEqual(
            slip["student"]["student_id"], student["student_id"]
        )

    def test_roll_slip_unknown_roll_returns_404(self):
        with self.assertRaises(self.portal.HTTPException) as ctx:
            self.portal.api_roll_slip("DOES-NOT-EXIST-999")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
