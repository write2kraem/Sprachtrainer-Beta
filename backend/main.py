import json
from pathlib import Path
from typing import Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from models import Project, Message, NewMessage, ProjectSlots
from database import DEFAULT_USER_ID, ensure_user, projects_db, interviews_db, slots_db, vocabulary_db, roleplay_db, save_data, DATA_DIR, DB_FILE, save_feedback_entry, load_feedback_entries
from services.interview import get_next_question, update_slots
from services.llm import generate_roleplay_opening, continue_roleplay, evaluate_learning_answer_llm
from services.vocabulary import extract_vocabulary_from_slots, expand_vocabulary_item, rebuild_vocabulary_item, normalize_lookup_key, update_vocabulary_learning_state

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sprachtrainer-beta.vercel.app",
        "https://sprachtrainer.peterkraemer.de",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_user_id(request: Request) -> str:
    user_id = request.headers.get("X-User-Id", DEFAULT_USER_ID)
    user_id = user_id.strip() if user_id else DEFAULT_USER_ID
    ensure_user(user_id)
    return user_id





@app.post("/feedback")
def submit_feedback(payload: dict[str, Any], request: Request):
    user_id = get_user_id(request)

    entry = {
        "user_id": user_id,
        **payload,
    }

    saved = save_feedback_entry(entry)

    return {
        "message": "Feedback gespeichert",
        "id": saved.get("id"),
    }



@app.get("/feedback")
def get_feedback(request: Request):
    get_user_id(request)
    return load_feedback_entries()


@app.get("/debug/storage")
def debug_storage(request: Request):
    user_id = get_user_id(request)
    return {
        "user_id": user_id,
        "DATA_DIR": str(DATA_DIR),
        "DB_FILE": str(DB_FILE),
        "db_exists": DB_FILE.exists(),
        "data_dir_exists": DATA_DIR.exists(),
        "known_users": list(projects_db.keys()),
        "project_count_for_user": len(projects_db.get(user_id, [])),
    }

@app.get("/projects")
def get_projects(request: Request):
    user_id = get_user_id(request)
    return projects_db[user_id]


@app.post("/projects")
def create_project(project: Project, request: Request):
    user_id = get_user_id(request)
    projects_db[user_id].append(project)
    save_data()

    return {
        "message": "Projekt erfolgreich angelegt",
        "project": project
    }

@app.get("/projects/{project_id}/slots")
def get_project_slots(project_id: int, request: Request):
    user_id = get_user_id(request)
    if project_id not in slots_db[user_id]:
        raise HTTPException(status_code=404, detail="Noch keine Slots vorhanden")
    return slots_db[user_id][project_id]


@app.get("/projects/{project_id}/vocabulary")
def get_project_vocabulary(project_id: int, request: Request):
    user_id = get_user_id(request)
    project = next((p for p in projects_db[user_id] if p.id == project_id), None)
    target_language = project.target_language if project else None
    source_language = getattr(project, "source_language", None) if project else None

    if not source_language:
        source_language = "Deutsch"

    if project_id not in vocabulary_db[user_id]:
        return {
            "target_language": target_language,
            "source_language": source_language,
            "vocabulary": [],
        }

    return {
        "target_language": target_language,
        "source_language": source_language,
        "vocabulary": vocabulary_db[user_id][project_id],
    }

@app.get("/projects/{project_id}/vocabulary/by-source")
def get_project_vocabulary_by_source(project_id: int, request: Request):
    user_id = get_user_id(request)
    if project_id not in vocabulary_db[user_id]:
        return {
            "base_core": [],
            "description": [],
            "situation_core": [],
        }

    grouped = {
        "base_core": [],
        "description": [],
        "situation_core": [],
    }

    for item in vocabulary_db[user_id][project_id]:
        source = getattr(item, "source", "description") or "description"
        if source not in grouped:
            grouped[source] = []
        grouped[source].append(item.word)

    return grouped

@app.post("/projects/{project_id}/vocabulary/{word}/expand")
def expand_vocabulary_word(project_id: int, word: str, request: Request):
    user_id = get_user_id(request)
    item = expand_vocabulary_item(project_id, word, user_id=user_id)

    if not item:
        raise HTTPException(status_code=404, detail="Wort nicht gefunden")

    save_data()
    return item


# Add rebuild route directly after expand route
@app.post("/projects/{project_id}/vocabulary/{word}/rebuild")
def rebuild_vocabulary_word(project_id: int, word: str, request: Request):
    user_id = get_user_id(request)
    item = rebuild_vocabulary_item(project_id, word, user_id=user_id)

    if not item:
        raise HTTPException(status_code=404, detail="Wort nicht gefunden")

    save_data()
    return item


# New route: Update vocabulary word
@app.post("/projects/{project_id}/vocabulary/{word}/update")
def update_vocabulary_word(project_id: int, word: str, payload: dict[str, Any], request: Request):
    user_id = get_user_id(request)

    if project_id not in vocabulary_db[user_id]:
        raise HTTPException(status_code=404, detail="Wortschatz nicht gefunden")

    target_item = next(
        (
            item
            for item in vocabulary_db[user_id][project_id]
            if normalize_lookup_key(item.word) == normalize_lookup_key(word)
        ),
        None,
    )

    if not target_item:
        raise HTTPException(status_code=404, detail="Wort nicht gefunden")

    new_word = payload.get("word")
    if isinstance(new_word, str) and new_word.strip():
        target_item.word = new_word.strip()

    new_translation = payload.get("translation")
    if isinstance(new_translation, str):
        target_item.translation = new_translation.strip() or None

    new_category = payload.get("category")
    if isinstance(new_category, str) and new_category in {"noun", "verb", "phrase", "other"}:
        target_item.category = new_category

    new_review_status = payload.get("review_status")
    if isinstance(new_review_status, str) and new_review_status in {"new", "approved", "edited", "rejected"}:
        target_item.review_status = new_review_status
    elif any(key in payload for key in ["word", "translation", "category"]):
        target_item.review_status = "edited"

    save_data()
    return target_item


# Add rebuild-all endpoint
@app.post("/projects/{project_id}/vocabulary/rebuild-all")
def rebuild_all_vocabulary_words(project_id: int, request: Request):
    user_id = get_user_id(request)

    if project_id not in vocabulary_db[user_id]:
        raise HTTPException(status_code=404, detail="Wortschatz nicht gefunden")

    reset_count = 0
    for item in vocabulary_db[user_id][project_id]:
        item.translation = None
        item.example_sentence = None
        item.example_sentence_source = None
        item.example_sentence_target = None
        item.dialogue_line_1 = None
        item.dialogue_line_2 = None
        item.sample_answer = None
        item.expanded = False
        reset_count += 1

    save_data()
    return {"status": "ok", "reset_count": reset_count}

@app.post("/projects/{project_id}/interview/start")
def start_interview(project_id: int, request: Request):
    user_id = get_user_id(request)
    project = next((p for p in projects_db[user_id] if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    user_name = project.user_name if project else "!"

    interviews_db[user_id][project_id] = [
        Message(
            role="assistant",
            text=f"Hi {user_name}, erzähl mir doch mal wie einem Freund in mehr als vier Sätzen, "
                 f"was du in deinem Projekt '{project.title}' vorhast."
        )
    ]

    slots = ProjectSlots()

    # Projektkontext sofort vorbelegen, damit Base-Core und Situation-Core
    # schon beim Interviewstart generiert werden können.
    initial_context_parts = [project.title]

    if getattr(project, "focus_topics", None):
        initial_context_parts.append("Themen: " + ", ".join(project.focus_topics))

    slots.context = "\n".join(initial_context_parts)

    slots_db[user_id][project_id] = slots
    vocabulary_db[user_id][project_id] = []
    roleplay_db[user_id][project_id] = []

    extract_vocabulary_from_slots(project_id, user_id=user_id)
    save_data()

    return {
        "message": "Interview gestartet",
        "interview": interviews_db[user_id][project_id]
    }


@app.get("/projects/{project_id}/interview")
def get_interview(project_id: int, request: Request):
    user_id = get_user_id(request)
    if project_id not in interviews_db[user_id]:
        raise HTTPException(status_code=404, detail="Interview nicht gefunden")
    return interviews_db[user_id][project_id]


@app.post("/projects/{project_id}/interview/message")
def add_interview_message(project_id: int, new_message: NewMessage, request: Request):
    user_id = get_user_id(request)
    if project_id not in interviews_db[user_id]:
        raise HTTPException(status_code=404, detail="Interview nicht gefunden")

    user_message = Message(role="user", text=new_message.text)
    interviews_db[user_id][project_id].append(user_message)

    update_slots(project_id, new_message.text, user_id=user_id)

    # Wortschatz nach jeder neuen Interview-Antwort aktualisieren
    extract_vocabulary_from_slots(project_id, user_id=user_id)

    assistant_message = Message(
        role="assistant",
        text=get_next_question(project_id, user_id=user_id)
    )
    interviews_db[user_id][project_id].append(assistant_message)
    save_data()

    return {
        "message": "Nachricht gespeichert",
        "interview": interviews_db[user_id][project_id],
        "slots": slots_db[user_id][project_id],
        "vocabulary": vocabulary_db[user_id][project_id]
    }


@app.post("/projects/{project_id}/roleplay/start")
def start_roleplay(project_id: int, request: Request):
    user_id = get_user_id(request)
    project = next((p for p in projects_db[user_id] if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    vocabulary = vocabulary_db[user_id].get(project_id, [])

    slots = slots_db[user_id].get(project_id, ProjectSlots())

    context_text = ""
    if slots.context:
        context_text += slots.context
    if slots.description:
        context_text += "\n" + slots.description
    if slots.followup_notes:
        context_text += "\n" + slots.followup_notes

    roleplay = generate_roleplay_opening(
        context=context_text,
        target_language=project.target_language,
        vocabulary=vocabulary,
    )

    roleplay_db[user_id][project_id] = [
        {"role": "system", "text": roleplay["scenario"]},
        {"role": "trainer", "text": roleplay["trainer_line"]},
    ]
    save_data()

    return {
        "scenario": roleplay["scenario"],
        "history": roleplay_db[user_id][project_id],
    }

@app.post("/projects/{project_id}/roleplay/message")
def send_roleplay_message(project_id: int, new_message: NewMessage, request: Request):

    user_id = get_user_id(request)

    project = next((p for p in projects_db[user_id] if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    if project_id not in roleplay_db[user_id]:
        raise HTTPException(status_code=404, detail="Kein Rollenspiel gestartet")

    vocabulary = vocabulary_db[user_id].get(project_id, [])
    history = roleplay_db[user_id][project_id]

    history.append({"role": "learner", "text": new_message.text})

    slots = slots_db[user_id].get(project_id, ProjectSlots())

    context_text = ""
    if slots.context:
        context_text += slots.context
    if slots.description:
        context_text += "\n" + slots.description
    if slots.followup_notes:
        context_text += "\n" + slots.followup_notes

    trainer_reply = continue_roleplay(
        context=context_text,
        target_language=project.target_language,
        vocabulary=vocabulary,
        history=history,
        learner_message=new_message.text,
    )

    history.append({"role": "trainer", "text": trainer_reply})
    roleplay_db[user_id][project_id] = history
    save_data()

    return {
        "history": history
    }


# New route: Evaluate learning answer
@app.post("/projects/{project_id}/learning/evaluate")
def evaluate_learning_answer(project_id: int, payload: dict, request: Request):
    user_id = get_user_id(request)
    project = next((p for p in projects_db[user_id] if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    slots = slots_db[user_id].get(project_id, ProjectSlots())

    context_parts = []
    if slots.context:
        context_parts.append(slots.context)
    if slots.description:
        context_parts.append(slots.description)
    if slots.followup_notes:
        context_parts.append(slots.followup_notes)

    context_text = "\n".join(context_parts)

    return evaluate_learning_answer_llm(
        answer=payload.get("answer", ""),
        expected=payload.get("expected", ""),
        context=context_text,
        source_language=getattr(project, "source_language", "Deutsch") or "Deutsch",
        target_language=project.target_language,
        word=payload.get("word"),
        category=payload.get("category"),
        direction=payload.get("direction", "target-first"),
    )


# New endpoint: Update learning state
@app.post("/projects/{project_id}/vocabulary/{word}/learning-state")
def update_learning_state(project_id: int, word: str, payload: dict, request: Request):
    user_id = get_user_id(request)

    result = payload.get("result")
    timestamp = payload.get("timestamp")

    if not isinstance(result, str):
        raise HTTPException(status_code=400, detail="Invalid result")

    item = update_vocabulary_learning_state(
        project_id=project_id,
        word=word,
        result=result,
        timestamp=timestamp,
        user_id=user_id,
    )

    if not item:
        raise HTTPException(status_code=404, detail="Wort nicht gefunden")

    save_data()

    return {
        "status": "ok",
        "word": item.word,
        "mastered": item.mastered,
        "wrong_count": item.wrong_count,
        "last_correct": item.last_correct,
        "last_wrong": item.last_wrong,
    }