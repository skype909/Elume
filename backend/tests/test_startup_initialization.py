import ast
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import main


def _is_metadata_create_all(node: ast.Call) -> bool:
    return (
        isinstance(node.func, ast.Attribute)
        and node.func.attr == "create_all"
        and isinstance(node.func.value, ast.Attribute)
        and node.func.value.attr == "metadata"
        and isinstance(node.func.value.value, ast.Name)
        and node.func.value.value.id == "Base"
    )


class _CreateAllLocationVisitor(ast.NodeVisitor):
    def __init__(self):
        self.function_stack = []
        self.locations = []

    def visit_FunctionDef(self, node):
        self.function_stack.append(node.name)
        self.generic_visit(node)
        self.function_stack.pop()

    def visit_Call(self, node):
        if _is_metadata_create_all(node):
            self.locations.append(tuple(self.function_stack))
        self.generic_visit(node)


class StartupInitializationTests(unittest.TestCase):
    def test_main_contains_no_create_all_call(self):
        tree = ast.parse((BACKEND_DIR / "main.py").read_text(encoding="utf-8"))
        visitor = _CreateAllLocationVisitor()
        visitor.visit(tree)

        self.assertEqual(visitor.locations, [])

    def test_import_succeeds_with_an_unreachable_database(self):
        environment = os.environ.copy()
        environment["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/elume?connect_timeout=1"
        environment["PYTHONIOENCODING"] = "utf-8"
        environment["PYTHONPATH"] = str(BACKEND_DIR)
        result = subprocess.run(
            [sys.executable, "-c", "import main; assert main.app is not None"],
            cwd=BACKEND_DIR,
            env=environment,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_fastapi_startup_performs_no_database_access_or_maintenance(self):
        with (
            patch.object(main.Base.metadata, "create_all", side_effect=AssertionError("DDL attempted")) as create_all,
            patch.object(main.engine, "connect", side_effect=AssertionError("connection attempted")) as connect,
            patch.object(main.engine, "begin", side_effect=AssertionError("transaction attempted")) as begin,
            patch.object(main, "SessionLocal", side_effect=AssertionError("session attempted")) as session_local,
            patch.object(main, "seed_classes", side_effect=AssertionError("seed attempted")) as seed_classes,
            patch.object(main, "_backfill_class_access_details", side_effect=AssertionError("backfill attempted")) as backfill,
            self.assertLogs(main.logger, level="INFO") as logs,
        ):
            with TestClient(main.app) as client:
                self.assertEqual(client.get("/openapi.json").status_code, 200)

        create_all.assert_not_called()
        connect.assert_not_called()
        begin.assert_not_called()
        session_local.assert_not_called()
        seed_classes.assert_not_called()
        backfill.assert_not_called()
        output = "\n".join(logs.output)
        for phase in (
            "Elume startup: begin",
            "Elume startup: database initialization is external; no database work is performed",
            "Elume startup: complete",
        ):
            self.assertIn(phase, output)


if __name__ == "__main__":
    unittest.main()
