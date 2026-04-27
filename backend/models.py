from pydantic import BaseModel
from typing import Optional


class Project(BaseModel):
    id: int
    title: str
    target_language: str
    user_name: str
    focus_topics: list[str] = []


class Message(BaseModel):
    role: str
    text: str


class NewMessage(BaseModel):
    text: str


class ProjectSlots(BaseModel):
    name: Optional[str] = None
    target_language: Optional[str] = None
    context: Optional[str] = None
    description: Optional[str] = None
    followup_notes: Optional[str] = None


class VocabularyItem(BaseModel):
    word: str
    category: str
    source: str
    example_sentence: Optional[str] = None
    example_sentence_source: Optional[str] = None
    example_sentence_target: Optional[str] = None
    dialogue_line_1: Optional[str] = None
    dialogue_line_2: Optional[str] = None
    expanded: bool = False
    translation: Optional[str] = None
    sample_answer: Optional[str] = None