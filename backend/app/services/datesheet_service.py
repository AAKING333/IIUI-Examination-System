"""Datesheet Generation and Export Service."""
import datetime
import logging
from fastapi import HTTPException

from data import store
from database import database
from datesheet import generate_datesheet
from exports import datesheet_xlsx, datesheet_pdf
from app.state import datesheet_state, seating_cache
from app.services.seating_service import sync_datesheet_rooms, resolve_seating_plan

logger = logging.getLogger("exam_portal.datesheet_service")


def generate_datesheet_schedule(lab_mode: str = "separate_days") -> dict:
    """Solves timetable CSP, enriches rooms from seating solver, and publishes new datesheet."""
    global datesheet_state
    slots = store.get_time_slots()
    if not slots:
        raise HTTPException(status_code=400, detail="Validation Error: Cannot generate datesheet: No time slots defined.")
    if not store.get_courses():
        raise HTTPException(status_code=400, detail="Validation Error: Cannot generate datesheet: No courses defined.")
    if not store.get_rooms():
        raise HTTPException(status_code=400, detail="Validation Error: Cannot generate datesheet: No examination rooms configured in the system.")

    schedulable_courses = [
        course for course in store.get_courses()
        if course.get("eligible_roll_numbers")
    ]
    if not schedulable_courses:
        raise HTTPException(
            status_code=400,
            detail="Cannot generate datesheet: all courses have zero enrolled students.",
        )
    result = generate_datesheet(slots, store.get_courses(), store.get_rooms(), lab_mode=lab_mode)

    if result.get("unplaced") and len(result["unplaced"]) > 0:
        unplaced_count = len(result["unplaced"])
        unplaced_codes = [u["course_code"] for u in result["unplaced"]]
        sample_codes = ", ".join(unplaced_codes[:5])
        if unplaced_count > 5:
            sample_codes += f" (+{unplaced_count - 5} more)"

        diagnostics = "; ".join(
            f"{item['course_code']} ({item['students']} students): {item['reason']}"
            for item in result["unplaced"]
        )
        logger.error(
            "Datesheet generation blocked by %d unplaced paper(s) [%s]: %s",
            unplaced_count,
            sample_codes,
            diagnostics,
        )
        hint = " Add more dates in Exam Slots and generate again."
        if any(item.get("is_lab") for item in result["unplaced"]):
            hint = " Add more dates, or regenerate slots with Lab Days set to Concurrent so labs share regular paper days."
        raise HTTPException(
            status_code=422,
            detail=(
                f"Datesheet not generated: {unplaced_count} paper(s) could not fit into the current "
                f"{len({slot['date'] for slot in slots})} exam days."
                + hint
            ),
        )

    sync_datesheet_rooms(result)
    new_state = database.publish_datesheet(result, datetime.datetime.now().isoformat())
    datesheet_state.clear()
    datesheet_state.update(new_state)
    seating_cache.clear()
    # A new datesheet invalidates every existing invigilation assignment.
    database.clear_invigilation_duties()
    # Build the roster straight from the freshly generated seating plans so the
    # invigilators are ready with the seating sheet. Manual duties are kept on
    # later recalculations.
    try:
        from app.services.invigilation_service import generate_duties

        roster = generate_duties(preserve_manual=True)
        logger.info(
            "Invigilation roster auto-generated: %s new duty assignment(s), %s manual kept.",
            roster.get("generated_count", 0), roster.get("preserved_manual_count", 0),
        )
    except Exception:
        logger.exception("Automatic invigilation roster generation failed; use Recalculate Roster.")
    logger.info(
        "Datesheet successfully generated: all %d papers scheduled.",
        len(datesheet_state["datesheet"]),
    )
    return datesheet_state


def get_datesheet_with_synced_rooms() -> dict:
    """Returns active datesheet state with real-time synced room allocations."""
    sync_datesheet_rooms(datesheet_state)
    return datesheet_state


def compile_datesheet_xlsx_buffer():
    """Compiles datesheet Excel workbook buffer with official IIUI format."""
    if not datesheet_state.get("datesheet"):
        raise HTTPException(status_code=404, detail="Generate the datesheet first before exporting.")
    if datesheet_state.get("status") == "SUPERSEDED":
        raise HTTPException(status_code=409, detail="Export is disabled for a superseded datesheet.")
    seating_by_slot = {}
    for entry in datesheet_state["datesheet"]:
        sid = entry["slot_id"]
        if sid not in seating_by_slot:
            try:
                seating_by_slot[sid] = resolve_seating_plan(sid)
            except HTTPException:
                seating_by_slot[sid] = {}
    return datesheet_xlsx(
        datesheet_state["datesheet"],
        seating_by_slot,
        version=datesheet_state.get("version", "1.2"),
    )


def compile_datesheet_pdf_buffer():
    """Compiles datesheet PDF document buffer."""
    if not datesheet_state.get("datesheet"):
        raise HTTPException(status_code=404, detail="Generate the datesheet first before exporting.")
    if datesheet_state.get("status") == "SUPERSEDED":
        raise HTTPException(status_code=409, detail="Export is disabled for a superseded datesheet.")
    seating_by_slot = {}
    for entry in datesheet_state["datesheet"]:
        sid = entry["slot_id"]
        if sid not in seating_by_slot:
            try:
                seating_by_slot[sid] = resolve_seating_plan(sid)
            except HTTPException:
                seating_by_slot[sid] = {}
    return datesheet_pdf(
        datesheet_state["datesheet"],
        seating_by_slot,
        version=datesheet_state.get("version", "1.2"),
    )
