"""Application configuration and constants."""
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("exam_portal")

# Invigilation committee markers.
# ECR members are the relief/rotation pool: exactly one ECR teacher is placed
# per exam slot, cycling round-robin across slots (see invigilation service).
# The seed data spells "Musharaf" with one "r"; the policy documents use
# "Musharraf" with two.  "Tariq Sadad"/"Tariq Saddad" are likewise spelling
# variants of the same teacher.  The tuple order is the rotation order
# (Jibran first, then Musharraf, then Tariq Sadad).
ECR_MARKERS = (
    "jibran",
    "musharrafali",
    "musharafali",
    "tariqsadad",
    "tariqsaddad",
)
# Chairman / HOD: exactly one duty — their own exam (HOD "one duty/own exam").
CHAIRMAN_MARKERS = (
    "muhammadnazir",
    "muhammadnazeer",
)
# Most-senior teachers: at most two duties, allotted only when there is a
# dire need (i.e. after all other eligible faculty are already committed).
# Per the faculty attendance list, "Dr. Qaiser Javed" is Dr. Qaisar Javaid
# (Professor) — a different person from Dr. Syed Qaiser Ali Shah, who is a
# separate Assistant Professor and stays in the regular duty pool.
SENIOR_ROLE_MARKERS = (
    "qaisarjavaid",
    "qaiserjaved",
    "muhammadmajid",
)
# Regular senior professors still get morning-slot priority.  Dire-need
# seniors (SENIOR_ROLE_MARKERS) are handled by their role instead.
SENIOR_MARKERS = (
    "muhammadsaqlain",
)
# Teachers on the no-duty list are never allotted routine invigilation duty.
# This is now an admin-managed role rather than a fixed roster default.
NO_DUTY_MARKERS = ()
MIN_EXTRA_DUTIES = 3
MAX_EXTRA_DUTIES = 4
# Dire-need seniors may hold at most two *extra* duties (own-paper
# availability, including split labs, remains mandatory and is exempt).
SENIOR_MAX_EXTRA_DUTIES = 2
# Faculty roles understood by the system.  Admin may re-role any teacher via
# the faculty policy table (roles double as scalable defaults).
FACULTY_ROLES = (
    "regular",   # normal duty pool; cap = MAX_EXTRA_DUTIES (or admin override)
    "ecr",       # relief rotation: one ECR duty per slot, round-robin
    "chairman",  # chairman / HOD: own exam duty only
    "senior",    # most senior: max 2 duties, dire need only
    "visiting",  # visiting faculty: own exam only
    "no_duty",   # never assigned (visits only); admin option
)
DUTY_STATUSES = ("assigned", "confirmed", "completed", "absent")
