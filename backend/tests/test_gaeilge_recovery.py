import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import authorization
import main
import models
import schemas


BACKEND_DIR = Path(__file__).resolve().parents[1]
EXPECTED_GAEILGE_REVIEWERS = {
    "admin@elume.ie", "peter@elume.ie", "pfitzgerald@preskilkenny.ie",
    "emma@elume.ie", "sdb@elume.ie", "jskelton@elume.ie",
    "lmulcahy@preskilkenny.ie", "nbrennan@preskilkenny.ie",
    "rgalway@preskilkenny.ie",
}


class GaeilgeRecoveryTests(unittest.TestCase):
    def test_application_imports_and_reviewer_routes_are_registered(self):
        route_paths = {route.path for route in main.app.routes}
        self.assertIn("/ui-translations/ga", route_paths)
        self.assertIn("/ui-translations/ga/{translation_key}", route_paths)
        self.assertEqual(
            authorization.GAEILGE_REVIEWER_EMAILS,
            EXPECTED_GAEILGE_REVIEWERS,
        )
        for email in EXPECTED_GAEILGE_REVIEWERS:
            self.assertTrue(authorization.is_gaeilge_reviewer(type("User", (), {"email": email})()))
        self.assertTrue(authorization.is_gaeilge_reviewer(type("User", (), {"email": "  EMMA@ELUME.IE  "})()))
        self.assertFalse(authorization.is_gaeilge_reviewer(type("User", (), {"email": "teacher@example.test"})()))
        self.assertIn("/auth/me", route_paths)
        self.assertIn("/classes/{class_id}/student-access-code", route_paths)
        self.assertIn("/student/join/class", route_paths)
        self.assertIn("/exam-library/items", route_paths)

    def test_migration_009_is_retained_and_dashboard_surface_remains(self):
        migrations = BACKEND_DIR / "migrations"
        self.assertTrue((migrations / "20260902_009_ui_translation_overrides.up.sql").is_file())
        self.assertTrue((migrations / "20260902_009_ui_translation_overrides.down.sql").is_file())
        self.assertTrue(hasattr(models.ClassModel, "dashboard_order"))
        self.assertTrue(hasattr(schemas, "ClassDashboardOrderUpdate"))
        self.assertIn("/classes/dashboard-order", {route.path for route in main.app.routes})

    def test_application_startup_completes(self):
        with TestClient(main.app) as client:
            self.assertEqual(client.get("/openapi.json").status_code, 200)
            self.assertEqual(client.get("/auth/me").status_code, 401)
            self.assertEqual(client.get("/exam-library/items").status_code, 401)
            self.assertEqual(client.get("/classes/1/student-access-code").status_code, 401)
            self.assertEqual(client.post("/student/join/class", json={}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
