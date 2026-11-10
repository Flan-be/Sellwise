import logging
import threading
import time
from datetime import datetime, timezone

from bson import ObjectId
from bson.decimal128 import Decimal128
from firebase_admin import firestore
from pymongo.errors import OperationFailure, PyMongoError

from app.deps import db          # also initialises firebase_admin with your key

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("sync")

fs = firestore.client()
tokens = db["_sync_tokens"]      # where each collection's resume point is saved

COLLECTIONS = ["products", "sales", "expenses"]


def clean(v):
    """Turn Mongo-only types into Firestore-friendly ones."""
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


def backfill(name: str):
    """Copy everything that already exists. Safe to re-run: it only overwrites."""
    batch, n = fs.batch(), 0
    for doc in db[name].find():
        batch.set(ref(name, doc["_id"]), to_doc(doc))
        n += 1
        if n % 400 == 0:                     # Firestore batches max out at 500
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

            # Open the stream FIRST, then backfill, so nothing changing during
            # the backfill is missed. Writes are idempotent, so overlap is harmless.
            with db[name].watch(**kwargs) as stream:
                if not saved:
                    backfill(name)
                log.info("%s: watching for changes", name)

                for change in stream:
                    op = change["operationType"]
                    key = change["documentKey"]["_id"]

                    if op == "delete":
                        ref(name, key).delete()
                        log.info("%s: deleted %s", name, key)
                    elif op in ("insert", "update", "replace"):
                        doc = change.get("fullDocument")
                        if doc is None:      # deleted again before we could read it
                            continue
                        ref(name, key).set(to_doc(doc))   # full overwrite, so unset fields vanish
                        log.info("%s: %s %s", name, op, key)

                    tokens.update_one({"_id": name},
                                      {"$set": {"token": change["_id"]}}, upsert=True)

        except OperationFailure as e:
            # resume point is too old (worker was off for a long time): start fresh
            log.warning("%s: can't resume (%s). Re-syncing from scratch.", name, e)
            tokens.delete_one({"_id": name})
        except PyMongoError as e:
            log.warning("%s: Mongo error: %s. Retrying in 5s.", name, e)
            time.sleep(5)
        except Exception as e:
            log.exception("%s: unexpected error: %s. Retrying in 5s.", name, e)
            time.sleep(5)


if __name__ == "__main__":
    threads = [threading.Thread(target=watch, args=(n,), daemon=True) for n in COLLECTIONS]
    for t in threads:
        t.start()
    for t in threads:
        t.join()