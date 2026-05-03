import json
import os
import sqlite3
from pathlib import Path
from typing import Any, List

from models import Project, Message, ProjectSlots, VocabularyItem

DEFAULT_USER_ID = "local-dev-user"

projects_db: dict[str, List[Project]] = {}
interviews_db: dict[str, dict[int, List[Message]]] = {}
slots_db: dict[str, dict[int, ProjectSlots]] = {}
vocabulary_db: dict[str, dict[int, List[VocabularyItem]]] = {}
roleplay_db: dict[str, dict[int, list[dict]]] = {}


def ensure_user(user_id: str) -> None:
    if user_id not in projects_db:
        projects_db[user_id] = []
        interviews_db[user_id] = {}
        slots_db[user_id] = {}
        vocabulary_db[user_id] = {}
        roleplay_db[user_id] = {}

data_dir_env = os.getenv("DATA_DIR")

if data_dir_env:
    DATA_DIR = Path(data_dir_env)
else:
    DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_FILE = DATA_DIR / "state.json"  # legacy migration source only
DB_FILE = DATA_DIR / "sprachtrainer.sqlite3"


def _get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with _get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_state (
                user_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()


def _project_to_dict(project: Project) -> dict:
    return project.model_dump()


def _message_to_dict(message: Message) -> dict:
    return message.model_dump()


def _slots_to_dict(slots: ProjectSlots) -> dict:
    return slots.model_dump()


def _vocabulary_item_to_dict(item: VocabularyItem) -> dict:
    return item.model_dump()


def _serialize_state() -> dict:
    return {
        "users": {
            user_id: {
                "projects": [_project_to_dict(project) for project in projects_db[user_id]],
                "interviews": {
                    str(project_id): [_message_to_dict(message) for message in messages]
                    for project_id, messages in interviews_db[user_id].items()
                },
                "slots": {
                    str(project_id): _slots_to_dict(slots)
                    for project_id, slots in slots_db[user_id].items()
                },
                "vocabulary": {
                    str(project_id): [_vocabulary_item_to_dict(item) for item in items]
                    for project_id, items in vocabulary_db[user_id].items()
                },
                "roleplay": {
                    str(project_id): history
                    for project_id, history in roleplay_db[user_id].items()
                },
            }
            for user_id in projects_db
        }
    }


def save_data() -> None:
    init_db()
    state = _serialize_state()
    users = state.get("users", {})

    with _get_connection() as connection:
        for user_id, user_state in users.items():
            connection.execute(
                """
                INSERT INTO user_state (user_id, state_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (user_id, json.dumps(user_state, ensure_ascii=False)),
            )
        connection.commit()


def _load_sqlite_state() -> dict[str, Any]:
    init_db()
    users: dict[str, Any] = {}

    with _get_connection() as connection:
        rows = connection.execute("SELECT user_id, state_json FROM user_state").fetchall()

    for row in rows:
        try:
            users[row["user_id"]] = json.loads(row["state_json"])
        except json.JSONDecodeError:
            continue

    return {"users": users}


def load_data() -> None:
    projects_db.clear()
    interviews_db.clear()
    slots_db.clear()
    vocabulary_db.clear()
    roleplay_db.clear()

    raw_state = _load_sqlite_state()

    # One-time legacy migration from state.json if SQLite is still empty.
    if not raw_state.get("users") and DATA_FILE.exists():
        with DATA_FILE.open("r", encoding="utf-8") as file:
            raw_state = json.load(file)

    if "users" in raw_state:
        for user_id, user_data in raw_state.get("users", {}).items():
            ensure_user(user_id)

            projects_db[user_id] = [
                Project(**project_data)
                for project_data in user_data.get("projects", [])
            ]

            interviews_db[user_id] = {
                int(project_id): [Message(**message) for message in messages]
                for project_id, messages in user_data.get("interviews", {}).items()
            }

            slots_db[user_id] = {
                int(project_id): ProjectSlots(**slots)
                for project_id, slots in user_data.get("slots", {}).items()
            }

            vocabulary_db[user_id] = {
                int(project_id): [VocabularyItem(**item) for item in items]
                for project_id, items in user_data.get("vocabulary", {}).items()
            }

            roleplay_db[user_id] = {
                int(project_id): history
                for project_id, history in user_data.get("roleplay", {}).items()
            }

        save_data()
        ensure_user(DEFAULT_USER_ID)
        return

    ensure_user(DEFAULT_USER_ID)

    projects_db[DEFAULT_USER_ID] = [
        Project(**project_data)
        for project_data in raw_state.get("projects", [])
    ]

    interviews_db[DEFAULT_USER_ID] = {
        int(project_id): [Message(**message) for message in messages]
        for project_id, messages in raw_state.get("interviews", {}).items()
    }

    slots_db[DEFAULT_USER_ID] = {
        int(project_id): ProjectSlots(**slots)
        for project_id, slots in raw_state.get("slots", {}).items()
    }

    vocabulary_db[DEFAULT_USER_ID] = {
        int(project_id): [VocabularyItem(**item) for item in items]
        for project_id, items in raw_state.get("vocabulary", {}).items()
    }

    roleplay_db[DEFAULT_USER_ID] = {
        int(project_id): history
        for project_id, history in raw_state.get("roleplay", {}).items()
    }


init_db()
load_data()