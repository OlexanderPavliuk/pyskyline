import ast
import tokenize
from pathlib import Path

from pyskyline.metrics.complexity import block_complexity, collect_functions
from pyskyline.metrics.lines import count_lines
from pyskyline.models import FileMetrics, LineCounts

_NO_LINES = LineCounts(total=0, code=0, comment=0, blank=0)


def analyze_file(path: Path) -> FileMetrics:
    """Measure one Python file. Never raises for bad input: errors go into the result."""
    try:
        # tokenize.open honors the PEP 263 coding cookie and a UTF-8 BOM.
        with tokenize.open(path) as file:
            source = file.read()
    except (OSError, SyntaxError, UnicodeDecodeError) as error:
        return _failed(path, _NO_LINES, f"cannot read file: {error}")

    lines = count_lines(source)
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        return _failed(path, lines, f"syntax error on line {error.lineno}: {error.msg}")
    except (ValueError, RecursionError) as error:
        return _failed(path, lines, f"cannot parse file: {error}")

    return FileMetrics(
        path=str(path),
        lines=lines,
        functions=tuple(collect_functions(tree)),
        classes=sum(isinstance(node, ast.ClassDef) for node in ast.walk(tree)),
        module_complexity=block_complexity(tree.body),
    )


def _failed(path: Path, lines: LineCounts, error: str) -> FileMetrics:
    return FileMetrics(
        path=str(path),
        lines=lines,
        functions=(),
        classes=0,
        module_complexity=0,
        error=error,
    )
