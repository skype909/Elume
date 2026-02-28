from __future__ import annotations

import json, os, uuid
import re
import shutil
import random
import string
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_
from sqlalchemy import text
from fastapi import Header
from passlib.context import CryptContext
from jose import jwt, JWTError
import secrets


import models  # IMPORTANT: needed because we reference models.Topic, models.Note, etc.
import schemas
from db import Base, SessionLocal, engine

from models import (
    ClassModel,
    PostModel,
    TestCategory,
    TestItem,
    StudentModel,
    ClassAssessmentModel,
    AssessmentResultModel,
    LiveQuizSessionModel,
    LiveQuizParticipantModel,
    LiveQuizAnswerModel,

)


# =========================================================
# APP
# =========================================================
app = FastAPI()
print("✅ LOADED main.py FROM:", __file__)

PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_ALG = "HS256"
JWT_EXPIRE_DAYS = 30

class AuthRegister(BaseModel):
    email: str
    password: str

class AuthLogin(BaseModel):
    email: str
    password: str

class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"

def _make_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, JWT_SECRET, algorithm=JWT_ALG)

# =========================================================
# CORS
# =========================================================
from starlette.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/auth/register", response_model=AuthToken)
def auth_register(payload: AuthRegister, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    password = (payload.password or "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(models.UserModel).filter(models.UserModel.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.UserModel(email=email, password_hash=PWD_CONTEXT.hash(password))
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"access_token": _make_token(user.id), "token_type": "bearer"}


@app.post("/auth/login", response_model=AuthToken)
def auth_login(payload: AuthLogin, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    password = (payload.password or "").strip()

    user = db.query(models.UserModel).filter(models.UserModel.email == email).first()
    if not user or not PWD_CONTEXT.verify(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"access_token": _make_token(user.id), "token_type": "bearer"}

def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> models.UserModel:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(models.UserModel).filter(models.UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user

# =========================================================
# DB
# =========================================================
Base.metadata.create_all(bind=engine)


# =========================================================
# ADMIN (Students + Assessments/Results)
# =========================================================

class StudentCreate(BaseModel):
    first_name: str
    notes: Optional[str] = None

class StudentBulkCreate(BaseModel):
    names: List[str]
    notes: Optional[str] = None

class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None

class AssessmentCreate(BaseModel):
    title: str
    # optional YYYY-MM-DD; if omitted use today
    assessment_date: Optional[str] = None

class ResultUpsert(BaseModel):
    student_id: int
    score_percent: Optional[int] = None
    absent: bool = False

class BulkResultsUpdate(BaseModel):
    results: List[ResultUpsert]

# =========================================================
# LIVE QUIZ / POLL
# =========================================================

class LiveQuizCreateQuestion(BaseModel):
    id: str
    prompt: str
    choices: dict
    correct: Optional[str] = None  # "A"|"B"|"C"|"D" or None

class LiveQuizCreateRequest(BaseModel):
    class_id: int
    title: str
    anonymous: bool = True
    seconds_per_question: Optional[int] = 20
    shuffle_questions: bool = False
    auto_end_when_all_answered: bool = True
    questions: List[LiveQuizCreateQuestion]

class LiveQuizCreateResponse(BaseModel):
    session_code: str
    join_url: Optional[str] = None

class LiveQuizJoinRequest(BaseModel):
    anon_id: Optional[str] = None  # allow client to send same anon_id again (optional)
    name: Optional[str] = None     # ✅ student-entered name

class LiveQuizJoinResponse(BaseModel):
    anon_id: str
    nickname: Optional[str] = None

class LiveQuizAnswerRequest(BaseModel):
    anon_id: str
    question_id: str
    choice: str  # A/B/C/D

def _rand_code(n: int = 6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(n))

def _kid_name() -> str:
    adj = ["Sunny","Rocket","Brave","Clever","Happy","Chill","Mighty","Rapid","Cosmic","Bouncy","Quiet","Zippy"]
    animal = ["Panda","Koala","Tiger","Otter","Fox","Dolphin","Eagle","Turtle","Penguin","Lemur","Rabbit","Seal"]
    return f"{random.choice(adj)} {random.choice(animal)}"

def _load_questions(session: LiveQuizSessionModel) -> list:
    try:
        q = json.loads(session.questions_json or "[]")
        return q if isinstance(q, list) else []
    except Exception:
        return []

def _time_left_seconds(session: LiveQuizSessionModel) -> Optional[int]:
    if session.state != "live":
        return None
    if not session.seconds_per_question:
        return None
    if not session.question_started_at:
        return None
    elapsed = (datetime.utcnow() - session.question_started_at).total_seconds()
    left = int(session.seconds_per_question - elapsed)
    return max(0, left)

def _current_question(session: LiveQuizSessionModel) -> Optional[dict]:
    qs = _load_questions(session)

    # IMPORTANT: current_index can be 0, so do NOT use "or -1"
    if session.current_index is None:
        idx = -1
    else:
        try:
            idx = int(session.current_index)
        except Exception:
            idx = -1

    if idx < 0 or idx >= len(qs):
        return None
    return qs[idx]

def ensure_columns():
    # Safely add missing columns to existing SQLite tables
    with engine.connect() as conn:
        cols = conn.execute(text("PRAGMA table_info(classes)")).fetchall()
        col_names = {c[1] for c in cols}  # (cid, name, type, notnull, dflt_value, pk)

        if "owner_user_id" not in col_names:
            conn.execute(text("ALTER TABLE classes ADD COLUMN owner_user_id INTEGER"))
            conn.commit()

@app.post("/livequiz/create", response_model=LiveQuizCreateResponse)
def livequiz_create(payload: LiveQuizCreateRequest, db: Session = Depends(get_db)):
    cls = db.query(ClassModel).filter(ClassModel.id == payload.class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    questions = payload.questions or []
    if len(questions) == 0:
        raise HTTPException(status_code=400, detail="At least one question is required")

    # normalise + validate choices
    cleaned = []
    for q in questions:
        qid = (q.id or "").strip()
        prompt = (q.prompt or "").strip()
        if not qid or not prompt:
            raise HTTPException(status_code=400, detail="Each question needs id and prompt")

        choices = q.choices or {}
        # enforce A-D keys
        obj = {
            "id": qid,
            "prompt": prompt,
            "choices": {
                "A": str(choices.get("A","")).strip(),
                "B": str(choices.get("B","")).strip(),
                "C": str(choices.get("C","")).strip(),
                "D": str(choices.get("D","")).strip(),
            },
            "correct": (q.correct or None),
        }
        non_empty = [v for v in obj["choices"].values() if v]
        if len(non_empty) < 2:
            raise HTTPException(status_code=400, detail=f"Question '{prompt}' needs at least 2 options")
        cleaned.append(obj)

    if payload.shuffle_questions:
        random.shuffle(cleaned)

    # session code unique
    for _ in range(20):
        code = _rand_code(6)
        exists = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
        if not exists:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate session code")

    s = LiveQuizSessionModel(
        class_id=payload.class_id,
        session_code=code,
        title=title,
        anonymous=bool(payload.anonymous),
        questions_json=json.dumps(cleaned, ensure_ascii=False),
        state="lobby",
        current_index=-1,
        seconds_per_question=(int(payload.seconds_per_question) if payload.seconds_per_question else None),
        shuffle_questions=bool(payload.shuffle_questions),
        auto_end_when_all_answered=bool(payload.auto_end_when_all_answered),
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    return {"session_code": s.session_code, "join_url": None}

@app.get("/livequiz/{code}/status")
def livequiz_status(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    qs = _load_questions(s)
    joined = db.query(LiveQuizParticipantModel).filter(LiveQuizParticipantModel.session_id == s.id).count()

    # answered count for current question
    answered = 0
    cq = _current_question(s)
    if cq:
        qid = cq.get("id")
        answered = (
            db.query(LiveQuizAnswerModel)
            .filter(LiveQuizAnswerModel.session_id == s.id)
            .filter(LiveQuizAnswerModel.question_id == qid)
            .count()
        )

    return {
        "session_code": s.session_code,
        "state": s.state,
        "title": s.title,
        "anonymous": s.anonymous,
        "seconds_per_question": s.seconds_per_question,
        "current_index": s.current_index,
        "total_questions": len(qs),
        "time_left_seconds": _time_left_seconds(s),
        "joined_count": joined,
        "answered_count": answered,
    }

@app.post("/livequiz/{code}/start")
def livequiz_start(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    qs = _load_questions(s)
    if not qs:
        raise HTTPException(status_code=400, detail="No questions")

    s.state = "live"
    s.started_at = datetime.utcnow()
    s.current_index = 0
    s.question_started_at = datetime.utcnow()
    db.commit()
    return {"message": "started"}

@app.post("/livequiz/{code}/next")
def livequiz_next(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    qs = _load_questions(s)
    if not qs:
        raise HTTPException(status_code=400, detail="No questions")

    if s.state != "live":
        raise HTTPException(status_code=400, detail="Session is not live")

    nxt = int(s.current_index) + 1
    if nxt >= len(qs):
        s.state = "ended"
        s.ended_at = datetime.utcnow()
        db.commit()
        return {"message": "ended"}

    s.current_index = nxt
    s.question_started_at = datetime.utcnow()
    db.commit()
    return {"message": "next"}

@app.post("/livequiz/{code}/end-question")
def livequiz_end_question(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if s.state != "live":
        raise HTTPException(status_code=400, detail="Session is not live")

    # just sets timer to 0 by moving question_started_at back
    if s.seconds_per_question:
        s.question_started_at = datetime.utcnow() - timedelta(seconds=int(s.seconds_per_question))
        db.commit()
    return {"message": "ended_question"}

@app.post("/livequiz/{code}/end-session")
def livequiz_end_session(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    s.state = "ended"
    s.ended_at = datetime.utcnow()
    db.commit()
    return {"message": "ended"}

@app.post("/livequiz/{code}/join", response_model=LiveQuizJoinResponse)
def livequiz_join(code: str, payload: LiveQuizJoinRequest, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    anon_id = (payload.anon_id or "").strip() or uuid.uuid4().hex

    existing = (
        db.query(LiveQuizParticipantModel)
        .filter(LiveQuizParticipantModel.session_id == s.id)
        .filter(LiveQuizParticipantModel.anon_id == anon_id)
        .first()
    )
    if existing:
        return {"anon_id": existing.anon_id, "nickname": existing.nickname}

    provided = (payload.name or "").strip()

    # If anonymous mode, do not store names
    if s.anonymous:
        nickname = None
    else:
        nickname = provided if provided else _kid_name()

    p = LiveQuizParticipantModel(session_id=s.id, anon_id=anon_id, nickname=nickname)
    db.add(p)
    db.commit()
    db.refresh(p)

    return {"anon_id": p.anon_id, "nickname": p.nickname}

@app.get("/livequiz/{code}/current")
def livequiz_current(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    q = _current_question(s)
    return {
        "state": s.state,
        "title": s.title,
        "anonymous": s.anonymous,
        "current_index": s.current_index,
        "total_questions": len(_load_questions(s)),
        "time_left_seconds": _time_left_seconds(s),
        "question": q,
    }

@app.post("/livequiz/{code}/answer")
def livequiz_answer(code: str, payload: LiveQuizAnswerRequest, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    anon_id = (payload.anon_id or "").strip()
    if not anon_id:
        raise HTTPException(status_code=400, detail="anon_id is required")

    choice = (payload.choice or "").strip().upper()
    if choice not in ["A", "B", "C", "D"]:
        raise HTTPException(status_code=400, detail="choice must be A/B/C/D")

    qid = (payload.question_id or "").strip()
    if not qid:
        raise HTTPException(status_code=400, detail="question_id is required")

    p = (
        db.query(LiveQuizParticipantModel)
        .filter(LiveQuizParticipantModel.session_id == s.id)
        .filter(LiveQuizParticipantModel.anon_id == anon_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Participant not joined")

    # prevent double-answering same question by same participant
    existing = (
        db.query(LiveQuizAnswerModel)
        .filter(LiveQuizAnswerModel.session_id == s.id)
        .filter(LiveQuizAnswerModel.participant_id == p.id)
        .filter(LiveQuizAnswerModel.question_id == qid)
        .first()
    )
    if existing:
        existing.choice = choice
        existing.answered_at = datetime.utcnow()
        db.commit()
    else:
        a = LiveQuizAnswerModel(session_id=s.id, participant_id=p.id, question_id=qid, choice=choice)
        db.add(a)
        db.commit()

    # auto-end check (teacher can still press End Q early)
    if s.auto_end_when_all_answered and s.state == "live":
        joined = db.query(LiveQuizParticipantModel).filter(LiveQuizParticipantModel.session_id == s.id).count()
        answered = (
            db.query(LiveQuizAnswerModel)
            .filter(LiveQuizAnswerModel.session_id == s.id)
            .filter(LiveQuizAnswerModel.question_id == qid)
            .count()
        )
        if joined > 0 and answered >= joined and s.seconds_per_question:
            s.question_started_at = datetime.utcnow() - timedelta(seconds=int(s.seconds_per_question))
            db.commit()

    return {"message": "ok"}

def _build_livequiz_results(db: Session, s: LiveQuizSessionModel) -> dict:
    qs = _load_questions(s)
    correct_map = {}
    for q in qs:
        qid = str(q.get("id", "")).strip()
        corr = q.get("correct", None)
        corr = (str(corr).strip().upper() if corr is not None else None)
        if qid:
            correct_map[qid] = corr if corr in ["A", "B", "C", "D"] else None

    participants = (
        db.query(LiveQuizParticipantModel)
        .filter(LiveQuizParticipantModel.session_id == s.id)
        .all()
    )
    pid_to_name = {
        p.id: (p.nickname or ("Anonymous" if s.anonymous else "Player"))
        for p in participants
    }

    answers = (
        db.query(LiveQuizAnswerModel)
        .filter(LiveQuizAnswerModel.session_id == s.id)
        .all()
    )

    # Score per participant
    by_pid = {}
    for a in answers:
        pid = int(a.participant_id)
        qid = str(a.question_id)
        choice = str(a.choice).strip().upper()
        if pid not in by_pid:
            by_pid[pid] = {"answered": 0, "correct": 0}
        by_pid[pid]["answered"] += 1
        corr = correct_map.get(qid, None)
        if corr and choice == corr:
            by_pid[pid]["correct"] += 1

    total_qs = len(qs)
    leaderboard = []
    for p in participants:
        stats = by_pid.get(p.id, {"answered": 0, "correct": 0})
        correct = int(stats["correct"])
        answered = int(stats["answered"])
        percent = int(round((correct / total_qs) * 100)) if total_qs else 0
        leaderboard.append({
            "participant_id": p.id,
            "name": pid_to_name.get(p.id, "Player"),
            "correct": correct,
            "answered": answered,
            "total_questions": total_qs,
            "percent": percent,
        })

    # Sort: most correct, then most answered, then name
    leaderboard.sort(key=lambda r: (-r["correct"], -r["answered"], r["name"].lower()))

    top3 = leaderboard[:3]

    # Question stats (most common choice, difficulty)
    # Build counts by question_id
    q_counts = {}
    for a in answers:
        qid = str(a.question_id)
        choice = str(a.choice).strip().upper()
        if qid not in q_counts:
            q_counts[qid] = {"A": 0, "B": 0, "C": 0, "D": 0, "total": 0}
        if choice in ["A", "B", "C", "D"]:
            q_counts[qid][choice] += 1
            q_counts[qid]["total"] += 1

    question_stats = []
    for q in qs:
        qid = str(q.get("id", ""))
        prompt = str(q.get("prompt", ""))
        counts = q_counts.get(qid, {"A": 0, "B": 0, "C": 0, "D": 0, "total": 0})
        corr = correct_map.get(qid, None)
        total = int(counts["total"])
        correct_ct = int(counts.get(corr, 0)) if corr else 0
        correct_rate = (correct_ct / total) if (total and corr) else None

        # Most common wrong choice
        most_wrong = None
        if corr and total:
            wrong_items = [(k, counts[k]) for k in ["A", "B", "C", "D"] if k != corr]
            wrong_items.sort(key=lambda x: -x[1])
            if wrong_items and wrong_items[0][1] > 0:
                most_wrong = wrong_items[0][0]

        question_stats.append({
            "question_id": qid,
            "prompt": prompt,
            "correct": corr,
            "counts": {k: int(counts[k]) for k in ["A", "B", "C", "D"]},
            "total_answers": total,
            "correct_rate": (float(correct_rate) if correct_rate is not None else None),
            "most_common_wrong": most_wrong,
        })

    # Snapshot
    joined = len(participants)
    attempted_any = sum(1 for r in leaderboard if r["answered"] > 0)
    avg_percent = int(round(sum(r["percent"] for r in leaderboard) / joined)) if joined else 0

    # Hardest question = lowest correct_rate (ignoring None)
    hardest = None
    rated = [q for q in question_stats if isinstance(q["correct_rate"], float)]
    if rated:
        rated.sort(key=lambda q: q["correct_rate"])
        hardest = {"question_id": rated[0]["question_id"], "prompt": rated[0]["prompt"], "correct_rate": rated[0]["correct_rate"]}

    return {
        "session_code": s.session_code,
        "class_id": s.class_id,
        "title": s.title,
        "anonymous": s.anonymous,
        "state": s.state,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "summary": {
            "joined": joined,
            "attempted_any": attempted_any,
            "total_questions": total_qs,
            "avg_percent": avg_percent,
            "hardest_question": hardest,
        },
        "top3": top3,
        "leaderboard": leaderboard,
        "question_stats": question_stats,
    }


@app.get("/livequiz/{code}/results")
def livequiz_results(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    return _build_livequiz_results(db, s)

def _build_livequiz_results(db: Session, s: LiveQuizSessionModel) -> dict:
    qs = _load_questions(s)

    # Map question_id -> correct option (A/B/C/D) if available
    correct_map = {}
    for q in qs:
        qid = str(q.get("id", "")).strip()
        corr = q.get("correct", None)
        corr = (str(corr).strip().upper() if corr is not None else None)
        if qid:
            correct_map[qid] = corr if corr in ["A", "B", "C", "D"] else None

    participants = (
        db.query(LiveQuizParticipantModel)
        .filter(LiveQuizParticipantModel.session_id == s.id)
        .all()
    )

    # Name display (nickname stored; in anonymous mode nickname is None)
    pid_to_name = {}
    for p in participants:
        if s.anonymous:
            pid_to_name[p.id] = "Anonymous"
        else:
            pid_to_name[p.id] = (p.nickname or "Player")

    answers = (
        db.query(LiveQuizAnswerModel)
        .filter(LiveQuizAnswerModel.session_id == s.id)
        .all()
    )

    # Score per participant
    by_pid = {}
    for a in answers:
        pid = int(a.participant_id)
        qid = str(a.question_id)
        choice = str(a.choice).strip().upper()

        if pid not in by_pid:
            by_pid[pid] = {"answered": 0, "correct": 0}

        # count only valid choices
        if choice in ["A", "B", "C", "D"]:
            by_pid[pid]["answered"] += 1

        corr = correct_map.get(qid, None)
        if corr and choice == corr:
            by_pid[pid]["correct"] += 1

    total_qs = len(qs)
    any_correct_keys = any(v in ["A", "B", "C", "D"] for v in correct_map.values())

    leaderboard = []
    for p in participants:
        stats = by_pid.get(p.id, {"answered": 0, "correct": 0})
        answered = int(stats["answered"])
        correct = int(stats["correct"])

        # If there are no correct answers defined, percent is based on participation
        if any_correct_keys and total_qs:
            percent = int(round((correct / total_qs) * 100))
        else:
            percent = int(round((answered / total_qs) * 100)) if total_qs else 0

        leaderboard.append({
            "participant_id": p.id,
            "name": pid_to_name.get(p.id, "Player"),
            "correct": correct,
            "answered": answered,
            "total_questions": total_qs,
            "percent": percent,
        })

    # Sort: if correct keys exist, sort by correct then answered; otherwise answered then name
    if any_correct_keys:
        leaderboard.sort(key=lambda r: (-r["correct"], -r["answered"], r["name"].lower()))
    else:
        leaderboard.sort(key=lambda r: (-r["answered"], r["name"].lower()))

    top3 = leaderboard[:3]

    # Question stats: counts per option + correct rate when available
    q_counts = {}
    for a in answers:
        qid = str(a.question_id)
        choice = str(a.choice).strip().upper()
        if qid not in q_counts:
            q_counts[qid] = {"A": 0, "B": 0, "C": 0, "D": 0, "total": 0}
        if choice in ["A", "B", "C", "D"]:
            q_counts[qid][choice] += 1
            q_counts[qid]["total"] += 1

    question_stats = []
    for q in qs:
        qid = str(q.get("id", "")).strip()
        prompt = str(q.get("prompt", "")).strip()
        counts = q_counts.get(qid, {"A": 0, "B": 0, "C": 0, "D": 0, "total": 0})
        corr = correct_map.get(qid, None)

        total = int(counts["total"])
        correct_ct = int(counts.get(corr, 0)) if corr else 0
        correct_rate = (correct_ct / total) if (total and corr) else None

        # most common wrong choice
        most_wrong = None
        if corr and total:
            wrong_items = [(k, counts[k]) for k in ["A", "B", "C", "D"] if k != corr]
            wrong_items.sort(key=lambda x: -x[1])
            if wrong_items and wrong_items[0][1] > 0:
                most_wrong = wrong_items[0][0]

        question_stats.append({
            "question_id": qid,
            "prompt": prompt,
            "correct": corr,
            "counts": {k: int(counts[k]) for k in ["A", "B", "C", "D"]},
            "total_answers": total,
            "correct_rate": (float(correct_rate) if correct_rate is not None else None),
            "most_common_wrong": most_wrong,
        })

    joined = len(participants)
    attempted_any = sum(1 for r in leaderboard if r["answered"] > 0)
    avg_percent = int(round(sum(r["percent"] for r in leaderboard) / joined)) if joined else 0

    # hardest question = lowest correct_rate
    hardest = None
    rated = [q for q in question_stats if isinstance(q["correct_rate"], float)]
    if rated:
        rated.sort(key=lambda q: q["correct_rate"])
        hardest = {
            "question_id": rated[0]["question_id"],
            "prompt": rated[0]["prompt"],
            "correct_rate": rated[0]["correct_rate"],
        }

    return {
        "session_code": s.session_code,
        "class_id": s.class_id,
        "title": s.title,
        "anonymous": s.anonymous,
        "state": s.state,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "summary": {
            "joined": joined,
            "attempted_any": attempted_any,
            "total_questions": total_qs,
            "avg_percent": avg_percent,
            "hardest_question": hardest,
            "scored_mode": bool(any_correct_keys),
        },
        "top3": top3,
        "leaderboard": leaderboard,
        "question_stats": question_stats,
    }


@app.get("/livequiz/{code}/results")
def livequiz_results(code: str, db: Session = Depends(get_db)):
    s = db.query(LiveQuizSessionModel).filter(LiveQuizSessionModel.session_code == code).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _build_livequiz_results(db, s)

# =========================================================
# FILES / UPLOADS (ABSOLUTE + STABLE)
# =========================================================
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Static serving: /uploads/...
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


def _rel_upload_url(stored_path: str) -> str:
    """
    Convert a stored_path on disk into a URL like /uploads/notes/1/123_file.pdf
    Works whether stored_path is absolute or relative.
    """
    p = Path(stored_path)

    # If absolute path inside UPLOADS_DIR, make it relative to uploads root
    try:
        rel = p.resolve().relative_to(UPLOADS_DIR.resolve()).as_posix()
        return f"/uploads/{rel}"
    except Exception:
        pass

    # Fallback: split on "uploads/" if someone stored a path containing it
    s = p.as_posix()
    if "uploads/" in s:
        rel = s.split("uploads/")[-1]
        return f"/uploads/{rel}"

    # Last resort: just expose basename (not ideal, but avoids crashing)
    return f"/uploads/{p.name}"


# =========================================================
# SEED CLASSES (optional)
# =========================================================
def seed_classes(db: Session):
    # ONLY seed if database is empty
    if db.query(ClassModel).count() > 0:
        return

    defaults = [
        ("6th Year Physics", "Physics"),
        ("6th Year Maths", "Maths"),
        ("5th Year Physics", "Physics"),
        ("3rd Year Maths", "Maths"),
    ]

    for name, subject in defaults:
        db.add(ClassModel(name=name, subject=subject))

    db.commit()



@app.on_event("startup")
def on_startup():
    ensure_columns()
    db = SessionLocal()
    try:
        seed_classes(db)
    finally:
        db.close()


# =========================================================
# CLASSES
# =========================================================
@app.get("/classes")
def get_classes(
    db: Session = Depends(get_db),
    user: models.UserModel = Depends(get_current_user),
):
    return db.query(ClassModel).filter(ClassModel.owner_user_id == user.id).all()


@app.post("/classes", response_model=schemas.ClassOut)
def create_class(
    new_class: schemas.ClassCreate,
    db: Session = Depends(get_db),
    user: models.UserModel = Depends(get_current_user),
):
    c = ClassModel(
        owner_user_id=user.id,
        name=new_class.name,
        subject=new_class.subject,
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    # auto-create student access token
    token = secrets.token_urlsafe(24)
    link = models.StudentAccessLink(
        class_id=c.id,
        token=token,
    )
    db.add(link)
    db.commit()

    return c


@app.post("/whiteboard/save")
async def save_whiteboard(
    class_id: int = Form(...),
    title: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Confirm class exists
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    os.makedirs("uploads/whiteboards", exist_ok=True)

    ext = os.path.splitext(image.filename or "")[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp", ""]:
        ext = ".png"

    filename = f"whiteboard_{class_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex}{ext}"
    disk_path = os.path.join("uploads", "whiteboards", filename)

    # Save file
    contents = await image.read()
    with open(disk_path, "wb") as f:
        f.write(contents)

    # Create a post on the class feed with a link to the saved image
    url_path = f"/uploads/whiteboards/{filename}"
    post = PostModel(
        class_id=class_id,
        author="Whiteboard",
        content=f"Whiteboard saved: {title}",
        links=json.dumps([url_path]),
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    return {
        "id": post.id,
        "class_id": post.class_id,
        "author": post.author,
        "content": post.content,
        "links": post.links,
        "createdAt": getattr(post, "created_at", None),
    }

@app.get("/classes/{class_id}")
def get_class(class_id: int, db: Session = Depends(get_db)):
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    return cls

@app.put("/classes/{class_id}")
def update_class(class_id: int, payload: dict, db: Session = Depends(get_db)):
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()

    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    if "name" in payload and isinstance(payload["name"], str):
        cls.name = payload["name"].strip() or cls.name

    if "subject" in payload and isinstance(payload["subject"], str):
        cls.subject = payload["subject"].strip() or cls.subject

    db.commit()
    db.refresh(cls)

    return cls

# =========================================================
# POSTS (links stored as JSON string)
# =========================================================
def _links_to_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if str(x).strip()]
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x) for x in parsed if str(x).strip()]
        except Exception:
            pass
        parts = re.split(r"[\n,]+", s)
        return [p.strip() for p in parts if p.strip()]
    return [str(v)]


def _links_to_storage(v):
    return json.dumps(_links_to_list(v), ensure_ascii=False)


@app.get("/classes/{class_id}/posts")
def get_posts(class_id: int, db: Session = Depends(get_db)):
    posts = (
        db.query(PostModel)
        .filter(PostModel.class_id == class_id)
        .order_by(PostModel.id.desc())
        .all()
    )
    out = []
    for p in posts:
        out.append(
            {
                "id": p.id,
                "class_id": p.class_id,
                "author": getattr(p, "author", ""),
                "content": getattr(p, "content", ""),
                "links": _links_to_list(getattr(p, "links", None)),
                "createdAt": getattr(p, "created_at", None).isoformat() if getattr(p, "created_at", None) else None,
            }
        )
    return out


@app.post("/classes/{class_id}/posts")
def add_post(class_id: int, new_post: schemas.PostCreate, db: Session = Depends(get_db)):
    p = PostModel(
        class_id=class_id,
        author=new_post.author,
        content=new_post.content,
        links=_links_to_storage(getattr(new_post, "links", None)),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {
        "id": p.id,
        "class_id": p.class_id,
        "author": p.author,
        "content": p.content,
        "links": _links_to_list(getattr(p, "links", None)),
        "createdAt": getattr(p, "created_at", None).isoformat() if getattr(p, "created_at", None) else None,
    }


@app.delete("/posts/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post)
    db.commit()
    return {"message": "Post deleted"}


# =========================================================
# NOTES + TOPICS (Notes vs Exam Papers via prefix)
# =========================================================
EXAM_PREFIX = "EXAM: "
NOTES_PREFIX = "NOTES: "


def strip_prefix(name: str) -> str:
    if name.startswith(EXAM_PREFIX):
        return name[len(EXAM_PREFIX) :]
    if name.startswith(NOTES_PREFIX):
        return name[len(NOTES_PREFIX) :]
    return name


@app.get("/topics/{class_id}", response_model=List[schemas.TopicOut])
def list_topics(class_id: int, kind: str = "notes", db: Session = Depends(get_db)):
    q = db.query(models.Topic).filter(models.Topic.class_id == class_id)
    if kind == "exam":
        q = q.filter(models.Topic.name.startswith(EXAM_PREFIX))
    else:
        q = q.filter(~models.Topic.name.startswith(EXAM_PREFIX))

    topics = q.order_by(models.Topic.name).all()
    return [schemas.TopicOut(id=t.id, class_id=t.class_id, name=strip_prefix(t.name)) for t in topics]


@app.post("/topics", response_model=schemas.TopicOut)
def create_topic(payload: schemas.TopicCreate, kind: str = "notes", db: Session = Depends(get_db)):
    prefix = EXAM_PREFIX if kind == "exam" else NOTES_PREFIX
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Topic name cannot be empty")

    topic = models.Topic(class_id=payload.class_id, name=f"{prefix}{name}")
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return schemas.TopicOut(id=topic.id, class_id=topic.class_id, name=name)


@app.delete("/topics/{topic_id}")
def delete_topic(topic_id: int, db: Session = Depends(get_db)):
    topic = db.query(models.Topic).filter(models.Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # delete notes belonging to this topic
    notes = db.query(models.Note).filter(models.Note.topic_id == topic_id).all()
    for n in notes:
        if n.stored_path and os.path.exists(n.stored_path):
            try:
                os.remove(n.stored_path)
            except Exception:
                pass

    db.query(models.Note).filter(models.Note.topic_id == topic_id).delete()
    db.delete(topic)
    db.commit()
    return {"message": "Topic deleted"}


@app.get("/notes/{class_id}", response_model=List[schemas.NoteOut])
def list_notes(class_id: int, kind: str = "notes", db: Session = Depends(get_db)):
    q = (
        db.query(models.Note, models.Topic)
        .join(models.Topic, models.Note.topic_id == models.Topic.id)
        .filter(models.Note.class_id == class_id)
    )

    if kind == "exam":
        q = q.filter(models.Topic.name.startswith(EXAM_PREFIX))
    else:
        q = q.filter(~models.Topic.name.startswith(EXAM_PREFIX))

    rows = q.order_by(models.Note.id.desc()).all()

    out: List[schemas.NoteOut] = []
    for note, topic in rows:
        out.append(
            schemas.NoteOut(
                id=note.id,
                class_id=note.class_id,
                topic_id=note.topic_id,
                filename=note.filename,
                file_url=_rel_upload_url(note.stored_path),
                uploaded_at=note.uploaded_at,
                topic_name=strip_prefix(topic.name) if topic else "Unsorted",
            )
        )
    return out


@app.post("/notes/upload", response_model=schemas.NoteOut)
def upload_note(
    class_id: int = Form(...),
    topic_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    topic = db.query(models.Topic).filter(models.Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    dest_dir = UPLOADS_DIR / "notes" / str(class_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    safe_name = (file.filename or "file.pdf").replace("\\", "/").split("/")[-1]
    dest_path = dest_dir / f"{int(datetime.utcnow().timestamp())}_{safe_name}"

    with dest_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    n = models.Note(
        class_id=class_id,
        topic_id=topic_id,
        filename=safe_name,
        stored_path=str(dest_path),
    )
    db.add(n)
    db.commit()
    db.refresh(n)

    return schemas.NoteOut(
        id=n.id,
        class_id=n.class_id,
        topic_id=n.topic_id,
        filename=n.filename,
        file_url=_rel_upload_url(n.stored_path),
        uploaded_at=n.uploaded_at,
        topic_name=strip_prefix(topic.name),
    )


@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Note not found")

    if n.stored_path and os.path.exists(n.stored_path):
        try:
            os.remove(n.stored_path)
        except Exception:
            pass

    db.delete(n)
    db.commit()
    return {"message": "Note deleted"}


# =========================================================
# TESTS (Categories + PDF uploads)  — matches schemas.py
# =========================================================
@app.get("/classes/{class_id}/test-categories", response_model=List[schemas.TestCategoryOut])
def list_test_categories(class_id: int, db: Session = Depends(get_db)):
    cats = (
        db.query(TestCategory)
        .filter(TestCategory.class_id == class_id)
        .order_by(TestCategory.id.desc())
        .all()
    )
    return [
        schemas.TestCategoryOut(
            id=c.id,
            class_id=c.class_id,
            title=c.title,
            description=c.description,
        )
        for c in cats
    ]


@app.post("/classes/{class_id}/test-categories", response_model=schemas.TestCategoryOut)
def create_test_category(class_id: int, payload: schemas.TestCategoryCreate, db: Session = Depends(get_db)):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Category title cannot be empty")

    c = TestCategory(
        class_id=class_id,
        title=title,
        description=(payload.description or "").strip() or None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    return schemas.TestCategoryOut(
        id=c.id,
        class_id=c.class_id,
        title=c.title,
        description=c.description,
    )


@app.put("/test-categories/{cat_id}", response_model=schemas.TestCategoryOut)
def update_test_category(cat_id: int, payload: schemas.TestCategoryPatch, db: Session = Depends(get_db)):
    c = db.query(TestCategory).filter(TestCategory.id == cat_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.title is not None:
        t = payload.title.strip()
        if not t:
            raise HTTPException(status_code=400, detail="Category title cannot be empty")
        c.title = t

    if payload.description is not None:
        c.description = payload.description.strip() or None

    db.commit()
    db.refresh(c)

    return schemas.TestCategoryOut(
        id=c.id,
        class_id=c.class_id,
        title=c.title,
        description=c.description,
    )


@app.delete("/test-categories/{cat_id}")
def delete_test_category(cat_id: int, db: Session = Depends(get_db)):
    c = db.query(TestCategory).filter(TestCategory.id == cat_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")

    # detach tests from category
    db.query(TestItem).filter(TestItem.category_id == cat_id).update({"category_id": None})
    db.delete(c)
    db.commit()
    return {"message": "Category deleted"}


@app.get("/classes/{class_id}/tests", response_model=List[schemas.TestOut])
def list_tests(class_id: int, db: Session = Depends(get_db)):
    tests = (
        db.query(TestItem)
        .filter(TestItem.class_id == class_id)
        .order_by(TestItem.id.desc())
        .all()
    )

    out: List[schemas.TestOut] = []
    for t in tests:
        out.append(
            schemas.TestOut(
                id=t.id,
                class_id=t.class_id,
                category_id=t.category_id,
                title=t.title,
                description=t.description,
                filename=t.filename,
                file_url=_rel_upload_url(t.stored_path),
                uploaded_at=t.uploaded_at,
            )
        )
    return out

@app.delete("/classes/{class_id}")
def delete_class(
    class_id: int,
    db: Session = Depends(get_db),
    user: models.UserModel = Depends(get_current_user),
):
    c = db.query(ClassModel).filter(
        ClassModel.id == class_id,
        ClassModel.owner_user_id == user.id
    ).first()

    if not c:
        raise HTTPException(status_code=404, detail="Class not found")

    db.delete(c)
    db.commit()
    return {"ok": True}

@app.post("/tests", response_model=schemas.TestOut)
def upload_test(
    class_id: int = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    category_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    title = (title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    dest_dir = UPLOADS_DIR / "tests" / str(class_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    safe_name = (file.filename or "test.pdf").replace("\\", "/").split("/")[-1]
    dest_path = dest_dir / f"{int(datetime.utcnow().timestamp())}_{safe_name}"

    with dest_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    t = TestItem(
        class_id=class_id,
        category_id=category_id,
        title=title,
        description=(description or "").strip() or None,
        filename=safe_name,
        stored_path=str(dest_path),
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    return schemas.TestOut(
        id=t.id,
        class_id=t.class_id,
        category_id=t.category_id,
        title=t.title,
        description=t.description,
        filename=t.filename,
        file_url=_rel_upload_url(t.stored_path),
        uploaded_at=t.uploaded_at,
    )


@app.put("/tests/{test_id}", response_model=schemas.TestOut)
def update_test(test_id: int, payload: schemas.TestPatch, db: Session = Depends(get_db)):
    t = db.query(TestItem).filter(TestItem.id == test_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")

    if payload.title is not None:
        new_title = payload.title.strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        t.title = new_title

    if payload.description is not None:
        t.description = payload.description.strip() or None

    if payload.category_id is not None or payload.category_id is None:
        # allow explicit null to clear category
        t.category_id = payload.category_id

    db.commit()
    db.refresh(t)

    return schemas.TestOut(
        id=t.id,
        class_id=t.class_id,
        category_id=t.category_id,
        title=t.title,
        description=t.description,
        filename=t.filename,
        file_url=_rel_upload_url(t.stored_path),
        uploaded_at=t.uploaded_at,
    )


@app.delete("/tests/{test_id}")
def delete_test(test_id: int, db: Session = Depends(get_db)):
    t = db.query(TestItem).filter(TestItem.id == test_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")

    if t.stored_path and os.path.exists(t.stored_path):
        try:
            os.remove(t.stored_path)
        except Exception:
            pass

    db.delete(t)
    db.commit()
    return {"message": "Test deleted"}

# -------------------------
# Calendar Routes
# -------------------------
# -------------------------
# Calendar Routes (single canonical source of truth)
# - class_id = NULL => global event
# - class_id = <int> => class event
# -------------------------

@app.get("/calendar-events", response_model=list[schemas.CalendarEventOut])
def list_calendar_events(
    class_id: Optional[int] = None,
    global_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(models.CalendarEvent)

    if global_only:
        return q.filter(models.CalendarEvent.class_id.is_(None)).all()

    # If class_id provided, return (global + this class). Otherwise return all.
    if class_id is not None:
        return q.filter(
            (models.CalendarEvent.class_id.is_(None))
            | (models.CalendarEvent.class_id == class_id)
        ).all()

    return q.all()


# Backwards-compatible endpoint (used by older pages)
@app.get("/classes/{class_id}/calendar-events", response_model=list[schemas.CalendarEventOut])
def get_calendar_events_for_class(class_id: int, db: Session = Depends(get_db)):
    return db.query(models.CalendarEvent).filter(
        models.CalendarEvent.class_id == class_id
    ).all()


@app.post("/calendar-events", response_model=schemas.CalendarEventOut)
def create_calendar_event(event: schemas.CalendarEventCreate, db: Session = Depends(get_db)):
    new_event = models.CalendarEvent(**event.dict())
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event


@app.put("/calendar-events/{event_id}", response_model=schemas.CalendarEventOut)
def update_calendar_event(event_id: int, event: schemas.CalendarEventCreate, db: Session = Depends(get_db)):
    db_event = db.query(models.CalendarEvent).get(event_id)

    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    for key, value in event.dict().items():
        setattr(db_event, key, value)

    db.commit()
    db.refresh(db_event)
    return db_event



@app.post("/student-access/{class_id}")
def create_student_access(
    class_id: int,
    db: Session = Depends(get_db),
    user: models.UserModel = Depends(get_current_user),
):
    cls = db.query(ClassModel).filter(
        ClassModel.id == class_id,
        ClassModel.owner_user_id == user.id
    ).first()

    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    # deactivate existing links
    db.query(models.StudentAccessLink).filter(
        models.StudentAccessLink.class_id == class_id,
        models.StudentAccessLink.is_active == True
    ).update({"is_active": False})

    token = secrets.token_urlsafe(24)

    link = models.StudentAccessLink(
        class_id=class_id,
        token=token,
    )

    db.add(link)
    db.commit()
    db.refresh(link)

    return {"token": token}

@app.get("/student-access/{class_id}")
def get_student_access(
    class_id: int,
    db: Session = Depends(get_db),
    user: models.UserModel = Depends(get_current_user),
):
    link = db.query(models.StudentAccessLink).filter(
        models.StudentAccessLink.class_id == class_id,
        models.StudentAccessLink.is_active == True
    ).first()

    return {"token": link.token if link else None}

@app.get("/student/{token}")
def student_view(token: str, db: Session = Depends(get_db)):
    link = db.query(models.StudentAccessLink).filter(
        models.StudentAccessLink.token == token,
        models.StudentAccessLink.is_active == True
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Invalid link")

    cls = db.query(ClassModel).filter(ClassModel.id == link.class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    posts = (
        db.query(PostModel)
        .filter(PostModel.class_id == link.class_id)
        .order_by(PostModel.created_at.desc())
        .all()
    )

    notes = db.query(models.Note).filter(models.Note.class_id == link.class_id).all()
    tests = db.query(TestItem).filter(TestItem.class_id == link.class_id).all()

    # If you already have _rel_upload_url in main.py elsewhere, reuse it here.
    def _safe_url(stored_path: str | None):
        if not stored_path:
            return None
        # If your project already defines _rel_upload_url earlier, call that instead.
        # This is a safe fallback:
        p = stored_path.replace("\\", "/")
        if "/uploads/" in p:
            return p[p.index("/uploads/"):]
        if "uploads/" in p:
            return "/" + p[p.index("uploads/"):]
        return None

    return {
        "class_name": cls.name,
        "subject": cls.subject,
        "posts": [
    {
        "id": p.id,
        "author": p.author,
        "content": p.content,
        "links": _links_to_list(getattr(p, "links", None)),  # ✅ add this
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
    for p in posts
],
        "notes": [
            {
                "id": n.id,
                "filename": n.filename,
                "file_url": _safe_url(n.stored_path),
            }
            for n in notes
        ],
        "tests": [
            {
                "id": t.id,
                "title": t.title,
                "file_url": _safe_url(t.stored_path),
            }
            for t in tests
        ],
    }


# =========================================================
# STUDENTS (first names only)
# =========================================================

@app.get("/classes/{class_id}/students")
def list_students(class_id: int, db: Session = Depends(get_db)):
    # include inactive too (teacher admin needs to see them)
    rows = (
        db.query(StudentModel)
        .filter(StudentModel.class_id == class_id)
        .order_by(StudentModel.id.desc())
        .all()
    )
    return rows


@app.post("/classes/{class_id}/students")
def create_student(class_id: int, payload: StudentCreate, db: Session = Depends(get_db)):
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    name = (payload.first_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="First name cannot be empty")

    s = StudentModel(
        class_id=class_id,
        first_name=name,
        notes=(payload.notes or "").strip() or None,
        active=True,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@app.put("/students/{student_id}")
def update_student(student_id: int, payload: StudentUpdate, db: Session = Depends(get_db)):
    s = db.query(StudentModel).filter(StudentModel.id == student_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")

    if payload.first_name is not None:
        name = payload.first_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="First name cannot be empty")
        s.first_name = name

    if payload.notes is not None:
        s.notes = payload.notes.strip() or None

    if payload.active is not None:
        s.active = bool(payload.active)

    db.commit()
    db.refresh(s)
    return s

@app.post("/classes/{class_id}/students/bulk")
def create_students_bulk(class_id: int, payload: StudentBulkCreate, db: Session = Depends(get_db)):
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    cleaned = []
    seen = set()

    for n in (payload.names or []):
        name = (n or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(name)

    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid names provided")

    existing = db.query(StudentModel.first_name).filter(
        StudentModel.class_id == class_id
    ).all()

    existing_set = {(x[0] or "").strip().lower() for x in existing}

    to_create = []
    for name in cleaned:
        if name.lower() in existing_set:
            continue
        to_create.append(
            StudentModel(
                class_id=class_id,
                first_name=name,
                active=True,
            )
        )

    if not to_create:
        return []

    db.add_all(to_create)
    db.commit()

    for s in to_create:
        db.refresh(s)

    return to_create

@app.delete("/calendar-events/{event_id}")
def delete_calendar_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.CalendarEvent).get(event_id)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()

    return {"message": "Deleted"}

# =========================================================
# ASSESSMENTS (class tests/results tracker) — separate from PDF "tests"
# =========================================================

@app.get("/classes/{class_id}/assessments")
def list_assessments(class_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(ClassAssessmentModel)
        .filter(ClassAssessmentModel.class_id == class_id)
        .order_by(ClassAssessmentModel.id.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "class_id": a.class_id,
            "title": a.title,
            "assessment_date": a.assessment_date.date().isoformat() if a.assessment_date else None,
        }
        for a in rows
    ]


@app.post("/classes/{class_id}/assessments")
def create_assessment(class_id: int, payload: AssessmentCreate, db: Session = Depends(get_db)):
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    # parse optional YYYY-MM-DD
    if payload.assessment_date:
        try:
            dt = datetime.strptime(payload.assessment_date, "%Y-%m-%d")
        except Exception:
            raise HTTPException(status_code=400, detail="assessment_date must be YYYY-MM-DD")
    else:
        dt = datetime.utcnow()

    a = ClassAssessmentModel(class_id=class_id, title=title, assessment_date=dt)
    db.add(a)
    db.commit()
    db.refresh(a)

    return {
        "id": a.id,
        "class_id": a.class_id,
        "title": a.title,
        "assessment_date": a.assessment_date.date().isoformat() if a.assessment_date else None,
    }


@app.get("/assessments/{assessment_id}/results")
def get_assessment_results(assessment_id: int, db: Session = Depends(get_db)):
    a = db.query(ClassAssessmentModel).filter(ClassAssessmentModel.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Use ACTIVE students by default for entry grid
    students = (
        db.query(StudentModel)
        .filter(StudentModel.class_id == a.class_id)
        .filter(StudentModel.active == True)  # noqa: E712
        .order_by(StudentModel.id.desc())
        .all()
    )

    # existing results keyed by student_id
    existing = (
        db.query(AssessmentResultModel)
        .filter(AssessmentResultModel.assessment_id == assessment_id)
        .all()
    )
    by_student = {r.student_id: r for r in existing}

    rows = []
    for s in students:
        r = by_student.get(s.id)
        rows.append(
            {
                "student_id": s.id,
                "first_name": s.first_name,
                "score_percent": r.score_percent if r else None,
                "absent": bool(r.absent) if r else False,
            }
        )

    return {
        "assessment": {
            "id": a.id,
            "class_id": a.class_id,
            "title": a.title,
            "assessment_date": a.assessment_date.date().isoformat() if a.assessment_date else None,
        },
        "results": rows,
    }


@app.put("/assessments/{assessment_id}/results")
def upsert_assessment_results(assessment_id: int, payload: BulkResultsUpdate, db: Session = Depends(get_db)):
    a = db.query(ClassAssessmentModel).filter(ClassAssessmentModel.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Build map of existing rows for this assessment
    existing = (
        db.query(AssessmentResultModel)
        .filter(AssessmentResultModel.assessment_id == assessment_id)
        .all()
    )
    by_student = {r.student_id: r for r in existing}

    for item in payload.results:
        # Ensure student belongs to the same class
        s = db.query(StudentModel).filter(StudentModel.id == item.student_id).first()
        if not s or s.class_id != a.class_id:
            raise HTTPException(status_code=400, detail=f"Student {item.student_id} not in this class")

        absent = bool(item.absent)

        # normalise score
        score = item.score_percent
        if absent:
            score = None
        else:
            if score is None:
                score = 0
            score = int(score)
            if score < 0 or score > 100:
                raise HTTPException(status_code=400, detail="score_percent must be 0..100")

        r = by_student.get(item.student_id)
        if r:
            r.absent = absent
            r.score_percent = score
        else:
            r = AssessmentResultModel(
                assessment_id=assessment_id,
                student_id=item.student_id,
                absent=absent,
                score_percent=score,
            )
            db.add(r)

    db.commit()

    return {"message": "Saved"}

@app.get("/classes/{class_id}/insights")
def class_insights(class_id: int, db: Session = Depends(get_db)):
    # Active students only (consistent with your results entry grid)
    students = (
        db.query(StudentModel)
        .filter(StudentModel.class_id == class_id)
        .filter(StudentModel.active == True)  # noqa: E712
        .order_by(StudentModel.id.desc())
        .all()
    )

    active_student_count = len(students)
    if active_student_count == 0:
        return {
            "class_id": class_id,
            "class_average": None,
            "assessment_count": 0,
            "active_student_count": 0,
            "student_rankings": [],
            "at_risk": [],
        }

    student_ids = [s.id for s in students]

    # Count assessments for this class
    assessment_count = (
        db.query(ClassAssessmentModel)
        .filter(ClassAssessmentModel.class_id == class_id)
        .count()
    )

    # Pull all results for this class (join assessments -> results)
    rows = (
        db.query(AssessmentResultModel, ClassAssessmentModel)
        .join(ClassAssessmentModel, AssessmentResultModel.assessment_id == ClassAssessmentModel.id)
        .filter(ClassAssessmentModel.class_id == class_id)
        .filter(AssessmentResultModel.student_id.in_(student_ids))
        .all()
    )

    # Aggregate per student
    scores_by_student: dict[int, list[int]] = {sid: [] for sid in student_ids}
    tests_count_by_student: dict[int, int] = {sid: 0 for sid in student_ids}
    absences_by_student: dict[int, int] = {sid: 0 for sid in student_ids}
    latest_by_student: dict[int, int | None] = {sid: None for sid in student_ids}

    for r, a in rows:
        tests_count_by_student[r.student_id] += 1

        if r.absent:
            absences_by_student[r.student_id] += 1
            continue

        if r.score_percent is None:
            continue

        sc = int(r.score_percent)
        scores_by_student[r.student_id].append(sc)
        latest_by_student[r.student_id] = sc  # "latest" in the order rows arrive (good enough for now)

    # Build output rows
    rankings = []
    class_avgs = []

    for s in students:
        scores = scores_by_student.get(s.id, [])
        avg = round(sum(scores) / len(scores), 1) if scores else None

        if avg is not None:
            class_avgs.append(avg)

        rankings.append(
            {
                "student_id": s.id,
                "first_name": s.first_name,
                "average": avg,
                "taken": tests_count_by_student.get(s.id, 0),
                "missed": absences_by_student.get(s.id, 0),
                "latest": latest_by_student.get(s.id, None),
            }
        )

    # Sort: strongest -> weakest by average; students with no avg at bottom
    rankings.sort(
        key=lambda x: (x["average"] is None, -(x["average"] or -1))
    )

    class_avg = round(sum(class_avgs) / len(class_avgs), 1) if class_avgs else None

    # At-risk rule v1 (simple + effective)
    # - average < 50 OR missed >= 2
    at_risk = []
    for r in rankings:
        reasons = []
        if r["average"] is not None and r["average"] < 50:
            reasons.append("Average below 50")
        if r["missed"] >= 2:
            reasons.append(f"Missed {r['missed']} assessments")
        if reasons:
            at_risk.append(
                {
                    "student_id": r["student_id"],
                    "first_name": r["first_name"],
                    "average": r["average"],
                    "missed": r["missed"],
                    "reasons": reasons,
                }
            )

    return {
        "class_id": class_id,
        "class_average": class_avg,
        "assessment_count": assessment_count,
        "active_student_count": active_student_count,
        "student_rankings": rankings,
        "at_risk": at_risk,
    }

from sqlalchemy import func  # add near your other imports

@app.get("/classes/{class_id}/students/{student_id}/history")
def student_history(
    class_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    user: models.UserModel = Depends(get_current_user),
):
    # ✅ Security: ensure class belongs to logged-in teacher
    cls = db.query(ClassModel).filter(
        ClassModel.id == class_id,
        ClassModel.owner_user_id == user.id
    ).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    # Ensure student belongs to this class
    student = db.query(StudentModel).filter(
        StudentModel.id == student_id,
        StudentModel.class_id == class_id
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Assessments in chronological order
    assessments = (
        db.query(ClassAssessmentModel)
        .filter(ClassAssessmentModel.class_id == class_id)
        .order_by(ClassAssessmentModel.assessment_date.asc(), ClassAssessmentModel.id.asc())
        .all()
    )

    if not assessments:
        return {
            "student": {"id": student.id, "first_name": student.first_name},
            "points": [],
        }

    assessment_ids = [a.id for a in assessments]

    # Student results for those assessments
    student_results = (
        db.query(AssessmentResultModel)
        .filter(AssessmentResultModel.assessment_id.in_(assessment_ids))
        .filter(AssessmentResultModel.student_id == student_id)
        .all()
    )
    by_assessment = {r.assessment_id: r for r in student_results}

    # Class averages per assessment (exclude absent + null scores)
    avg_rows = (
        db.query(
            AssessmentResultModel.assessment_id.label("assessment_id"),
            func.avg(AssessmentResultModel.score_percent).label("avg_score"),
        )
        .filter(AssessmentResultModel.assessment_id.in_(assessment_ids))
        .filter(AssessmentResultModel.absent == False)  # noqa: E712
        .filter(AssessmentResultModel.score_percent.isnot(None))
        .group_by(AssessmentResultModel.assessment_id)
        .all()
    )
    avg_by_assessment = {int(r.assessment_id): float(r.avg_score) for r in avg_rows}

    points = []
    for a in assessments:
        r = by_assessment.get(a.id)

        # student score: null if absent or missing row
        student_score = None
        absent = False

        if r:
            absent = bool(r.absent)
            if not absent and r.score_percent is not None:
                student_score = int(r.score_percent)

        class_avg = avg_by_assessment.get(a.id, None)
        class_avg_rounded = round(class_avg, 1) if class_avg is not None else None

        points.append(
            {
                "assessment_id": a.id,
                "title": a.title,
                "date": a.assessment_date.date().isoformat() if a.assessment_date else None,
                "student": student_score,
                "absent": absent,
                "class_avg": class_avg_rounded,
            }
        )

    return {
        "student": {"id": student.id, "first_name": student.first_name},
        "points": points,
    }

# -------------------------
# AI Calendar Assistant (draft only - NEVER writes to DB)
# -------------------------
@app.post("/ai/parse-event", response_model=schemas.AIParseEventResponse)
def ai_parse_event(payload: schemas.AIParseEventRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # Lazy import so your backend still runs even if openai isn't installed in this env
    try:
        from openai import OpenAI  # type: ignore
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI client not available: {e}")

    # ✅ Make key usage explicit (prevents silent 500s)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is missing. Check backend .env and that load_dotenv() runs on startup.",
        )

    client = OpenAI(api_key=api_key)

    system = (
       "Today is " + datetime.now().date().isoformat() + " in timezone " + payload.timezone + ". "
        "If the user does not specify a year, choose the next occurrence in the future (not past). "
        "You convert teacher calendar requests into a single JSON object for an event draft. "
        "Return ONLY valid JSON. No markdown. "
        "Timezone: " + payload.timezone + ". "
        "If date is relative (e.g. next Friday), resolve it relative to today's date. "
        "If no end time is provided, set end_date to start + default duration. "
        "If it's clearly an all-day item (e.g. 'midterm break', 'bank holiday'), set all_day=true and set times to 09:00 start, 09:00 end. "
        "Use event_type one of: general, test, homework, trip. "
        "Required keys: title, description, event_date, end_date, all_day, event_type, class_id."
    )

    user = (
        f"Text: {text}\n"
        f"class_id: {payload.class_id}\n"
        f"default_duration_minutes: {payload.default_duration_minutes}\n"
        f"timezone: {payload.timezone}"
        f"today: {datetime.now().date().isoformat()}\n"
    )

    resp = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
    )

    content = (resp.choices[0].message.content or "").strip()

    # Extract the first JSON object defensively (supports extra text)
    m = re.search(r"\{[\s\S]*\}", content)
    if not m:
        raise HTTPException(status_code=500, detail=f"AI did not return JSON. Got: {content[:200]}")

    try:
        data = json.loads(m.group(0))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not parse AI JSON: {e}")

    # Some models return {"draft": {...}}; accept both shapes
    if isinstance(data, dict) and "draft" in data and isinstance(data["draft"], dict):
        data = data["draft"]

    warnings: list[str] = []

    # Force class_id from payload if provided (front-end controls target class)
    if payload.class_id is not None:
        data["class_id"] = payload.class_id

    # If end_date missing, we’ll let schema validation complain nicely (422),
    # but keep your warning behavior too:
    if data.get("end_date") in (None, ""):
        warnings.append(f"End time assumed as {payload.default_duration_minutes} minutes (AI did not supply end_date).")

    # ✅ Catch schema validation errors and return 422 instead of 500
    try:
        draft = schemas.CalendarEventCreate(**data)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"AI draft failed validation against CalendarEventCreate. Error: {e}. Draft keys: {list(data.keys())}",
        )

    return schemas.AIParseEventResponse(draft=draft, warnings=warnings)


# ================= AI QUIZ GENERATION =================

import requests
from pypdf import PdfReader

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


class GenerateQuizRequest(BaseModel):
    class_id: int
    note_id: int
    num_questions: int = 10


@app.get("/ai/status")
def ai_status():
    return {
        "has_key": bool(OPENAI_API_KEY),
        "model": OPENAI_MODEL,
    }


def extract_pdf_text(path: str):
    reader = PdfReader(path)
    text = ""

    for page in reader.pages:
        try:
            text += page.extract_text() or ""
        except:
            pass

    return text[:12000]

@app.post("/ai/generate-quiz-from-note")
def generate_quiz(payload: GenerateQuizRequest, db: Session = Depends(get_db)):

    note = db.query(models.Note).filter(models.Note.id == payload.note_id).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if not os.path.exists(note.stored_path):
        raise HTTPException(status_code=404, detail="PDF missing")

    text = extract_pdf_text(note.stored_path)

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    prompt = f"""
Create {payload.num_questions} multiple choice quiz questions from this content.

Return JSON format:

{{
"title": "Quiz",
"questions":[
{{
"prompt": "",
"choices": ["","","",""],
"correctIndex": 0
}}
]
}}

CONTENT:
{text}
"""

    body = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.4
    }

    r = requests.post(OPENAI_URL, headers=headers, json=body)

    if r.status_code != 200:
        raise HTTPException(status_code=500, detail=r.text)

    data = r.json()
    content = data["choices"][0]["message"]["content"]

    cleaned = content.strip()

    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(cleaned)
    except Exception:
        return {
            "error": "OpenAI did not return valid JSON",
            "raw_response": cleaned
        }
