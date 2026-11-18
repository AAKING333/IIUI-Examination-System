"""System health, diagnostic information, and state restoration routes."""
import datetime
import logging
from fastapi import APIRouter

from collections import defaultdict
from database import database
from data import store
from app.state import datesheet_state, seating_cache

router = APIRouter(prefix="/api", tags=["System & Health"])
logger = logging.getLogger("exam_portal.system")


@router.get("/health")
def get_health():
    """System health check and capacity summary."""
    rooms = store.get_rooms()
    courses = store.get_courses()
    students = store.get_students()
    slots = store.get_time_slots()
    assignments = store.get_instructor_assignments()

    total_capacity = sum(r["capacity"] for r in rooms)
    back_papers = sum(1 for s in students for e in s.get("enrolments", []) if e.get("type") == "back")

    return {
        "status": "healthy",
        "system": "IIUI Examination Management System",
        "environment": "production-ready",
        "timestamp": datetime.datetime.now().isoformat(),
        "students": len(students),
        "courses": len(courses),
        "rooms": len(rooms),
        "instructor_assignments": len(assignments),
        "total_capacity_per_slot": total_capacity,
        "time_slots": len(slots),
        "back_paper_students": back_papers,
        "datesheet_scheduled_count": len(datesheet_state.get("datesheet", [])),
        "datesheet_unplaced_count": len(datesheet_state.get("unplaced", [])),
    }


@router.get("/system/executive-summary")
def get_executive_summary():
    """Day-wise, week-wise, session-wise, and whole-exam metrics executive summary."""
    entries = datesheet_state.get("datesheet", [])
    if not entries:
        from datesheet import generate_datesheet
        try:
            res = generate_datesheet()
            entries = res.get("datesheet", [])
        except Exception:
            entries = []

    duties = database.get_invigilation_duties()
    umcs = database.get_umc_reports()

    # Slot lookups
    all_slots = store.get_time_slots()
    slot_by_id = {s["id"]: s for s in all_slots}

    # Slot metrics
    slot_candidates = defaultdict(int)
    slot_entries_count = defaultdict(int)
    for e in entries:
        sid = e.get("slot_id")
        slot_candidates[sid] += e.get("students", 0)
        slot_entries_count[sid] += 1

    slot_teachers = defaultdict(set)
    for d in duties:
        slot_teachers[d["slot_id"]].add(d["instructor"])

    slot_umcs = defaultdict(int)
    for u in umcs:
        slot_umcs[u["slot_id"]] += 1

    # ECR Incharge assignment per slot
    ECR_MEMBERS = ["Dr. Tariq Sadad", "Mr. Jibran Mir", "Mr. Musharraf"]

    # Session-wise
    session_wise = []
    for s in sorted(all_slots, key=lambda x: (x["date"], x["start_time"])):
        sid = s["id"]
        # Find busy ECRs in slot
        slot_courses = [e for e in entries if e.get("slot_id") == sid]
        busy_teachers = {t.lower() for e in slot_courses for t in ([e.get("instructor")] if e.get("instructor") else [])}
        free_ecrs = [m for m in ECR_MEMBERS if not any(part in m.lower() for part in busy_teachers)]
        s_num = int("".join(c for c in sid if c.isdigit()) or 0)
        ecr_incharge = free_ecrs[s_num % len(free_ecrs)] if free_ecrs else ECR_MEMBERS[0]

        session_wise.append({
            "slot_id": sid,
            "date": s["date"],
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "label": s.get("label", ""),
            "candidates": slot_candidates[sid],
            "papers_count": slot_entries_count[sid],
            "duty_teachers_count": len(slot_teachers[sid]),
            "umc_cases": slot_umcs[sid],
            "ecr_incharge": ecr_incharge,
        })

    # Day-wise
    day_wise_dict = defaultdict(lambda: {
        "candidates": 0, "papers": 0, "teachers": set(), "umcs": 0, "slots": [], "has_lab": False
    })
    for sess in session_wise:
        d = sess["date"]
        rec = day_wise_dict[d]
        rec["candidates"] += sess["candidates"]
        rec["papers"] += sess["papers_count"]
        rec["teachers"].update(slot_teachers[sess["slot_id"]])
        rec["umcs"] += sess["umc_cases"]
        rec["slots"].append(sess["slot_id"])

    for e in entries:
        if e.get("is_lab"):
            day_wise_dict[e.get("date")]["has_lab"] = True

    day_wise = []
    for d in sorted(day_wise_dict.keys()):
        rec = day_wise_dict[d]
        try:
            day_name = datetime.datetime.strptime(d, "%Y-%m-%d").strftime("%A")
        except Exception:
            day_name = ""
        day_wise.append({
            "date": d,
            "day_name": day_name,
            "candidates": rec["candidates"],
            "papers_count": rec["papers"],
            "duty_teachers_count": len(rec["teachers"]),
            "umc_cases": rec["umcs"],
            "sessions_count": len(rec["slots"]),
            "has_lab": rec["has_lab"],
        })

    # Week-wise (chunked by calendar ISO week or sequential 5-day academic weeks)
    week_wise = []
    all_dates = sorted(day_wise_dict.keys())
    # Group every 5 consecutive exam dates into an academic exam week
    week_chunk_size = 5
    for w_idx in range(0, len(all_dates), week_chunk_size):
        chunk_dates = all_dates[w_idx:w_idx + week_chunk_size]
        w_num = (w_idx // week_chunk_size) + 1
        w_candidates = sum(day_wise_dict[d]["candidates"] for d in chunk_dates)
        w_teachers = set().union(*(day_wise_dict[d]["teachers"] for d in chunk_dates))
        w_umcs = sum(day_wise_dict[d]["umcs"] for d in chunk_dates)
        w_papers = sum(day_wise_dict[d]["papers"] for d in chunk_dates)
        week_wise.append({
            "week_label": f"Week {w_num}",
            "dates_range": f"{chunk_dates[0]} to {chunk_dates[-1]}",
            "days_count": len(chunk_dates),
            "candidates": w_candidates,
            "papers_count": w_papers,
            "duty_teachers_count": len(w_teachers),
            "umc_cases": w_umcs,
        })

    # Whole-exam
    total_candidates = sum(d["candidates"] for d in day_wise)
    all_duty_teachers = set().union(*(day_wise_dict[d]["teachers"] for d in day_wise_dict))
    total_umcs = sum(d["umc_cases"] for d in day_wise)

    return {
        "status": "success",
        "whole_exam": {
            "total_candidates": total_candidates,
            "total_papers": len(entries),
            "total_duty_teachers": len(all_duty_teachers),
            "total_umc_cases": total_umcs,
            "total_exam_days": len(day_wise),
            "total_sessions": len(session_wise),
        },
        "week_wise": week_wise,
        "day_wise": day_wise,
        "session_wise": session_wise,
    }


@router.post("/reset-data")
def reset_system_data():
    """Restores database to initial seed state."""
    global datesheet_state
    store.reset_to_seed()
    datesheet_state.clear()
    datesheet_state.update({"datesheet": [], "unplaced": [], "total_capacity_per_slot": 0})
    seating_cache.clear()
    logger.info("System state restored to factory seed data.")
    return {"message": "Data restored to initial factory seed state successfully."}
