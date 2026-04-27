from models import ProjectSlots
from database import interviews_db, slots_db, projects_db
from services.vocabulary import extract_vocabulary_from_slots, add_vocabulary_from_text
from services.llm import generate_followup_question


def get_project(project_id: int):
    return next((p for p in projects_db if p.id == project_id), None)


def get_next_question(project_id: int) -> str:
    messages = interviews_db[project_id]
    user_messages = [msg for msg in messages if msg.role == "user"]
    user_count = len(user_messages)

    if user_count == 1:
        return (
            "Das klingt interessant. Erzähle mir bitte mehr darüber... "
            "je mehr ich von dir weiß, umso besser passe ich den Wortschatz an dich an."          
        )

    elif user_count == 2:
        return (
            "Was kannst du mir noch darüber erzählen"
        )

    else:
        slots = slots_db.get(project_id, ProjectSlots())

        context = slots.context or ""
        description = slots.description or ""
        followup_notes = slots.followup_notes or ""

        return generate_followup_question(
            context=context,
            description=description,
            followup_notes=followup_notes,
        )


def update_slots(project_id: int, user_text: str) -> None:
    if project_id not in slots_db:
        slots_db[project_id] = ProjectSlots()

    slots = slots_db[project_id]
    messages = interviews_db[project_id]
    user_messages = [msg for msg in messages if msg.role == "user"]
    user_count = len(user_messages)

    if user_count == 1:
        # erste offene Erzählung
        slots.context = user_text
        add_vocabulary_from_text(project_id, user_text)

    elif user_count == 2:
        # zweite offene Vertiefung
        slots.description = user_text
        extract_vocabulary_from_slots(project_id)

    else:
        existing_notes = slots.followup_notes or ""
        if existing_notes:
            slots.followup_notes = existing_notes + "\n" + user_text
        else:
            slots.followup_notes = user_text

        add_vocabulary_from_text(project_id, user_text)

    slots_db[project_id] = slots