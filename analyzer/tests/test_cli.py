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


def test_inspect_fails_on_syntax_error(tmp_path: Path) -> None:
    path = tmp_path / "broken.py"
    path.write_text("def broken(:\n")

    result = runner.invoke(app, ["inspect", str(path)])

    assert result.exit_code == 1
    assert "syntax error" in result.output
