"""Shared in-memory execution state and cache management."""
from database import database

# In-memory execution state (slot_id -> seating plan dict, datesheet state)
datesheet_state = database.load_datesheet()
seating_cache = {}


def clear_cache():
    """Clear all cached seating plans."""
    seating_cache.clear()


def pop_cache(slot_id: str):
    """Invalidate cache for a specific slot."""
    seating_cache.pop(slot_id, None)


def supersede_state():
    """Mark datesheet state superseded when master data changes."""
    global datesheet_state
    superseded = database.supersede_datesheet()
    if superseded:
        datesheet_state = superseded
    database.clear_invigilation_duties()
    clear_cache()
    return datesheet_state
