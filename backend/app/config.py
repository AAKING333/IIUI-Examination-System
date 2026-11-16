"""Application configuration and constants."""
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("exam_portal")

# Invigilation committee markers.
# The seed data spells "Musharaf" with one "r"; the policy documents use
# "Musharraf" with two.  Both spellings must map to the same exempt ECR member.
ECR_MARKERS = (
    "jibranmir",
    "musharrafali",
    "musharafali",
    "imransaeed",
)
SENIOR_MARKERS = (
    "qaisarjavaid", "muhammadmajid", "muhammadnazir",
    "muhammadsaqlain",
)
MIN_EXTRA_DUTIES = 3
MAX_EXTRA_DUTIES = 4
DUTY_STATUSES = ("assigned", "confirmed", "completed", "absent")
