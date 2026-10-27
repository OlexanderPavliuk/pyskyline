"""Whole-project analysis: every Python file with metrics, imports and history."""

import os
import subprocess
from collections.abc import Iterable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath

from pyskyline.history import read_history
from pyskyline.imports import external_packages, imported_names, module_name, resolve_internal
from pyskyline.metrics.file import measure, parse_file
from pyskyline.models import FileHistory, FileMetrics

# Directories that hold tooling, dependencies or build output, not project code.
# Only used when the project is not a git repository; otherwise .gitignore decides.
SKIPPED_DIRS = frozenset(
    {
        "__pycache__",
        "build",
        "dist",
        "env",
        "node_modules",
        "site-packages",
        "venv",
    }
)


@dataclass(frozen=True, slots=True)
class FileReport:
    path: str
    module: str
    metrics: FileMetrics
    # POSIX paths of project files this file imports.
    imports: tuple[str, ...]
    # Third-party top-level packages this file imports.
    packages: tuple[str, ...]
    history: FileHistory | None
    # Complex and frequently changed at once: 0 is calm, 1 is the worst in the project.
    hotspot: float


@dataclass(frozen=True, slots=True)
class ProjectReport:
    name: str
    files: tuple[FileReport, ...]
    has_history: bool


def find_python_files(root: Path) -> list[PurePosixPath]:
    """Python files under root as sorted POSIX paths relative to root."""
    listed = _git_python_files(root)
    if listed is None:
        listed = _walk_python_files(root)
    # git also lists files deleted from the working tree but not yet committed.
    return sorted(path for path in listed if (root / path).is_file())


def _git_python_files(root: Path) -> list[PurePosixPath] | None:
    command = [
        "git",
        "-C",
        str(root),
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        "*.py",
    ]
    try:
        result = subprocess.run(command, capture_output=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    output = result.stdout.decode("utf-8", errors="replace")
    return [PurePosixPath(name) for name in output.split("\0") if name]


def _walk_python_files(root: Path) -> list[PurePosixPath]:
    found: list[PurePosixPath] = []
    for directory, subdirectories, filenames in os.walk(root):
        # Pruning in place stops os.walk from descending into these directories.
        subdirectories[:] = [
            name for name in subdirectories if name not in SKIPPED_DIRS and not name.startswith(".")
        ]
        relative = Path(directory).relative_to(root)
        found.extend(
            PurePosixPath(relative.as_posix(), name) for name in filenames if name.endswith(".py")
        )
    return found


@dataclass(frozen=True, slots=True)
class _FileJob:
    absolute: Path
    path: str
    module: str
    is_package: bool


# Below this many files, starting worker processes costs more than it saves.
_PARALLEL_THRESHOLD = 64


def _analyze_job(job: _FileJob) -> tuple[FileMetrics, list[str] | None]:
    """Per-file work. Module level and picklable so worker processes can run it.

    Returns plain data, not the AST: syntax trees are expensive to send between
    processes, and the import names are all the parent needs from them.
    """
    parsed = parse_file(job.absolute)
    names = None
    if parsed.tree is not None:
        names = imported_names(parsed.tree, job.module, job.is_package)
    return measure(job.path, parsed), names


def _run(
    jobs: list[_FileJob], workers: int | None
) -> Iterable[tuple[FileMetrics, list[str] | None]]:
    if workers == 1 or (workers is None and len(jobs) < _PARALLEL_THRESHOLD):
        return map(_analyze_job, jobs)
    # Processes, not threads: parsing is CPU-bound and the GIL would serialize threads.
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(_analyze_job, jobs, chunksize=8))


def analyze_project(
    root: Path, *, with_history: bool = True, workers: int | None = None
) -> ProjectReport:
    """Analyze every Python file under root.

    workers=None picks automatically (parallel for large projects), 1 forces a
    single process.
    """
    root = root.resolve()
    paths = find_python_files(root)
    package_dirs = frozenset(path.parent for path in paths if path.name == "__init__.py")
    modules = {path: module_name(path, package_dirs) for path in paths}
    # When two files claim one module name (scripts in different folders), the first wins.
    path_of_module: dict[str, PurePosixPath] = {}
    for path, module in modules.items():
        path_of_module.setdefault(module, path)
    module_set = frozenset(path_of_module)

    history = read_history(root) if with_history else None
    jobs = [
        _FileJob(root / path, path.as_posix(), modules[path], path.name == "__init__.py")
        for path in paths
    ]
    reports: list[FileReport] = []
    for path, (metrics, names) in zip(paths, _run(jobs, workers), strict=True):
        imports: set[str] = set()
        packages: set[str] = set()
        if names is not None:
            imports = {
                path_of_module[module].as_posix()
                for module in resolve_internal(names, module_set)
                if path_of_module[module] != path
            }
            packages = external_packages(names, module_set)
        reports.append(
            FileReport(
                path=path.as_posix(),
                module=modules[path],
                metrics=metrics,
                imports=tuple(sorted(imports)),
                packages=tuple(sorted(packages)),
                history=history.get(path.as_posix()) if history is not None else None,
                hotspot=0.0,
            )
        )
    return ProjectReport(
        name=root.name,
        files=tuple(_with_hotspots(reports)),
        has_history=history is not None,
    )


def _with_hotspots(reports: list[FileReport]) -> list[FileReport]:
    """Score = complexity share x change share, each relative to the project maximum.

    The idea comes from behavioral code analysis: complex code that nobody
    touches is cheap, simple code that changes often is cheap, but code that is
    both complex and constantly changing is where bugs and cost concentrate.
    """
    max_complexity = max((r.metrics.total_complexity for r in reports), default=0)
    max_commits = max((r.history.commits for r in reports if r.history), default=0)
    if max_complexity == 0 or max_commits == 0:
        return reports
    scored: list[FileReport] = []
    for report in reports:
        commits = report.history.commits if report.history else 0
        score = (report.metrics.total_complexity / max_complexity) * (commits / max_commits)
        scored.append(replace(report, hotspot=score))
    return scored
