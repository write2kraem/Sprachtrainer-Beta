import re
from typing import List, Optional

from base_core import BASE_CORE
from models import VocabularyItem
from database import DEFAULT_USER_ID, ensure_user, slots_db, vocabulary_db, projects_db
from services.llm import (
    extract_vocabulary_llm,
    generate_situation_core,
    generate_example_sentence,
    generate_mini_dialogue,
    translate_vocabulary_item,
    generate_sample_answer,
)

STOPWORDS = {
    "ich", "du", "er", "sie", "wir", "ihr", "sie",
    "der", "die", "das", "ein", "eine", "einer",
    "und", "oder", "aber", "dass", "weil", "wenn",
    "mit", "ohne", "für", "von", "zu", "zum", "zur",
    "im", "in", "am", "an", "auf", "bei", "über", "unter",
    "es", "ist", "sind", "war", "waren", "bin", "bist",
    "hat", "haben", "als", "auch", "noch", "schon",
}

FOUNDATION_TARGET = 200


def extract_words(text: str) -> List[str]:
    text = text.lower()
    words = re.findall(r"\b[a-zA-ZäöüÄÖÜß]+\b", text)

    filtered_words = []
    for word in words:
        if word not in STOPWORDS and len(word) > 2:
            filtered_words.append(word)

    unique_words = list(dict.fromkeys(filtered_words))
    return unique_words


def normalize_word(word: str) -> str:
    return re.sub(r"\s+", " ", word.strip())


def normalize_lookup_key(word: str) -> str:
    return normalize_word(word).lower()





def is_valid_word_or_phrase(word: str) -> bool:
    if not word:
        return False

    cleaned = word.strip().lower()

    # einzelne Stopwörter nicht zulassen
    if cleaned in STOPWORDS:
        return False

    # sehr kurze Einzelwörter raus
    if " " not in cleaned and len(cleaned) < 3:
        return False

    return True


def sort_vocabulary_items(items: List[VocabularyItem]) -> List[VocabularyItem]:
    def sort_key(item: VocabularyItem):
        # persönliche Wörter zuerst, Grundwortschatz später
        source_priority_map = {
            "situation_core": 0,
            "description": 1,
            "base_core": 2,
        }
        source_priority = source_priority_map.get(item.source, 1)
        return (source_priority, normalize_lookup_key(item.word))

    return sorted(items, key=sort_key)


def get_usable_vocab_count(project_id: int, user_id: str = DEFAULT_USER_ID) -> int:
    ensure_user(user_id)

    if project_id not in vocabulary_db[user_id]:
        return 0

    return sum(
        1
        for item in vocabulary_db[user_id][project_id]
        if item.translation and item.translation.strip()
    )


def is_foundation_phase(project_id: int, user_id: str = DEFAULT_USER_ID) -> bool:
    return get_usable_vocab_count(project_id, user_id=user_id) < FOUNDATION_TARGET


def expand_vocabulary_item(project_id: int, word: str, user_id: str = DEFAULT_USER_ID) -> Optional[VocabularyItem]:
    ensure_user(user_id)

    if project_id not in vocabulary_db[user_id]:
        return None

    items = vocabulary_db[user_id][project_id]
    target_item = next((item for item in items if normalize_lookup_key(item.word) == normalize_lookup_key(word)), None)

    if not target_item:
        return None

    if (
        target_item.expanded
        and target_item.translation
        and target_item.translation.strip()
        and normalize_lookup_key(target_item.translation) != normalize_lookup_key(target_item.word)
    ):
        return target_item

    slots = slots_db[user_id].get(project_id)
    if not slots:
        return target_item

    combined_text = ""
    if slots.context:
        combined_text += slots.context
    if slots.description:
        if combined_text:
            combined_text += "\n"
        combined_text += slots.description
    if slots.followup_notes:
        if combined_text:
            combined_text += "\n"
        combined_text += slots.followup_notes

    foundation_phase = is_foundation_phase(project_id, user_id=user_id)

    project = next((p for p in projects_db[user_id] if p.id == project_id), None)
    target_language = project.target_language if project else "Spanisch"
    source_language = getattr(project, "source_language", None) if project else None
    if not source_language:
        source_language = "Deutsch"

    translation = translate_vocabulary_item(
        word=target_item.word,
        target_language=target_language,
        context=combined_text,
    )

    if not translation or normalize_lookup_key(translation) == normalize_lookup_key(target_item.word):
        target_item.translation = None
    else:
        target_item.translation = translation

    if not target_item.translation:
        target_item.example_sentence = None
        target_item.example_sentence_source = None
        target_item.example_sentence_target = None
        target_item.dialogue_line_1 = None
        target_item.dialogue_line_2 = None
        target_item.sample_answer = None
        target_item.expanded = True
        return target_item

    example_sentence_target = generate_example_sentence(
        word=target_item.translation,
        category=target_item.category,
        context=combined_text,
        target_language=target_language,
        source_word=target_item.word,
        foundation_phase=foundation_phase,
    )

    example_sentence_source = generate_example_sentence(
        word=target_item.word,
        category=target_item.category,
        context=combined_text,
        target_language=source_language,
        source_word=target_item.translation,
        foundation_phase=foundation_phase,
    )

    dialogue_line_1, dialogue_line_2 = generate_mini_dialogue(
        word=target_item.translation,
        category=target_item.category,
        context=combined_text,
        target_language=target_language,
        source_word=target_item.word,
        foundation_phase=foundation_phase,
    )

    sample_answer = generate_sample_answer(
        word=target_item.translation,
        target_language=target_language,
        context=combined_text,
        foundation_phase=foundation_phase,
    )

    target_item.example_sentence = example_sentence_target
    target_item.example_sentence_source = example_sentence_source
    target_item.example_sentence_target = example_sentence_target
    target_item.dialogue_line_1 = dialogue_line_1
    target_item.dialogue_line_2 = dialogue_line_2
    target_item.sample_answer = sample_answer
    target_item.expanded = True

    return target_item


def add_vocabulary_from_text(project_id: int, text: str, user_id: str = DEFAULT_USER_ID) -> None:
    ensure_user(user_id)

    if project_id not in vocabulary_db[user_id]:
        vocabulary_db[user_id][project_id] = []

    if not text.strip():
        return

    existing_items = vocabulary_db[user_id][project_id]
    seen_words = {normalize_lookup_key(item.word) for item in existing_items}

    items = extract_vocabulary_llm(text)

    for item in items:
        if "word" not in item or "category" not in item:
            continue

        raw_word = item["word"].strip()

        word = normalize_word(raw_word)

        if not is_valid_word_or_phrase(word):
            continue

        if normalize_lookup_key(word) in seen_words:
            continue

        existing = next(
            (existing_item for existing_item in vocabulary_db[user_id][project_id] if normalize_lookup_key(existing_item.word) == normalize_lookup_key(word)),
            None,
        )
        if existing:
            continue

        new_item = VocabularyItem(
            word=word,
            category=item["category"],
            source="description",
            example_sentence=None,
            example_sentence_source=None,
            example_sentence_target=None,
            dialogue_line_1=None,
            dialogue_line_2=None,
            expanded=False,
        )
        vocabulary_db[user_id][project_id].append(new_item)
        seen_words.add(normalize_lookup_key(word))

    vocabulary_db[user_id][project_id] = sort_vocabulary_items(vocabulary_db[user_id][project_id])


def extract_vocabulary_from_slots(project_id: int, user_id: str = DEFAULT_USER_ID) -> None:
    ensure_user(user_id)

    if project_id not in slots_db[user_id]:
        return

    slots = slots_db[user_id][project_id]

    if project_id not in vocabulary_db[user_id]:
        vocabulary_db[user_id][project_id] = []

    seen_words = {normalize_lookup_key(item.word) for item in vocabulary_db[user_id][project_id]}

    # 1. Grundwortschatz sicherstellen
    for raw_word in BASE_CORE:
        word = normalize_word(raw_word)

        if not is_valid_word_or_phrase(word):
            continue

        existing_base_item = next(
            (item for item in vocabulary_db[user_id][project_id] if normalize_lookup_key(item.word) == normalize_lookup_key(word)),
            None,
        )

        if existing_base_item:
            continue

        new_base_item = VocabularyItem(
            word=word,
            category="other",
            source="base_core",
            example_sentence=None,
            example_sentence_source=None,
            example_sentence_target=None,
            dialogue_line_1=None,
            dialogue_line_2=None,
            expanded=False,
        )
        vocabulary_db[user_id][project_id].append(new_base_item)
        seen_words.add(normalize_lookup_key(word))

    # 2. Gesamten bekannten Kontexttext zusammensetzen
    combined_text = ""

    if slots.context:
        combined_text += slots.context

    if slots.description:
        if combined_text:
            combined_text += "\n"
        combined_text += slots.description

    if slots.followup_notes:
        if combined_text:
            combined_text += "\n"
        combined_text += slots.followup_notes

    if not combined_text.strip():
        vocabulary_db[user_id][project_id] = sort_vocabulary_items(vocabulary_db[user_id][project_id])
        return

    latest_text = ""

    if slots.followup_notes:
        latest_text = slots.followup_notes.strip().split("\n")[-1]
    elif slots.description:
        latest_text = slots.description
    else:
        latest_text = slots.context or ""

    items = extract_vocabulary_llm(latest_text)

    project = next((p for p in projects_db[user_id] if p.id == project_id), None)
    focus_topics = project.focus_topics if project and getattr(project, "focus_topics", None) else []

    situation_items = []

    has_situation_core = any(item.source == "situation_core" for item in vocabulary_db[user_id][project_id])

    # Generate the situation core only once.
    if not has_situation_core:
        situation_items = generate_situation_core(
            context=slots.context or "",
            description=slots.description or "",
            followup_notes="",
            focus_topics=focus_topics,
        )

    situation_words = {normalize_lookup_key(str(item.get("word", ""))) for item in situation_items if isinstance(item, dict)}

    # 5. Beides zusammenführen
    items.extend(situation_items)

    for item in items:
        if "word" not in item or "category" not in item:
            continue

        raw_word = item["word"].strip()

        word = normalize_word(raw_word)

        if not is_valid_word_or_phrase(word):
            continue

        if normalize_lookup_key(word) in seen_words:
            continue

        existing = next(
            (existing_item for existing_item in vocabulary_db[user_id][project_id] if normalize_lookup_key(existing_item.word) == normalize_lookup_key(word)),
            None,
        )
        if existing:
            continue

        new_item = VocabularyItem(
            word=word,
            category=item["category"],
            source="situation_core" if normalize_lookup_key(word) in situation_words else "description",
            example_sentence=None,
            example_sentence_source=None,
            example_sentence_target=None,
            dialogue_line_1=None,
            dialogue_line_2=None,
            expanded=False,
        )
        vocabulary_db[user_id][project_id].append(new_item)
        seen_words.add(normalize_lookup_key(word))

    vocabulary_db[user_id][project_id] = sort_vocabulary_items(vocabulary_db[user_id][project_id])


# Helper to reset and rebuild a vocabulary item
from typing import Optional

def rebuild_vocabulary_item(project_id: int, word: str, user_id: str = DEFAULT_USER_ID) -> Optional[VocabularyItem]:
    ensure_user(user_id)

    if project_id not in vocabulary_db[user_id]:
        return None

    target_item = next(
        (
            item
            for item in vocabulary_db[user_id][project_id]
            if normalize_lookup_key(item.word) == normalize_lookup_key(word)
        ),
        None,
    )

    if not target_item:
        return None

    target_item.translation = None
    target_item.example_sentence = None
    target_item.example_sentence_source = None
    target_item.example_sentence_target = None
    target_item.dialogue_line_1 = None
    target_item.dialogue_line_2 = None
    target_item.sample_answer = None
    target_item.expanded = False

    return expand_vocabulary_item(project_id, word, user_id=user_id)