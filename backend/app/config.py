"""Application configuration and constants."""
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("exam_portal")

# Invigilation committee markers
ECR_MARKERS = ("jibranmir", "musharrafali", "imransaeed")
SENIOR_MARKERS = (
    "qaisarjavaid", "muhammadmajid", "muhammadnazir",
    "muhammadsaqlain",
)
MAX_EXTRA_DUTIES = 4
