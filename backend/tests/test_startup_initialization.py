import ast
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


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
    def test_create_all_is_not_called_at_module_import_scope(self):
        tree = ast.parse((BACKEND_DIR / "main.py").read_text(encoding="utf-8"))
        visitor = _CreateAllLocationVisitor()
        visitor.visit(tree)

        self.assertEqual(visitor.locations, [("on_startup",)])

    def test_startup_keeps_schema_seed_and_backfill_phases(self):
        db = Mock()
        with (
            patch.object(main.Base.metadata, "create_all") as create_all,
            patch.object(main, "SessionLocal", return_value=db),
            patch.object(main, "seed_classes") as seed_classes,
            patch.object(main, "_backfill_class_access_details") as backfill,
            self.assertLogs(main.logger, level="INFO") as logs,
        ):
            main.on_startup()

        create_all.assert_called_once_with(bind=main.engine)
        seed_classes.assert_called_once_with(db)
        backfill.assert_called_once_with(db)
        db.close.assert_called_once_with()
        output = "\n".join(logs.output)
        for phase in (
            "Elume startup: begin",
            "Elume startup: create_all begin",
            "Elume startup: create_all complete",
            "Elume startup: seed_classes begin",
            "Elume startup: seed_classes complete",
            "Elume startup: class access backfill begin",
            "Elume startup: class access backfill complete",
            "Elume startup: complete",
        ):
            self.assertIn(phase, output)

    def test_startup_exceptions_are_not_swallowed(self):
        db = Mock()
        expected = RuntimeError("schema unavailable")
        with (
            patch.object(main.Base.metadata, "create_all", side_effect=expected),
            patch.object(main, "SessionLocal", return_value=db) as session_local,
        ):
            with self.assertRaisesRegex(RuntimeError, "schema unavailable"):
                main.on_startup()

        session_local.assert_not_called()
        db.close.assert_not_called()


if __name__ == "__main__":
    unittest.main()
