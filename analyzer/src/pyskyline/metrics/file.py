import ast
import tokenize
from dataclasses import dataclass
from pathlib import Path

from pyskyline.metrics.complexity import block_complexity, collect_functions
from pyskyline.metrics.lines import count_lines
from pyskyline.models import FileMetrics, LineCounts

_NO_LINES = LineCounts(total=0, code=0, comment=0, blank=0)


@dataclass(frozen=True, slots=True)
class ParsedFile:
    """A file read and parsed once, so metrics and imports share the same tree."""

    lines: LineCounts
    tree: ast.Module | None
    error: str | None


def parse_file(path: Path) -> ParsedFile:
    """Read and parse one file. Never raises for bad input: errors go into the result."""
    try:
        # tokenize.open honors the PEP 263 coding cookie and a UTF-8 BOM.
        with tokenize.open(path) as file:
            source = file.read()
    except (OSError, SyntaxError, UnicodeDecodeError) as error:
        return ParsedFile(_NO_LINES, None, f"cannot read file: {error}")

    lines = count_lines(source)
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        return ParsedFile(lines, None, f"syntax error on line {error.lineno}: {error.msg}")
    except (ValueError, RecursionError) as error:
        return ParsedFile(lines, None, f"cannot parse file: {error}")
    return ParsedFile(lines, tree, None)


def measure(path: str, parsed: ParsedFile) -> FileMetrics:
    if parsed.tree is None:
        return FileMetrics(
            path=path,
            lines=parsed.lines,
            functions=(),
            classes=0,
            module_complexity=0,
            error=parsed.error,
        )
    tree = parsed.tree
    return FileMetrics(
        path=path,
        lines=parsed.lines,
        functions=tuple(collect_functions(tree)),
        classes=sum(isinstance(node, ast.ClassDef) for node in ast.walk(tree)),
        module_complexity=block_complexity(tree.body),
    )


def analyze_file(path: Path) -> FileMetrics:
    """Measure one Python file. Never raises for bad input: errors go into the result."""
    return measure(str(path), parse_file(path))
