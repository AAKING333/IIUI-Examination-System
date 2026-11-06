"""
data_generator.py
-----------------
Generates dummy data for the Exam Management Portal.
Conforms strictly to the International Islamic University, Islamabad (IIUI)
Department of Computer Science & Information Technology (Male Campus) syllabus & timetable:
- Courses with real instructors and batches from the departmental datesheet.
- Full set of examination rooms / halls (R-101, R-102, R-103, R-201, R-202, R-203, Hall-A, Hall-B).
- 100% Male students in accordance with the Male Campus system.
- Schema aligns with PRD v1.1 Sections 3 & 8.2.
"""

import random
from datetime import date
from typing import List, Dict, Tuple

from instructor_utils import normalize_instructor

# ── Seed for deterministic repeatability ────────────────────────────────────
SEED = 42
random.seed(SEED)

# ── Room Specs (Standard 30 seats 5x6 grids, plus main exam halls) ──────────
ROOM_SPECS = [
    {"room_id": "R-101", "name": "Room 101", "rows": 5, "cols": 6, "capacity": 30},
    {"room_id": "R-102", "name": "Room 102", "rows": 5, "cols": 6, "capacity": 30},
    {"room_id": "R-103", "name": "Room 103", "rows": 5, "cols": 6, "capacity": 30},
    {"room_id": "R-201", "name": "Room 201", "rows": 5, "cols": 6, "capacity": 30},
    {"room_id": "R-202", "name": "Room 202", "rows": 5, "cols": 6, "capacity": 30},
    {"room_id": "R-203", "name": "Room 203", "rows": 5, "cols": 6, "capacity": 30},
    {"room_id": "Hall-A", "name": "Exam Hall A", "rows": 5, "cols": 6, "capacity": 30},
    {"room_id": "Hall-B", "name": "Exam Hall B", "rows": 5, "cols": 6, "capacity": 30},
]

# ── Academic Batches (Male Campus) ──────────────────────────────────────────
BATCH_NAMES = [
    "BSCS-F23", "BSCS-F24", "BSCS-F25", "BSCS-F26",
    "BSIT-F23", "BSIT-F24", "BSIT-F25", "BSIT-F26"
]

# ── Complete Departmental Courses from the Provided IIUI Datesheet ──────────
COURSE_CATALOG = [
    {
        "code": "GEC 102",
        "name": "Functional English",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Mr. Kausar Mehmood"},
            {"section_code": "Sec-B", "instructor": "Mr. Atif Ur Rehman"},
            {"section_code": "Sec-C", "instructor": "Mr. Muhammad Usman"},
        ],
        "target_batches": ["BSCS-F26", "BSIT-F26"],
    },
    {
        "code": "CS 344",
        "name": "Computer Architecture",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Mr. Sameer Akram"},
            {"section_code": "Sec-B", "instructor": "Dr. M. Adeel"},
        ],
        "target_batches": ["BSCS-F24"],
    },
    {
        "code": "CS 212",
        "name": "Object Oriented Programming",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Muhammad Nadeem"},
            {"section_code": "Sec-B", "instructor": "Dr. Syed Musharaf Ali"},
        ],
        "target_batches": ["BSCS-F25", "BSIT-F25"],
    },
    {
        "code": "CS 323",
        "name": "Theory of Automata",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Syed Muhammad Saqlain"},
        ],
        "target_batches": ["BSIT-F24"],
    },
    {
        "code": "CS 363",
        "name": "Parallel and Distributed Computing",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Tariq Sadad"},
        ],
        "target_batches": ["BSCS-F23"],
    },
    {
        "code": "GC 132",
        "name": "Introduction to Social Media Marketing",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Farrukh Nazir"},
        ],
        "target_batches": ["BSIT-F23"],
    },
    {
        "code": "GEC 114",
        "name": "Application of ICT",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Tariq Saddad"},
            {"section_code": "Sec-B", "instructor": "Mr. Sameer Akram"},
            {"section_code": "Sec-C", "instructor": "Mr. M. Kashif Shafique"},
        ],
        "target_batches": ["BSCS-F26", "BSIT-F26"],
    },
    {
        "code": "URC 302",
        "name": "Understanding Quran",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Muhammad Iqbal"},
            {"section_code": "Sec-B", "instructor": "Mr. Hafiz Muhammad Naeem"},
        ],
        "target_batches": ["BSCS-F25", "BSIT-F25"],
    },
    {
        "code": "IT 321",
        "name": "Web Technologies",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Mr. Majid Bashir"},
            {"section_code": "Sec-B", "instructor": "Dr. Tariq Sadad"},
            {"section_code": "Sec-C", "instructor": "Mr. Ahsan Tanvir"},
        ],
        "target_batches": ["BSIT-F24"],
    },
    {
        "code": "AI 211",
        "name": "Introduction to Machine Learning",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Muhammad Majid"},
            {"section_code": "Sec-B", "instructor": "Mr. Tahir Hussain"},
        ],
        "target_batches": ["BSCS-F24"],
    },
    {
        "code": "IT 332",
        "name": "Mobile Application Development",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Mr. Abid Jamil"},
            {"section_code": "Sec-B", "instructor": "Dr. Muhammad Adeel"},
        ],
        "target_batches": ["BSCS-F23", "BSIT-F23"],
    },
    {
        "code": "GEC 113",
        "name": "Discrete Structures",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Qamar Abbas"},
            {"section_code": "Sec-B", "instructor": "Mr. Ahsan Tanveer"},
        ],
        "target_batches": ["BSCS-F26", "BSIT-F26"],
    },
    {
        "code": "CS 342",
        "name": "Operating Systems",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Asim Munir"},
            {"section_code": "Sec-B", "instructor": "Dr. Jibran Mir"},
        ],
        "target_batches": ["BSCS-F24", "BSIT-F24"],
    },
    {
        "code": "MAT 221",
        "name": "Linear Algebra",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Muhammad Rehan"},
            {"section_code": "Sec-B", "instructor": "Mr. Muhammad Musharaf"},
            {"section_code": "Sec-C", "instructor": "Dr. Nasir Shehzad"},
        ],
        "target_batches": ["BSCS-F25", "BSIT-F25"],
    },
    {
        "code": "CS 322",
        "name": "Analysis of Algorithms",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Qamar Abbas"},
            {"section_code": "Sec-B", "instructor": "Dr. Syed Muhammad Saqlain"},
            {"section_code": "Sec-C", "instructor": "Dr. Muhammad Nazir"},
        ],
        "target_batches": ["BSCS-F24", "BSIT-F24"],
    },
    {
        "code": "CS 111",
        "name": "Programming Fundamentals",
        "sections": [
            {"section_code": "Sec-A", "instructor": "Dr. Sajid Ali Khan"},
            {"section_code": "Sec-B", "instructor": "Mr. Awais Sarwar"},
        ],
        "target_batches": ["BSCS-F26"],
    },
]

# Normalise the handful of known spelling variants once, so the rest of the
# pipeline (scheduler, seating engine, exports) sees one identity per teacher.
for _course in COURSE_CATALOG:
    for _section in _course["sections"]:
        _section["instructor"] = normalize_instructor(_section["instructor"])

# ── 100% Male Names for IIUI Male Campus ────────────────────────────────────
MALE_FIRST_NAMES = [
    "Muhammad", "Ahmed", "Ali", "Usman", "Hamza", "Bilal", "Hassan", "Hussein",
    "Omar", "Abu Bakr", "Zubair", "Talha", "Saad", "Abdullah", "Abdul Rehman",
    "Tariq", "Kamran", "Mohsin", "Nasir", "Qasim", "Waqar", "Yasir", "Zain",
    "Mustafa", "Ibrahim", "Ismail", "Yahya", "Haris", "Danish", "Shahzaib",
    "Umair", "Fahad", "Farhan", "Noman", "Kashif", "Sohail", "Rizwan", "Imran",
    "Zeeshan", "Shoaib", "Arsalan", "Junaid", "Adnan", "Sarmad", "Asad"
]

MALE_LAST_NAMES = [
    "Khan", "Ahmed", "Ali", "Hassan", "Malik", "Raza", "Shah",
    "Siddiqui", "Qureshi", "Baig", "Chaudhry", "Mirza", "Sheikh",
    "Butt", "Nawaz", "Javed", "Iqbal", "Abbasi", "Ansari", "Bhatti",
    "Awan", "Mahmood", "Tahir", "Saleem", "Farooq", "Akram", "Tareen"
]

EXAM_DAYS = [
    date(2026, 10, 26),  # Monday
    date(2026, 10, 27),  # Tuesday
    date(2026, 10, 28),  # Wednesday
    date(2026, 10, 29),  # Thursday
    date(2026, 10, 30),  # Friday
]

SLOT_TIMINGS = [
    {"slot_name": "Session 1", "time": "08:45 AM - 10:15 AM"},
    {"slot_name": "Session 2", "time": "10:30 AM - 12:00 PM"},
    {"slot_name": "Session 3", "time": "02:30 PM - 04:00 PM"},
    {"slot_name": "Session 4", "time": "04:00 PM - 05:30 PM"},
]


def generate_rooms() -> List[Dict]:
    """Returns the university's examination rooms."""
    return [dict(r) for r in ROOM_SPECS]


def generate_students(count: int = 240) -> List[Dict]:
    """Generates male students strictly for IIUI Male Campus across all batches."""
    students = []
    used_rolls = set()

    for idx in range(1, count + 1):
        batch = BATCH_NAMES[(idx - 1) % len(BATCH_NAMES)]
        clean_batch = batch.replace("-", "")
        roll_no = f"{clean_batch}-{idx:03d}"
        while roll_no in used_rolls:
            idx += 1
            roll_no = f"{clean_batch}-{idx:03d}"
        used_rolls.add(roll_no)

        first = random.choice(MALE_FIRST_NAMES)
        last = random.choice(MALE_LAST_NAMES)
        full_name = f"{first} {last}"

        students.append({
            "student_id": idx,
            "roll_no": roll_no,
            "name": full_name,
            "gender": "Male",
            "batch": batch,
            "campus": "Male Campus, IIUI",
        })
    return students


def generate_courses_and_enrollments(
    students: List[Dict],
) -> Tuple[List[Dict], List[Dict]]:
    """
    Creates courses with teacher sections and assigns enrollments based on cohort batches.
    """
    courses = []
    enrollments = []
    enroll_id = 1

    batch_students: Dict[str, List[int]] = {}
    for s in students:
        batch_students.setdefault(s["batch"], []).append(s["student_id"])

    for i, c_data in enumerate(COURSE_CATALOG, start=1):
        course_obj = {
            "course_id": i,
            "code": c_data["code"],
            "name": c_data["name"],
            "sections": c_data["sections"],
            "instructors": [sec["instructor"] for sec in c_data["sections"]],
            "target_batches": c_data.get("target_batches", []),
        }
        courses.append(course_obj)

        target_batches = c_data.get("target_batches", [])
        if not target_batches:
            target_batches = random.sample(list(batch_students.keys()), k=2)

        sections = c_data["sections"]

        for b in target_batches:
            pool = batch_students.get(b, [])
            if not pool:
                continue
            num_to_enroll = max(15, int(len(pool) * random.uniform(0.75, 0.95)))
            enrolled_ids = random.sample(pool, min(num_to_enroll, len(pool)))

            for s_idx, sid in enumerate(enrolled_ids):
                assigned_sec = sections[s_idx % len(sections)]
                enrollments.append({
                    "enroll_id": enroll_id,
                    "student_id": sid,
                    "course_id": i,
                    "course_code": c_data["code"],
                    "course_name": c_data["name"],
                    "section_code": assigned_sec["section_code"],
                    "instructor": assigned_sec["instructor"],
                })
                enroll_id += 1

    seen = set()
    deduped = []
    for e in enrollments:
        key = (e["student_id"], e["course_id"])
        if key not in seen:
            seen.add(key)
            deduped.append(e)

    return courses, deduped


def generate_time_slots() -> List[Dict]:
    """Generates structured time slots across exam days matching IIUI timetable."""
    slots = []
    slot_id = 1
    for day in EXAM_DAYS:
        for timing in SLOT_TIMINGS:
            slots.append({
                "slot_id": slot_id,
                "date": day.isoformat(),
                "day_label": day.strftime("%A, %d %b %Y"),
                "slot_name": timing["slot_name"],
                "time": timing["time"],
            })
            slot_id += 1
    return slots
