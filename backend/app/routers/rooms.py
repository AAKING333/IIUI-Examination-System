"""Rooms and examination hall management routes."""
from fastapi import APIRouter, HTTPException, status

from data import store
from app.schemas.room import RoomIn
from app.state import seating_cache

router = APIRouter(prefix="/api/rooms", tags=["Rooms Management"])


def _with_totals(room: dict) -> dict:
    cap = int(room.get("capacity", 0) or 0)
    reserve = int(room.get("reserve_capacity", 0) or 0)
    enriched = dict(room)
    enriched["reserve_capacity"] = reserve
    enriched["total_usable_seats"] = cap + reserve
    return enriched


@router.get("")
def list_rooms():
    return [_with_totals(r) for r in store.get_rooms()]


@router.get("/{room_id}")
def get_room(room_id: str):
    room = store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")
    return _with_totals(room)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_room(room: RoomIn):
    try:
        new_room = store.add_room(
            room.name,
            room.rows,
            room.columns,
            room.capacity,
            room.room_type,
            room.department,
            room.reserve_capacity,
            room.invigilators_required,
        )
        seating_cache.clear()
        return _with_totals(new_room)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{room_id}")
def update_room(room_id: str, room: RoomIn):
    try:
        updated = store.update_room(
            room_id,
            room.name,
            room.rows,
            room.columns,
            room.capacity,
            room.room_type,
            room.department,
            room.reserve_capacity,
            room.invigilators_required,
        )
        if not updated:
            raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")
        seating_cache.clear()
        return _with_totals(updated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{room_id}")
def delete_room(room_id: str):
    if len(store.get_rooms()) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only remaining examination room.")
    deleted = store.delete_room(room_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")
    seating_cache.clear()
    return {"message": f"Room '{room_id}' deleted successfully."}
