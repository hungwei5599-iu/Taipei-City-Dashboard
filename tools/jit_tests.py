#!/usr/bin/env python3
"""Dry-run JIT test selector for Taipei-City-Dashboard.

The selector is intentionally dependency-free. It builds a small static
dependency graph from relative JS/Vue imports, Go package layout, and simple
Python imports, then reports tests likely affected by changed files.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
FE_ROOT = ROOT / "Taipei-City-Dashboard-FE"
BE_ROOT = ROOT / "Taipei-City-Dashboard-BE"
DE_ROOT = ROOT / "Taipei-City-Dashboard-DE"

JS_IMPORT_RE = re.compile(
    r"""(?:import\s+(?:[^'"]+\s+from\s+)?|require\()\s*['"]([^'"]+)['"]"""
)


@dataclass(frozen=True)
class Selection:
    test: str
    command: str
    reason: str


@dataclass(frozen=True)
class Skipped:
    test: str
    reason: str


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def normalize_changed(paths: Iterable[str]) -> list[Path]:
    normalized: list[Path] = []
    for raw in paths:
        path = Path(raw)
        if not path.is_absolute():
            path = ROOT / path
        normalized.append(path.resolve())
    return normalized


def all_files(root: Path, suffixes: tuple[str, ...]) -> list[Path]:
    if not root.exists():
        return []
    ignored = {"node_modules", ".git", "dist", "build", "__pycache__", ".pytest_cache"}
    result: list[Path] = []
    for path in root.rglob("*"):
        if any(part in ignored for part in path.parts):
            continue
        if path.is_file() and path.suffix in suffixes:
            result.append(path.resolve())
    return result


def resolve_js_import(importer: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    base = (importer.parent / spec).resolve()
    candidates = [
        base,
        base.with_suffix(".js"),
        base.with_suffix(".vue"),
        base.with_suffix(".ts"),
        base / "index.js",
        base / "index.ts",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate.resolve()
    return None


def js_dependencies(path: Path) -> set[Path]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(errors="ignore")
    deps: set[Path] = set()
    for match in JS_IMPORT_RE.finditer(text):
        resolved = resolve_js_import(path, match.group(1))
        if resolved:
            deps.add(resolved)
    return deps


def python_dependencies(path: Path) -> set[Path]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return set()
    deps: set[Path] = set()
    for node in ast.walk(tree):
        module = None
        if isinstance(node, ast.ImportFrom):
            module = node.module
        elif isinstance(node, ast.Import):
            for alias in node.names:
                module = alias.name
                break
        if not module:
            continue
        candidate = DE_ROOT / "dags" / Path(*module.split("."))
        for resolved in (candidate.with_suffix(".py"), candidate / "__init__.py"):
            if resolved.exists():
                deps.add(resolved.resolve())
    return deps


def transitive_deps(start: Path, graph: dict[Path, set[Path]]) -> set[Path]:
    seen: set[Path] = set()
    stack = list(graph.get(start, set()))
    while stack:
        dep = stack.pop()
        if dep in seen:
            continue
        seen.add(dep)
        stack.extend(graph.get(dep, set()) - seen)
    return seen


def test_command(test: Path) -> str:
    if test.is_relative_to(FE_ROOT):
        return f"cd Taipei-City-Dashboard-FE && node {test.relative_to(FE_ROOT).as_posix()}"
    if test.is_relative_to(BE_ROOT):
        package = test.parent.relative_to(BE_ROOT).as_posix()
        return f"cd Taipei-City-Dashboard-BE && go test ./{package}"
    if test.is_relative_to(DE_ROOT):
        return f"cd Taipei-City-Dashboard-DE && python -m pytest {test.relative_to(DE_ROOT).as_posix()}"
    return f"# no command for {rel(test)}"


def fe_tests() -> list[Path]:
    return all_files(FE_ROOT / "tests", (".js", ".ts"))


def be_tests() -> list[Path]:
    return all_files(BE_ROOT, (".go",))


def de_tests() -> list[Path]:
    tests = []
    for path in all_files(DE_ROOT, (".py",)):
        if path.name.startswith("test_") or path.name.endswith("_test.py"):
            tests.append(path)
    return tests


def select_fe(changed: list[Path]) -> tuple[list[Selection], list[Skipped]]:
    tests = fe_tests()
    graph = {path: js_dependencies(path) for path in all_files(FE_ROOT, (".js", ".vue", ".ts"))}
    selections: list[Selection] = []
    skipped: list[Skipped] = []

    for test in tests:
        deps = transitive_deps(test, graph)
        direct = graph.get(test, set())
        matched = [path for path in changed if path == test or path in deps]
        if matched:
            edge = "direct import" if any(path in direct for path in matched) else "transitive import"
            selections.append(Selection(rel(test), test_command(test), f"{edge} from changed file"))
        else:
            skipped.append(Skipped(rel(test), "not affected by FE import graph"))

    return selections, skipped


def go_package(path: Path) -> str | None:
    if not path.is_relative_to(BE_ROOT) or path.suffix != ".go":
        return None
    return path.parent.relative_to(BE_ROOT).as_posix()


def select_be(changed: list[Path]) -> tuple[list[Selection], list[Skipped]]:
    tests = [path for path in be_tests() if path.name.endswith("_test.go")]
    changed_packages = {pkg for path in changed if (pkg := go_package(path))}
    selections: list[Selection] = []
    skipped: list[Skipped] = []

    for test in tests:
        package = test.parent.relative_to(BE_ROOT).as_posix()
        if package in changed_packages or test in changed:
            selections.append(
                Selection(rel(test), test_command(test), "same Go package as changed file")
            )
        else:
            skipped.append(Skipped(rel(test), "not affected by Go package graph"))
    return selections, skipped


def select_de(changed: list[Path]) -> tuple[list[Selection], list[Skipped]]:
    tests = de_tests()
    graph = {path: python_dependencies(path) for path in all_files(DE_ROOT, (".py",))}
    selections: list[Selection] = []
    skipped: list[Skipped] = []

    for test in tests:
        deps = transitive_deps(test, graph)
        matched = [path for path in changed if path == test or path in deps or path.parent == test.parent]
        if matched:
            selections.append(
                Selection(rel(test), test_command(test), "Python import or same-directory test")
            )
        else:
            skipped.append(Skipped(rel(test), "not affected by DE import graph"))
    return selections, skipped


def docs_only(changed: list[Path]) -> bool:
    doc_suffixes = {".md", ".mdx", ".txt", ".png", ".jpg", ".jpeg", ".svg"}
    return all(path.suffix.lower() in doc_suffixes or "docs" in path.parts for path in changed)


def changed_from_git_diff() -> list[str]:
    output = subprocess.check_output(
        ["git", "diff", "--name-only", "HEAD"], cwd=ROOT, text=True
    )
    return [line.strip() for line in output.splitlines() if line.strip()]


def unique_selections(selections: Iterable[Selection]) -> list[Selection]:
    by_command: dict[str, Selection] = {}
    for selection in selections:
        existing = by_command.get(selection.command)
        if existing is None:
            by_command[selection.command] = selection
        elif selection.test < existing.test:
            by_command[selection.command] = selection
    return sorted(by_command.values(), key=lambda item: (item.command, item.test))


def unique_skipped(skipped: Iterable[Skipped], selected_tests: set[str]) -> list[Skipped]:
    by_test: dict[str, Skipped] = {}
    for item in skipped:
        if item.test in selected_tests:
            continue
        by_test.setdefault(item.test, item)
    return sorted(by_test.values(), key=lambda item: item.test)


def select_tests(changed: list[Path]) -> dict[str, object]:
    if docs_only(changed):
        return {
            "changed": [rel(path) for path in changed],
            "tests_to_run": [],
            "skipped_tests": [],
            "summary": {
                "tests_run": 0,
                "tests_skipped": 0,
                "reason": "docs-only change",
            },
        }

    selections: list[Selection] = []
    skipped: list[Skipped] = []
    for selector in (select_fe, select_be, select_de):
        selected, skipped_items = selector(changed)
        selections.extend(selected)
        skipped.extend(skipped_items)

    selections = unique_selections(selections)
    selected_tests = {item.test for item in selections}
    skipped = unique_skipped(skipped, selected_tests)

    return {
        "changed": [rel(path) for path in changed],
        "tests_to_run": [asdict(item) for item in selections],
        "skipped_tests": [asdict(item) for item in skipped],
        "summary": {
            "tests_run": len(selections),
            "tests_skipped": len(skipped),
            "reason": "affected tests selected from static dependency graph",
        },
    }


def print_human(report: dict[str, object]) -> None:
    print("Changed files:")
    for path in report["changed"]:
        print(f"  - {path}")

    print("\nTests to run:")
    tests = report["tests_to_run"]
    if tests:
        for item in tests:
            print(f"  - {item['test']}")
            print(f"    command: {item['command']}")
            print(f"    reason: {item['reason']}")
    else:
        print("  - none")

    print("\nSkipped tests:")
    skipped = report["skipped_tests"]
    if skipped:
        for item in skipped:
            print(f"  - {item['test']} ({item['reason']})")
    else:
        print("  - none")

    summary = report["summary"]
    print(
        "\nSummary: "
        f"tests run {summary['tests_run']} | "
        f"tests skipped {summary['tests_skipped']} | "
        f"{summary['reason']}"
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dry-run JIT affected test selector.")
    parser.add_argument("--changed", nargs="*", default=[], help="Changed file paths.")
    parser.add_argument(
        "--from-git-diff",
        action="store_true",
        help="Use git diff --name-only HEAD as changed file input.",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON report.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    changed = list(args.changed)
    if args.from_git_diff:
        changed.extend(changed_from_git_diff())
    if not changed:
        print("No changed files supplied. Use --changed <path> or --from-git-diff.", file=sys.stderr)
        return 2

    report = select_tests(normalize_changed(changed))
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
