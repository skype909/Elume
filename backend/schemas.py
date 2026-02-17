from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class ClassCreate(BaseModel):
    name: str
    subject: str


class PostCreate(BaseModel):
    author: str
    content: str
    links: Optional[List[str]] = None


class TopicCreate(BaseModel):
    class_id: int
    name: str


class TopicOut(BaseModel):
    id: int
    class_id: int
    name: str


class NoteOut(BaseModel):
    id: int
    class_id: int
    topic_id: int
    filename: str
    file_url: str
    uploaded_at: datetime
    topic_name: str


# -------------------------
# Tests
# -------------------------

class TestCategoryCreate(BaseModel):
    title: str
    description: Optional[str] = None


class TestCategoryPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


class TestCategoryOut(BaseModel):
    id: int
    class_id: int
    title: str
    description: Optional[str] = None


class TestOut(BaseModel):
    id: int
    class_id: int
    category_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    filename: str
    file_url: str
    uploaded_at: datetime


class TestPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None


# -------------------------
# Calendar Schemas (canonical)
# -------------------------

class CalendarEventCreate(BaseModel):
    # ✅ class_id can be null => global teacher event
    class_id: Optional[int] = None

    title: str
    description: Optional[str] = None

    # Start datetime (supports date-only or datetime from frontend)
    event_date: datetime

    # Optional end datetime
    end_date: Optional[datetime] = None

    all_day: bool = False

    # general | test | homework | trip | ...
    event_type: Optional[str] = "general"


class CalendarEventOut(BaseModel):
    id: int
    class_id: Optional[int]
    title: str
    description: Optional[str]
    event_date: datetime
    end_date: Optional[datetime]
    all_day: bool
    event_type: str

    class Config:
        orm_mode = True


# -------------------------
# AI calendar parsing
# -------------------------

class AIParseEventRequest(BaseModel):
    text: str
    class_id: Optional[int] = None
    timezone: str = "Europe/Dublin"
    default_duration_minutes: int = 60


class AIParseEventResponse(BaseModel):
    draft: CalendarEventCreate
    warnings: List[str] = []
