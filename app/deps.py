import os
from dotenv import load_dotenv
load_dotenv()  # must run before anything reads os.environ

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Header, HTTPException
from pymongo import MongoClient

firebase_admin.initialize_app(credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]))

client = MongoClient(os.environ["MONGO_URI"])
db = client["sellwise"]   # must match the name in db_setup.py


def current_user(authorization: str = Header(...)):
    try:
        return auth.verify_id_token(authorization.removeprefix("Bearer "), clock_skew_seconds=10)
    except Exception as e:
        print("TOKEN ERROR:", repr(e))
        raise HTTPException(status_code=401, detail="Invalid token")