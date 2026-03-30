from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class ClassCreate(BaseModel):
    name: str
    subject: str
    color: Optional[str] = None
    preferred_exam_subject: Optional[str] = None


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
    whiteboard_state_id: Optional[int] = None
    uploaded_at: datetime
    topic_name: str

class ClassOut(BaseModel):
    id: int
    name: str
    subject: str
    color: Optional[str] = None
    preferred_exam_subject: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ExamLibraryItemOut(BaseModel):
    id: str
    cycle: str
    subject: str
    level: str
    year: str
    title: str
    path: str
    file_url: str


class ClassAccessOut(BaseModel):
    class_id: int
    class_code: str
    class_pin: str


class ClassJoinPayload(BaseModel):
    code: str
    pin: str
    name: Optional[str] = None


class StudentJoinRedirectOut(BaseModel):
    ok: bool
    redirect_url: Optional[str] = None
    message: Optional[str] = None

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
# Quizzes
# -------------------------

class SavedQuizQuestionCreate(BaseModel):
    prompt: str
    choices: List[str]
    correct_index: int = 0
    explanation: Optional[str] = None
    position: Optional[int] = 0


class SavedQuizQuestionUpdate(BaseModel):
    prompt: Optional[str] = None
    choices: Optional[List[str]] = None
    correct_index: Optional[int] = None
    explanation: Optional[str] = None
    position: Optional[int] = None


class SavedQuizQuestionOut(BaseModel):
    id: int
    prompt: str
    choices: List[str]
    correct_index: int
    explanation: Optional[str] = None
    position: int

    model_config = ConfigDict(from_attributes=True)


class SavedQuizCreate(BaseModel):
    title: str
    category: Optional[str] = "General"
    description: Optional[str] = None
    questions: List[SavedQuizQuestionCreate] = []


class SavedQuizUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None


class SavedQuizOut(BaseModel):
    id: int
    class_id: int
    title: str
    category: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    questions: List[SavedQuizQuestionOut] = []

    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)

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


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class WhiteboardStateSave(BaseModel):
    whiteboard_id: Optional[int] = None
    class_id: int
    title: str
    state: dict


class WhiteboardNoteLinkPayload(BaseModel):
    class_id: int
    post_id: int


class WhiteboardStateListItemOut(BaseModel):
    id: int
    class_id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WhiteboardStateOut(BaseModel):
    id: int
    class_id: int
    title: str
    created_at: datetime
    updated_at: datetime
    state: dict

    model_config = ConfigDict(from_attributes=True)


class WhiteboardStateListResponse(BaseModel):
    items: List[WhiteboardStateListItemOut]


class BillingStatusOut(BaseModel):
    subscription_status: str
    billing_interval: Optional[str] = None
    current_period_end: Optional[datetime] = None
    has_stripe_customer: bool = False
    billing_onboarding_required: bool = False
    trial_started_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    trial_active: bool = False
    prompt_usage_today: int = 0
    prompt_limit_today: int = 0

# -------------------------
# Teacher Admin State
# -------------------------

class TeacherAdminStateOut(BaseModel):
    state: dict
    updated_at: Optional[datetime] = None

class TeacherAdminStateSave(BaseModel):
    state: dict

# -------------------------
# Collaboration State
# -------------------------

class CollabCreatePayload(BaseModel):
    class_id: int
    title: str = "Collaboration Whiteboard"
    room_count: int = 4
    timer_minutes: Optional[int] = 10


class CollabCreateResponse(BaseModel):
    session_code: str
    join_url: Optional[str] = None


class CollabJoinPayload(BaseModel):
    anon_id: Optional[str] = None
    name: Optional[str] = None


class CollabJoinResponse(BaseModel):
    anon_id: str
    name: str
    room_number: Optional[int] = None


class CollabAssignItem(BaseModel):
    participant_id: int
    room_number: Optional[int] = None


class CollabAssignmentsPayload(BaseModel):
    assignments: List[CollabAssignItem]


class CollabParticipantOut(BaseModel):
    id: int
    anon_id: str
    name: str
    room_number: Optional[int] = None
    is_online: bool = True


class CollabStatusResponse(BaseModel):
    session_code: str
    title: str
    state: str
    room_count: int
    timer_minutes: Optional[int] = None
    time_left_seconds: Optional[int] = None
    joined_count: int
    assigned_count: int
