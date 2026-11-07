"""Same transactional contract for Firestore and isolated local development."""

from copy import deepcopy
from threading import RLock


class MemoryStore:
    def __init__(self):
        self.docs = {}
        self.lock = RLock()

    def get(self, path):
        with self.lock:
            return deepcopy(self.docs.get(path))

    def set(self, path, value):
        self.docs[path] = deepcopy(value)

    def delete(self, path):
        self.docs.pop(path, None)

    def scan(self, collection):
        with self.lock:
            return [(k, deepcopy(v)) for k, v in self.docs.items()
                    if k.startswith(collection + "/") and k.count("/") == collection.count("/") + 1]

    def atomic(self, callback):
        with self.lock:
            before = deepcopy(self.docs)
            try:
                return callback(self)
            except Exception:
                self.docs = before
                raise

    def list(self, collection, limit=50, before=None, member=None):
        with self.lock:
            items = [
                deepcopy(v)
                for k, v in self.docs.items()
                if k.startswith(collection + "/") and k.count("/") == collection.count("/") + 1
            ]
        if member:
            items = [x for x in items if member in x.get("member_ids", [])]
        if before:
            items = [x for x in items if x["id"] < before]
        return sorted(items, key=lambda x: x["id"], reverse=True)[:limit]


class FirestoreStore:
    def __init__(self, project):
        from google.cloud import firestore

        self.client = firestore.Client(project=project)

    def get(self, path):
        return self.client.document(path).get().to_dict()

    def scan(self, collection):
        return [(s.reference.path, s.to_dict()) for s in self.client.collection(collection).stream()]

    def atomic(self, callback):
        from google.cloud import firestore

        @firestore.transactional
        def run(transaction):
            return callback(FirestoreTransaction(self.client, transaction))

        return run(self.client.transaction())

    def list(self, collection, limit=50, before=None, member=None):
        from google.cloud.firestore_v1.base_query import FieldFilter

        query = self.client.collection(collection)
        if member:
            query = query.where(filter=FieldFilter("member_ids", "array_contains", member))
        if before:
            query = query.where(filter=FieldFilter("id", "<", before))
        query = query.order_by("id", direction="DESCENDING").limit(limit)
        return [s.to_dict() for s in query.stream()]


class FirestoreTransaction:
    def __init__(self, client, transaction):
        self.client, self.transaction = client, transaction

    def get(self, path):
        return self.client.document(path).get(transaction=self.transaction).to_dict()

    def set(self, path, value):
        self.transaction.set(self.client.document(path), value)

    def delete(self, path):
        self.transaction.delete(self.client.document(path))
