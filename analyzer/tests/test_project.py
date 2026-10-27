import json
import os
import subprocess
from pathlib import Path, PurePosixPath

import pytest

from pyskyline.export import SCHEMA_VERSION, to_json
from pyskyline.project import analyze_project, find_python_files


def write(root: Path, files: dict[str, str]) -> None:
    for name, content in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


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


SHOP = {
    "src/shop/__init__.py": "from .models import Item\n",
    "src/shop/models.py": "import requests\n\nclass Item:\n    pass\n",
    "src/shop/cart.py": (
        "from shop.models import Item\n"
        "import os\n\n"
        "def total(items):\n"
        "    if not items:\n"
        "        return 0\n"
        "    return sum(i.price for i in items if i)\n"
    ),
    "tests/test_cart.py": "from shop import cart\n\ndef test_total():\n    assert cart\n",
    "broken.py": "def broken(:\n",
}


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    write(tmp_path, SHOP)
    return tmp_path


def test_files_are_found_without_git(shop: Path) -> None:
    write(shop, {".venv/lib/x.py": "", "node_modules/y.py": "", "src/shop/__pycache__/z.py": ""})

    assert find_python_files(shop) == [
        PurePosixPath("broken.py"),
        PurePosixPath("src/shop/__init__.py"),
        PurePosixPath("src/shop/cart.py"),
        PurePosixPath("src/shop/models.py"),
        PurePosixPath("tests/test_cart.py"),
    ]


def test_git_ignore_rules_are_respected(shop: Path) -> None:
    write(shop, {".gitignore": "generated/\n", "generated/out.py": ""})
    git(shop, "init", "-q")

    assert PurePosixPath("generated/out.py") not in find_python_files(shop)
    assert PurePosixPath("src/shop/cart.py") in find_python_files(shop)


def test_project_report(shop: Path) -> None:
    report = analyze_project(shop, with_history=False)
    by_path = {file.path: file for file in report.files}

    cart = by_path["src/shop/cart.py"]
    assert cart.module == "shop.cart"
    assert cart.imports == ("src/shop/models.py",)
    assert cart.packages == ()
    assert cart.metrics.functions[0].complexity == 4

    assert by_path["src/shop/__init__.py"].imports == ("src/shop/models.py",)
    assert by_path["src/shop/models.py"].packages == ("requests",)
    assert by_path["tests/test_cart.py"].imports == ("src/shop/cart.py",)
    assert by_path["broken.py"].metrics.error is not None
    assert not report.has_history


def test_parallel_run_matches_single_process(shop: Path) -> None:
    single = analyze_project(shop, with_history=False, workers=1)
    parallel = analyze_project(shop, with_history=False, workers=2)

    assert parallel == single


def test_hotspots_combine_complexity_and_commits(shop: Path) -> None:
    git(shop, "init", "-q")
    git(shop, "add", ".")
    git(shop, "commit", "-q", "-m", "first", timestamp=1_000)
    for step in range(3):
        (shop / "src/shop/cart.py").write_text(SHOP["src/shop/cart.py"] + f"# {step}\n")
        git(shop, "commit", "-q", "-am", f"change {step}", timestamp=2_000 + step)

    report = analyze_project(shop)
    hotspots = {file.path: file.hotspot for file in report.files}

    assert report.has_history
    assert hotspots["src/shop/cart.py"] == 1.0
    assert 0 < hotspots["tests/test_cart.py"] < 1.0
    assert hotspots["broken.py"] == 0.0


def test_json_export(shop: Path) -> None:
    document = json.loads(to_json(analyze_project(shop, with_history=False)))

    assert document["schema"] == SCHEMA_VERSION
    assert document["hasHistory"] is False
    cart = next(f for f in document["files"] if f["path"] == "src/shop/cart.py")
    assert cart["lines"] == {"total": 7, "code": 6, "comment": 0, "blank": 1}
    assert cart["complexity"] == {"total": 5, "max": 4, "average": 4.0, "module": 1}
    assert cart["functions"] == [
        {"name": "total", "line": 4, "endLine": 7, "params": 1, "complexity": 4}
    ]
    assert cart["imports"] == ["src/shop/models.py"]
    assert cart["history"] is None
    assert cart["error"] is None
