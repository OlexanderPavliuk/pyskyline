import json
from importlib.metadata import version
from pathlib import Path

from typer.testing import CliRunner

from pyskyline.cli import app

runner = CliRunner()


def test_version_prints_package_version() -> None:
    result = runner.invoke(app, ["--version"])

    assert result.exit_code == 0
    assert result.stdout.strip() == f"pyskyline {version('pyskyline')}"


def test_no_arguments_shows_help() -> None:
    result = runner.invoke(app, [])

    assert "Usage" in result.output


def test_inspect_lists_functions(tmp_path: Path) -> None:
    path = tmp_path / "module.py"
    path.write_text("def greet(name):\n    if name:\n        return name\n")

    result = runner.invoke(app, ["inspect", str(path)])

    assert result.exit_code == 0
    assert "greet" in result.output
    assert "complexity total 3" in result.output


def test_analyze_writes_city_json(tmp_path: Path) -> None:
    project = tmp_path / "demo"
    project.mkdir()
    (project / "app.py").write_text("def run(x):\n    return x or 0\n")
    output = tmp_path / "city.json"

    result = runner.invoke(app, ["analyze", str(project), "-o", str(output), "--no-history"])

    assert result.exit_code == 0
    assert "demo: 1 files" in result.output
    assert json.loads(output.read_text(encoding="utf-8"))["name"] == "demo"


def test_inspect_fails_on_syntax_error(tmp_path: Path) -> None:
    path = tmp_path / "broken.py"
    path.write_text("def broken(:\n")

    result = runner.invoke(app, ["inspect", str(path)])

    assert result.exit_code == 1
    assert "syntax error" in result.output
