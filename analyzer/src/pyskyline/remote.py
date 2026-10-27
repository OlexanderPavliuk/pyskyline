"""Analyze a repository by URL: clone it into a temporary directory first."""

import os
import shutil
import stat
import subprocess
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

_REMOTE_PREFIXES = ("https://", "http://", "git@", "ssh://")


class CloneError(Exception):
    pass


def is_remote(source: str) -> bool:
    return source.startswith(_REMOTE_PREFIXES)


def repository_name(url: str) -> str:
    """Last path segment without .git: flask for https://github.com/pallets/flask.git."""
    name = url.rstrip("/").rsplit("/", 1)[-1].rsplit(":", 1)[-1]
    return name.removesuffix(".git") or "repository"


@contextmanager
def cloned(url: str, *, depth: int | None = None) -> Iterator[Path]:
    """Clone url, yield the working tree, delete it afterwards.

    depth limits how many commits are fetched, which also limits the history
    the hotspot score sees.
    """
    workspace = Path(tempfile.mkdtemp(prefix="pyskyline-"))
    target = workspace / repository_name(url)
    command = ["git", "clone", "--quiet", "--single-branch"]
    if depth is not None:
        command += ["--depth", str(depth)]
    # "--" keeps a URL starting with "-" from being read as a git option.
    command += ["--", url, str(target)]
    try:
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
        except OSError as error:
            raise CloneError(f"cannot run git: {error}") from error
        except subprocess.CalledProcessError as error:
            raise CloneError(error.stderr.strip() or f"git clone failed for {url}") from error
        yield target
    finally:
        shutil.rmtree(workspace, onexc=_make_writable_and_retry)


def _make_writable_and_retry(
    function: Callable[[str], object], path: str, _error: BaseException
) -> None:
    # Git marks pack files read-only, and Windows refuses to delete read-only files.
    os.chmod(path, stat.S_IWRITE)
    function(path)
