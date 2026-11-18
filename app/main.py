from datetime import datetime, timezone

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .deps import db, current_user
from .products import router as products_router
from .expenses import router as expenses_router
from .sales import router as sales_router
from .reports import router as reports_router
from .restock import router as restock_router
from .settings import router as settings_router
from .exports import router as exports_router
from .summary import build_summary

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.users.create_index("firebase_uid", unique=True)
for r in (products_router, expenses_router, sales_router, reports_router,
          restock_router, settings_router, exports_router):
    app.include_router(r)


class SyncIn(BaseModel):
    display_name: str | None = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/users/sync")
def sync_user(body: SyncIn, user=Depends(current_user)):
    now = datetime.now(timezone.utc)
    set_fields = {"email": user.get("email"), "last_login": now}
    if body.display_name:
        set_fields["display_name"] = body.display_name
    db.users.update_one(
        {"firebase_uid": user["uid"]},
        {"$set": set_fields,
         "$setOnInsert": {"firebase_uid": user["uid"], "role": "customer", "created_at": now}},
        upsert=True,
    )
    return db.users.find_one({"firebase_uid": user["uid"]}, {"_id": 0})


@app.get("/dashboard/summary")
def summary(tz: int = 0, user=Depends(current_user)):
    return build_summary(user["uid"], tz)