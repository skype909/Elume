import sys, unittest
from pathlib import Path
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main, models
from db import Base

class SavedVideosTests(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool); Base.metadata.create_all(self.engine); self.db=sessionmaker(bind=self.engine)()
  self.owner=models.UserModel(email="owner@test",password_hash="x"); self.other=models.UserModel(email="other@test",password_hash="x"); self.db.add_all([self.owner,self.other]); self.db.commit()
  self.cls=models.ClassModel(owner_user_id=self.owner.id,name="A",subject="S"); self.other_cls=models.ClassModel(owner_user_id=self.other.id,name="B",subject="S"); self.db.add_all([self.cls,self.other_cls]); self.db.commit(); main.app.dependency_overrides[main.get_db]=lambda:self.db; self.client=TestClient(main.app)
 def tearDown(self): main.app.dependency_overrides.clear(); self.db.close(); self.engine.dispose()
 def h(self,u): return {"Authorization":"Bearer "+jwt.encode({"sub":str(u.id)},main.JWT_SECRET,algorithm=main.JWT_ALG)}
 def payload(self,id="abc"): return {"youtube_id":id,"url":"https://youtu.be/"+id,"title":"Video","category":"Maths"}
 def test_crud_conflicts_and_ownership(self):
  self.assertEqual(self.client.get(f"/classes/{self.cls.id}/videos").status_code,401)
  made=self.client.post(f"/classes/{self.cls.id}/videos",json=self.payload(),headers=self.h(self.owner)); self.assertEqual(made.status_code,201,made.text); row=made.json(); self.assertEqual(set(row),{"id","youtube_id","url","title","category","added_at","updated_at"})
  self.assertEqual(self.client.post(f"/classes/{self.cls.id}/videos",json=self.payload(),headers=self.h(self.owner)).status_code,409)
  # rollback after conflict: a later request still commits
  self.assertEqual(self.client.post(f"/classes/{self.cls.id}/videos",json=self.payload("next"),headers=self.h(self.owner)).status_code,201)
  self.assertEqual(self.client.get(f"/classes/{self.cls.id}/videos",headers=self.h(self.other)).status_code,404)
  self.assertEqual(self.client.put(f"/classes/{self.other_cls.id}/videos/{row['id']}",json=self.payload("changed"),headers=self.h(self.other)).status_code,404)
  self.assertEqual(self.client.delete(f"/classes/{self.other_cls.id}/videos/{row['id']}",headers=self.h(self.other)).status_code,404)
  changed=self.client.put(f"/classes/{self.cls.id}/videos/{row['id']}",json=self.payload("changed"),headers=self.h(self.owner)); self.assertEqual(changed.status_code,200)
  self.assertEqual(self.client.delete(f"/classes/{self.cls.id}/videos/{row['id']}",headers=self.h(self.owner)).status_code,204)
 def test_same_youtube_id_is_scoped_to_class(self):
  self.assertEqual(self.client.post(f"/classes/{self.cls.id}/videos",json=self.payload(),headers=self.h(self.owner)).status_code,201)
  self.assertEqual(self.client.post(f"/classes/{self.other_cls.id}/videos",json=self.payload(),headers=self.h(self.other)).status_code,201)
if __name__ == "__main__": unittest.main()
