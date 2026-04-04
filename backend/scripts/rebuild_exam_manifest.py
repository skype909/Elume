"""
Rebuild Elume's exam library manifest from the exam-library folders.

Usage from the repo root:
    python backend/scripts/rebuild_exam_manifest.py

Optional override:
    ELUME_EXAM_LIBRARY_DIR=/var/lib/elume/exam-library python backend/scripts/rebuild_exam_manifest.py

This keeps the existing manifest-driven runtime intact. It scans the exam-library
folder, infers metadata from folder names and filenames, backs up the previous
manifest, and writes a fresh manifest.json in the shape already used by the app.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


DEFAULT_EXAM_LIBRARY_DIR = Path("/var/lib/elume/exam-library")
EXAM_LIBRARY_DIR = Path(os.getenv("ELUME_EXAM_LIBRARY_DIR") or DEFAULT_EXAM_LIBRARY_DIR)
MANIFEST_PATH = EXAM_LIBRARY_DIR / "manifest.json"

PDF_EXTENSIONS = {".pdf"}

SUBJECT_NAME_MAP = {
    "applied maths": "Applied Maths",
    "biology": "Biology",
    "biologyab": "Biology",
    "biologyc": "Biology",
    "chemistry": "Chemistry",
    "english": "English",
    "french": "French",
    "gaeilge": "Irish",
    "geography": "Geography",
    "history": "History",
    "irish": "Irish",
    "maths": "Maths",
    "physics": "Physics",
}

LEVEL_MAP = {
    "hl": "Higher Level",
    "ol": "Ordinary Level",
    "cl": "Common Level",
}

LEVEL_ID_MAP = {
    "Higher Level": "hl",
    "Ordinary Level": "ol",
    "Common Level": "cl",
}


@dataclass(frozen=True)
class ParsedExamPaper:
    cycle: str
    subject: str
    level: str
    year: str
    title: str
    path: str
    item_id: str


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def _cycle_from_part(part: str) -> str | None:
    key = part.strip().lower()
    if key == "junior-cycle":
        return "Junior Cycle"
    if key == "senior-cycle":
        return "Senior Cycle"
    return None


def _certificate_label(cycle: str) -> str:
    return "Leaving Certificate" if cycle == "Senior Cycle" else "Junior Cycle"


def _subject_from_folder(folder_name: str) -> str:
    cleaned = folder_name.replace("_", " ").strip()
    return SUBJECT_NAME_MAP.get(cleaned.lower(), " ".join(word.capitalize() for word in cleaned.split()))


def _paper_suffix_from_tokens(tokens: list[str]) -> tuple[str | None, str | None]:
    upper_tokens = [token.upper() for token in tokens]
    if "P1" in upper_tokens:
        return "Paper 1", "paper-1"
    if "P2" in upper_tokens:
        return "Paper 2", "paper-2"
    if "AB" in upper_tokens:
        return "Section AB", "section-ab"
    if "C" in upper_tokens:
        return "Section C", "section-c"
    return None, None


def _parse_pdf(path: Path, root: Path) -> ParsedExamPaper | None:
    rel_path = path.relative_to(root).as_posix()
    parts = rel_path.split("/")
    if len(parts) < 3:
        return None

    cycle = _cycle_from_part(parts[0])
    if not cycle:
        return None

    subject = _subject_from_folder(parts[1])

    stem = path.stem.replace("_", "-")
    tokens = [token for token in re.split(r"[^A-Za-z0-9]+", stem) if token]
    lower_tokens = [token.lower() for token in tokens]

    year_match = re.search(r"\b(20\d{2})\b", stem)
    if not year_match:
        return None
    year = year_match.group(1)

    level = ""
    for token in lower_tokens:
        if token in LEVEL_MAP:
            level = LEVEL_MAP[token]
            break
    if not level:
        return None

    paper_label, paper_id = _paper_suffix_from_tokens(tokens)
    certificate = _certificate_label(cycle)
    level_short = LEVEL_ID_MAP[level].upper()
    title_parts = [certificate, subject, level_short, year]
    if paper_label:
        title_parts.append(paper_label)
    title = " ".join(title_parts)

    item_id_parts = [_slugify("lc" if cycle == "Senior Cycle" else "jc"), _slugify(subject), LEVEL_ID_MAP[level], year]
    if paper_id:
        item_id_parts.append(paper_id)
    item_id = "-".join(part for part in item_id_parts if part)

    return ParsedExamPaper(
        cycle=cycle,
        subject=subject,
        level=level,
        year=year,
        title=title,
        path=rel_path,
        item_id=item_id,
    )


def _iter_exam_pdfs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        [
            path
            for path in root.rglob("*")
            if path.is_file() and path.suffix.lower() in PDF_EXTENSIONS
        ],
        key=lambda p: p.relative_to(root).as_posix().lower(),
    )


def _ensure_unique_id(base_id: str, seen: set[str]) -> str:
    if base_id not in seen:
        seen.add(base_id)
        return base_id
    counter = 2
    while True:
        candidate = f"{base_id}-{counter}"
        if candidate not in seen:
            seen.add(candidate)
            return candidate
        counter += 1


def rebuild_manifest(root: Path) -> tuple[int, Path | None]:
    root = root.resolve()
    items: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    for pdf_path in _iter_exam_pdfs(root):
        parsed = _parse_pdf(pdf_path, root)
        if not parsed:
            continue
        item_id = _ensure_unique_id(parsed.item_id, seen_ids)
        items.append(
            {
                "id": item_id,
                "cycle": parsed.cycle,
                "subject": parsed.subject,
                "level": parsed.level,
                "year": parsed.year,
                "title": parsed.title,
                "path": parsed.path,
            }
        )

    items.sort(key=lambda item: (item["subject"].lower(), item["cycle"].lower(), item["level"].lower(), item["year"], item["title"].lower()))

    backup_path: Path | None = None
    if MANIFEST_PATH.exists():
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        backup_path = MANIFEST_PATH.with_name(f"manifest.backup.{timestamp}.json")
        shutil.copy2(MANIFEST_PATH, backup_path)

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(items), backup_path


def main() -> int:
    item_count, backup_path = rebuild_manifest(EXAM_LIBRARY_DIR)
    print(f"Exam library root: {EXAM_LIBRARY_DIR}")
    print(f"Manifest written: {MANIFEST_PATH}")
    print(f"Items written: {item_count}")
    if backup_path:
        print(f"Backup created: {backup_path}")
    else:
        print("Backup created: none (no previous manifest found)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
