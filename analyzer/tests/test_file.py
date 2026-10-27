import textwrap
from pathlib import Path

import pytest

import pyskyline
from pyskyline.metrics.file import analyze_file
from pyskyline.models import LineCounts

SAMPLE = textwrap.dedent(
    """\
    # Sample module.

    class Greeter:
        def greet(self, name):
            if name:
                return f"Hello, {name}"
            return "Hello"


    def shout(text):
        return text.upper() if text else ""


    if __name__ == "__main__":
        print(shout(Greeter().greet("world")))
    """
)


def write(tmp_path: Path, content: bytes) -> Path:
    path = tmp_path / "module.py"
    path.write_bytes(content)
    return path


def test_sample_module(tmp_path: Path) -> None:
    metrics = analyze_file(write(tmp_path, SAMPLE.encode()))

    assert metrics.error is None
    assert metrics.lines == LineCounts(total=15, code=9, comment=1, blank=5)
    assert metrics.classes == 1
    assert [(f.qualified_name, f.complexity) for f in metrics.functions] == [
        ("Greeter.greet", 2),
        ("shout", 2),
    ]
    assert metrics.module_complexity == 2
    assert metrics.total_complexity == 6
    assert metrics.max_complexity == 2
    assert metrics.average_complexity == 2.0


def test_coding_cookie_is_honored(tmp_path: Path) -> None:
    source = "# -*- coding: latin-1 -*-\nname = 'café'\n".encode("latin-1")

    metrics = analyze_file(write(tmp_path, source))

    assert metrics.error is None
    assert metrics.lines.code == 1


def test_utf8_bom_is_accepted(tmp_path: Path) -> None:
    metrics = analyze_file(write(tmp_path, b"\xef\xbb\xbfx = 1\n"))

    assert metrics.error is None
    assert metrics.lines.code == 1


def test_syntax_error_is_reported_not_raised(tmp_path: Path) -> None:
    metrics = analyze_file(write(tmp_path, b"print 'python 2'\n\ndef ok():\n    pass\n"))

    assert metrics.error is not None
    assert metrics.error.startswith("syntax error on line 1")
    assert metrics.functions == ()
    assert metrics.lines.total == 4


def test_missing_file_is_reported_not_raised(tmp_path: Path) -> None:
    metrics = analyze_file(tmp_path / "missing.py")

    assert metrics.error is not None
    assert metrics.error.startswith("cannot read file")


def test_empty_file(tmp_path: Path) -> None:
    metrics = analyze_file(write(tmp_path, b""))

    assert metrics.error is None
    assert metrics.module_complexity == 1
    assert metrics.average_complexity == 0.0


@pytest.mark.parametrize(
    "path",
    sorted(Path(pyskyline.__file__).parent.rglob("*.py")),
    ids=lambda p: p.name,
)
def test_own_sources_parse_cleanly(path: Path) -> None:
    assert analyze_file(path).error is None
