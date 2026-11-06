"""
instructor_utils.py
-------------------
Canonical instructor names for the IIUI CS&IT dataset.

The seed data contains a few spelling variants of the same faculty member.
Treating them as different people hides real teacher double-bookings, so all
modules normalise instructor names through this module.
"""

from __future__ import annotations

# Raw spelling -> canonical spelling
INSTRUCTOR_ALIASES = {
    "Dr. Tariq Saddad": "Dr. Tariq Sadad",
    "Dr. M. Adeel": "Dr. Muhammad Adeel",
    "Mr. Ahsan Tanvir": "Mr. Ahsan Tanveer",
}

# Case-insensitive lookup so uploaded data also normalises cleanly.
_ALIAS_LOOKUP = {
    " ".join(raw.lower().split()): canonical
    for raw, canonical in INSTRUCTOR_ALIASES.items()
}


def normalize_instructor(name: str) -> str:
    """Return the canonical instructor name, or the cleaned original."""
    if not name:
        return name
    cleaned = " ".join(name.strip().split())
    return _ALIAS_LOOKUP.get(cleaned.lower(), cleaned)
