from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .deps import db, current_user

router = APIRouter(prefix="/settings", tags=["settings"])

DEFAULTS = {
    "business_name": "",
    "default_reorder_level": 10,
    "soon_days": 7,
    "cover_days": 14,
    "tz": 480,             # minutes east of UTC (Philippines = 480)
}


def get_settings(uid: str) -> dict:
    u = db.users.find_one({"firebase_uid": uid}, {"settings": 1}) or {}
    return {**DEFAULTS, **u.get("settings", {})}


class SettingsIn(BaseModel):
    business_name: str = Field("", max_length=80)
    default_reorder_level: int = Field(10, ge=0, le=100000)
    soon_days: int = Field(7, ge=1, le=60)
    cover_days: int = Field(14, ge=3, le=60)
    tz: int = Field(480, ge=-720, le=840)


@router.get("")
def read_settings(user=Depends(current_user)):
    return get_settings(user["uid"])


@router.put("")
def update_settings(body: SettingsIn, user=Depends(current_user)):
    data = body.model_dump()
    data["business_name"] = data["business_name"].strip()
    db.users.update_one({"firebase_uid": user["uid"]}, {"$set": {"settings": data}}, upsert=True)
    return get_settings(user["uid"])