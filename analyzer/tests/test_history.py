import os
import subprocess
from pathlib import Path

import pytest

from pyskyline.history import parse_git_log, read_history
from pyskyline.models import FileHistory


def test_parse_git_log() -> None:
    output = (
        "\x01200\0\n3\t1\tapp/main.py\0-\t-\tlogo.png\0"
        "\x01100\0\n10\t0\tapp/main.py\0"
        "2\t0\tpath with\ttab.py\0"
    )

    assert parse_git_log(output) == {
        "app/main.py": FileHistory(commits=2, lines_changed=14, last_changed=200),
        "logo.png": FileHistory(commits=1, lines_changed=0, last_changed=200),
        "path with\ttab.py": FileHistory(commits=1, lines_changed=2, last_changed=100),
    }


def test_parse_empty_log() -> None:
    assert parse_git_log("") == {}


def git(repo: Path, *args: str, timestamp: int = 0) -> None:
    env = {
        **os.environ,
        "GIT_AUTHOR_DATE": f"@{timestamp} +0000",
        "GIT_COMMITTER_DATE": f"@{timestamp} +0000",
    }
    subprocess.run(
        ["git", "-c", "user.name=Test", "-c", "user.email=test@example.com", *args],
        cwd=repo,
        env=env,
        check=True,
        capture_output=True,
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q")
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "core.py").write_text("a = 1\n")
    (tmp_path / "readme.txt").write_text("hi\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "first", timestamp=1_000)
    (tmp_path / "pkg" / "core.py").write_text("a = 2\nb = 3\n")
    git(tmp_path, "commit", "-q", "-am", "second", timestamp=2_000)
    return tmp_path


def test_read_history_of_real_repository(repo: Path) -> None:
    history = read_history(repo)

    assert history == {
        "pkg/core.py": FileHistory(commits=2, lines_changed=4, last_changed=2_000),
        "readme.txt": FileHistory(commits=1, lines_changed=1, last_changed=1_000),
    }


def test_read_history_of_subdirectory_uses_relative_paths(repo: Path) -> None:
    history = read_history(repo / "pkg")

    assert history is not None
    assert set(history) == {"core.py"}


def test_read_history_outside_git_returns_none(tmp_path: Path) -> None:
    assert read_history(tmp_path) is None
