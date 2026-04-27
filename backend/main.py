from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import Project, Message, NewMessage, ProjectSlots
from database import projects_db, interviews_db, slots_db, vocabulary_db, roleplay_db, save_data
from services.interview import get_next_question, update_slots
from services.llm import generate_roleplay_opening, continue_roleplay, evaluate_learning_answer_llm
from services.vocabulary import extract_vocabulary_from_slots, expand_vocabulary_item, rebuild_vocabulary_item

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Sprachtrainer Backend läuft"}


@app.get("/projects")
def get_projects():
    return projects_db


@app.post("/projects")
def create_project(project: Project):
    projects_db.append(project)
    save_data()

    return {
        "message": "Projekt erfolgreich angelegt",
        "project": project
    }

@app.get("/projects/{project_id}/slots")
def get_project_slots(project_id: int):
    if project_id not in slots_db:
        raise HTTPException(status_code=404, detail="Noch keine Slots vorhanden")
    return slots_db[project_id]


@app.get("/projects/{project_id}/vocabulary")
def get_project_vocabulary(project_id: int):
    project = next((p for p in projects_db if p.id == project_id), None)
    target_language = project.target_language if project else None
    source_language = getattr(project, "source_language", None) if project else None

    if not source_language:
        source_language = "Deutsch"

    if project_id not in vocabulary_db:
        return {
            "target_language": target_language,
            "source_language": source_language,
            "vocabulary": [],
        }

    return {
        "target_language": target_language,
        "source_language": source_language,
        "vocabulary": vocabulary_db[project_id],
    }

@app.get("/projects/{project_id}/vocabulary/by-source")
def get_project_vocabulary_by_source(project_id: int):
    if project_id not in vocabulary_db:
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

    for item in vocabulary_db[project_id]:
        source = getattr(item, "source", "description") or "description"
        if source not in grouped:
            grouped[source] = []
        grouped[source].append(item.word)

    return grouped

@app.post("/projects/{project_id}/vocabulary/{word}/expand")
def expand_vocabulary_word(project_id: int, word: str):
    item = expand_vocabulary_item(project_id, word)

    if not item:
        raise HTTPException(status_code=404, detail="Wort nicht gefunden")

    save_data()
    return item


# Add rebuild route directly after expand route
@app.post("/projects/{project_id}/vocabulary/{word}/rebuild")
def rebuild_vocabulary_word(project_id: int, word: str):
    item = rebuild_vocabulary_item(project_id, word)

    if not item:
        raise HTTPException(status_code=404, detail="Wort nicht gefunden")

    save_data()
    return item

@app.post("/projects/{project_id}/interview/start")
def start_interview(project_id: int):
    project = next((p for p in projects_db if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    user_name = project.user_name if project else "!"

    interviews_db[project_id] = [
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

    slots_db[project_id] = slots
    vocabulary_db[project_id] = []
    roleplay_db[project_id] = []

    extract_vocabulary_from_slots(project_id)
    save_data()

    return {
        "message": "Interview gestartet",
        "interview": interviews_db[project_id]
    }


@app.get("/projects/{project_id}/interview")
def get_interview(project_id: int):
    if project_id not in interviews_db:
        raise HTTPException(status_code=404, detail="Interview nicht gefunden")
    return interviews_db[project_id]


@app.post("/projects/{project_id}/interview/message")
def add_interview_message(project_id: int, new_message: NewMessage):
    if project_id not in interviews_db:
        raise HTTPException(status_code=404, detail="Interview nicht gefunden")

    user_message = Message(role="user", text=new_message.text)
    interviews_db[project_id].append(user_message)

    update_slots(project_id, new_message.text)

    # Wortschatz nach jeder neuen Interview-Antwort aktualisieren
    extract_vocabulary_from_slots(project_id)

    assistant_message = Message(
        role="assistant",
        text=get_next_question(project_id)
    )
    interviews_db[project_id].append(assistant_message)
    save_data()

    return {
        "message": "Nachricht gespeichert",
        "interview": interviews_db[project_id],
        "slots": slots_db[project_id],
        "vocabulary": vocabulary_db[project_id]
    }


@app.post("/projects/{project_id}/roleplay/start")
def start_roleplay(project_id: int):
    project = next((p for p in projects_db if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    vocabulary = vocabulary_db.get(project_id, [])

    slots = slots_db.get(project_id, ProjectSlots())

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

    roleplay_db[project_id] = [
        {"role": "system", "text": roleplay["scenario"]},
        {"role": "trainer", "text": roleplay["trainer_line"]},
    ]
    save_data()

    return {
        "scenario": roleplay["scenario"],
        "history": roleplay_db[project_id],
    }

@app.post("/projects/{project_id}/roleplay/message")
def send_roleplay_message(project_id: int, new_message: NewMessage):

    project = next((p for p in projects_db if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    if project_id not in roleplay_db:
        raise HTTPException(status_code=404, detail="Kein Rollenspiel gestartet")

    vocabulary = vocabulary_db.get(project_id, [])
    history = roleplay_db[project_id]

    history.append({"role": "learner", "text": new_message.text})

    slots = slots_db.get(project_id, ProjectSlots())

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
    roleplay_db[project_id] = history
    save_data()

    return {
        "history": history
    }


# New route: Evaluate learning answer
@app.post("/projects/{project_id}/learning/evaluate")
def evaluate_learning_answer(project_id: int, payload: dict):
    project = next((p for p in projects_db if p.id == project_id), None)

    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    slots = slots_db.get(project_id, ProjectSlots())

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