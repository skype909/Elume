import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("JWT_SECRET", "public-exam-collection-test-secret-0123456789")

import main


class PublicExamCollectionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "public-library"
        self.root.mkdir()
        paper_dir = self.root / "mr-fitz-maths-mini-papers"
        paper_dir.mkdir()
        (paper_dir / "paper-1.pdf").write_bytes(b"%PDF-test-paper-1")
        self.manifest = Path(self.temp.name) / "collections.json"
        self.manifest.write_text(
            json.dumps(
                {
                    "collections": [
                        {
                            "id": "mr-fitz-maths-mini-papers",
                            "published": True,
                            "title": "Mr Fitz Maths Mini Papers",
                            "description": "Original practice",
                            "items": [
                                {
                                    "id": "paper-1",
                                    "published": True,
                                    "title": "Mr Fitz Maths - Algebra Mini Paper 1",
                                    "cycle": "Leaving Certificate",
                                    "level": "Higher Level",
                                    "topic": "Algebra",
                                    "duration": "30 minutes",
                                    "marks": "60 marks",
                                    "path": "mr-fitz-maths-mini-papers/paper-1.pdf",
                                    "download_filename": "Mr-Fitz-Maths-Algebra-Mini-Paper-1.pdf",
                                },
                                {
                                    "id": "unpublished",
                                    "published": False,
                                    "path": "mr-fitz-maths-mini-papers/paper-1.pdf",
                                },
                            ],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        self.paths = patch.multiple(
            main,
            PUBLIC_EXAM_LIBRARY_DIR=self.root,
            PUBLIC_EXAM_COLLECTIONS_MANIFEST=self.manifest,
        )
        self.paths.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.client.close()
        self.paths.stop()
        self.temp.cleanup()

    def test_public_collection_is_explicit_and_download_has_declared_name(self):
        response = self.client.get("/public-exam-collections/mr-fitz-maths-mini-papers")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()["items"]], ["paper-1"])
        self.assertNotIn("path", response.json()["items"][0])

        download = self.client.get(
            "/public-exam-collections/mr-fitz-maths-mini-papers/items/paper-1/download"
        )
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download.content, b"%PDF-test-paper-1")
        self.assertIn("Mr-Fitz-Maths-Algebra-Mini-Paper-1.pdf", download.headers["content-disposition"])

    def test_unknown_unpublished_and_escaping_items_are_not_public(self):
        self.assertEqual(self.client.get("/public-exam-collections/nope").status_code, 404)
        self.assertEqual(
            self.client.get(
                "/public-exam-collections/mr-fitz-maths-mini-papers/items/unpublished/download"
            ).status_code,
            404,
        )
        manifest = json.loads(self.manifest.read_text(encoding="utf-8"))
        manifest["collections"][0]["items"][0]["path"] = "../outside.pdf"
        self.manifest.write_text(json.dumps(manifest), encoding="utf-8")
        self.assertEqual(
            self.client.get(
                "/public-exam-collections/mr-fitz-maths-mini-papers/items/paper-1/download"
            ).status_code,
            404,
        )

    def test_private_exam_library_stays_authenticated(self):
        self.assertEqual(self.client.get("/exam-library/items").status_code, 401)


if __name__ == "__main__":
    unittest.main()
