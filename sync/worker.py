import logging
import threading
import time
from datetime import datetime, timezone

from bson import ObjectId
from bson.decimal128 import Decimal128
from firebase_admin import firestore
from pymongo.errors import OperationFailure, PyMongoError

from app.deps import db          # also initialises firebase_admin with your key
from app.settings import get_settings
from app.summary import build_summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("sync")

fs = firestore.client()
tokens = db["_sync_tokens"]

COLLECTIONS = ["products", "sales", "expenses", "inventory_movements"]
FULL_REFRESH_SECONDS = 300       # also catches settings changes and day rollover

dirty: set[str] = set()
lock = threading.Lock()


def clean(v):
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, Decimal128):
        return float(v.to_decimal())
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v


def to_doc(doc: dict) -> dict:
    out = clean({k: v for k, v in doc.items() if k != "_id"})
    out["mongo_id"] = str(doc["_id"])
    return out


def ref(name: str, _id):
    return fs.collection(name).document(str(_id))


# ---------- summary documents ----------
def mark(uid):
    if uid:
        with lock:
            dirty.add(uid)


def mark_all():
    """Used for deletes: the event doesn't say whose document it was."""
    owners = db.products.distinct("owner_uid")
    with lock:
        dirty.update(owners)


def refresh_summary(uid: str):
    try:
        data = build_summary(uid, get_settings(uid)["tz"])
        fs.collection("summaries").document(uid).set(
            {**data, "updated_at": firestore.SERVER_TIMESTAMP})
        log.info("summary: refreshed %s", uid)
    except Exception:
        log.exception("summary: failed for %s", uid)


def summary_loop():
    mark_all()                    # build everyone's summary right at startup
    last_full = time.time()
    while True:
        time.sleep(2)
        if time.time() - last_full > FULL_REFRESH_SECONDS:
            mark_all()
            last_full = time.time()
        with lock:
            batch = list(dirty)
            dirty.clear()
        for uid in batch:
            refresh_summary(uid)


# ---------- collection mirroring ----------
def backfill(name: str):
    batch, n = fs.batch(), 0
    for doc in db[name].find():
        batch.set(ref(name, doc["_id"]), to_doc(doc))
        n += 1
        if n % 400 == 0:
            batch.commit()
            batch = fs.batch()
    batch.commit()
    log.info("%s: backfilled %d documents", name, n)


def watch(name: str):
    while True:
        try:
            saved = tokens.find_one({"_id": name})
            kwargs = {"full_document": "updateLookup"}
            if saved:
                kwargs["resume_after"] = saved["token"]

            with db[name].watch(**kwargs) as stream:
                if not saved:
                    backfill(name)
                log.info("%s: watching for changes", name)

                for change in stream:
                    op = change["operationType"]
                    key = change["documentKey"]["_id"]

                    if op == "delete":
                        ref(name, key).delete()
                        mark_all()
                        log.info("%s: deleted %s", name, key)
                    elif op in ("insert", "update", "replace"):
                        doc = change.get("fullDocument")
                        if doc is None:
                            continue
                        ref(name, key).set(to_doc(doc))
                        mark(doc.get("owner_uid"))
                        log.info("%s: %s %s", name, op, key)

                    tokens.update_one({"_id": name},
                                      {"$set": {"token": change["_id"]}}, upsert=True)

        except OperationFailure as e:
            if e.code in (280, 286):     # resume point too old: start fresh
                log.warning("%s: can't resume (%s). Re-syncing.", name, e)
                tokens.delete_one({"_id": name})
            else:
                log.error("%s: Mongo refused the change stream: %s", name, e)
            time.sleep(5)
        except PyMongoError as e:
            log.warning("%s: Mongo error: %s. Retrying in 5s.", name, e)
            time.sleep(5)
        except Exception as e:
            log.exception("%s: unexpected error: %s. Retrying in 5s.", name, e)
            time.sleep(5)


if __name__ == "__main__":
    threads = [threading.Thread(target=watch, args=(n,), daemon=True) for n in COLLECTIONS]
    threads.append(threading.Thread(target=summary_loop, daemon=True))
    for t in threads:
        t.start()
    for t in threads:
        t.join()