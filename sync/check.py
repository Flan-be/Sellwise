from app.deps import db
from firebase_admin import firestore

fs = firestore.client()
fs.collection("_ping").document("test").set({"ok": True})
print("1. Firestore write OK: check for a _ping collection in the console")

with db.products.watch() as stream:
    print("2. Change stream open. Now edit a product on the website...")
    print("3. Got event:", stream.next()["operationType"])