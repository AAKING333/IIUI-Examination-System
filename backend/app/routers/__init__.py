"""Router registry for FastAPI application."""
from app.routers.system import router as system_router
from app.routers.rooms import router as rooms_router
from app.routers.courses import router as courses_router
from app.routers.assignments import router as assignments_router
from app.routers.students import router as students_router
from app.routers.time_slots import router as time_slots_router
from app.routers.datesheet import router as datesheet_router
from app.routers.seating import router as seating_router
from app.routers.invigilation import router as invigilation_router
from app.routers.umc import router as umc_router
from app.routers.verifications import router as verifications_router
from app.routers.roll_slips import router as roll_slips_router

ALL_ROUTERS = [
    system_router,
    rooms_router,
    courses_router,
    assignments_router,
    students_router,
    time_slots_router,
    datesheet_router,
    seating_router,
    invigilation_router,
    umc_router,
    verifications_router,
    roll_slips_router,
]

__all__ = ["ALL_ROUTERS"]
