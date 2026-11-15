"""System health, diagnostic information, and state restoration routes."""
import datetime
import logging
from fastapi import APIRouter

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
