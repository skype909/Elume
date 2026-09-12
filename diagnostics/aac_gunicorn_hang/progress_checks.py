"""Synthetic-only progress and non-destructive recovery verification."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time
from jose import jwt


def check_progress(port, class_id, token, request, json_request, auth_probe, log, write):
    base = f"/classes/{class_id}/aac"
    def get(path, auth=token):
        status, raw = request(port, "GET", path, token=auth)
        assert status == 200, f"GET status {status}"
        return json.loads(raw)
    grid = get(base + "/students"); identity = grid["tracker_id"]
    stage_ids = [s["id"] for s in grid["stages"]]
    original_plan = get(base)["project"]["revision"]
    students = grid["students"]; alice, bob = students[0]["id"], students[1]["id"]
    payload = {"tracker_id":identity, "expected_version":0, "stages":{stage_ids[0]:{"status":"ready_for_review","target":"2026-10-26"}}, "note":"Synthetic teacher next action", "follow_up":"2026-10-20"}
    stop = threading.Event()
    def auth_loop():
        count = 0; deadline = time.monotonic() + 45
        while (not stop.is_set() or count < 8) and time.monotonic() < deadline:
            assert auth_probe() == 401
            count += 1; time.sleep(.01)
        assert count >= 8
        return count
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        auth_work = pool.submit(auth_loop)
        try:
            assert json_request(port, "PUT", base + f"/students/{alice}", token, payload)[0] == 200
            # request() creates a fresh HTTP connection each time; a fresh signed
            # teacher token also exercises a new authenticated client identity.
            fresh_token = jwt.encode({"sub":"1", "diagnostic_client":"fresh"}, os.environ["DIAGNOSTIC_JWT_SECRET"], algorithm="HS256")
            assert request(port, "GET", "/auth/me", token=fresh_token)[0] == 200
            saved = get(base + "/students", fresh_token)["students"][0]["check_in"]
            assert saved["note"] == payload["note"] and saved["follow_up"] == payload["follow_up"]
            assert saved["stages"][stage_ids[0]]["target"] == "2026-10-26"
            assert saved["stages"][stage_ids[0]]["status"] == "ready_for_review"
            assert get(base)["project"]["revision"]["plan"] == original_plan["plan"]
            assert get(base + "/students")["students"][1]["check_in"]["version"] == 0
            dan = jwt.encode({"sub":"2"}, os.environ["DIAGNOSTIC_JWT_SECRET"], algorithm="HS256")
            outsider = jwt.encode({"sub":"3"}, os.environ["DIAGNOSTIC_JWT_SECRET"], algorithm="HS256")
            assert request(port,"GET",base+"/students",token=dan)[0] == 404
            assert request(port,"GET",base+"/students",token=outsider)[0] == 403
            assert json_request(port,"PUT",base+f"/students/{alice}",dan,payload)[0] == 404
            assert json_request(port,"PUT",base+"/students/3",token,payload)[0] == 404
            dan_grid = get("/classes/2/aac/students", dan)
            dan_payload = {**payload,"tracker_id":dan_grid["tracker_id"],"stages":{"dan-stage":{"status":"teacher_reviewed","target":None}}}
            assert json_request(port,"PUT","/classes/2/aac/students/3",dan,dan_payload)[0] == 200
            assert get("/classes/2/aac/students",dan)["students"][0]["check_in"]["note"] == payload["note"]
            assert request(port,"GET","/classes/2/aac/students",token=token)[0] == 404
            # PostgreSQL contention: exactly one same-version writer can win.
            writes = [pool.submit(json_request,port,"PUT",base+f"/students/{bob}",token,payload) for _ in range(2)]
            assert sorted(f.result()[0] for f in writes) == [200,409]
            stages = list(reversed(original_plan["plan"]["stages"]))
            stages[0] = {**stages[0],"name":"Synthetic renamed stage","completion_date":"2026-11-09"}
            plan_payload = {"tracker_id":identity,"plan":{"stages":stages},"planning_inputs":original_plan["planning_inputs"]}
            assert json_request(port,"PUT",base+"/revision",token,plan_payload)[0] == 200
            assert get(base+"/students")["students"][0]["check_in"] == saved
            reduced = [s for s in stages if s["id"] != stage_ids[0]]
            removal = {**plan_payload,"plan":{"stages":reduced}}
            assert json_request(port,"PUT",base+"/revision",token,removal)[0] == 409
            removal["reviewed_removed_stage_ids"] = [stage_ids[0]]
            assert json_request(port,"PUT",base+"/revision",token,removal)[0] == 200
            assert get(base+"/students")["students"][0]["check_in"] == saved
            assert request(port,"DELETE",f"/students/{alice}",token=token)[0] == 409
            assert json_request(port,"PUT",f"/students/{alice}",token,{"active":False})[0] == 200
            archived = get(base+"/students")["students"][0]
            assert archived["active"] is False and archived["check_in"] == saved
            admin = jwt.encode({"sub":"4"}, os.environ["DIAGNOSTIC_JWT_SECRET"], algorithm="HS256")
            assert request(port,"DELETE",f"/classes/{class_id}",token=token)[0] == 409
            assert json_request(port,"DELETE","/admin/users",admin,{"email":"pfitzgerald@preskilkenny.ie","hard_delete":True})[0] == 409
            assert get(base+"/students")["students"][0]["check_in"] == saved
            assert request(port,"DELETE","/classes/3",token=token)[0] == 200
            assert json_request(port,"DELETE","/admin/users",admin,{"email":"candidate-empty@example.test","hard_delete":True})[0] == 200
            write(log,"DELETION:owner-and-admin-protected=409 history=retained ordinary-owner-and-admin=200")
            write(log,"PROGRESS:both-reviewers=save-reload fresh-auth-client=pass cross-owner-class-student=reject individual-date-isolation=pass rename-reorder-dates=retained contention=200+409 stage-removal=reviewed-history student-delete=blocked archive=retained")
        finally: stop.set()
        write(log,f"PROGRESS:concurrent-auth-count={auth_work.result()}")
    return identity, saved


def database_fingerprint(source, database_url):
    code = """import hashlib,json
from sqlalchemy import text
from db import engine
with engine.connect() as c:
 data={t:[dict(r) for r in c.execute(text('SELECT * FROM '+t+' ORDER BY id')).mappings()] for t in ['aac_student_progress','aac_plan_revisions','aac_projects','students']}
 print(hashlib.sha256(json.dumps(data,sort_keys=True,default=str).encode()).hexdigest())
"""
    env = {**os.environ,"DATABASE_URL":database_url,"PYTHONDONTWRITEBYTECODE":"1"}
    return subprocess.check_output([sys.executable,"-c",code],cwd=source/"backend",env=env,timeout=15,text=True).strip()


def check_recovery(root, harness, revision, candidate, workdir, database_url, token, request, write, dump_stacks):
    source = workdir/"recovery"; log = workdir/"logs/recovery.log"
    subprocess.run(["git","worktree","add","--detach",str(source),revision],cwd=root,check=True,stdout=subprocess.DEVNULL)
    main = source/"backend/main.py"
    # Deterministic recovery source: exact baseline plus middleware registration.
    original = subprocess.check_output(["git","show",f"{revision}:backend/main.py"],cwd=root)
    from recovery_source import assemble
    final = subprocess.check_output(["git","show",f"{candidate}:backend/main.py"],cwd=root)
    main.write_bytes(assemble(original,final))
    shutil.copyfile(harness/"aac_recovery_guard.py",source/"backend/aac_recovery_guard.py")
    before = database_fingerprint(source,database_url)
    env = {**os.environ,"DATABASE_URL":database_url,"JWT_SECRET":os.environ["DIAGNOSTIC_JWT_SECRET"],"ELUME_UPLOADS_DIR":str(workdir/"recovery-uploads"),"PYTHONPATH":os.pathsep.join((str(harness),str(source/"backend"))),"PYTHONDONTWRITEBYTECODE":"1"}
    with log.open("ab") as stream:
        process = subprocess.Popen([sys.executable,"-m","gunicorn","main:app","--workers","1","--worker-class","uvicorn.workers.UvicornWorker","--bind","127.0.0.1:18184"],cwd=source/"backend",env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
    write(log,f"RECOVERY:baseline={revision} master={process.pid} main_sha256={hashlib.sha256(main.read_bytes()).hexdigest()} guard_sha256={hashlib.sha256((source/'backend/aac_recovery_guard.py').read_bytes()).hexdigest()}")
    try:
        deadline = time.monotonic()+30
        while time.monotonic()<deadline:
            try:
                if request(18184,"GET","/auth/me",timeout=2)[0]==401 and "Application startup complete" in log.read_text(): break
            except OSError: time.sleep(.2)
        else: raise TimeoutError("Recovery worker startup failed")
        for _ in range(8): assert request(18184,"GET","/auth/me",timeout=3)[0] == 401
        for method,path in [("PUT","/classes/1/aac/revision"),("POST","/classes/1/aac/new-draft"),("PUT","/classes/1/aac/students/1")]:
            assert request(18184,method,path,token=token)[0] == 503
        for path in ['/students/1','/classes/1']:
            assert request(18184,'DELETE',path,token=token)[0] == 409
        admin=jwt.encode({'sub':'4'},os.environ['DIAGNOSTIC_JWT_SECRET'],algorithm='HS256')
        def admin_delete(email):
            return request(18184,'DELETE','/admin/users',token=admin,body=json.dumps({'email':email,'hard_delete':True}).encode(),content_type='application/json')[0]
        assert admin_delete('pfitzgerald@preskilkenny.ie') == 409
        assert request(18184,"GET","/classes/1/aac",token=token)[0] == 200
        after = database_fingerprint(source,database_url)
        assert before == after
        assert request(18184,'DELETE','/classes/5',token=token)[0] == 200
        assert admin_delete('recovery-empty@example.test') == 200
        write(log,"RECOVERY:worker-startup=complete auth=8x401-json old-plan-read=200 AAC-writes=503 protected-student-owner-admin-deletes=409 protected-database-fingerprint=unchanged ordinary-owner-admin-deletes=200 RESULT:pass")
    except Exception as exc:
        dump_stacks(process,log); write(log,f"RESULT:fail:{type(exc).__name__}"); raise
    finally:
        if process.poll() is None: os.killpg(process.pid,signal.SIGTERM)
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL); process.wait(timeout=5)
        subprocess.run(["git","worktree","remove","--force",str(source)],cwd=root,check=False,stdout=subprocess.DEVNULL)
