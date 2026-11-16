"""Student exam allocation verification and roll number slips service."""
import re
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException

from data import store, enrolment_type
from app.state import datesheet_state, seating_cache
from app.services.seating_service import resolve_seating_plan


def compile_student_exam_allocations() -> List[dict]:
    """Builds the comprehensive administrative verification roster of all student exam placements."""
    seat_of = {}
    for entry in datesheet_state.get("datesheet", []):
        sid = entry["slot_id"]
        if sid not in seating_cache:
            try:
                resolve_seating_plan(sid)
            except HTTPException:
                continue
        plan = seating_cache.get(sid)
        if not plan:
            continue
        for room in plan.get("rooms", []):
            r_name = room.get("room_name") or room.get("name") or str(room.get("room_id"))
            # 1. Map all cells in the 2D grid
            for r, row in enumerate(room.get("grid", [])):
                for c, cell in enumerate(row):
                    if cell and cell.get("roll_no"):
                        roll = str(cell["roll_no"]).strip()
                        raw_c = str(cell.get("course_code") or "").strip()
                        clean_c = re.sub(r"-T\d+$", "", raw_c)
                        clean_c_noprog = re.sub(r"-(CS|IT|SE)$", "", clean_c)
                        seat_info = {
                            "room": r_name,
                            "seat": cell.get("seat") or f"Row {r + 1}, Col {c + 1}",
                        }
                        seat_of[(roll, raw_c)] = seat_info
                        seat_of[(roll, clean_c)] = seat_info
                        seat_of[(roll, clean_c_noprog)] = seat_info

            # 2. Map all column entries from seating sheet (handles manual edits / saved layouts)
            sheet = room.get("seating_sheet")
            if sheet and sheet.get("columns"):
                for col_idx, col in enumerate(sheet["columns"]):
                    col_num = col.get("col_num", col_idx + 1)
                    raw_c = str(col.get("course_code") or col.get("paper") or "").strip()
                    clean_c = re.sub(r"-T\d+$", "", raw_c)
                    clean_c_noprog = re.sub(r"-(CS|IT|SE)$", "", clean_c)
                    for r_idx, roll in enumerate(col.get("roll_nos", [])):
                        if roll and str(roll).strip():
                            r_clean = str(roll).strip()
                            s_info = {
                                "room": r_name,
                                "seat": f"Row {r_idx + 1}, Col {col_num}",
                            }
                            seat_of.setdefault((r_clean, raw_c), s_info)
                            seat_of.setdefault((r_clean, clean_c), s_info)
                            seat_of.setdefault((r_clean, clean_c_noprog), s_info)

    records = []
    for student in store.get_students():
        papers = []
        for entry in datesheet_state.get("datesheet", []):
            code = entry["course_code"]
            c_info = store.get_course(code)
            in_scheduled_group = (
                student["program"] == entry.get("program", student["program"])
                and student["batch"] == entry.get("batch", student["batch"])
                and student.get("section", "A") in entry.get("sections", [entry.get("section", student.get("section", "A"))])
            )
            if c_info and in_scheduled_group and student["roll_no"] in c_info.get("student_roll_numbers", []):
                if store.get_attendance_percent(student["roll_no"], code) < 75:
                    continue
                clean_code = re.sub(r"-T\d+$", "", code)
                clean_code_noprog = re.sub(r"-(CS|IT|SE)$", "", clean_code)
                seat = (
                    seat_of.get((student["roll_no"], code))
                    or seat_of.get((student["roll_no"], clean_code))
                    or seat_of.get((student["roll_no"], clean_code_noprog))
                    or {}
                )
                typ = enrolment_type(student["roll_no"], code)
                papers.append({
                    "course_code": code,
                    "course_title": entry["course_title"],
                    "date": entry["date"],
                    "start_time": entry["start_time"],
                    "end_time": entry["end_time"],
                    "room": seat.get("room") or "—",
                    "seat": seat.get("seat") or "—",
                    "type": typ,
                    "remarks": "Back Paper" if typ == "back" else "Regular",
                })
        ineligible_courses = [
            {
                "course_code": enrolment["course"],
                "attendance_percent": store.get_attendance_percent(student["roll_no"], enrolment["course"]),
            }
            for enrolment in student.get("enrolments", [])
            if store.get_attendance_percent(student["roll_no"], enrolment["course"]) < 75
        ]
        if papers or ineligible_courses:
            papers.sort(key=lambda p: (p["date"], p["start_time"]))
            records.append({
                "roll_no": student["roll_no"],
                "name": student["name"],
                "father_name": student["father_name"],
                "batch": student["batch"],
                "program": student["program"],
                "section": student.get("section", "A"),
                "faculty": student["faculty"],
                "datesheet_version": datesheet_state.get("version"),
                "datesheet_status": datesheet_state.get("status", "PUBLISHED"),
                "ineligible_courses": ineligible_courses,
                "papers": papers,
            })
    return records


def get_roll_slip_payload(clean_roll: str) -> dict:
    """Builds official university roll number slip data structure."""
    student = store.get_student(clean_roll)
    if not student:
        for s in store.get_students():
            if s["roll_no"].lower() == clean_roll.lower():
                student = s
                break
    if not student:
        raise HTTPException(status_code=404, detail=f"No student found with roll number '{clean_roll}'.")

    if datesheet_state.get("status") == "SUPERSEDED":
        raise HTTPException(
            status_code=409,
            detail="This slip belongs to a superseded datesheet. Generate and publish a new datesheet.",
        )

    records = compile_student_exam_allocations()
    matched = next((r for r in records if r["roll_no"].lower() == clean_roll.lower()), None)
    papers = matched["papers"] if matched else []

    for p in papers:
        try:
            p["day_name"] = datetime.strptime(p["date"], "%Y-%m-%d").strftime("%A")
        except Exception:
            p["day_name"] = ""

    halls = sorted(list(set(p["room"] for p in papers if p.get("room"))))

    return {
        "institution": {
            "name": "International Islamic University, Islamabad",
            "department": "Department of Computer Science & Information Technology",
            "faculty": "Faculty of Computing and Information Technology",
            "campus": "Male Campus, Sector H-10, Islamabad",
            "session": "Midterm Examination Fall-2026",
            "branch": "Examination Branch",
        },
        "student": {
            "roll_no": student["roll_no"],
            "name": student["name"],
            "father_name": student.get("father_name", "—"),
            "batch": student["batch"],
            "program": student["program"],
            "faculty": student.get("faculty", "Computing and Information Technology"),
            "campus": "Male Campus",
        },
        "datesheet": {
            "version": datesheet_state.get("version"),
            "status": datesheet_state.get("status", "PUBLISHED"),
        },
        "eligibility": {
            "eligible": not bool(matched and matched.get("ineligible_courses")),
            "ineligible_courses": matched.get("ineligible_courses", []) if matched else [],
        },
        "exams": papers,
        "summary": {
            "total_exams": len(papers),
            "total_halls": len(halls),
            "halls": halls,
        },
        "notes": [
            "Bring this official Roll No. Slip and University Student ID Card into the Examination Hall.",
            "Possession of cell phones, smartwatches, or programmable electronic devices in the exam hall is strictly prohibited.",
            "Candidate must be seated in their assigned room and desk at least 15 minutes before the exam commences.",
            "Candidates may not leave the examination hall during the examination session.",
            "Borrowing or sharing stationery, calculators, or instruments is prohibited.",
            "All slips are provisional. Candidates with less than 75% course attendance are ineligible; any exam taken despite short attendance will be cancelled.",
        ],
    }
