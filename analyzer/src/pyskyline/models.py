from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class LineCounts:
    """How the physical lines of a file split up. code + comment + blank == total."""

    total: int
    code: int
    comment: int
    blank: int


@dataclass(frozen=True, slots=True)
class FileHistory:
    """What git remembers about one file."""

    commits: int
    # Lines added plus lines deleted, summed over all commits.
    lines_changed: int
    # Unix timestamp of the newest commit that touched the file.
    last_changed: int


@dataclass(frozen=True, slots=True)
class FunctionMetrics:
    name: str
    # Follows Python's __qualname__: "Class.method", "outer.<locals>.inner".
    qualified_name: str
    line_start: int
    line_end: int
    parameters: int
    complexity: int


@dataclass(frozen=True, slots=True)
class FileMetrics:
    path: str
    lines: LineCounts
    functions: tuple[FunctionMetrics, ...]
    classes: int
    # Complexity of top-level code outside any function (class bodies included).
    module_complexity: int
    # Set when the file could not be read or parsed; the metrics are then partial.
    error: str | None = None

    @property
    def total_complexity(self) -> int:
        return self.module_complexity + sum(f.complexity for f in self.functions)

    @property
    def max_complexity(self) -> int:
        return max([self.module_complexity, *(f.complexity for f in self.functions)])

    @property
    def average_complexity(self) -> float:
        if not self.functions:
            return 0.0
        return sum(f.complexity for f in self.functions) / len(self.functions)
