import subprocess
from pathlib import Path

import pytest

from pyskyline.remote import CloneError, cloned, is_remote, repository_name


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("https://github.com/pallets/flask", True),
        ("git@github.com:pallets/flask.git", True),
        ("./flask", False),
        ("C:\\code\\flask", False),
    ],
)
def test_is_remote(source: str, expected: bool) -> None:
    assert is_remote(source) is expected


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://github.com/pallets/flask", "flask"),
        ("https://github.com/pallets/flask.git", "flask"),
        ("https://github.com/pallets/flask/", "flask"),
        ("git@github.com:psf/requests.git", "requests"),
    ],
)
def test_repository_name(url: str, expected: str) -> None:
    assert repository_name(url) == expected


@pytest.fixture
def origin(tmp_path: Path) -> Path:
    repo = tmp_path / "origin"
    repo.mkdir()
    (repo / "app.py").write_text("x = 1\n")
    git = ["git", "-c", "user.name=Test", "-c", "user.email=test@example.com"]
    subprocess.run([*git, "init", "-q"], cwd=repo, check=True)
    subprocess.run([*git, "add", "."], cwd=repo, check=True)
    subprocess.run([*git, "commit", "-q", "-m", "init"], cwd=repo, check=True)
    return repo


def test_clone_is_removed_afterwards(origin: Path) -> None:
    with cloned(origin.as_uri()) as checkout:
        assert (checkout / "app.py").is_file()
        assert checkout.name == "origin"
    assert not checkout.parent.exists()


def test_clone_failure_raises_clone_error(tmp_path: Path) -> None:
    with pytest.raises(CloneError), cloned((tmp_path / "missing").as_uri()):
        pass
