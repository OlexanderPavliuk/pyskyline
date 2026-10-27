"""JSON format consumed by the web viewer.

Keys are camelCase because the consumer is JavaScript. "schema" is bumped on
any breaking change so the viewer can refuse files it does not understand.
"""

import json
from importlib.metadata import version
from typing import Any

from pyskyline.models import FileHistory, FunctionMetrics
from pyskyline.project import FileReport, ProjectReport

SCHEMA_VERSION = 1

type JsonObject = dict[str, Any]


def to_json(report: ProjectReport, *, indent: int | None = None) -> str:
    document: JsonObject = {
        "schema": SCHEMA_VERSION,
        "generator": f"pyskyline {version('pyskyline')}",
        "name": report.name,
        "hasHistory": report.has_history,
        "files": [_file(file) for file in report.files],
    }
    return json.dumps(document, indent=indent, ensure_ascii=False)


def _file(file: FileReport) -> JsonObject:
    metrics = file.metrics
    lines = metrics.lines
    return {
        "path": file.path,
        "module": file.module,
        "lines": {
            "total": lines.total,
            "code": lines.code,
            "comment": lines.comment,
            "blank": lines.blank,
        },
        "classes": metrics.classes,
        "complexity": {
            "total": metrics.total_complexity,
            "max": metrics.max_complexity,
            "average": round(metrics.average_complexity, 2),
            "module": metrics.module_complexity,
        },
        "functions": [_function(function) for function in metrics.functions],
        "imports": list(file.imports),
        "packages": list(file.packages),
        "history": _history(file.history),
        "hotspot": round(file.hotspot, 4),
        "error": metrics.error,
    }


def _function(function: FunctionMetrics) -> JsonObject:
    return {
        "name": function.qualified_name,
        "line": function.line_start,
        "endLine": function.line_end,
        "params": function.parameters,
        "complexity": function.complexity,
    }


def _history(history: FileHistory | None) -> JsonObject | None:
    if history is None:
        return None
    return {
        "commits": history.commits,
        "linesChanged": history.lines_changed,
        "lastChanged": history.last_changed,
    }
