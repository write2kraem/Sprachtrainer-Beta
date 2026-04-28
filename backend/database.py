import json
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

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_FILE = DATA_DIR / "state.json"


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
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as file:
        json.dump(_serialize_state(), file, ensure_ascii=False, indent=2)


def load_data() -> None:
    projects_db.clear()
    interviews_db.clear()
    slots_db.clear()
    vocabulary_db.clear()
    roleplay_db.clear()

    if not DATA_FILE.exists():
        ensure_user(DEFAULT_USER_ID)
        return

    with DATA_FILE.open("r", encoding="utf-8") as file:
        raw_state: dict[str, Any] = json.load(file)

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


load_data()