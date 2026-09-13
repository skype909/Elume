import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import AICreateResourcesManualFile, _create_resource_image_count, _create_resource_upload_kind


class CreateResourcesUploadTests(unittest.TestCase):
    def test_backend_image_limit_counts_filename_and_mime(self):
        sources = [AICreateResourcesManualFile(filename=f"photo-{index}.png", mime_type="image/png") for index in range(12)]
        self.assertEqual(_create_resource_image_count(sources), 12)
        sources.append(AICreateResourcesManualFile(filename="thirteenth.jpg", mime_type=""))
        self.assertGreater(_create_resource_image_count(sources), 12)

    def test_file_signature_rejects_disguised_files_and_accepts_legacy_office(self):
        with self.assertRaises(Exception):
            _create_resource_upload_kind("calendar.png", "image/png", b"not a png")
        self.assertEqual(_create_resource_upload_kind("topics.doc", "application/msword", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1rest"), "doc")


if __name__ == "__main__":
    unittest.main()
