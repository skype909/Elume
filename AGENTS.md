# Elume / Classroom Clone

## Project purpose
This project is an edtech platform for teachers and students.
It is evolving into Elume, an AI-powered classroom platform.

## Current stack
- Backend: Python FastAPI
- Frontend: React + TypeScript
- Database: SQLite
- Backend entry point: backend/main.py
- Frontend app entry: frontend/src/App.tsx
- Frontend API layer: frontend/src/api.ts

## Architecture rules
- Keep backend business logic in the FastAPI backend.
- Keep frontend focused on UI and API consumption.
- Do not hardcode API calls across many components; prefer using frontend/src/api.ts.
- Keep database-related logic consistent with db.py, models.py, and schemas.py.
- Prefer modular, readable code over large files.

## Important files
- backend/main.py: primary backend entry point and routing hub
- backend/db.py: database connection/setup
- backend/models.py: database models
- backend/schemas.py: request/response schemas
- frontend/src/App.tsx: main routing/app shell
- frontend/src/api.ts: API communication layer

## Working rules for Codex
When making changes:
1. First inspect the existing code structure before editing.
2. Explain the plan briefly before large changes.
3. Do not break existing routes unless explicitly asked.
4. When changing backend logic, always review backend/main.py and related model/schema files.
5. When changing frontend features, check whether App.tsx and api.ts also need updating.
6. Prefer small, safe refactors over sweeping rewrites.
7. Flag security risks, duplicated logic, and scaling issues when found.

## Quality bar
Before considering work complete:
- code should run
- imports should be valid
- no obvious type or syntax errors
- changes should be consistent with the existing app structure
- note any follow-up work still needed

## Product direction
The long-term goal is to evolve this into Elume, including:
- class workspaces
- teacher planning tools
- collaboration tools
- quizzes
- reports
- AI-supported lesson planning using selected documents
