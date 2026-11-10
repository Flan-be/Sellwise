import os
from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import CollectionInvalid

load_dotenv()
db = MongoClient(os.environ["MONGO_URI"])["sellwise"]

int_ = {"bsonType": ["int", "long"], "minimum": 0}
oid = {"bsonType": "objectId"}
date = {"bsonType": "date"}
str_ = {"bsonType": "string"}

SCHEMAS = {
    "customers": {
        "required": ["owner_uid", "name", "created_at"],
        "properties": {
            "owner_uid": str_, "name": str_, "contact_number": str_,
            "address": str_, "created_at": date,
        },
    },
    "products": {
        "required": ["owner_uid", "name", "selling_price_centavos",
                     "stock_quantity", "reorder_level", "is_active", "created_at"],
        "properties": {
            "owner_uid": str_, "name": str_, "sku": str_, "category": str_,
            "description": str_,
            "selling_price_centavos": int_,
            "costs": {
                "bsonType": "object",
                "properties": {
                    "material_centavos": int_,
                    "packaging_centavos": int_,
                    "other_centavos": int_,
                },
            },
            "stock_quantity": {"bsonType": ["int", "long"]},
            "reorder_level": int_,
            "is_active": {"bsonType": "bool"},
            "created_at": date,
        },
    },
    "sales": {
        "required": ["owner_uid", "sale_date", "payment_method",
                     "status", "items", "total_centavos"],
        "properties": {
            "owner_uid": str_, "customer_id": {"bsonType": ["objectId", "null"]},
            "sale_date": date,
            "payment_method": {"enum": ["cash", "gcash", "card", "other"]},
            "status": {"enum": ["completed", "voided"]},
            "total_centavos": int_,
            "items": {
                "bsonType": "array", "minItems": 1,
                "items": {
                    "bsonType": "object",
                    "required": ["product_id", "name", "quantity",
                                 "unit_price_centavos", "unit_cost_centavos"],
                    "properties": {
                        "product_id": oid, "name": str_,
                        "quantity": {"bsonType": ["int", "long"], "minimum": 1},
                        "unit_price_centavos": int_,
                        "unit_cost_centavos": int_,
                    },
                },
            },
        },
    },
    "inventory_movements": {
        "required": ["owner_uid", "product_id", "type", "quantity", "created_at"],
        "properties": {
            "owner_uid": str_, "product_id": oid,
            "type": {"enum": ["restock", "sale", "adjustment", "damage", "void"]},
            "quantity": {"bsonType": ["int", "long"]},  # negative = stock out
            "reference_sale_id": {"bsonType": ["objectId", "null"]},
            "notes": str_, "created_at": date,
        },
    },
    "expenses": {
        "required": ["owner_uid", "name", "amount_centavos", "expense_date"],
        "properties": {
            "owner_uid": str_, "name": str_, "category": str_,
            "amount_centavos": int_, "expense_date": date,
            "product_id": {"bsonType": ["objectId", "null"]},
            "notes": str_,
        },
    },
}

INDEXES = {
    "customers": [([("owner_uid", ASCENDING), ("name", ASCENDING)], {})],
    "products": [
        ([("owner_uid", ASCENDING), ("sku", ASCENDING)],
         {"unique": True, "partialFilterExpression": {"sku": {"$type": "string"}}}),
        ([("owner_uid", ASCENDING), ("is_active", ASCENDING)], {}),
    ],
    "sales": [([("owner_uid", ASCENDING), ("sale_date", DESCENDING)], {})],
    "inventory_movements": [
        ([("owner_uid", ASCENDING), ("product_id", ASCENDING), ("created_at", DESCENDING)], {}),
    ],
    "expenses": [([("owner_uid", ASCENDING), ("expense_date", DESCENDING)], {})],
}

for name, schema in SCHEMAS.items():
    validator = {"$jsonSchema": {"bsonType": "object", **schema}}
    try:
        db.create_collection(name, validator=validator)
        print("created", name)
    except CollectionInvalid:  # already exists, so update its rules
        db.command("collMod", name, validator=validator)
        print("updated", name)

    for keys, opts in INDEXES.get(name, []):
        db[name].create_index(keys, **opts)

print("done")