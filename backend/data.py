"""Data store and seed data for the Exam Management Portal.

Provides in-memory CRUD operations for:
- Rooms & capacities
- Courses & credit hours
- Instructor assignments (Program, Batch, Section, Course, Instructor)
- Students & course enrolments (Regular / Back-paper) with Program, Batch, Section
- Time slots
"""
import copy
import datetime
from typing import List, Dict, Any, Optional
from database import database

FIRST_NAMES = [
    "Ahmed", "Ayesha", "Bilal", "Fatima", "Hassan", "Hina", "Usman", "Zainab",
    "Ali", "Maryam", "Omar", "Sana", "Danish", "Iqra", "Hamza", "Noor",
    "Faisal", "Amina", "Saad", "Laiba", "Arslan", "Mahnoor", "Taha", "Sara",
]
LAST_NAMES = [
    "Khan", "Ahmed", "Ali", "Malik", "Hussain", "Raza", "Shah", "Qureshi",
    "Butt", "Chaudhry", "Iqbal", "Rana", "Sheikh", "Mirza", "Siddiqui", "Akhtar",
]
FATHER_NAMES = [
    "Farooq Ali", "Muhammad Aslam", "Abdul Rehman", "Ghulam Hussain",
    "Muhammad Akram", "Shahid Mehmood", "Naseer Ahmed", "Tariq Aziz",
    "Muhammad Yousaf", "Imran Haider", "Zafar Iqbal", "Rashid Mehmood",
]

_DEFAULT_ROOMS = [
    {"id": "R1", "name": "Room A", "rows": 6, "columns": 10, "capacity": 60},
    {"id": "R2", "name": "Room B", "rows": 5, "columns": 8, "capacity": 40},
    {"id": "R3", "name": "Room C", "rows": 5, "columns": 6, "capacity": 30},
    {"id": "R4", "name": "Room D", "rows": 5, "columns": 10, "capacity": 50},
]

# Courses catalog contains strictly: code, title, credit_hours
_DEFAULT_COURSES = [
    {"code": "CS101", "title": "Introduction to Programming", "credit_hours": 4},
    {"code": "CS102", "title": "Data Structures & Algorithms", "credit_hours": 4},
    {"code": "MA101", "title": "Calculus & Analytical Geometry", "credit_hours": 3},
    {"code": "PH101", "title": "Applied Physics", "credit_hours": 3},
    {"code": "EN101", "title": "English Composition & Comprehension", "credit_hours": 3},
    {"code": "HU101", "title": "Pakistan Studies & History", "credit_hours": 2},
    {"code": "CS201", "title": "Object Oriented Programming", "credit_hours": 4},
    {"code": "CS202", "title": "Database Systems", "credit_hours": 4},
    {"code": "CS203", "title": "Computer Organization & Assembly Language", "credit_hours": 4},
    {"code": "CS301", "title": "Operating Systems", "credit_hours": 4},
    {"code": "CS302", "title": "Software Engineering Concepts", "credit_hours": 3},
    {"code": "CS303", "title": "Design & Analysis of Algorithms", "credit_hours": 3},
    {"code": "CS304", "title": "Computer Networks & Data Comms", "credit_hours": 4},
    {"code": "CS305", "title": "Theory of Automata & Computation", "credit_hours": 3},
    {"code": "CS401", "title": "Artificial Intelligence", "credit_hours": 4},
    {"code": "CS402", "title": "Compiler Construction", "credit_hours": 3},
    {"code": "CS403", "title": "Information & Network Security", "credit_hours": 3},
    {"code": "CS404", "title": "Mobile Application Development", "credit_hours": 3},
    {"code": "SE201", "title": "Software Requirement Engineering", "credit_hours": 3},
    {"code": "SE301", "title": "Software Architecture & Design", "credit_hours": 3},
    {"code": "IT201", "title": "Human Computer Interaction", "credit_hours": 3},
    {"code": "IT301", "title": "Cloud Infrastructure & Services", "credit_hours": 3},
    {"code": "MA201", "title": "Linear Algebra & Differential Equations", "credit_hours": 3},
    {"code": "MA301", "title": "Probability & Statistics for Computing", "credit_hours": 3},
    {"code": "IS101", "title": "Islamic Studies & Ethics", "credit_hours": 2},
    {"code": "HU201", "title": "Professional Ethics & Legal Issues", "credit_hours": 2},
]

# Dedicated Instructor Assignments: maps program, batch, section, course, instructor
_DEFAULT_INSTRUCTOR_ASSIGNMENTS = [
    # CS101
    {"id": "IA1", "program": "BSCS", "batch": "F24", "section": "A", "course_code": "CS101", "instructor": "Dr. Sajid Ali Khan"},
    {"id": "IA2", "program": "BSCS", "batch": "F24", "section": "B", "course_code": "CS101", "instructor": "Dr. Sajid Ali Khan"},
    {"id": "IA3", "program": "BSIT", "batch": "F24", "section": "A", "course_code": "CS101", "instructor": "Engr. Tariq Saleem"},
    {"id": "IA4", "program": "BSIT", "batch": "F24", "section": "B", "course_code": "CS101", "instructor": "Engr. Tariq Saleem"},
    # CS102
    {"id": "IA5", "program": "BSCS", "batch": "F23", "section": "A", "course_code": "CS102", "instructor": "Dr. Syed Muhammad Saqlain"},
    {"id": "IA6", "program": "BSCS", "batch": "F23", "section": "B", "course_code": "CS102", "instructor": "Dr. Syed Muhammad Saqlain"},
    # MA101
    {"id": "IA7", "program": "BSCS", "batch": "F24", "section": "A", "course_code": "MA101", "instructor": "Dr. Qamar Abbas"},
    {"id": "IA8", "program": "BSCS", "batch": "F24", "section": "B", "course_code": "MA101", "instructor": "Dr. Qamar Abbas"},
    {"id": "IA9", "program": "BSIT", "batch": "F24", "section": "A", "course_code": "MA101", "instructor": "Dr. Muhammad Tariq"},
    # PH101
    {"id": "IA10", "program": "BSIT", "batch": "F24", "section": "A", "course_code": "PH101", "instructor": "Engr. Tariq Saleem"},
    {"id": "IA11", "program": "BSIT", "batch": "F24", "section": "B", "course_code": "PH101", "instructor": "Engr. Tariq Saleem"},
    # EN101
    {"id": "IA12", "program": "BSCS", "batch": "F24", "section": "A", "course_code": "EN101", "instructor": "Mr. Kausar Mehmood"},
    {"id": "IA13", "program": "BSCS", "batch": "F24", "section": "B", "course_code": "EN101", "instructor": "Mr. Kausar Mehmood"},
    # HU101
    {"id": "IA14", "program": "BSCS", "batch": "F23", "section": "A", "course_code": "HU101", "instructor": "Dr. Farrukh Nazir"},
    {"id": "IA15", "program": "BSCS", "batch": "F23", "section": "B", "course_code": "HU101", "instructor": "Dr. Farrukh Nazir"},
    # CS201
    {"id": "IA16", "program": "BSCS", "batch": "F23", "section": "A", "course_code": "CS201", "instructor": "Dr. Muhammad Imran"},
    {"id": "IA17", "program": "BSCS", "batch": "F23", "section": "B", "course_code": "CS201", "instructor": "Dr. Muhammad Imran"},
    {"id": "IA18", "program": "BSIT", "batch": "F23", "section": "A", "course_code": "CS201", "instructor": "Dr. Adeel"},
    # CS202
    {"id": "IA19", "program": "BSCS", "batch": "F23", "section": "A", "course_code": "CS202", "instructor": "Dr. Asim Munir"},
    {"id": "IA20", "program": "BSCS", "batch": "F23", "section": "B", "course_code": "CS202", "instructor": "Dr. Asim Munir"},
    # CS203
    {"id": "IA21", "program": "BSCS", "batch": "F23", "section": "A", "course_code": "CS203", "instructor": "Dr. Naveed Riaz"},
    {"id": "IA22", "program": "BSCS", "batch": "F23", "section": "B", "course_code": "CS203", "instructor": "Dr. Naveed Riaz"},
    # CS301 (Same teacher across BSCS & BSIT sections)
    {"id": "IA23", "program": "BSCS", "batch": "F23", "section": "A", "course_code": "CS301", "instructor": "Dr. Adeel"},
    {"id": "IA24", "program": "BSCS", "batch": "F23", "section": "B", "course_code": "CS301", "instructor": "Dr. Adeel"},
    {"id": "IA25", "program": "BSIT", "batch": "F23", "section": "A", "course_code": "CS301", "instructor": "Dr. Adeel"},
    {"id": "IA26", "program": "BSIT", "batch": "F23", "section": "B", "course_code": "CS301", "instructor": "Dr. Adeel"},
    # CS302
    {"id": "IA27", "program": "BSSE", "batch": "F22", "section": "A", "course_code": "CS302", "instructor": "Dr. Nadeem Javaid"},
    {"id": "IA28", "program": "BSSE", "batch": "F22", "section": "B", "course_code": "CS302", "instructor": "Dr. Nadeem Javaid"},
    # CS303
    {"id": "IA29", "program": "BSCS", "batch": "F22", "section": "A", "course_code": "CS303", "instructor": "Dr. Abdul Rauf"},
    {"id": "IA30", "program": "BSCS", "batch": "F22", "section": "B", "course_code": "CS303", "instructor": "Dr. Abdul Rauf"},
    # CS304
    {"id": "IA31", "program": "BSCS", "batch": "F22", "section": "A", "course_code": "CS304", "instructor": "Dr. Kashif Munir"},
    {"id": "IA32", "program": "BSCS", "batch": "F22", "section": "B", "course_code": "CS304", "instructor": "Dr. Kashif Munir"},
    # CS305
    {"id": "IA33", "program": "BSCS", "batch": "F22", "section": "A", "course_code": "CS305", "instructor": "Dr. Mumtaz Ahmed"},
    {"id": "IA34", "program": "BSCS", "batch": "F22", "section": "B", "course_code": "CS305", "instructor": "Dr. Mumtaz Ahmed"},
    # CS401
    {"id": "IA35", "program": "BSCS", "batch": "F21", "section": "A", "course_code": "CS401", "instructor": "Dr. Khalid Saleem"},
    {"id": "IA36", "program": "BSCS", "batch": "F21", "section": "B", "course_code": "CS401", "instructor": "Dr. Khalid Saleem"},
    # CS402
    {"id": "IA37", "program": "BSCS", "batch": "F21", "section": "A", "course_code": "CS402", "instructor": "Dr. Shariq Bashir"},
    {"id": "IA38", "program": "BSCS", "batch": "F21", "section": "B", "course_code": "CS402", "instructor": "Dr. Shariq Bashir"},
    # CS403
    {"id": "IA39", "program": "BSCS", "batch": "F21", "section": "A", "course_code": "CS403", "instructor": "Dr. Tanveer Ahmed"},
    {"id": "IA40", "program": "BSCS", "batch": "F21", "section": "B", "course_code": "CS403", "instructor": "Dr. Tanveer Ahmed"},
    # CS404 (Different teachers per section/batch)
    {"id": "IA41", "program": "BSCS", "batch": "F21", "section": "A", "course_code": "CS404", "instructor": "Mr. Umar Aftab"},
    {"id": "IA42", "program": "BSCS", "batch": "F21", "section": "B", "course_code": "CS404", "instructor": "Dr. Abid Jameel"},
    {"id": "IA43", "program": "BSIT", "batch": "F23", "section": "A", "course_code": "CS404", "instructor": "Dr. Farrukh Nazir"},
    # SE201
    {"id": "IA44", "program": "BSSE", "batch": "F24", "section": "A", "course_code": "SE201", "instructor": "Dr. Bushra Hamid"},
    {"id": "IA45", "program": "BSSE", "batch": "F24", "section": "B", "course_code": "SE201", "instructor": "Dr. Bushra Hamid"},
    # SE301
    {"id": "IA46", "program": "BSSE", "batch": "F22", "section": "A", "course_code": "SE301", "instructor": "Dr. Zeeshan Ali"},
    {"id": "IA47", "program": "BSSE", "batch": "F22", "section": "B", "course_code": "SE301", "instructor": "Dr. Zeeshan Ali"},
    # IT201
    {"id": "IA48", "program": "BSIT", "batch": "F23", "section": "A", "course_code": "IT201", "instructor": "Ms. Sana Fatima"},
    {"id": "IA49", "program": "BSIT", "batch": "F23", "section": "B", "course_code": "IT201", "instructor": "Ms. Sana Fatima"},
    # IT301
    {"id": "IA50", "program": "BSIT", "batch": "F21", "section": "A", "course_code": "IT301", "instructor": "Dr. Waqas Jadoon"},
    {"id": "IA51", "program": "BSIT", "batch": "F21", "section": "B", "course_code": "IT301", "instructor": "Dr. Waqas Jadoon"},
    # MA201
    {"id": "IA52", "program": "BSCS", "batch": "F23", "section": "A", "course_code": "MA201", "instructor": "Dr. Muhammad Tariq"},
    {"id": "IA53", "program": "BSCS", "batch": "F23", "section": "B", "course_code": "MA201", "instructor": "Dr. Muhammad Tariq"},
    # MA301
    {"id": "IA54", "program": "BSCS", "batch": "F22", "section": "A", "course_code": "MA301", "instructor": "Dr. Nasir Mehmood"},
    {"id": "IA55", "program": "BSCS", "batch": "F22", "section": "B", "course_code": "MA301", "instructor": "Dr. Nasir Mehmood"},
    # IS101
    {"id": "IA56", "program": "BSCS", "batch": "F24", "section": "A", "course_code": "IS101", "instructor": "Dr. Hafiz Abdul Quddus"},
    {"id": "IA57", "program": "BSCS", "batch": "F24", "section": "B", "course_code": "IS101", "instructor": "Dr. Hafiz Abdul Quddus"},
    # HU201
    {"id": "IA58", "program": "BSCS", "batch": "F21", "section": "A", "course_code": "HU201", "instructor": "Dr. Sadia Munir"},
    {"id": "IA59", "program": "BSCS", "batch": "F21", "section": "B", "course_code": "HU201", "instructor": "Dr. Sadia Munir"},
]

def _student_info(n: int) -> Dict[str, str]:
    """Returns (roll_no, program, batch, section) for student 1..200 matching batch year."""
    if n <= 50:
        # Cohort 1: F24 (Joined Fall 2024 -> Year 2024)
        if n <= 35:
            prog = "BSCS"
            sec = "A" if n <= 18 else "B"
            roll = f"2024-CS-{n:03d}"
        else:
            prog = "BSIT"
            sec = "A" if n <= 43 else "B"
            roll = f"2024-IT-{n:03d}"
        batch = "F24"
    elif n <= 100:
        # Cohort 2: F23 (Joined Fall 2023 -> Year 2023)
        if n <= 85:
            prog = "BSCS"
            sec = "A" if n <= 68 else "B"
            roll = f"2023-CS-{n:03d}"
        else:
            prog = "BSIT"
            sec = "A" if n <= 93 else "B"
            roll = f"2023-IT-{n:03d}"
        batch = "F23"
    elif n <= 150:
        # Cohort 3: F22 (Joined Fall 2022 -> Year 2022)
        if n <= 135:
            prog = "BSCS"
            sec = "A" if n <= 118 else "B"
            roll = f"2022-CS-{n:03d}"
        else:
            prog = "BSSE"
            sec = "A" if n <= 143 else "B"
            roll = f"2022-SE-{n:03d}"
        batch = "F22"
    else:
        # Cohort 4: F21 (Joined Fall 2021 -> Year 2021)
        if n <= 185:
            prog = "BSCS"
            sec = "A" if n <= 168 else "B"
            roll = f"2021-CS-{n:03d}"
        else:
            prog = "BSIT"
            sec = "A" if n <= 193 else "B"
            roll = f"2021-IT-{n:03d}"
        batch = "F21"
    return {"roll_no": roll, "program": prog, "batch": batch, "section": sec}


def _build_seed_enrolments() -> Dict[str, List[Dict[str, str]]]:
    """Builds seed enrolments guaranteeing EVERY student (1 to 200) has EXACTLY 5 courses."""
    enrolments = {}
    for n in range(1, 201):
        info = _student_info(n)
        roll = info["roll_no"]
        prog = info["program"]

        if n <= 50:
            # Cohort 1: F24 (Semester 1)
            # Courses: CS101, MA101, PH101, EN101, IS101
            enrolments[roll] = [
                {"course": "CS101", "type": "regular"},
                {"course": "MA101", "type": "regular"},
                {"course": "PH101", "type": "regular"},
                {"course": "EN101", "type": "regular"},
                {"course": "IS101", "type": "regular"},
            ]

        elif n <= 100:
            # Cohort 2: F23 (Semester 3)
            # BSCS F23 courses: CS102 (35 regular), CS201, CS202, CS301, MA201, CS203
            # BSIT F23 courses: CS201, CS202, IT201, CS301, MA201
            if n <= 80:
                # BSCS F23 (regular)
                enrolments[roll] = [
                    {"course": "CS102", "type": "regular"},
                    {"course": "CS201", "type": "regular"},
                    {"course": "CS202", "type": "regular"},
                    {"course": "CS301", "type": "regular"},
                    {"course": "MA201", "type": "regular"},
                ]
            elif n <= 85:
                # BSCS F23 with CS203 instead
                enrolments[roll] = [
                    {"course": "CS102", "type": "regular"},
                    {"course": "CS201", "type": "regular"},
                    {"course": "CS203", "type": "regular"},
                    {"course": "CS301", "type": "regular"},
                    {"course": "MA201", "type": "regular"},
                ]
            elif n <= 95:
                # BSIT F23 (regular)
                enrolments[roll] = [
                    {"course": "CS201", "type": "regular"},
                    {"course": "CS202", "type": "regular"},
                    {"course": "IT201", "type": "regular"},
                    {"course": "CS301", "type": "regular"},
                    {"course": "MA201", "type": "regular"},
                ]
            else:
                # n=96..100: BSIT F23 with 1 back paper in CS101 (5 students)
                enrolments[roll] = [
                    {"course": "CS201", "type": "regular"},
                    {"course": "CS202", "type": "regular"},
                    {"course": "IT201", "type": "regular"},
                    {"course": "CS301", "type": "regular"},
                    {"course": "CS101", "type": "back"},
                ]

        elif n <= 150:
            # Cohort 3: F22 (Semester 5)
            # BSCS F22 courses: CS303, CS304, CS305, MA301, HU101
            # BSSE F22 courses: CS302, SE301, CS304, MA301, HU101
            if n <= 130:
                enrolments[roll] = [
                    {"course": "CS303", "type": "regular"},
                    {"course": "CS304", "type": "regular"},
                    {"course": "CS305", "type": "regular"},
                    {"course": "MA301", "type": "regular"},
                    {"course": "HU101", "type": "regular"},
                ]
            elif n <= 135:
                # BSCS F22 with back paper in CS102 (5 students)
                enrolments[roll] = [
                    {"course": "CS303", "type": "regular"},
                    {"course": "CS304", "type": "regular"},
                    {"course": "CS305", "type": "regular"},
                    {"course": "MA301", "type": "regular"},
                    {"course": "CS102", "type": "back"},
                ]
            elif n <= 145:
                # BSSE F22
                enrolments[roll] = [
                    {"course": "CS302", "type": "regular"},
                    {"course": "SE301", "type": "regular"},
                    {"course": "CS304", "type": "regular"},
                    {"course": "MA301", "type": "regular"},
                    {"course": "HU101", "type": "regular"},
                ]
            else:
                # n=146..150: BSSE F22 with back paper in CS201 (5 students)
                enrolments[roll] = [
                    {"course": "CS302", "type": "regular"},
                    {"course": "SE301", "type": "regular"},
                    {"course": "CS304", "type": "regular"},
                    {"course": "MA301", "type": "regular"},
                    {"course": "CS201", "type": "back"},
                ]

        else:
            # Cohort 4: F21 (Semester 7)
            # BSCS F21 courses: CS401, CS402, CS403, CS404, HU201
            # BSIT F21 courses: CS401, IT301, CS403, CS404, HU201
            if n <= 180:
                enrolments[roll] = [
                    {"course": "CS401", "type": "regular"},
                    {"course": "CS402", "type": "regular"},
                    {"course": "CS403", "type": "regular"},
                    {"course": "CS404", "type": "regular"},
                    {"course": "HU201", "type": "regular"},
                ]
            elif n <= 194:
                enrolments[roll] = [
                    {"course": "CS401", "type": "regular"},
                    {"course": "IT301", "type": "regular"},
                    {"course": "CS403", "type": "regular"},
                    {"course": "CS404", "type": "regular"},
                    {"course": "HU201", "type": "regular"},
                ]
            else:
                # n=195..200: BSIT F21 with back paper in CS301 (6 students)
                enrolments[roll] = [
                    {"course": "CS401", "type": "regular"},
                    {"course": "IT301", "type": "regular"},
                    {"course": "CS403", "type": "regular"},
                    {"course": "HU201", "type": "regular"},
                    {"course": "CS301", "type": "back"},
                ]

    return enrolments

_SLOT_TIMES = [
    ("08:45", "10:15", "Morning 1"),
    ("10:30", "12:00", "Morning 2"),
    ("14:30", "16:00", "Afternoon 1"),
    ("16:00", "17:30", "Afternoon 2"),
]


_REFERENCE_COURSES = [
    ("GEC102", "Functional English", [("BSCS", "F26"), ("BSIT", "F26")], ["Mr. Kausar Mehmood", "Mr. Atif Ur Rehman", "Mr. Muhammad Usman"], False),
    ("CS344L", "Computer Architecture Lab", [("BSCS", "F24")], ["Mr. Sameer Akram"], True),
    ("CS212", "Object Oriented Programming", [("BSCS", "F25"), ("BSIT", "F25")], ["Dr. Muhammad Nadeem", "Dr. Syed Musharaf Ali"], False),
    ("CS344", "Computer Architecture", [("BSCS", "F24")], ["Mr. Sameer Akram"], False),
    ("CS212L", "Object Oriented Programming Lab", [("BSCS", "F25"), ("BSIT", "F25")], ["Dr. Muhammad Nadeem", "Dr. Syed Musharaf Ali"], True),
    ("CS323", "Theory of Automata", [("BSIT", "F24")], ["Dr. Syed Muhammad Saqlain"], False),
    ("CS363", "Parallel and Distributed Computing", [("BSCS", "F23")], ["Dr. Tariq Sadad"], False),
    ("GC132", "Introduction to Social Media Marketing", [("BSIT", "F23")], ["Dr. Farrukh Nazir"], False),
    ("GEC114", "Application of Information and Communication Technologies", [("BSCS", "F26"), ("BSIT", "F26")], ["Dr. Tariq Saddad", "Mr. Sameer Akram", "Mr. M. Kashif Shafique"], False),
    ("URC302", "Understanding Quran", [("BSCS", "F25"), ("BSIT", "F25")], ["Dr. Muhammad Iqbal", "Mr. Hafiz Muhammad Naeem"], False),
    ("AI211L", "Introduction to Machine Learning Lab", [("BSCS", "F24")], ["Dr. Muhammad Majid", "Mr. Tahir Hussain"], True),
    ("GEC114L", "Application of Information and Communication Technologies Lab", [("BSCS", "F26"), ("BSIT", "F26")], ["Mr. Iftikhar Ali Khan", "Mr. M. Kashif Shafique"], True),
    ("IT321", "Web Technologies", [("BSIT", "F24")], ["Mr. Majid Bashir"], False),
    ("AI211", "Introduction to Machine Learning", [("BSCS", "F24")], ["Dr. Muhammad Majid"], False),
    ("IT332", "Mobile Application Development", [("BSCS", "F23"), ("BSIT", "F23")], ["Mr. Abid Jamil", "Dr. Muhammad Adeel"], False),
    ("IT321L", "Web Technologies Lab", [("BSIT", "F24")], ["Mr. Majid Bashir"], True),
    ("GEC113", "Discrete Structure", [("BSCS", "F26"), ("BSIT", "F26")], ["Dr. Qamar Abbas", "Mr. Ahsan Tanveer"], False),
    ("CS342L", "Operating System Lab", [("BSCS", "F24"), ("BSIT", "F24")], ["Dr. Asim Munir", "Dr. Jibran Mir"], True),
    ("MAT221", "Linear Algebra", [("BSCS", "F25"), ("BSIT", "F25")], ["Dr. Muhammad Rehan", "Mr. Muhammad Musharaf", "Dr. Nasir Shehzad"], False),
    ("CS342", "Operating System", [("BSCS", "F24"), ("BSIT", "F24")], ["Dr. Asim Munir", "Dr. Jibran Mir"], False),
    ("ISLAMIC1", "Islamic Studies / Ethics for Non-Muslims", [("BSCS", "F26")], ["Mr. Aftab Ahmad"], False),
    ("CS411L", "Compiler Construction Lab", [("BSCS", "F23")], ["Dr. Zafar Mehmood", "Mr. Umer Aftab"], True),
    ("IT376", "Cyber Security", [("BSIT", "F23")], ["Dr. Sayed Qaiser Ali Shah", "Mr. Ahsan Tanveer"], False),
    ("M101", "Mathematics-I (Premedical)", [("BSCS", "F26"), ("BSIT", "F26")], ["Dr. Qamar Abbas"], False),
    ("SE311", "Software Engineering", [("BSCS", "F25"), ("BSIT", "F25")], ["Mr. Muhammad Imran Saeed"], False),
    ("CS322", "Analysis of Algorithms", [("BSCS", "F24"), ("BSIT", "F24")], ["Dr. Qamar Abbas", "Dr. Syed Muhammad Saqlain", "Dr. Muhammad Nazir"], False),
    ("SE345", "Enterprise Systems", [("BSIT", "F23")], ["Mr. Tahir Hussain"], False),
    ("SE346", "E-Commerce", [("BSCS", "F23"), ("BSCS", "F24"), ("BSIT", "F23"), ("BSIT", "F24")], ["Mr. Abid Jamil"], False),
    ("GC152", "Introduction to Management", [("BSCS", "F23")], ["Mr. Ayaz Ali", "Mr. Adnan Khan", "Mr. Naveed Ahmad"], False),
    ("CS324", "Computer Organization and Assembly Language", [("BSCS", "F23")], ["Dr. Asim Munir"], False),
    ("CS352", "Information Security", [("BSCS", "F24"), ("BSIT", "F24")], ["Dr. Jibran Mir", "Mr. Tahir Hussain", "Mr. Ahsan Tanveer"], False),
    ("CS352L", "Information Security Lab", [("BSCS", "F24"), ("BSIT", "F24")], ["Dr. Jibran Mir", "Mr. Tahir Hussain", "Mr. Ahsan Tanveer"], True),
    ("GEC215", "Calculus and Analytical Geometry", [("BSCS", "F26"), ("BSIT", "F26")], ["Mr. Awais Sarwar", "Mr. Zamran Ali"], False),
    ("IT342", "Information Technology Infrastructure", [("BSIT", "F25")], ["Mr. Majid Bashir", "Dr. Tariq Sadad"], False),
    ("IT342L", "Information Technology Infrastructure Lab", [("BSIT", "F25")], ["Dr. Tariq Sadad", "Mr. Umer Aftab"], True),
    ("IT341", "Database Administration and Management", [("BSIT", "F24")], ["Mr. Iftikhar Ali Khan"], False),
    ("CS332", "Advanced Database Management Systems", [("BSCS", "F24")], ["Dr. Zafar Mehmood"], False),
    ("GC120", "Technical and Business Writing", [("BSCS", "F23")], ["Dr. Shahbaz Malik", "Mr. Muhammad Taufail"], False),
    ("IT341L", "Database Administration and Management Lab", [("BSIT", "F24")], ["Mr. Iftikhar Ali Khan"], True),
    ("CS332L", "Advanced Database Management Systems Lab", [("BSCS", "F24")], ["Dr. Zafar Mehmood"], True),
    ("IT379", "Virtual Systems and Services", [("BSIT", "F23")], ["Dr. Sayed Qaiser Ali Shah"], False),
    ("CS111", "Programming Fundamentals", [("BSCS", "F26")], ["Dr. Sajid Ali Khan"], False),
    ("PHY251", "Applied Physics (Basic Electronics)", [("BSIT", "F26")], ["Engr. Tariq Saleem"], False),
    ("GEC112", "Introduction to Social Sciences", [("BSCS", "F25"), ("BSIT", "F25")], ["Dr. Arif Saleem Cheema", "Mr. Sohaib Qureshi"], False),
    ("PHY251L", "Applied Physics (Basic Electronics) Lab", [("BSIT", "F26")], ["Engr. Tariq Saleem"], True),
    ("CS111L", "Programming Fundamentals Lab", [("BSCS", "F26")], ["Dr. Sajid Ali Khan"], True),
]

_COHORTS = [
    ("BSCS", "F23", 100, "CS", ["A", "B", "C"]),
    ("BSCS", "F24", 65, "CS", ["A", "B"]),
    ("BSCS", "F25", 90, "CS", ["A", "B"]),
    ("BSCS", "F26", 106, "CS", ["A", "B"]),
    ("BSIT", "F23", 80, "IT", ["A", "B"]),
    ("BSIT", "F24", 77, "IT", ["A", "B"]),
    ("BSIT", "F25", 86, "IT", ["A", "B"]),
    ("BSIT", "F26", 71, "IT", ["A", "B"]),
]

_TIMETABLE_ENROLMENTS = {
    # BSCS F26
    ("BSCS", "F26", "A"): [
        ("GEC215", "Mr. Awais Sarwar"),
        ("GEC113", "Dr. Qamar Abbas"),
        ("GEC114", "Dr. Tariq Saddad"),
        ("GEC114L", "Mr. Iftikhar Ali Khan"),
        ("CS111", "Dr. Sajid Ali Khan"),
        ("CS111L", "Dr. Sajid Ali Khan"),
        ("GEC102", "Mr. Kausar Mehmood"),
        ("ISLAMIC1", "Mr. Aftab Ahmad"),
    ],
    ("BSCS", "F26", "B"): [
        ("GEC215", "Mr. Awais Sarwar"),
        ("GEC113", "Dr. Qamar Abbas"),
        ("GEC114", "Mr. Sameer Akram"),
        ("GEC114L", "Mr. M. Kashif Shafique"),
        ("CS111", "Dr. Sajid Ali Khan"),
        ("CS111L", "Dr. Sajid Ali Khan"),
        ("GEC102", "Mr. Atif Ur Rehman"),
        ("ISLAMIC1", "Mr. Aftab Ahmad"),
    ],
    # BSIT F26
    ("BSIT", "F26", "A"): [
        ("GEC215", "Mr. Zamran Ali"),
        ("GEC113", "Mr. Ahsan Tanveer"),
        ("GEC114", "Mr. M. Kashif Shafique"),
        ("GEC114L", "Mr. M. Kashif Shafique"),
        ("PHY251", "Engr. Tariq Saleem"),
        ("PHY251L", "Engr. Tariq Saleem"),
        ("GEC102", "Mr. Muhammad Usman"),
    ],
    ("BSIT", "F26", "B"): [
        ("GEC215", "Mr. Zamran Ali"),
        ("GEC113", "Dr. Qamar Abbas"),
        ("GEC114", "Mr. M. Kashif Shafique"),
        ("GEC114L", "Mr. M. Kashif Shafique"),
        ("PHY251", "Engr. Tariq Saleem"),
        ("PHY251L", "Engr. Tariq Saleem"),
        ("GEC102", "Mr. Muhammad Usman"),
    ],
    # BSCS F25
    ("BSCS", "F25", "A"): [
        ("CS212", "Dr. Muhammad Nadeem"),
        ("CS212L", "Dr. Muhammad Nadeem"),
        ("SE311", "Mr. Muhammad Imran Saeed"),
        ("MAT221", "Dr. Nasir Shehzad"),
        ("URC302", "Dr. Muhammad Iqbal"),
        ("GEC112", "Dr. Arif Saleem Cheema"),
    ],
    ("BSCS", "F25", "B"): [
        ("CS212", "Dr. Muhammad Nadeem"),
        ("CS212L", "Dr. Muhammad Nadeem"),
        ("SE311", "Mr. Muhammad Imran Saeed"),
        ("MAT221", "Dr. Nasir Shehzad"),
        ("URC302", "Dr. Muhammad Iqbal"),
        ("GEC112", "Dr. Arif Saleem Cheema"),
    ],
    # BSIT F25
    ("BSIT", "F25", "A"): [
        ("CS212", "Dr. Syed Musharaf Ali"),
        ("CS212L", "Dr. Syed Musharaf Ali"),
        ("SE311", "Mr. Muhammad Imran Saeed"),
        ("MAT221", "Dr. Muhammad Rehan"),
        ("IT342", "Mr. Majid Bashir"),
        ("IT342L", "Mr. Umer Aftab"),
        ("URC302", "Mr. Hafiz Muhammad Naeem"),
        ("GEC112", "Mr. Sohaib Qureshi"),
    ],
    ("BSIT", "F25", "B"): [
        ("CS212", "Dr. Syed Musharaf Ali"),
        ("CS212L", "Dr. Syed Musharaf Ali"),
        ("SE311", "Mr. Muhammad Imran Saeed"),
        ("MAT221", "Mr. Muhammad Musharraf"),
        ("IT342", "Dr. Tariq Sadad"),
        ("IT342L", "Dr. Tariq Sadad"),
        ("URC302", "Mr. Hafiz Muhammad Naeem"),
        ("GEC112", "Mr. Sohaib Qureshi"),
    ],
    # BSCS F24
    ("BSCS", "F24", "A"): [
        ("AI211", "Dr. Muhammad Majid"),
        ("AI211L", "Dr. Muhammad Majid"),
        ("CS322", "Dr. Qamar Abbas"),
        ("CS332", "Dr. Zafar Mehmood"),
        ("CS332L", "Dr. Zafar Mehmood"),
        ("CS342", "Dr. Asim Munir"),
        ("CS342L", "Dr. Asim Munir"),
        ("CS344", "Mr. Sameer Akram"),
        ("CS344L", "Mr. Sameer Akram"),
        ("CS352", "Dr. Jibran Mir"),
        ("CS352L", "Dr. Jibran Mir"),
    ],
    ("BSCS", "F24", "B"): [
        ("AI211", "Dr. Muhammad Majid"),
        ("AI211L", "Mr. Tahir Hussain"),
        ("CS322", "Dr. Syed Muhammad Saqlain"),
        ("CS332", "Dr. Zafar Mehmood"),
        ("CS332L", "Dr. Zafar Mehmood"),
        ("CS342", "Dr. Asim Munir"),
        ("CS342L", "Dr. Asim Munir"),
        ("CS344", "Mr. Sameer Akram"),
        ("CS344L", "Mr. Sameer Akram"),
        ("CS352", "Mr. Tahir Hussain"),
        ("CS352L", "Mr. Tahir Hussain"),
    ],
    # BSIT F24
    ("BSIT", "F24", "A"): [
        ("CS322", "Dr. Muhammad Nazir"),
        ("CS323", "Dr. Syed Muhammad Saqlain"),
        ("CS342", "Dr. Jibran Mir"),
        ("CS342L", "Dr. Jibran Mir"),
        ("CS352", "Mr. Ahsan Tanveer"),
        ("CS352L", "Mr. Ahsan Tanveer"),
        ("IT321", "Mr. Majid Bashir"),
        ("IT321L", "Mr. Majid Bashir"),
        ("IT341", "Mr. Iftikhar Ali Khan"),
        ("IT341L", "Mr. Iftikhar Ali Khan"),
    ],
    ("BSIT", "F24", "B"): [
        ("CS322", "Dr. Muhammad Nazir"),
        ("CS323", "Dr. Syed Muhammad Saqlain"),
        ("CS342", "Dr. Jibran Mir"),
        ("CS342L", "Mr. Umer Aftab"),
        ("CS352", "Mr. Ahsan Tanveer"),
        ("CS352L", "Mr. Ahsan Tanveer"),
        ("IT321", "Mr. Majid Bashir"),
        ("IT321L", "Mr. Majid Bashir"),
        ("IT341", "Mr. Iftikhar Ali Khan"),
        ("IT341L", "Mr. Iftikhar Ali Khan"),
    ],
    # BSCS F23
    ("BSCS", "F23", "A"): [
        ("CS363", "Dr. Tariq Sadad"),
        ("CS411L", "Dr. Zafar Mehmood"),
        ("GC120", "Dr. Shahbaz Malik"),
        ("GC152", "Mr. Ayaz Ali"),
        ("IT332", "Dr. Muhammad Adeel"),
        ("CS324", "Dr. Asim Munir"),
    ],
    ("BSCS", "F23", "B"): [
        ("CS363", "Dr. Tariq Sadad"),
        ("CS411L", "Mr. Umer Aftab"),
        ("GC120", "Mr. Muhammad Taufail"),
        ("GC152", "Mr. Adnan Khan"),
        ("IT332", "Dr. Muhammad Adeel"),
        ("CS324", "Dr. Asim Munir"),
    ],
    ("BSCS", "F23", "C"): [
        ("CS363", "Dr. Tariq Sadad"),
        ("CS411L", "Mr. Umer Aftab"),
        ("GC120", "Mr. Muhammad Taufail"),
        ("GC152", "Dr. Arif Saleem Cheema"),
        ("IT332", "Dr. Muhammad Adeel"),
        ("CS324", "Dr. Asim Munir"),
    ],
    # BSIT F23
    ("BSIT", "F23", "A"): [
        ("SE345", "Mr. Tahir Hussain"),
        ("GC132", "Dr. Farrukh Nazir"),
        ("IT332", "Dr. Muhammad Adeel"),
        ("IT376", "Dr. Sayed Qaiser Ali Shah"),
        ("IT379", "Dr. Sayed Qaiser Ali Shah"),
    ],
    ("BSIT", "F23", "B"): [
        ("SE345", "Mr. Tahir Hussain"),
        ("GC132", "Dr. Farrukh Nazir"),
        ("IT332", "Mr. Abid Jamil"),
        ("IT376", "Mr. Ahsan Tanveer"),
        ("IT379", "Dr. Sayed Qaiser Ali Shah"),
    ],
}


class DataStore:
    def __init__(self):
        self.rooms: List[Dict[str, Any]] = []
        self.courses: List[Dict[str, Any]] = []
        self.instructor_assignments: List[Dict[str, Any]] = []
        self.students: List[Dict[str, Any]] = []
        self.time_slots: List[Dict[str, Any]] = []
        self.student_by_roll: Dict[str, Dict[str, Any]] = {}
        self.course_by_code: Dict[str, Dict[str, Any]] = {}
        self.enrolment_type_map: Dict[tuple, str] = {}
        self.attendance_map: Dict[tuple, float] = {}
        persisted = database.load_master_data()
        if persisted:
            self.rooms = persisted["rooms"]
            self.courses = persisted["courses"]
            self.instructor_assignments = persisted["instructor_assignments"]
            self.students = persisted["students"]
            self.time_slots = persisted["time_slots"]
            self._rebuild_indexes()
        else:
            self.reset_to_seed()
            self.save()

    def reset_to_seed(self):
        self.rooms = [
            {"id": "R25", "name": "Room 25", "rows": 7, "columns": 5, "capacity": 35, "department": "CS", "reserve_capacity": 5, "invigilators_required": 1, "room_type": "hall"},
            {"id": "R26", "name": "Room 26", "rows": 10, "columns": 7, "capacity": 70, "department": "CS", "reserve_capacity": 5, "invigilators_required": 3, "room_type": "hall"},
            {"id": "R27", "name": "Room 27", "rows": 7, "columns": 5, "capacity": 35, "department": "CS", "reserve_capacity": 5, "invigilators_required": 1, "room_type": "hall"},
            {"id": "R18", "name": "Room 18", "rows": 10, "columns": 6, "capacity": 60, "department": "IT", "reserve_capacity": 10, "invigilators_required": 2, "room_type": "hall"},
            {"id": "R21", "name": "Room 21", "rows": 7, "columns": 5, "capacity": 35, "department": "IT", "reserve_capacity": 5, "invigilators_required": 1, "room_type": "hall"},
            {"id": "R28", "name": "Room 28", "rows": 7, "columns": 5, "capacity": 35, "department": "IT", "reserve_capacity": 5, "invigilators_required": 1, "room_type": "hall"},
            {"id": "LAB-2", "name": "Lab 2", "rows": 5, "columns": 5, "capacity": 25, "department": "CS", "reserve_capacity": 0, "invigilators_required": 1, "room_type": "lab"},
            {"id": "LAB-3", "name": "Lab 3", "rows": 5, "columns": 5, "capacity": 25, "department": "CS", "reserve_capacity": 0, "invigilators_required": 1, "room_type": "lab"},
            {"id": "LAB-4", "name": "Lab 4", "rows": 5, "columns": 5, "capacity": 25, "department": "IT", "reserve_capacity": 0, "invigilators_required": 1, "room_type": "lab"},
            {"id": "LAB-5", "name": "Lab 5", "rows": 5, "columns": 5, "capacity": 25, "department": "IT", "reserve_capacity": 0, "invigilators_required": 1, "room_type": "lab"},
        ]
        self.courses = [
            {"code": code, "title": title, "credit_hours": 3, "is_lab": is_lab,
             "student_roll_numbers": [], "regular_roll_numbers": [], "back_roll_numbers": []}
            for code, title, _, _, is_lab in _REFERENCE_COURSES
        ]
        self.instructor_assignments = []
        self.students = []
        self.time_slots = []

        section_counts = {}
        for program, batch, total, _, sections in _COHORTS:
            year = int("20" + batch[1:])
            counts = [total // len(sections)] * len(sections)
            for index in range(total % len(sections)):
                counts[index] += 1
            section_counts[(program, batch)] = dict(zip(sections, counts))
            major = "CS" if program == "BSCS" else "IT"
            for section, count in zip(sections, counts):
                for position in range(count):
                    ordinal = sum(section_counts[(program, batch)][s] for s in sections[:sections.index(section)]) + position + 1
                    roll = f"{year}-{major}-{ordinal:03d}"
                    name_index = len(self.students)
                    self.students.append({
                        "roll_no": roll,
                        "name": f"{FIRST_NAMES[name_index % len(FIRST_NAMES)]} {LAST_NAMES[name_index % len(LAST_NAMES)]}",
                        "father_name": f"{FATHER_NAMES[name_index % len(FATHER_NAMES)]} {LAST_NAMES[(name_index + 3) % len(LAST_NAMES)]}",
                        "program": program,
                        "batch": batch,
                        "section": section,
                        "faculty": "Computing and Information Technology",
                        "courses": [],
                        "enrolments": [],
                    })

        # Dedicated Instructor Assignments directly from Fall 2026 timetable
        self.instructor_assignments = []
        for (prog, batch, sec), list_courses in _TIMETABLE_ENROLMENTS.items():
            for code, inst in list_courses:
                self.instructor_assignments.append({
                    "id": f"IA{len(self.instructor_assignments) + 1}",
                    "program": prog,
                    "batch": batch,
                    "section": sec,
                    "course_code": code,
                    "instructor": inst,
                })

        # Premedical M101 assignments for BSCS F26 and BSIT F26 with Dr. Qamar Abbas
        for prog in ("BSCS", "BSIT"):
            for sec in ("A", "B"):
                self.instructor_assignments.append({
                    "id": f"IA{len(self.instructor_assignments) + 1}",
                    "program": prog,
                    "batch": "F26",
                    "section": sec,
                    "course_code": "M101",
                    "instructor": "Dr. Qamar Abbas",
                })

        # E-Commerce SE346 instructor assignments for Mr. Abid Jamil across cohorts
        for prog in ("BSCS", "BSIT"):
            for batch in ("F23", "F24"):
                cohort_secs = ("A", "B", "C") if (prog, batch) == ("BSCS", "F23") else ("A", "B")
                for sec in cohort_secs:
                    self.instructor_assignments.append({
                        "id": f"IA{len(self.instructor_assignments) + 1}",
                        "program": prog,
                        "batch": batch,
                        "section": sec,
                        "course_code": "SE346",
                        "instructor": "Mr. Abid Jamil",
                    })

        # Enroll each student in their exact batch & section courses from timetable
        for student in self.students:
            key = (student["program"], student["batch"], student["section"])
            assigned = _TIMETABLE_ENROLMENTS.get(key, [])
            for code, _ in assigned:
                student["enrolments"].append({
                    "course": code, "type": "regular", "attendance_percent": 100,
                })
                student["courses"].append(code)

        # Premedical students (BSCS F26 Section A and BSIT F26 Section A) take M101 with Dr. Qamar Abbas
        for s in [st for st in self.students if st["program"] == "BSCS" and st["batch"] == "F26" and st["section"] == "A"][:15]:
            s["enrolments"].append({"course": "M101", "type": "regular", "attendance_percent": 100})
            s["courses"].append("M101")
        for s in [st for st in self.students if st["program"] == "BSIT" and st["batch"] == "F26" and st["section"] == "A"][:12]:
            s["enrolments"].append({"course": "M101", "type": "regular", "attendance_percent": 100})
            s["courses"].append("M101")

        # E-Commerce SE346: Elective taken by random students across BSCS/BSIT F23 & F24
        import random
        rng = random.Random(42)
        f23_cs_st = [st for st in self.students if st["program"] == "BSCS" and st["batch"] == "F23"]
        f24_cs_st = [st for st in self.students if st["program"] == "BSCS" and st["batch"] == "F24"]
        f23_it_st = [st for st in self.students if st["program"] == "BSIT" and st["batch"] == "F23"]
        f24_it_st = [st for st in self.students if st["program"] == "BSIT" and st["batch"] == "F24"]
        ecom_students = (
            rng.sample(f23_cs_st, 18) +
            rng.sample(f24_cs_st, 15) +
            rng.sample(f23_it_st, 18) +
            rng.sample(f24_it_st, 15)
        )
        for s in ecom_students:
            s["enrolments"].append({"course": "SE346", "type": "regular", "attendance_percent": 100})
            s["courses"].append("SE346")

        # A small deterministic sample of repeaters exercises the back-paper workflow.
        for index, student in enumerate(self.students):
            if index % 31 == 0 and student["enrolments"]:
                student["enrolments"][-1]["type"] = "back"

        sid = 1
        exam_dates = ("2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02")
        for date in exam_dates:
            for slot_index, (start, end, label) in enumerate(_SLOT_TIMES):
                self.time_slots.append({
                    "id": f"S{sid}", "date": date, "start_time": start,
                    "end_time": end, "label": label,
                    "slot_type": "written",
                })
                sid += 1
        self._rebuild_indexes()
        database.reset_operational_data()
        self.save()

    def save(self):
        database.save_master_data(self)

    def _rebuild_indexes(self):
        # Sync student enrolments into course roll number arrays
        course_map = {c["code"]: c for c in self.courses}
        for c in self.courses:
            c["student_roll_numbers"] = []
            c["regular_roll_numbers"] = []
            c["back_roll_numbers"] = []
            c["eligible_roll_numbers"] = []

        self.enrolment_type_map.clear()
        self.attendance_map.clear()
        for s in self.students:
            roll = s["roll_no"]
            enrols = s.get("enrolments", [])
            for e in enrols:
                code = e["course"]
                typ = e.get("type", "regular")
                attendance = float(e.get("attendance_percent", 100))
                self.enrolment_type_map[(roll, code)] = typ
                self.attendance_map[(roll, code)] = attendance
                if code in course_map:
                    course_map[code]["student_roll_numbers"].append(roll)
                    if attendance >= 75:
                        course_map[code]["eligible_roll_numbers"].append(roll)
                    if typ == "back":
                        course_map[code]["back_roll_numbers"].append(roll)
                    else:
                        course_map[code]["regular_roll_numbers"].append(roll)

        for c in self.courses:
            c["student_roll_numbers"] = sorted(set(c["student_roll_numbers"]))
            c["regular_roll_numbers"] = sorted(set(c["regular_roll_numbers"]))
            c["back_roll_numbers"] = sorted(set(c["back_roll_numbers"]))
            c["eligible_roll_numbers"] = sorted(set(c["eligible_roll_numbers"]))

        self.student_by_roll = {s["roll_no"]: s for s in self.students}
        self.course_by_code = {c["code"]: c for c in self.courses}

    # ------------------ INSTRUCTOR ASSIGNMENTS HELPERS ------------------
    def get_instructors_for_course(self, course_code: str) -> List[str]:
        c_code = course_code.strip().upper()
        insts = [a["instructor"].strip() for a in self.instructor_assignments if a["course_code"].upper() == c_code and a["instructor"].strip()]
        return list(dict.fromkeys(insts))

    def get_batches_for_course(self, course_code: str) -> str:
        c_code = course_code.strip().upper()
        tags = []
        for a in self.instructor_assignments:
            if a["course_code"].upper() == c_code:
                tag = f"{a['program']} {a['batch']}".strip()
                if tag and tag not in tags:
                    tags.append(tag)
        return ", ".join(tags) if tags else "All Batches"

    def get_instructor_summary_for_course(self, course_code: str) -> str:
        c_code = course_code.strip().upper()
        assgns = [a for a in self.instructor_assignments if a["course_code"].upper() == c_code and a["instructor"].strip()]
        if not assgns:
            return "Unassigned"
        unique_insts = list(dict.fromkeys(a["instructor"].strip() for a in assgns))
        if len(unique_insts) == 1:
            inst = unique_insts[0]
            secs = sorted(set(a["section"] for a in assgns))
            if len(secs) > 1:
                return f"{inst} (Sec {' & '.join(secs)})"
            return inst

        # Multiple distinct instructors: group by instructor and their teaching sections
        inst_groups = {}
        for a in assgns:
            inst = a["instructor"].strip()
            sec = a["section"].strip()
            prog = a["program"].strip()
            inst_groups.setdefault(inst, []).append((prog, sec))

        lines = []
        for inst, progs_secs in inst_groups.items():
            progs = sorted(set(p for p, s in progs_secs))
            secs = sorted(set(s for p, s in progs_secs))
            prog_str = "/".join(progs)
            if len(secs) > 1:
                lines.append(f"{inst} ({prog_str}: Sec {' & '.join(secs)})")
            elif len(progs) > 0:
                lines.append(f"{inst} ({prog_str})")
            else:
                lines.append(inst)
        return " | ".join(lines)

    def get_instructor_for_student_course(self, student: Optional[Dict[str, Any]], course_code: str) -> str:
        """Finds the assigned faculty instructor for a student's enrolled course based on program, batch, and section."""
        if not student or not course_code:
            return ""
        prog = student.get("program", "").strip().upper()
        batch = student.get("batch", "").strip().upper()
        sec = student.get("section", "").strip().upper()
        c_code = course_code.strip().upper()

        assgns = [a for a in self.instructor_assignments if a["course_code"].upper() == c_code]
        if not assgns:
            return ""

        # 1. Exact match (program, batch, section)
        for a in assgns:
            if a["program"].upper() == prog and a["batch"].upper() == batch and a["section"].upper() == sec:
                return a["instructor"].strip()

        # 2. Program and batch
        for a in assgns:
            if a["program"].upper() == prog and a["batch"].upper() == batch:
                return a["instructor"].strip()

        # 3. Program match (e.g. back-paper student from another batch)
        for a in assgns:
            if a["program"].upper() == prog:
                return a["instructor"].strip()

        # 4. Fallback to first assigned instructor for this course
        return assgns[0]["instructor"].strip()

    def get_attendance_percent(self, roll_no: str, course_code: str) -> float:
        return self.attendance_map.get((roll_no, course_code), 100.0)

    # ------------------ ROOMS CRUD ------------------
    def get_rooms(self) -> List[Dict[str, Any]]:
        return self.rooms

    def get_room(self, room_id: str) -> Optional[Dict[str, Any]]:
        return next((r for r in self.rooms if r["id"] == room_id), None)

    def add_room(self, name: str, rows: int, columns: int, capacity: Optional[int] = None, room_type: Optional[str] = None) -> Dict[str, Any]:
        if any(room["name"].strip().lower() == name.strip().lower() for room in self.rooms):
            raise ValueError(f"Room '{name.strip()}' already exists.")
        calc_cap = capacity if capacity is not None and capacity > 0 else (rows * columns)
        is_lab = (room_type == "lab") or ("lab" in name.strip().lower())
        rtype = "lab" if is_lab else "hall"
        prefix = "LAB-" if is_lab else "R"
        existing_nums = [
            int(r["id"].replace(prefix, "")) for r in self.rooms
            if r["id"].startswith(prefix) and r["id"].replace(prefix, "").isdigit()
        ]
        new_num = max(existing_nums) + 1 if existing_nums else 1
        new_id = f"{prefix}{new_num}"

        room = {
            "id": new_id,
            "name": name.strip(),
            "rows": int(rows),
            "columns": int(columns),
            "capacity": int(calc_cap),
            "room_type": rtype,
            "department": "CS",
            "reserve_capacity": 0 if is_lab else 5,
            "invigilators_required": 1,
        }
        self.rooms.append(room)
        self.save()
        return room

    def update_room(self, room_id: str, name: str, rows: int, columns: int, capacity: Optional[int] = None, room_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        room = self.get_room(room_id)
        if not room:
            return None
        if any(other["id"] != room_id and other["name"].strip().lower() == name.strip().lower() for other in self.rooms):
            raise ValueError(f"Room '{name.strip()}' already exists.")
        room["name"] = name.strip()
        room["rows"] = int(rows)
        room["columns"] = int(columns)
        room["capacity"] = int(capacity) if capacity is not None and capacity > 0 else (rows * columns)
        if room_type:
            room["room_type"] = room_type
        elif "room_type" not in room:
            room["room_type"] = "lab" if "lab" in name.lower() else "hall"
        self.save()
        return room

    def delete_room(self, room_id: str) -> bool:
        room = self.get_room(room_id)
        if not room:
            return False
        self.rooms = [r for r in self.rooms if r["id"] != room_id]
        self.save()
        return True

    # ------------------ COURSES CRUD ------------------
    def get_courses(self) -> List[Dict[str, Any]]:
        """Returns courses catalog enriched with dynamic counts and instructor assignments."""
        res = []
        for c in self.courses:
            code = c["code"]
            item = {
                "code": c["code"],
                "title": c["title"],
                "credit_hours": int(c.get("credit_hours", 3)),
                "is_lab": bool(c.get("is_lab", False)),
                "instructors": self.get_instructors_for_course(code),
                "instructor": self.get_instructor_summary_for_course(code),
                "batches": self.get_batches_for_course(code),
                "student_roll_numbers": c.get("student_roll_numbers", []),
                "regular_roll_numbers": c.get("regular_roll_numbers", []),
                "back_roll_numbers": c.get("back_roll_numbers", []),
                "eligible_roll_numbers": c.get("eligible_roll_numbers", []),
                "total_students": len(c.get("student_roll_numbers", [])),
                "regular_students": len(c.get("regular_roll_numbers", [])),
                "back_students": len(c.get("back_roll_numbers", [])),
                "eligible_students": len(c.get("eligible_roll_numbers", [])),
                "ineligible_students": len(c.get("student_roll_numbers", [])) - len(c.get("eligible_roll_numbers", [])),
            }
            res.append(item)
        return res

    def get_course(self, code: str) -> Optional[Dict[str, Any]]:
        c = self.course_by_code.get(code.upper().strip())
        if not c:
            return None
        c_code = c["code"]
        return {
            "code": c["code"],
            "title": c["title"],
            "credit_hours": int(c.get("credit_hours", 3)),
            "is_lab": bool(c.get("is_lab", False)),
            "instructors": self.get_instructors_for_course(c_code),
            "instructor": self.get_instructor_summary_for_course(c_code),
            "batches": self.get_batches_for_course(c_code),
            "student_roll_numbers": c.get("student_roll_numbers", []),
            "regular_roll_numbers": c.get("regular_roll_numbers", []),
            "back_roll_numbers": c.get("back_roll_numbers", []),
            "eligible_roll_numbers": c.get("eligible_roll_numbers", []),
            "total_students": len(c.get("student_roll_numbers", [])),
            "regular_students": len(c.get("regular_roll_numbers", [])),
            "back_students": len(c.get("back_roll_numbers", [])),
            "eligible_students": len(c.get("eligible_roll_numbers", [])),
            "ineligible_students": len(c.get("student_roll_numbers", [])) - len(c.get("eligible_roll_numbers", [])),
        }

    def add_course(self, code: str, title: str, credit_hours: int = 3, is_lab: bool = False) -> Dict[str, Any]:
        clean_code = code.strip().upper()
        if clean_code in self.course_by_code:
            raise ValueError(f"Course with code '{clean_code}' already exists.")

        course = {
            "code": clean_code,
            "title": title.strip(),
            "credit_hours": int(credit_hours),
            "is_lab": bool(is_lab),
            "student_roll_numbers": [],
            "regular_roll_numbers": [],
            "back_roll_numbers": [],
        }
        self.courses.append(course)
        self._rebuild_indexes()
        self.save()
        return self.get_course(clean_code)

    def update_course(self, code: str, title: Optional[str] = None, credit_hours: Optional[int] = None, is_lab: Optional[bool] = None) -> Optional[Dict[str, Any]]:
        course = self.course_by_code.get(code.upper().strip())
        if not course:
            return None
        if title is not None:
            course["title"] = title.strip()
        if credit_hours is not None:
            course["credit_hours"] = int(credit_hours)
        if is_lab is not None:
            course["is_lab"] = bool(is_lab)
        self._rebuild_indexes()
        self.save()
        return self.get_course(code)

    def delete_course(self, code: str) -> bool:
        clean_code = code.strip().upper()
        if clean_code not in self.course_by_code:
            return False
        self.courses = [c for c in self.courses if c["code"] != clean_code]
        # remove associated instructor assignments
        self.instructor_assignments = [a for a in self.instructor_assignments if a["course_code"].upper() != clean_code]
        # remove from student enrolments
        for s in self.students:
            s["enrolments"] = [e for e in s.get("enrolments", []) if e["course"] != clean_code]
            s["courses"] = [c for c in s.get("courses", []) if c != clean_code]
        self._rebuild_indexes()
        self.save()
        return True

    # ------------------ INSTRUCTOR ASSIGNMENTS CRUD ------------------
    def get_instructor_assignments(
        self,
        course_code: Optional[str] = None,
        program: Optional[str] = None,
        batch: Optional[str] = None,
        section: Optional[str] = None,
        instructor: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        res = self.instructor_assignments
        if course_code:
            c = course_code.strip().upper()
            res = [a for a in res if a["course_code"].upper() == c]
        if program:
            p = program.strip().upper()
            res = [a for a in res if a["program"].upper() == p]
        if batch:
            b = batch.strip().upper()
            res = [a for a in res if a["batch"].upper() == b]
        if section:
            s = section.strip().upper()
            res = [a for a in res if a["section"].upper() == s]
        if instructor:
            i = instructor.strip().lower()
            res = [a for a in res if i in a["instructor"].lower()]
        return res

    def get_instructor_assignment(self, assignment_id: str) -> Optional[Dict[str, Any]]:
        return next((a for a in self.instructor_assignments if a["id"] == assignment_id), None)

    def add_instructor_assignment(self, program: str, batch: str, section: str, course_code: str, instructor: str) -> Dict[str, Any]:
        c_code = course_code.strip().upper()
        if c_code not in self.course_by_code:
            raise ValueError(f"Course '{c_code}' does not exist in courses directory.")
        clean_program = program.strip().upper()
        clean_batch = batch.strip().upper()
        clean_section = section.strip().upper()
        if any(
            item["program"] == clean_program and item["batch"] == clean_batch
            and item["section"] == clean_section and item["course_code"] == c_code
            for item in self.instructor_assignments
        ):
            raise ValueError("An instructor assignment already exists for this program, batch, section, and course.")

        existing_nums = [int(a["id"][2:]) for a in self.instructor_assignments if a["id"].startswith("IA") and a["id"][2:].isdigit()]
        new_num = max(existing_nums) + 1 if existing_nums else 1
        new_id = f"IA{new_num}"

        item = {
            "id": new_id,
            "program": clean_program,
            "batch": clean_batch,
            "section": clean_section,
            "course_code": c_code,
            "instructor": instructor.strip(),
        }
        self.instructor_assignments.append(item)
        self.save()
        return item

    def update_instructor_assignment(
        self,
        assignment_id: str,
        program: Optional[str] = None,
        batch: Optional[str] = None,
        section: Optional[str] = None,
        course_code: Optional[str] = None,
        instructor: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        item = self.get_instructor_assignment(assignment_id)
        if not item:
            return None
        if program is not None:
            item["program"] = program.strip().upper()
        if batch is not None:
            item["batch"] = batch.strip().upper()
        if section is not None:
            item["section"] = section.strip().upper()
        if course_code is not None:
            c_code = course_code.strip().upper()
            if c_code not in self.course_by_code:
                raise ValueError(f"Course '{c_code}' does not exist in courses directory.")
            item["course_code"] = c_code
        if instructor is not None:
            item["instructor"] = instructor.strip()
        if any(
            other["id"] != assignment_id
            and other["program"] == item["program"]
            and other["batch"] == item["batch"]
            and other["section"] == item["section"]
            and other["course_code"] == item["course_code"]
            for other in self.instructor_assignments
        ):
            raise ValueError("An instructor assignment already exists for this program, batch, section, and course.")
        self.save()
        return item

    def delete_instructor_assignment(self, assignment_id: str) -> bool:
        item = self.get_instructor_assignment(assignment_id)
        if not item:
            return False
        self.instructor_assignments = [a for a in self.instructor_assignments if a["id"] != assignment_id]
        self.save()
        return True

    # ------------------ STUDENTS CRUD ------------------
    def get_students(
        self,
        search: Optional[str] = None,
        batch: Optional[str] = None,
        program: Optional[str] = None,
        section: Optional[str] = None,
        course: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        res = self.students
        if search:
            q = search.lower().strip()
            res = [s for s in res if q in s["roll_no"].lower() or q in s["name"].lower() or q in s.get("father_name", "").lower()]
        if batch:
            b = batch.lower().strip()
            res = [s for s in res if b == s.get("batch", "").lower()]
        if program:
            p = program.lower().strip()
            res = [s for s in res if p == s.get("program", "").lower()]
        if section:
            sec = section.lower().strip()
            res = [s for s in res if sec == s.get("section", "").lower()]
        if course:
            c = course.upper().strip()
            res = [s for s in res if any(e["course"] == c for e in s.get("enrolments", []))]
        return res

    def get_student(self, roll_no: str) -> Optional[Dict[str, Any]]:
        return self.student_by_roll.get(roll_no.strip())

    def add_student(
        self,
        roll_no: str,
        name: str,
        father_name: str,
        program: str,
        batch: str,
        section: str,
        faculty: str,
        enrolments: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        clean_roll = roll_no.strip().upper()
        if clean_roll in self.student_by_roll:
            raise ValueError(f"Student with Roll No '{clean_roll}' already exists.")

        normalized_enrols = []
        seen_courses = set()
        for e in enrolments:
            c_code = e.get("course", "").strip().upper()
            if c_code not in self.course_by_code:
                raise ValueError(f"Course '{c_code}' does not exist in courses directory.")
            if c_code in seen_courses:
                raise ValueError(f"Course '{c_code}' is listed more than once for this student.")
            seen_courses.add(c_code)
            t = e.get("type", "regular").lower()
            if t not in ("regular", "back"):
                t = "regular"
            attendance = float(e.get("attendance_percent", 100))
            if attendance < 0 or attendance > 100:
                raise ValueError("Course attendance must be between 0 and 100 percent.")
            if c_code:
                normalized_enrols.append({"course": c_code, "type": t, "attendance_percent": attendance})

        student = {
            "roll_no": clean_roll,
            "name": name.strip(),
            "father_name": father_name.strip(),
            "program": program.strip() or "BSCS",
            "batch": batch.strip() or "F24",
            "section": section.strip().upper() or "A",
            "faculty": faculty.strip() or "Computing and Information Technology",
            "courses": [e["course"] for e in normalized_enrols],
            "enrolments": normalized_enrols,
        }
        self.students.append(student)
        self._rebuild_indexes()
        self.save()
        return student

    def update_student(
        self,
        roll_no: str,
        name: Optional[str] = None,
        father_name: Optional[str] = None,
        program: Optional[str] = None,
        batch: Optional[str] = None,
        section: Optional[str] = None,
        faculty: Optional[str] = None,
        enrolments: Optional[List[Dict[str, str]]] = None,
    ) -> Optional[Dict[str, Any]]:
        student = self.get_student(roll_no)
        if not student:
            return None
        if name is not None:
            student["name"] = name.strip()
        if father_name is not None:
            student["father_name"] = father_name.strip()
        if program is not None:
            student["program"] = program.strip()
        if batch is not None:
            student["batch"] = batch.strip()
        if section is not None:
            student["section"] = section.strip().upper()
        if faculty is not None:
            student["faculty"] = faculty.strip()
        if enrolments is not None:
            normalized_enrols = []
            seen_courses = set()
            for e in enrolments:
                c_code = e.get("course", "").strip().upper()
                if c_code not in self.course_by_code:
                    raise ValueError(f"Course '{c_code}' does not exist in courses directory.")
                if c_code in seen_courses:
                    raise ValueError(f"Course '{c_code}' is listed more than once for this student.")
                seen_courses.add(c_code)
                t = e.get("type", "regular").lower()
                if t not in ("regular", "back"):
                    t = "regular"
                attendance = float(e.get("attendance_percent", 100))
                if attendance < 0 or attendance > 100:
                    raise ValueError("Course attendance must be between 0 and 100 percent.")
                if c_code:
                    normalized_enrols.append({"course": c_code, "type": t, "attendance_percent": attendance})
            student["enrolments"] = normalized_enrols
            student["courses"] = [e["course"] for e in normalized_enrols]

        self._rebuild_indexes()
        self.save()
        return student

    def delete_student(self, roll_no: str) -> bool:
        clean_roll = roll_no.strip()
        if clean_roll not in self.student_by_roll:
            return False
        self.students = [s for s in self.students if s["roll_no"] != clean_roll]
        self._rebuild_indexes()
        self.save()
        return True

    # ------------------ TIME SLOTS CRUD ------------------
    def get_time_slots(self) -> List[Dict[str, Any]]:
        return sorted(self.time_slots, key=lambda s: (s["date"], s["start_time"]))

    def get_time_slot(self, slot_id: str) -> Optional[Dict[str, Any]]:
        return next((s for s in self.time_slots if s["id"] == slot_id), None)

    def add_time_slot(self, date: str, start_time: str, end_time: str, label: str = "", slot_type: str = "written") -> Dict[str, Any]:
        try:
            datetime.date.fromisoformat(date)
            start_min = self._time_to_minutes(start_time)
            end_min = self._time_to_minutes(end_time)
        except ValueError as exc:
            raise ValueError(f"Invalid date or time: {exc}")
        if end_min <= start_min:
            raise ValueError("Slot end time must be later than its start time.")
        for s in self.time_slots:
            if s["date"] == date:
                existing_start = self._time_to_minutes(s["start_time"])
                existing_end = self._time_to_minutes(s["end_time"])
                if start_min < existing_end and existing_start < end_min:
                    raise ValueError("Time slots on the same date cannot overlap.")

        existing_nums = [int(s["id"][1:]) for s in self.time_slots if s["id"].startswith("S") and s["id"][1:].isdigit()]
        new_num = max(existing_nums) + 1 if existing_nums else 1
        new_id = f"S{new_num}"

        item = {
            "id": new_id,
            "date": date.strip(),
            "start_time": start_time.strip(),
            "end_time": end_time.strip(),
            "label": label.strip() or f"Slot {new_id}",
            "slot_type": slot_type,
        }
        self.time_slots.append(item)
        self.save()
        return item

    def update_time_slot(self, slot_id: str, date: str, start_time: str, end_time: str, label: str = "", slot_type: str = "written") -> Optional[Dict[str, Any]]:
        slot = self.get_time_slot(slot_id)
        if not slot:
            return None
        try:
            datetime.date.fromisoformat(date)
            start_min = self._time_to_minutes(start_time)
            end_min = self._time_to_minutes(end_time)
        except ValueError as exc:
            raise ValueError(f"Invalid date or time: {exc}")
        if end_min <= start_min:
            raise ValueError("Slot end time must be later than its start time.")
        for other in self.time_slots:
            if other["id"] != slot_id and other["date"] == date:
                if start_min < self._time_to_minutes(other["end_time"]) and self._time_to_minutes(other["start_time"]) < end_min:
                    raise ValueError("Time slots on the same date cannot overlap.")
        slot["date"] = date.strip()
        slot["start_time"] = start_time.strip()
        slot["end_time"] = end_time.strip()
        slot["label"] = label.strip()
        slot["slot_type"] = slot_type
        self.save()
        return slot

    @staticmethod
    def _time_to_minutes(value: str) -> int:
        parts = value.split(":")
        if len(parts) != 2:
            raise ValueError(f"'{value}' must use HH:MM format.")
        hour, minute = (int(part) for part in parts)
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise ValueError(f"'{value}' is not a valid time.")
        return hour * 60 + minute

    def delete_time_slot(self, slot_id: str) -> bool:
        slot = self.get_time_slot(slot_id)
        if not slot:
            return False
        self.time_slots = [s for s in self.time_slots if s["id"] != slot_id]
        self.save()
        return True

    def bulk_delete_time_slots(self, slot_ids: List[str]) -> int:
        initial = len(self.time_slots)
        id_set = set(slot_ids)
        self.time_slots = [s for s in self.time_slots if s["id"] not in id_set]
        self.save()
        return initial - len(self.time_slots)

    def bulk_shift_time_slots(self, slot_ids: List[str], shift_days: int) -> int:
        import datetime
        id_set = set(slot_ids)
        shifted = 0
        delta = datetime.timedelta(days=shift_days)
        for s in self.time_slots:
            if s["id"] in id_set:
                try:
                    cur = datetime.date.fromisoformat(s["date"])
                    s["date"] = (cur + delta).isoformat()
                    shifted += 1
                except ValueError:
                    pass
        if shifted > 0:
            self.save()
        return shifted

    def clear_time_slots(self) -> int:
        count = len(self.time_slots)
        self.time_slots.clear()
        return count

    def auto_generate_time_slots(
        self,
        from_date: str,
        to_date: str,
        start_time: str = "08:30",
        end_time: str = "17:40",
        duration_minutes: int = 90,
        break_minutes: int = 15,
        skip_weekends: bool = True,
        replace_existing: bool = False,
    ) -> List[Dict[str, Any]]:
        import datetime

        try:
            d_start = datetime.date.fromisoformat(from_date.strip())
            d_end = datetime.date.fromisoformat(to_date.strip())
        except ValueError as e:
            raise ValueError(f"Invalid date format (must be YYYY-MM-DD): {e}")

        if d_end < d_start:
            raise ValueError("End date cannot be earlier than start date.")

        def time_to_min(t_str: str) -> int:
            parts = t_str.strip().split(":")
            return int(parts[0]) * 60 + int(parts[1])

        def min_to_time(m: int) -> str:
            return f"{m // 60:02d}:{m % 60:02d}"

        try:
            start_min = self._time_to_minutes(start_time)
            end_min = self._time_to_minutes(end_time)
        except ValueError as e:
            raise ValueError(f"Invalid time format: {e}")

        if duration_minutes <= 0:
            raise ValueError("Duration must be greater than 0 minutes.")
        if end_min <= start_min:
            raise ValueError("Day end time must be later than start time.")
        if (end_min - start_min) < duration_minutes:
            raise ValueError(f"Day window ({end_min - start_min}m) is shorter than slot duration ({duration_minutes}m).")

        if replace_existing:
            self.time_slots.clear()
            sid_counter = 1
        else:
            existing_nums = [int(s["id"][1:]) for s in self.time_slots if s["id"].startswith("S") and s["id"][1:].isdigit()]
            sid_counter = max(existing_nums) + 1 if existing_nums else 1

        new_slots = []
        curr_date = d_start
        one_day = datetime.timedelta(days=1)

        while curr_date <= d_end:
            if skip_weekends and curr_date.weekday() in (5, 6):
                curr_date += one_day
                continue

            date_str = curr_date.isoformat()
            curr_slot_start = start_min
            session_num = 1

            while curr_slot_start + duration_minutes <= end_min:
                curr_slot_end = curr_slot_start + duration_minutes
                s_start_str = min_to_time(curr_slot_start)
                s_end_str = min_to_time(curr_slot_end)

                exists = any(
                    s["date"] == date_str and s["start_time"] == s_start_str and s["end_time"] == s_end_str
                    for s in self.time_slots
                )
                overlapping = [
                    s for s in self.time_slots if s["date"] == date_str
                    and curr_slot_start < self._time_to_minutes(s["end_time"])
                    and self._time_to_minutes(s["start_time"]) < curr_slot_end
                ]
                if overlapping and not exists:
                    raise ValueError(f"Generated slot {date_str} {s_start_str}-{s_end_str} overlaps an existing slot.")
                if not exists:
                    label = f"Session {session_num}"
                    if session_num == 1:
                        label = "Morning 1"
                    elif session_num == 2:
                        label = "Morning 2"
                    elif session_num == 3:
                        label = "Afternoon 1"
                    elif session_num == 4:
                        label = "Afternoon 2"
                    elif session_num == 5:
                        label = "Evening 1"

                    slot_obj = {
                        "id": f"S{sid_counter}",
                        "date": date_str,
                        "start_time": s_start_str,
                        "end_time": s_end_str,
                        "label": label,
                        "slot_type": "written",
                    }
                    self.time_slots.append(slot_obj)
                    new_slots.append(slot_obj)
                    sid_counter += 1

                session_num += 1
                curr_slot_start = curr_slot_end + break_minutes

            curr_date += one_day

        return new_slots


# Global singleton instance
store = DataStore()

# Backwards compatibility accessors
ROOMS = store.rooms
COURSES = store.courses
STUDENTS = store.students
TIME_SLOTS_SEED = store.time_slots
STUDENT_BY_ROLL = store.student_by_roll
COURSE_BY_CODE = store.course_by_code


def enrolment_type(roll_no: str, course_code: str) -> str:
    return store.enrolment_type_map.get((roll_no, course_code), "regular")
