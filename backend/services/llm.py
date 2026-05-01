import os
import json
from typing import Optional
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def get_language_display_name(language: Optional[str]) -> str:
    if not language:
        return "Fremdsprache"

    normalized = language.strip().lower()
    aliases = {
        "spanisch": "Spanisch",
        "spanish": "Spanisch",
        "französisch": "Französisch",
        "franzoesisch": "Französisch",
        "french": "Französisch",
        "italienisch": "Italienisch",
        "italian": "Italienisch",
        "englisch": "Englisch",
        "english": "Englisch",
        "deutsch": "Deutsch",
        "german": "Deutsch",
    }
    return aliases.get(normalized, language.strip())

def extract_vocabulary_llm(text: str):
    prompt = f"""
Extrahiere aus dem folgenden Text alle sinnvollen neuen Wörter und kurzen Phrasen
für einen Sprachlernenden.

Regeln:
- extrahiere möglichst vollständig
- nimm relevante Verben, Nomen, Adjektive und kurze Phrasen
- deutsche Nomen müssen immer mit bestimmtem Artikel ausgegeben werden: der, die oder das
- deutsche Nomen müssen immer großgeschrieben werden
- Beispiel: nicht "frühstück", sondern "das Frühstück"
- Beispiel: nicht "welle", sondern "die Welle"
- Beispiel: nicht "surfkurs", sondern "der Surfkurs"
- entferne Dubletten
- keine Artikel allein
- keine Pronomen allein
- keine reinen Füllwörter
- einzelne Funktionswörter wie "mit", "unter", "über" nicht allein ausgeben
- solche Wörter nur dann ausgeben, wenn sie Teil einer sinnvollen Phrase sind
- bevorzuge Grundform oder sinnvolle Basisform
- bei Nomen ist die Basisform immer mit Artikel und korrekter Großschreibung
- kategorisiere jeden Eintrag als:
  - verb
  - noun
  - other
  - phrase
- verwende "noun" für Dinge, Orte, Personen, Konzepte und konkrete Gegenstände
- verwende "other" nur für Wörter, die weder klar Verb, Nomen noch Phrase sind
- sei bei einzelnen Inhaltswörtern lieber "noun" als "other", wenn es sich um einen Gegenstand, Ort oder Begriff handelt

Beispiele für gute Phrasen:
- mit der welle
- unter der welle
- im surfshop
- nach dem weg fragen
- vor starken wellen warnen

Antworte nur als JSON-Liste in diesem Format:
[
  {{"word": "ankern", "category": "verb"}},
  {{"word": "der Hafenmeister", "category": "noun"}},
  {{"word": "mit der Welle", "category": "phrase"}}
]

Text:
{text}
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    result = response.choices[0].message.content

    try:
        items = json.loads(result)
        return items
    except json.JSONDecodeError:
        return []




# New function: validate_vocabulary_batch
def validate_vocabulary_batch(items: list[dict], context: str = "") -> list[dict]:
    if not items:
        return []

    compact_items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word", "")).strip()
        category = str(item.get("category", "other")).strip().lower()
        if not word:
            continue
        if category not in {"noun", "verb", "phrase", "other"}:
            category = "other"
        compact_items.append({"word": word, "category": category})

    if not compact_items:
        return []

    prompt = f"""
Du validierst eine deutsche Vokabelliste für Karteikarten.

Kontext:
{context}

Aufgabe:
Korrigiere die Einträge sprachlich, bevor sie gespeichert werden.

Harte Regeln:
- Antworte nur als JSON-Liste.
- Jeder Eintrag muss exakt die Felder "word" und "category" haben.
- Erhalte die Reihenfolge möglichst bei.
- Entferne keine sinnvollen Einträge.
- category darf nur sein: noun, verb, phrase oder other.
- Deutsche Nomen müssen immer als Singular-Grundform mit bestimmtem Artikel ausgegeben werden: der, die oder das.
- Deutsche Nomen müssen großgeschrieben werden; der Artikel bleibt klein.
- Wenn ein einzelnes deutsches Wort ein Ding, Ort, Person, Konzept oder Gegenstand ist, setze category auf "noun".
- Wenn ein Eintrag ein Verb ist, setze category auf "verb" und verwende die Infinitivform ohne Artikel.
- Wenn ein Eintrag eine kurze sinnvolle Wendung ist, setze category auf "phrase".
- Ganze Sätze sind keine Vokabeln. Reduziere Sätze auf das zentrale Wort oder die zentrale kurze Phrase.
- Beispiel: "ich brauche Werkzeug" -> {{"word": "das Werkzeug", "category": "noun"}}
- Verwende bei Nomen grundsätzlich Singular, außer der Ausdruck ist eindeutig nur im Plural sinnvoll.
- Beispiel: "antworten" oder "respuestas" als Nomen -> {{"word": "die Antwort", "category": "noun"}}
- Vermeide substantivierte Verbformen, wenn ein normales Nomen gemeint ist.
- Beispiel: nicht {{"word": "das Tanzen", "category": "noun"}}, sondern {{"word": "der Tanz", "category": "noun"}}
- Beispiel: nicht {{"word": "das Beobachten", "category": "noun"}}, sondern {{"word": "die Beobachtung", "category": "noun"}}
- Länder, Inseln, Städte und Eigennamen bekommen normalerweise keinen Artikel.
- Beispiel: "Spanien" -> {{"word": "Spanien", "category": "noun"}}
- Beispiel: nicht {{"word": "das Spanien", "category": "noun"}}
- Beispiel: "antwort" -> {{"word": "die Antwort", "category": "noun"}}
- Beispiel: "auto" -> {{"word": "das Auto", "category": "noun"}}
- Beispiel: "bus" -> {{"word": "der Bus", "category": "noun"}}
- Beispiel: "frühstück" -> {{"word": "das Frühstück", "category": "noun"}}
- Beispiel: "baile" oder "tanzen" im Sinne eines Nomens -> {{"word": "der Tanz", "category": "noun"}}
- Beispiel: "observación" oder "beobachten" im Sinne eines Nomens -> {{"word": "die Beobachtung", "category": "noun"}}
- Beispiel: "surfen" als Tätigkeit -> {{"word": "surfen", "category": "verb"}}

Eingabe:
{json.dumps(compact_items, ensure_ascii=False)}
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    result = (response.choices[0].message.content or "[]").strip()

    if result.startswith("```"):
        result = result.strip("`")
        if result.startswith("json"):
            result = result[4:].strip()

    try:
        parsed = json.loads(result)
    except json.JSONDecodeError:
        print("VOCAB VALIDATION RAW:", result)
        return compact_items

    if not isinstance(parsed, list):
        return compact_items

    validated = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word", "")).strip()
        category = str(item.get("category", "other")).strip().lower()
        if not word:
            continue
        if category not in {"noun", "verb", "phrase", "other"}:
            category = "other"
        validated.append({"word": word, "category": category})

    return validated or compact_items


def generate_situation_core(
    context: str,
    description: str,
    followup_notes: str,
    focus_topics: Optional[list[str]] = None,
):
    prompt = (
        "Du ergänzt einen minimalen situativen Wortschatz für einen Sprachlernenden.\n\n"
        "Nutze den Kontext aus dem Interview.\n\n"
        "Fokus-Themen:\n" + ", ".join(focus_topics or []) + "\n\n"
        f"Kontext:\n{context}\n\n"
        f"Beschreibung:\n{description}\n\n"
        f"Weitere Antworten:\n{followup_notes}\n\n"
        "Aufgabe:\n"
        "- ergänze möglichst 15 bis 20 wichtige Wörter oder kurze Phrasen\n"
        "- sei lieber etwas vollständiger als zu sparsam\n"
        "- nimm die wichtigsten Objekte, Handlungen, Personen, Fragen und kurzen Alltagsphrasen der Situation auf\n"
        "- deutsche Nomen müssen immer mit bestimmtem Artikel ausgegeben werden: der, die oder das\n"
        "- deutsche Nomen müssen immer großgeschrieben werden\n"
        "- Beispiel: nicht 'frühstück', sondern 'das Frühstück'\n"
        "- Beispiel: nicht 'welle', sondern 'die Welle'\n"
        "- nur Dinge, die in dieser Situation sehr wahrscheinlich oder sehr nützlich sind\n"
        "- richte dich besonders nach den Fokus-Themen, wenn welche gegeben sind\n"
        "- wenn ein Thema zentral ist, ergänze auch typische Kernbegriffe dieses Themas\n"
        "- keine Dubletten\n"
        "- keine allgemeinen Füllwörter\n"
        "- keine Artikel allein\n"
        "- keine Pronomen allein\n"
        "- kurze Phrasen wie 'wo ist ...', 'ich brauche ...', 'kann ich ...' sind erlaubt, wenn sie zur Situation passen\n"
        "- gib für jedes Element eine category an\n"
        "- category darf nur sein: noun, verb, phrase oder other\n"
        "- keine thematischen Kategorien wie Handlung, Natur, Alltag, BBQ oder Surfschule\n\n"
        "Beispiele:\n"
        "- in einer Surfschule: die Welle, das Gleichgewicht, paddeln, der Surfkurs\n"
        "- im Restaurant: der Tisch, die Rechnung, bestellen, das Wasser\n\n"
              'Antworte nur als reine JSON-Liste von Objekten mit den Feldern "word" und "category". '
        'Für "category" sind ausschließlich diese Werte erlaubt: "noun", "verb", "phrase", "other". '
        'Keine Markdown-Codeblöcke, keine Erklärung, kein zusätzlicher Text.'
    )
    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
    )

    result = (response.choices[0].message.content or "[]").strip()

    if result.startswith("```"):
        result = result.strip("`")
        if result.startswith("json"):
            result = result[4:].strip()

    try:
        parsed = json.loads(result)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        print("SITUATION CORE RAW:", result)
        return []


def generate_example_sentence(
    word: str,
    category: str,
    context: str,
    target_language: str,
    source_word: Optional[str] = None,
    foundation_phase: bool = False,
) -> str:
    language_name = get_language_display_name(target_language)
    prompt = f"""
Erstelle genau einen sehr einfachen, natürlichen Beispielsatz in der Zielsprache.

Zielsprache: {language_name}
Wort oder Phrase: {word}
Kategorie: {category}
Kontext: {context}
Foundation-Phase: {foundation_phase}

Regeln:
- nur ein Satz
- der Satz muss vollständig in der Zielsprache sein
- kein einziges Wort aus einer anderen Sprache ist erlaubt
- keine Sprachmischung
- benutze das Wort oder die Phrase "{word}" genau einmal im Satz
- wenn die Zielsprache Deutsch ist, schreibe deutsche Nomen korrekt groß
- wenn die Zielsprache Deutsch ist, schreibe Eigennamen korrekt groß
- der Satz muss klar zur konkreten Situation im Kontext passen
- wenn das Wort mehrdeutig ist, wähle genau eine Bedeutung, die am besten zum Kontext passt
- benutze dieselbe Bedeutung konsequent und mische keine anderen Bedeutungen hinein
- der Satz muss semantisch zu genau derselben Bedeutung passen, die auch als Übersetzung gemeint ist
- wenn der Kontext von Surfschule, Restaurant, Strand, BBQ, Smalltalk, Städtereise, Museum oder Reise spricht, soll der Satz genau in so einer Situation spielen
- vermeide generische Standardsätze wie "Ich habe ein Buch" oder "Das ist gut", wenn der Kontext konkreter ist
- wenn das Wort eine feste Phrase ist, benutze genau diese Phrase
- wenn du unsicher bist, schreibe einen sehr einfachen Satz in der Zielsprache
- einfach und alltagsnah
- direkt zum Kontext passend
- wenn möglich für Anfänger verständlich
- wenn Foundation-Phase = True, benutze nur sehr einfache, häufige Wörter und eine sehr einfache Satzstruktur
- wenn Foundation-Phase = True, vermeide zusätzliche seltene oder komplexe Wörter
- keine Erklärung, nur der Satz
"""

    for _ in range(2):  # try up to 2 times
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
        )

        result = (response.choices[0].message.content or "").strip()

        if result.startswith("```"):
            result = result.strip("`")
            if result.startswith("json"):
                result = result[4:].strip()

        lowered = f" {result.lower()} "
        normalized_word = word.strip().lower()

        if normalized_word not in lowered:
            continue

        if source_word:
            normalized_source = source_word.strip().lower()
            if normalized_source != normalized_word and f" {normalized_source} " in lowered:
                continue

        return result

    return ""


# New function: generate_example_sentence_pair
def generate_example_sentence_pair(
    word: str,
    category: str,
    context: str,
    target_language: str,
    source_word: Optional[str] = None,
    source_language: str = "Deutsch",
    foundation_phase: bool = False,
) -> dict:
    target_language_name = get_language_display_name(target_language)
    source_language_name = get_language_display_name(source_language)

    prompt = f"""
Erstelle genau ein einfaches Beispielsatz-Paar für eine Sprachlern-Karteikarte.

Zielsprache: {target_language_name}
Quellsprache: {source_language_name}
Zielwort oder Zielphrase: {word}
Deutsches Ausgangswort oder Ausgangsphrase: {source_word or ""}
Kategorie: {category}
Kontext: {context}
Foundation-Phase: {foundation_phase}

Aufgabe:
- Erstelle einen natürlichen Beispielsatz in der Zielsprache.
- Erstelle dazu eine sinngemäße Übersetzung in der Quellsprache.
- Beide Sätze müssen dieselbe Bedeutung haben.

Regeln:
- antworte nur als JSON
- exakt die Felder "target" und "source"
- "target" ist der Satz in der Zielsprache
- "source" ist die Übersetzung in der Quellsprache
- der target-Satz muss das Zielwort oder die Zielphrase genau einmal enthalten
- der source-Satz muss die Bedeutung natürlich wiedergeben
- keine Frage-Antwort-Struktur
- kein Mini-Dialog
- keine Erklärung
- keine Listen
- keine Sprachmischung
- einfach und alltagsnah
- passend zum konkreten Kontext
- wenn Foundation-Phase = True, benutze sehr einfache Satzstruktur und häufige Wörter

Format:
{{
  "target": "Necesito una herramienta.",
  "source": "Ich brauche ein Werkzeug."
}}
"""

    for _ in range(2):
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )

        result = (response.choices[0].message.content or "{}").strip()

        if result.startswith("```"):
            result = result.strip("`")
            if result.startswith("json"):
                result = result[4:].strip()

        try:
            parsed = json.loads(result)
        except json.JSONDecodeError:
            continue

        if not isinstance(parsed, dict):
            continue

        target = str(parsed.get("target", "")).strip()
        source = str(parsed.get("source", "")).strip()

        if not target or not source:
            continue

        normalized_word = word.strip().lower()
        if normalized_word and normalized_word not in f" {target.lower()} ":
            continue

        return {"target": target, "source": source}

    return {"target": "", "source": ""}

def generate_mini_dialogue(
    word: str,
    category: str,
    context: str,
    target_language: str,
    source_word: Optional[str] = None,
    foundation_phase: bool = False,
) -> tuple[str, str]:
    language_name = get_language_display_name(target_language)
    prompt = f"""
Erstelle einen sehr kurzen Mini-Dialog für einen Sprachlernenden.

Zielsprache: {language_name}
Wort oder Phrase: {word}
Kategorie: {category}
Kontext: {context}
Foundation-Phase: {foundation_phase}

Wichtig:
- benutze den Ausdruck "{word}" mindestens einmal im Mini-Dialog
- verwende keine Variante dieses Ausdrucks aus der Quellsprache
- wenn die Zielsprache Deutsch ist, schreibe deutsche Nomen korrekt groß
- wenn die Zielsprache Deutsch ist, schreibe Eigennamen korrekt groß

Regeln:
- genau 2 Zeilen
- beide Zeilen vollständig in der Zielsprache
- natürlich und einfach
- alltagsnah
- passend zum Projektkontext
- wenn das Wort mehrdeutig ist, wähle genau eine Bedeutung, die am besten zum Kontext passt
- benutze dieselbe Bedeutung konsequent und mische keine anderen Bedeutungen hinein
- beide Zeilen müssen semantisch zu genau derselben Bedeutung passen, die auch als Übersetzung und Beispielsatz gemeint ist
- Zeile 1 soll eine typische Frage oder Aussage sein, die realistisch zu Zeile 2 führt
- Zeile 2 soll eine kurze, inhaltlich passende Antwort auf Zeile 1 sein
- kurz
- keine Erklärung
- keine Listen
- keine unnötigen Details
- wenn Foundation-Phase = True, halte beide Zeilen sehr einfach und benutze nur sehr häufige Wörter
- wenn Foundation-Phase = True, vermeide zusätzliche komplexe Begriffe außerhalb des Kernwortschatzes

Antworte nur als JSON in diesem Format:
{{
  "line_1": "¿Quieres tomar un curso?",
  "line_2": "Sí, quiero tomar un curso."
}}
"""

    for _ in range(2):  # try up to 2 times
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
        )

        result = response.choices[0].message.content or "{}"
        result = result.strip()

        if result.startswith("```"):
            result = result.strip("`")
            if result.startswith("json"):
                result = result[4:].strip()

        try:
            item = json.loads(result)
            if isinstance(item, dict) and "line_1" in item and "line_2" in item:
                line_1 = (item["line_1"] or "").strip()
                line_2 = (item["line_2"] or "").strip()
                combined = f" {line_1.lower()} {line_2.lower()} "
                normalized_word = word.strip().lower()

                if normalized_word not in combined:
                    continue

                if source_word:
                    normalized_source = source_word.strip().lower()
                    if normalized_source != normalized_word and f" {normalized_source} " in combined:
                        continue

                return line_1, line_2
        except json.JSONDecodeError:
            continue

    return "", ""


def generate_roleplay_opening(context: str, target_language: str, vocabulary: list):
    words = ", ".join([item.word for item in vocabulary[:8]]) if vocabulary else ""

    prompt = f"""
Du erzeugst den Einstieg in ein Rollenspiel für einen Sprachlernenden.

Zielsprache: {target_language}
Kontext: {context}
Wichtige Wörter: {words}

Regeln:
- antworte nur als JSON
- scenario = genau 1 kurzer Satz auf Deutsch
- scenario beschreibt eine konkrete Situation und den Gesprächspartner
- trainer_line = genau 1 kurze natürliche Eröffnungsfrage in der Zielsprache
- trainer_line wird vom Gesprächspartner gesprochen, nicht vom Lerner
- trainer_line muss zur Rolle des Gesprächspartners passen (z. B. Surflehrer, Kellner, Verkäufer)
- trainer_line soll den Lerner in der zweiten Person ansprechen, nicht aus der Ich-Perspektive des Lerners formuliert sein
- trainer_line soll offen sein, nicht belehrend
- Frage eine offene Frage, also eine die mit einem W-Wort beginnt (wie, wer, wo, was, warum....)
- keine Erklärungen
- kein Unterrichtston
- kein langer Text

Format:
{{
  "scenario": "Du bist nach dem Surfen auf Fuerteventura in einer Bar.",
  "trainer_line": "Hola, ¿qué te apetece tomar?"
}}
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
    )

    result = response.choices[0].message.content or "{}"

    try:
        item = json.loads(result)
        if isinstance(item, dict) and "scenario" in item and "trainer_line" in item:
            return item
    except json.JSONDecodeError:
        pass

    return {
        "scenario": "Du bist in einer passenden Alltagssituation.",
        "trainer_line": "Hola, ¿en qué puedo ayudarte hoy?"
    }


def continue_roleplay(
    context: str,
    target_language: str,
    vocabulary: list,
    history: list,
    learner_message: str,
):
    words = ", ".join([item.word for item in vocabulary[:10]]) if vocabulary else ""

    conversation = ""
    for msg in history:
        role = msg.get("role", "")
        text = msg.get("text", "")
        conversation += f"{role}: {text}\n"

    prompt = f"""
Du bist ein freundlicher Gesprächspartner in einem Rollenspiel.

Zielsprache: {target_language}
Kontext: {context}
Wichtige Wörter: {words}

Bisheriges Gespräch:
{conversation}

Neue Nachricht des Lerners:
learner: {learner_message}

Regeln:
- antworte nur in der Zielsprache
- kein einziges Wort aus der Quellsprache ist erlaubt
- wenn dir ein Begriff fehlt, umschreibe ihn in der Zielsprache, statt ein deutsches Wort zu übernehmen
- Wiederhole was du verstanden hast, möglichst wörtlich, aus der Perspektive des Trainers
- Korrigiere dabei Fehler
- Antworte anschliessend
- versuche einige der wichtigen Wörter natürlich im Gespräch zu verwenden
- verwende sie nicht künstlich, sondern nur wenn es sinnvoll wirkt
- kurz und natürlich
- wie ein echter Gesprächspartner, nicht wie ein Lehrer
- maximal ein kurzer Satz
- wenn du eine Frage stellst, dann nur eine, nicht zwei hintereinander
- erkläre keine Sprache und gib keine Grammatikhinweise
- stelle möglichst nur offene Fragen
- vermeide Ja/Nein Fragen soweit es geht
- keine Listen
- keine Unterrichtsformeln
- reagiere passend auf das, was der Lerner gesagt hat
- stelle danach genau eine natürliche, offene Anschlussfrage
- vewende nur offene Fragen, also w-Fragen die mit wie, wo, wer, was warum, weshalb usw.. beginnen
- stelle höchstens eine einzige Frage pro Antwort

Antworte nur mit deiner nächsten Gesprächszeile.
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
    )

    return (response.choices[0].message.content or "").strip()


def generate_followup_question(context: str, description: str, followup_notes: str) -> str:
    prompt = f"""
Du führst ein Tiefeninterview für einen personalisierten Sprachtrainer.

WICHTIG:
- Lies die bisherigen Informationen aufmerksam.
- Frage NICHT erneut allgemein nach dem Kontext.
- Stelle GENAU EINE kurze, neue Anschlussfrage.
- Die Frage muss auf einem noch offenen Aspekt aufbauen.
- vermeide Ja/Nein Fragen soweit es geht
- vewende nur offene Fragen, also Fragen die mit Wie, wo, was warum usw.. beginnen
- Bevorzuge konkrete Situationen, in denen der Nutzer sprechen, verstehen oder reagieren muss.
- Die Frage soll mehr konkrete Wörter, Verben, Phrasen und Dialogsituationen hervorbringen.

Bisher bekannte Informationen:

Kontext:
{context}

Beschreibung:
{description}

Weitere Antworten:
{followup_notes}

Beispiele für gute Anschlussfragen:
- Welche Dienstleistungen der Surfschule willst du in Anspruch nehmen?
- Wie stellst du dir den Unterrichtsablauf vor?
- Über welche Themen würdest gerne mit anderen sprechen?
- Welche Situation würdest du gerne als erstes in der fremden Sprache meistern?

Schlechte Fragen:
- In welchem Kontext möchtest du die Sprache benutzen?
- Hast du schonmal auf einem Surfbrett gestanden?
- Weisst du wie man surft?

Antworte nur mit genau einer deutschen Frage.
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
    )

    return (response.choices[0].message.content or "").strip()


def translate_vocabulary_item(word: str, target_language: str, context: str) -> str:
    language_name = get_language_display_name(target_language)
    prompt = f"""
Übersetze das folgende deutsche Wort oder die Phrase in die Zielsprache.

Zielsprache: {language_name}
Kontext: {context}
Wort oder Phrase: {word}

Regeln:
- gib nur die Übersetzung in der Zielsprache zurück
- die Ausgabe muss vollständig in der Zielsprache sein
- wenn die Zielsprache nicht Deutsch ist, sind deutsche Wörter und deutsche Artikel absolut verboten
- wenn die Zielsprache Spanisch ist, dürfen nur spanische Wörter und spanische Artikel wie el, la, los, las verwendet werden
- wenn die Zielsprache Französisch ist, dürfen nur französische Wörter und französische Artikel wie le, la, les verwendet werden
- wenn die Zielsprache Portugiesisch ist, dürfen nur portugiesische Wörter und portugiesische Artikel wie o, a, os, as verwendet werden
- verwende niemals deutsche Artikel wie der, die oder das, außer die Zielsprache ist Deutsch
- wenn die Zielsprache Deutsch ist, müssen deutsche Nomen immer mit bestimmtem Artikel der, die oder das ausgegeben werden
- wenn die Zielsprache Deutsch ist, müssen deutsche Nomen immer großgeschrieben werden
- wenn die Zielsprache Deutsch ist, ist eine Nomen-Ausgabe ohne Artikel falsch
- Beispiele für Deutsch: der Tisch, die Welle, das Frühstück, die Merienda
- übersetze auch scheinbar einfache deutsche Wörter vollständig in die Zielsprache
- gib niemals das deutsche Ausgangswort zurück, außer die Zielsprache ist Deutsch
- kurz und natürlich
- passend zum konkreten Kontext
- der Kontext darf ein mehrdeutiges Wort präzisieren, aber nicht in ein anderes, nur thematisch verwandtes Wort umdeuten
- wenn das Ausgangswort eine klare, gebräuchliche Standardbedeutung hat, übersetze genau diese Bedeutung
- Beispiel: "Bahn" darf im Surfkontext nicht als "ola" übersetzt werden; Kontext darf nur zwischen echten Bedeutungen von "Bahn" wählen, nicht zu "Welle" umdeuten
- bei mehrdeutigen Wörtern wähle genau eine Bedeutung, die am besten zum Kontext passt
- mische keine Bedeutungen
- bevorzuge eine klare muttersprachliche Standardübersetzung in der Zielsprache
- verwende keinen englischen Fachbegriff als Übersetzung, wenn es in der Zielsprache eine naheliegende normale Übersetzung gibt
- nur wenn ein englischer Fachbegriff in der Zielsprache wirklich die übliche Standardform ist, darfst du ihn verwenden
- nur die Übersetzung, keine Erklärung
- keine Sprachmischung
- wenn es für den Begriff eine gebräuchliche, etablierte Übersetzung in der Zielsprache gibt, verwende diese
- bestimme zuerst die Wortart des deutschen Ausgangswortes
- wenn das deutsche Ausgangswort ein Verb ist, muss die Übersetzung ebenfalls ein Verb oder eine verbale Phrase sein
- ein deutsches Verb darf niemals als Nomen mit Artikel übersetzt werden
- Beispiel: "putten" darf nicht zu "el putt" werden, sondern muss als Verb oder verbale Phrase übersetzt werden
- wenn der Begriff ein Nomen ist, gib die Übersetzung immer mit bestimmtem Artikel der Zielsprache aus
- das gilt für alle Sprachen außer Englisch
- Beispiel: die Zeit, das Brett, el tiempo, la ola, o tempo, a onda
- eine Nomen-Übersetzung ohne bestimmten Artikel ist falsch formatiert und darf nicht ausgegeben werden
- gib Nomen immer mit bestimmtem Artikel der Zielsprache und korrekter Großschreibung aus, wo möglich
- nur für Englisch gib Nomen ohne Artikel aus
- typische Sehenswürdigkeiten und gebräuchliche Ortsbezeichnungen dürfen übersetzt werden, wenn es dafür eine übliche Form gibt
- Personennamen, Marken und eindeutige Eigennamen ohne übliche Übersetzung nicht übersetzen
- wenn die Zielsprache Deutsch ist, schreibe deutsche Nomen korrekt groß und immer mit bestimmtem Artikel
- wenn die Zielsprache Deutsch ist, schreibe Eigennamen korrekt groß
"""

    language_key = language_name.strip().lower()

    source_word = word.strip()
    source_looks_like_single_word = bool(source_word) and " " not in source_word
    source_looks_like_noun = source_looks_like_single_word and (
        source_word[:1].isupper()
        or language_key == "deutsch"
    )

    require_article = (
        language_key != "englisch"
        and source_looks_like_noun
    )

    valid_articles = (
        "der ", "die ", "das ",
        "el ", "la ", "los ", "las ",
        "o ", "a ", "os ", "as ",
        "le ", "la ", "les ",
        "il ", "lo ", "la ", "i ", "gli ", "le ",
        "de ", "het ",
    )

    forbidden_articles_by_language = {
        "spanisch": ("der ", "die ", "das "),
        "französisch": ("der ", "die ", "das "),
        "portugiesisch": ("der ", "die ", "das "),
        "italienisch": ("der ", "die ", "das "),
        "englisch": ("der ", "die ", "das "),
    }

    allowed_articles_by_language = {
        "spanisch": ("el ", "la ", "los ", "las "),
        "französisch": ("le ", "la ", "les "),
        "portugiesisch": ("o ", "a ", "os ", "as "),
        "italienisch": ("il ", "lo ", "la ", "i ", "gli ", "le "),
        "deutsch": ("der ", "die ", "das "),
        "englisch": (),
    }

    # language_key is defined above

    def looks_invalid_for_target_language(value: str) -> bool:
        normalized_value = value.strip().lower()
        forbidden_articles = forbidden_articles_by_language.get(language_key, ())
        if normalized_value.startswith(forbidden_articles):
            return True

        if language_key != "deutsch":
            source_normalized = word.strip().lower()
            if normalized_value == source_normalized:
                return True

        return False

    def looks_like_bare_german_noun(value: str) -> bool:
        if language_key != "deutsch":
            return False

        normalized_value = value.strip().lower()
        if normalized_value.startswith(("der ", "die ", "das ")):
            return False

        if not normalized_value:
            return False

        if source_looks_like_noun:
            return True

        return False

    for _ in range(3):
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
        )

        result = (response.choices[0].message.content or "").strip()
        normalized_result = result.lower()

        if looks_invalid_for_target_language(result):
            continue

        if looks_like_bare_german_noun(result):
            continue

        if not require_article:
            return result

        allowed_articles = allowed_articles_by_language.get(language_key, valid_articles)
        if normalized_result.startswith(allowed_articles):
            return result

    return result


def generate_sample_answer(word: str, target_language: str, context: str, foundation_phase: bool = False) -> str:
    language_name = get_language_display_name(target_language)
    prompt = f"""
Erstelle eine sehr kurze mögliche Antwort eines Muttersprachlers oder fortgeschrittenen Sprechers.

Zielsprache: {language_name}
Kontext: {context}
Foundation-Phase: {foundation_phase}
Wort oder Phrase: {word}

Regeln:
- gib nur eine einzige kurze Antwort
- maximal 1 Satz
- höchstens 10 Wörter
- natürlich
- alltagsnah
- passend zum Kontext und semantisch passend zum Wort oder zur Phrase
- die Antwort soll wie eine echte Reaktion auf eine naheliegende Frage in dieser Situation wirken
- wenn das Wort mehrdeutig ist, wähle genau eine Bedeutung, die am besten zum Kontext passt
- benutze dieselbe Bedeutung konsequent und mische keine anderen Bedeutungen hinein
- die Antwort muss semantisch zu genau derselben Bedeutung passen, die auch als Übersetzung, Beispielsatz und Mini-Dialog gemeint ist
- keine unpassenden Standardantworten
- wenn die Zielsprache Deutsch ist, schreibe deutsche Nomen korrekt groß
- wenn die Zielsprache Deutsch ist, schreibe Eigennamen korrekt groß
- wenn Foundation-Phase = True, benutze nur sehr einfache und häufige Wörter
- wenn Foundation-Phase = True, antworte möglichst kurz und leicht verständlich
- keine Erklärung
- keine Empfehlungen
- keine Listen
- keine Zusatzinformationen

Beispiele für gute Antworten:
- Sí, soy principiante.
- Claro, vamos mañana.
- Necesito ayuda.
- Quiero una tabla.

Antworte nur mit der Antwort.
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
    )

    result = (response.choices[0].message.content or "").strip()

    if result.lower() == word.lower().strip():
        return ""

    return result


# New function: evaluate_learning_answer_llm
def evaluate_learning_answer_llm(
    answer: str,
    expected: str,
    context: str,
    source_language: str,
    target_language: str,
    word: Optional[str] = None,
    category: Optional[str] = None,
    direction: str = "target-first",
) -> dict:
    learner_language = source_language if direction == "target-first" else target_language
    expected_language = source_language if direction == "target-first" else target_language

    prompt = f"""
Du bist ein präziser, fairer Sprachtrainer.

Bewerte, ob die Antwort eines Lernenden inhaltlich eine sinnvolle Übersetzung ist.

Antwortsprache des Lernenden: {learner_language}
Erwartete Sprache: {expected_language}
Kontext: {context}
Erwartete Übersetzung: {expected}
Antwort des Lernenden: {answer}
Wort/Phrase: {word or ''}
Kategorie: {category or ''}

Regeln:
- bewerte die Antwort als Übersetzung genau dieses einzelnen Wortes oder dieser Phrase
- answer und expected stehen bereits in derselben Sprache und müssen direkt miteinander verglichen werden
- expected ist die Referenzlösung für dieses Wort und darf nicht inhaltlich umgedeutet, rückübersetzt oder durch eine andere deutsche Formulierung ersetzt werden
- bewerte nicht, ob im Kontext eine natürlichere Umschreibung existiert, sondern ob answer eine richtige deutsche Zielübersetzung von word ist
- preferred darf nur eine sehr nahe alternative deutsche Form sein, wenn answer inhaltlich korrekt ist
- preferred darf die Bedeutung von expected nicht verändern
- "correct" = answer entspricht expected oder ist nahezu gleichbedeutend in derselben Sprache
- "acceptable" = answer ist in derselben Sprache inhaltlich richtig, aber etwas weniger üblich oder etwas weniger präzise
- "incorrect" = answer bezeichnet eine andere Bedeutung oder eine andere Übersetzung
- Feedback kurz, freundlich und konkret auf Deutsch
- formuliere das Feedback semantisch und kontextbezogen, nicht formalistisch
- sage nicht einfach, dass expected korrekt sei, wenn der Kontext eher eine andere Bedeutung nahelegt
- wenn answer inhaltlich richtig ist, nenne im Feedback knapp die passendere Standardlösung
- antworte nur als JSON

Format:
{{
  "rating": "correct",
  "feedback": "Inhaltlich richtig.",
  "preferred": "..."
}}
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    result = (response.choices[0].message.content or "{}").strip()

    if result.startswith("```"):
        result = result.strip("`")
        if result.startswith("json"):
            result = result[4:].strip()

    try:
        parsed = json.loads(result)
        if isinstance(parsed, dict):
            rating = parsed.get("rating", "incorrect")
            feedback = parsed.get("feedback", "")
            preferred = parsed.get("preferred", expected)
            if rating not in {"correct", "acceptable", "incorrect"}:
                rating = "incorrect"
            return {
                "rating": rating,
                "feedback": feedback,
                "preferred": preferred,
            }
    except json.JSONDecodeError:
        pass

    return {
        "rating": "incorrect",
        "feedback": "Ich konnte die Antwort nicht sicher bewerten.",
        "preferred": expected,
    }