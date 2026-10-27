"""Change history per file, read from `git log`.

Plain subprocess instead of a git library: one command gives everything, and
-z output (NUL-separated, no path quoting) is simple to parse exactly.
Renames are not followed, so a renamed file starts a fresh history.
"""

import subprocess
from pathlib import Path

from pyskyline.models import FileHistory

# Marks the start of a commit record in the output; cannot occur in a path.
_COMMIT_MARK = "\x01"


def read_history(root: Path) -> dict[str, FileHistory] | None:
    """History of every file under root, keyed by POSIX path relative to root.

    Returns None when root is not inside a git repository or git is missing.
    """
    command = [
        "git",
        "-C",
        str(root),
        "log",
        "-z",
        "--no-renames",
        "--numstat",
        f"--format={_COMMIT_MARK}%ct",
        "--relative",
        "--",
        ".",
    ]
    try:
        result = subprocess.run(command, capture_output=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return parse_git_log(result.stdout.decode("utf-8", errors="replace"))


def parse_git_log(output: str) -> dict[str, FileHistory]:
    """Parse `git log -z --numstat --format=<mark>%ct` output.

    Records are NUL-separated: a commit record is the mark plus a timestamp, and
    each following record is "added<TAB>deleted<TAB>path" ("-" for binary files).
    """
    commits: dict[str, int] = {}
    changed: dict[str, int] = {}
    last: dict[str, int] = {}
    timestamp = 0
    for record in output.split("\0"):
        record = record.lstrip("\n")
        if not record:
            continue
        if record.startswith(_COMMIT_MARK):
            timestamp = int(record[1:])
            continue
        added, deleted, path = record.split("\t", 2)
        commits[path] = commits.get(path, 0) + 1
        changed[path] = changed.get(path, 0) + _count(added) + _count(deleted)
        last[path] = max(last.get(path, 0), timestamp)
    return {
        path: FileHistory(commits=count, lines_changed=changed[path], last_changed=last[path])
        for path, count in commits.items()
    }


def _count(value: str) -> int:
    return 0 if value == "-" else int(value)
