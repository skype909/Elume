"""Bounded Linux/Gunicorn comparison harness; never imports application code itself."""
from __future__ import annotations

import argparse
import concurrent.futures
import http.client
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
HARNESS = Path(__file__).resolve().parent
SECRET = "diagnostic-only-jwt-secret-not-used-outside-ci-7d6e5c4b3a2f"

def write(log: Path, text: str) -> None:
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as stream: stream.write(text + "\n")

def request(port: int, method: str, path: str, *, token: str | None = None, body: bytes | None = None, content_type: str | None = None, timeout: float = 5) -> tuple[int, str]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout); headers = {"Accept": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    if content_type: headers["Content-Type"] = content_type
    try:
        conn.request(method, path, body=body, headers=headers); response = conn.getresponse()
        return response.status, response.read().decode("utf-8", "replace")
    finally: conn.close()

def json_request(port: int, method: str, path: str, token: str, value: dict) -> tuple[int, dict]:
    status, payload = request(port, method, path, token=token, body=json.dumps(value).encode(), content_type="application/json")
    return status, json.loads(payload or "{}")

def multipart_upload(port: int, class_id: int, token: str) -> int:
    from docx import Document
    from io import BytesIO
    doc = Document(); doc.add_paragraph("Fictional coursework must be submitted to the class teacher by 12th March 2027."); doc.add_paragraph("Stage 1: Getting Started\nStage 2: Planning\nStage 3: Investigation")
    stream = BytesIO(); doc.save(stream); boundary = "----aac" + uuid4().hex
    body = b"".join((f"--{boundary}\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nspecification\r\n".encode(), f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"fictional-brief.docx\"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n".encode(), stream.getvalue(), b"\r\n", f"--{boundary}--\r\n".encode()))
    return request(port, "POST", f"/classes/{class_id}/aac/documents", token=token, body=body, content_type=f"multipart/form-data; boundary={boundary}")[0]

def seed(source: Path, database_url: str) -> tuple[int, str]:
    script = """import os
os.environ['DATABASE_URL']=os.environ['DIAGNOSTIC_DATABASE_URL']; os.environ['JWT_SECRET']=os.environ['DIAGNOSTIC_JWT_SECRET']
from db import Base,engine,SessionLocal
import models
from jose import jwt
Base.metadata.drop_all(bind=engine); Base.metadata.create_all(bind=engine); db=SessionLocal()
user=models.UserModel(email='pfitzgerald@preskilkenny.ie',password_hash='x',role='teacher',is_active=True,email_verified=True); db.add(user); db.flush()
klass=models.ClassModel(owner_user_id=user.id,name='Synthetic AAC',subject='Physics',aac_planner_enabled=True); db.add(klass); db.flush()
project=models.AacProjectModel(class_id=klass.id,owner_user_id=user.id,title='Synthetic tracker',subject='Physics'); db.add(project); db.flush()
revision=models.AacPlanRevisionModel(project_id=project.id,version=1,state='draft',source_requirements_json=[],source_document_ids_json=[],assumptions_json=[],planning_inputs_json={'weekly_minutes':30,'planned_start':'2026-09-14','normal_finish_target':'2027-02-08','final_classroom_deadline':'2027-02-20','controlling_deadline':'2027-03-12','fifth_year_end':'2026-05-29','sixth_year_restart':'2026-09-14'},plan_json={'stages':[{'id':'synthetic-stage','name':'Synthetic stage','completion_date':'2026-11-01','estimated_minutes':30,'checkpoints':[]}]}); db.add(revision); db.commit()
print(klass.id); print(jwt.encode({'sub':str(user.id)},os.environ['DIAGNOSTIC_JWT_SECRET'],algorithm='HS256'))"""
    env = {**os.environ, "DIAGNOSTIC_DATABASE_URL": database_url, "DIAGNOSTIC_JWT_SECRET": SECRET, "PYTHONDONTWRITEBYTECODE": "1"}
    result = subprocess.run([sys.executable, "-c", script], cwd=source / "backend", env=env, capture_output=True, text=True, check=True)
    class_id, token = result.stdout.strip().splitlines()[-2:]; return int(class_id), token

def dump_stacks(process: subprocess.Popen[bytes], log: Path) -> None:
    try: os.killpg(process.pid, signal.SIGUSR1)
    except ProcessLookupError: pass
    time.sleep(1); write(log, "DIAGNOSTIC: SIGUSR1 sent to the disposable Gunicorn process group for test-only faulthandler capture")

def run_revision(label: str, revision: str, port: int, workdir: Path, database_url: str) -> None:
    source = workdir / label; subprocess.run(["git", "worktree", "add", "--detach", str(source), revision], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    log = workdir / "logs" / f"{label}.log"
    try:
        class_id, token = seed(source, database_url)
        env = {**os.environ, "DATABASE_URL": database_url, "JWT_SECRET": SECRET, "UPLOADS_DIR": str(workdir / label / "uploads"), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1", "PYTHONPATH": os.pathsep.join((str(HARNESS), str(source / "backend")))}
        command = [sys.executable, "-m", "gunicorn", "main:app", "--workers", "1", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", f"127.0.0.1:{port}"]
        write(log, f"REVISION:{revision}\nRUNTIME:{sys.version.split()[0]}\nCOMMAND:gunicorn workers=1 uvicorn.workers.UvicornWorker")
        with log.open("ab") as stream: process = subprocess.Popen(command, cwd=source / "backend", env=env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    if request(port, "GET", "/auth/me", timeout=2)[0] == 401: break
                except (OSError, TimeoutError, socket.timeout): time.sleep(0.2)
            else: raise TimeoutError("startup auth probe did not return 401")
            if [request(port, "GET", "/auth/me", timeout=3)[0] for _ in range(8)] != [401] * 8: raise AssertionError("serial unauthenticated probes failed")
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                probes = [pool.submit(request, port, "GET", "/auth/me", timeout=5) for _ in range(8)]
                if revision.startswith("d58e505"):
                    if json_request(port, "POST", f"/classes/{class_id}/aac/new-draft", token, {})[0] != 200: raise AssertionError("fresh tracker failed")
                    if json_request(port, "PUT", f"/classes/{class_id}/aac/tracker-details", token, {"title":"Synthetic tracker","subject":"Physics","weekly_minutes":30,"current_year_stage":"sixth_year"})[0] != 200: raise AssertionError("tracker setup failed")
                if multipart_upload(port, class_id, token) != 200: raise AssertionError("fictional upload failed")
                if request(port, "GET", f"/classes/{class_id}/aac/deadline-candidates", token=token, timeout=5)[0] != 200: raise AssertionError("deadline review failed")
                if request(port, "GET", f"/classes/{class_id}/aac?recalculate_dates=true", token=token, timeout=5)[0] != 200: raise AssertionError("recalculation failed")
                if [future.result()[0] for future in probes] != [401] * 8: raise AssertionError("concurrent unauthenticated probes failed")
            write(log, "RESULT:pass")
        except Exception as exc:
            dump_stacks(process, log); write(log, f"RESULT:fail:{type(exc).__name__}"); raise
        finally:
            if process.poll() is None: os.killpg(process.pid, signal.SIGTERM)
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL)
    finally: subprocess.run(["git", "worktree", "remove", "--force", str(source)], cwd=ROOT, check=False, stdout=subprocess.DEVNULL)

def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--healthy", required=True); parser.add_argument("--suspect", required=True); args = parser.parse_args()
    workdir = Path(os.environ["DIAGNOSTIC_WORKDIR"]); shutil.rmtree(workdir, ignore_errors=True); (workdir / "logs").mkdir(parents=True)
    run_revision("healthy", args.healthy, 18182, workdir, os.environ["DIAGNOSTIC_DATABASE_URL"])
    run_revision("suspect", args.suspect, 18183, workdir, os.environ["DIAGNOSTIC_DATABASE_URL"])
    return 0

if __name__ == "__main__": raise SystemExit(main())
