import sys
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
import shutil

from fastapi import HTTPException, UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main


def slideshow_upload(slide_count: int) -> UploadFile:
    data = BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        for number in range(1, slide_count + 1):
            archive.writestr(f"ppt/slides/slide{number}.xml", "<slide />")
    data.seek(0)
    return UploadFile(filename="revision.pptx", file=data)


class SlideshowUploadLimitTests(unittest.TestCase):
    class _WorkspaceTempDirectory:
        def __init__(self):
            self.path = Path.cwd() / f".slideshow-upload-test-{uuid4().hex}"

        def __enter__(self):
            self.path.mkdir()
            return str(self.path)

        def __exit__(self, exc_type, exc_value, traceback):
            shutil.rmtree(self.path)

    def test_thirty_slide_slideshow_reaches_the_existing_conversion_path(self):
        upload = slideshow_upload(30)

        def fake_convert(args, **kwargs):
            source_path = Path(args[-1])
            output_dir = Path(args[args.index("--outdir") + 1])
            self.assertEqual(main._pptx_slide_count(source_path), 30)
            (output_dir / "revision.pdf").write_bytes(b"%PDF-1.7\ncontent")
            return SimpleNamespace(returncode=0)

        temporary_directory = self._WorkspaceTempDirectory()
        output_path = Path.cwd() / f".slideshow-output-{uuid4().hex}.pdf"
        try:
            with patch("main.tempfile.TemporaryDirectory", return_value=temporary_directory), patch(
                "main._libreoffice_command", return_value="libreoffice"
            ), patch("main.subprocess.run", side_effect=fake_convert), patch(
                "pypdf.PdfReader", return_value=SimpleNamespace(pages=[object()] * 30)
            ):
                main._convert_office_upload_to_pdf(upload, output_path)
                self.assertTrue(output_path.is_file())
        finally:
            output_path.unlink(missing_ok=True)

    def test_thirty_one_slide_slideshow_returns_a_safe_machine_readable_limit_response(self):
        upload = slideshow_upload(31)

        temporary_directory = self._WorkspaceTempDirectory()
        with patch("main.tempfile.TemporaryDirectory", return_value=temporary_directory), patch(
            "main._libreoffice_command", return_value="libreoffice"
        ), patch("main.subprocess.run") as converter:
            with self.assertRaises(HTTPException) as raised:
                main._convert_office_upload_to_pdf(upload, Path.cwd() / f".slideshow-output-{uuid4().hex}.pdf")

        error = raised.exception
        self.assertEqual(error.status_code, 422)
        self.assertEqual(error.detail, {
            "code": "slideshow_slide_limit_exceeded",
            "maximum_slides": 30,
            "actual_slides": 31,
            "message": "This slideshow is above Elume's supported slide limit.",
        })
        self.assertFalse(converter.called)
        response_text = str(error.detail).lower()
        self.assertNotIn("traceback", response_text)
        self.assertNotIn("libreoffice", response_text)
        self.assertNotIn("microsoft", response_text)
        self.assertNotIn("powerpoint", response_text)


if __name__ == "__main__":
    unittest.main()
