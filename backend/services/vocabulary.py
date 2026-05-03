import re
from typing import List, Optional

from base_core import BASE_CORE
from models import VocabularyItem
from database import DEFAULT_USER_ID, ensure_user, slots_db, vocabulary_db, projects_db
from services.llm import (
    extract_vocabulary_llm,
    generate_situation_core,
    generate_example_sentence,
    generate_example_sentence_pair,
    generate_mini_dialogue,
    translate_vocabulary_item,
    generate_sample_answer,
    validate_vocabulary_batch,
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

PROPER_NOUN_WITHOUT_ARTICLE = {
    "spanien",
    "frankreich",
    "portugal",
    "italien",
    "deutschland",
    "österreich",
    "schweiz",
    "niederlande",
    "belgien",
    "kroatien",
    "griechenland",
    "fuerteventura",
    "teneriffa",
    "mallorca",
    "menorca",
    "ibiza",
}

BASE_CORE_ARTICLE_OVERRIDES = {
    "hilfe": "die Hilfe",
    "preis": "der Preis",
    "geld": "das Geld",
    "zeit": "die Zeit",
    "tag": "der Tag",
    "woche": "die Woche",
    "monat": "der Monat",
    "wasser": "das Wasser",
    "essen": "das Essen",
    "trinken": "das Trinken",
    "haus": "das Haus",
    "zimmer": "das Zimmer",
    "straße": "die Straße",
    "auto": "das Auto",
    "bus": "der Bus",
    "bahn": "die Bahn",
    "ticket": "das Ticket",
    "name": "der Name",
    "frage": "die Frage",
    "antwort": "die Antwort",
    "problem": "das Problem",
    "lösung": "die Lösung",
    "freund": "der Freund",
    "frau": "die Frau",
    "mann": "der Mann",
    "kind": "das Kind",
    "arbeit": "die Arbeit",
    "urlaub": "der Urlaub",
}


BASE_CORE_VERBS = {
    "sein", "haben", "werden", "machen", "gehen", "kommen", "wollen",
    "können", "müssen", "brauchen", "geben", "nehmen", "sehen", "hören",
    "sagen", "fragen", "antworten", "verstehen", "lernen", "sprechen",
    "reden", "wissen", "denken", "finden", "mögen", "lieben", "wohnen",
    "bleiben", "bringen", "holen",
}


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


# German noun/article helpers
def has_german_article(word: str) -> bool:
    return normalize_lookup_key(word).startswith(("der ", "die ", "das "))


def normalize_article_and_noun(value: str) -> str:
    normalized = normalize_word(value)
    parts = normalized.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() in {"der", "die", "das"}:
        return f"{parts[0].lower()} {parts[1][:1].upper()}{parts[1][1:]}"
    return normalized


def normalize_base_core_word(word: str) -> str:
    normalized = normalize_word(word)
    key = normalize_lookup_key(normalized)

    if key in BASE_CORE_ARTICLE_OVERRIDES:
        return BASE_CORE_ARTICLE_OVERRIDES[key]

    if has_german_article(normalized):
        return normalize_article_and_noun(normalized)

    # Do not force capitalization for unknown base words; keep as-is
    return normalized


def normalize_base_core_category(word: str) -> str:
    key = normalize_lookup_key(word)

    if has_german_article(word):
        return "noun"

    if key in BASE_CORE_VERBS:
        return "verb"

    return "other"

# Helper function to chunk items for batch processing
def chunk_items(items: List[dict], chunk_size: int = 40) -> List[List[dict]]:
    return [items[index:index + chunk_size] for index in range(0, len(items), chunk_size)]


def should_force_german_noun_format(word: str, category: str) -> bool:
    normalized = normalize_word(word)
    if not normalized or " " in normalized:
        return False

    if normalize_lookup_key(normalized) in PROPER_NOUN_WITHOUT_ARTICLE:
        return False

    return category in {"noun", "other"}


def normalize_german_source_word(word: str, category: str, context: str = "", allow_llm: bool = True) -> str:
    normalized = normalize_word(word)

    # Heuristic: if likely plural noun without article, try singular (e.g., "Antworten" -> "Antwort").
    # Important: never apply this to explicit verbs such as "wissen", "fragen", "machen".
    if category in {"noun", "other"} and " " not in normalized and normalized.endswith("en") and len(normalized) > 4:
        singular_candidate = normalized[:-2]
        normalized = singular_candidate

    # Single lowercase German source words can be nouns from extraction,
    # but never override explicit verbs or phrases.
    if category in {"noun", "other"} and normalized and " " not in normalized and normalized[:1].islower():
        if normalize_lookup_key(normalized) not in PROPER_NOUN_WITHOUT_ARTICLE:
            category = "noun"

    if not should_force_german_noun_format(normalized, category):
        return normalized

    if has_german_article(normalized):
        return normalize_article_and_noun(normalized)

    if not allow_llm:
        return normalized

    candidate = translate_vocabulary_item(
        word=normalized,
        target_language="Deutsch",
        context=context,
        category=category,
    )

    if not (candidate and has_german_article(candidate)) and normalized[:1].islower():
        candidate = translate_vocabulary_item(
            word=f"{normalized[:1].upper()}{normalized[1:]}",
            target_language="Deutsch",
            context=context,
            category=category,
        )

    if candidate and has_german_article(candidate):
        return normalize_article_and_noun(candidate)

    return normalized





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
        category=target_item.category,
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

    example_pair = generate_example_sentence_pair(
        word=target_item.translation,
        category=target_item.category,
        context=combined_text,
        target_language=target_language,
        source_word=target_item.word,
        source_language=source_language,
        foundation_phase=foundation_phase,
    )

    example_sentence_target = example_pair.get("target") or None
    example_sentence_source = example_pair.get("source") or None

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

    items = validate_vocabulary_batch(
        extract_vocabulary_llm(text),
        context=text,
    )

    for item in items:
        if "word" not in item or "category" not in item:
            continue
        raw_word = item["word"].strip()
        category = item["category"]

        word = normalize_german_source_word(raw_word, category, context=text)
        if has_german_article(word):
            category = "noun"

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
            category=category,
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

    for existing_item in vocabulary_db[user_id][project_id]:
        if existing_item.source == "base_core":
            existing_item.word = normalize_base_core_word(existing_item.word)
            existing_item.category = normalize_base_core_category(existing_item.word)
        elif has_german_article(existing_item.word):
            existing_item.word = normalize_article_and_noun(existing_item.word)
            existing_item.category = "noun"

    seen_words = {normalize_lookup_key(item.word) for item in vocabulary_db[user_id][project_id]}

    # 1. Grundwortschatz sicherstellen (FAST PATH - no LLM)
    for raw_word in BASE_CORE:
        word = normalize_base_core_word(raw_word)
        category = normalize_base_core_category(word)

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
            category=category,
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

    items = validate_vocabulary_batch(
        extract_vocabulary_llm(latest_text),
        context=combined_text,
    )

    project = next((p for p in projects_db[user_id] if p.id == project_id), None)
    focus_topics = project.focus_topics if project and getattr(project, "focus_topics", None) else []

    situation_items = []

    has_situation_core = any(item.source == "situation_core" for item in vocabulary_db[user_id][project_id])

    # Generate the situation core only once.
    if not has_situation_core:
        situation_items = validate_vocabulary_batch(
            generate_situation_core(
                context=slots.context or "",
                description=slots.description or "",
                followup_notes="",
                focus_topics=focus_topics,
            ),
            context=combined_text,
        )

    situation_words = {normalize_lookup_key(str(item.get("word", ""))) for item in situation_items if isinstance(item, dict)}

    # 5. Beides zusammenführen
    items.extend(situation_items)

    for item in items:
        if "word" not in item or "category" not in item:
            continue
        raw_word = item["word"].strip()
        category = item["category"]

        word = normalize_german_source_word(raw_word, category, context=combined_text)
        if has_german_article(word):
            category = "noun"

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
            category=category,
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

    slots = slots_db[user_id].get(project_id)
    combined_text = ""
    if slots:
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

    target_item.word = normalize_german_source_word(
        target_item.word,
        target_item.category,
        context=combined_text,
    )

    if has_german_article(target_item.word):
        target_item.category = "noun"

    target_item.translation = None
    target_item.example_sentence = None
    target_item.example_sentence_source = None
    target_item.example_sentence_target = None
    target_item.dialogue_line_1 = None
    target_item.dialogue_line_2 = None
    target_item.sample_answer = None
    target_item.expanded = False

    return expand_vocabulary_item(project_id, word, user_id=user_id)


# New function: update_vocabulary_learning_state
def update_vocabulary_learning_state(
    project_id: int,
    word: str,
    result: str,
    timestamp: Optional[int] = None,
    user_id: str = DEFAULT_USER_ID,
) -> Optional[VocabularyItem]:
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

    normalized_result = normalize_lookup_key(result)

    if normalized_result in {"correct", "mastered", "success"}:
        target_item.mastered = True
        target_item.last_correct = timestamp
        target_item.last_wrong = None
        target_item.wrong_count = 0
        return target_item

    if normalized_result in {"incorrect", "wrong", "error"}:
        target_item.mastered = False
        target_item.last_wrong = timestamp
        target_item.wrong_count = (target_item.wrong_count or 0) + 1
        return target_item

    return target_item