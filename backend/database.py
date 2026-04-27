import json
from pathlib import Path
from typing import Any, List

from models import Project, Message, ProjectSlots, VocabularyItem

projects_db: List[Project] = []
interviews_db: dict[int, List[Message]] = {}
slots_db: dict[int, ProjectSlots] = {}
vocabulary_db: dict[int, List[VocabularyItem]] = {}
roleplay_db: dict[int, list[dict]] = {}

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
        "projects": [_project_to_dict(project) for project in projects_db],
        "interviews": {
            str(project_id): [_message_to_dict(message) for message in messages]
            for project_id, messages in interviews_db.items()
        },
        "slots": {
            str(project_id): _slots_to_dict(slots)
            for project_id, slots in slots_db.items()
        },
        "vocabulary": {
            str(project_id): [_vocabulary_item_to_dict(item) for item in items]
            for project_id, items in vocabulary_db.items()
        },
        "roleplay": {
            str(project_id): history
            for project_id, history in roleplay_db.items()
        },
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
        return

    with DATA_FILE.open("r", encoding="utf-8") as file:
        raw_state: dict[str, Any] = json.load(file)

    for project_data in raw_state.get("projects", []):
        projects_db.append(Project(**project_data))

    for project_id, messages in raw_state.get("interviews", {}).items():
        interviews_db[int(project_id)] = [Message(**message) for message in messages]

    for project_id, slots in raw_state.get("slots", {}).items():
        slots_db[int(project_id)] = ProjectSlots(**slots)

    for project_id, items in raw_state.get("vocabulary", {}).items():
        vocabulary_db[int(project_id)] = [VocabularyItem(**item) for item in items]

    for project_id, history in raw_state.get("roleplay", {}).items():
        roleplay_db[int(project_id)] = history


load_data()