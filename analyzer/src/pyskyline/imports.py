"""Import graph: which project modules each module imports.

Module names are derived from the directory layout, the same way Python finds
them: a file's package chain goes up while directories contain __init__.py, and
the first directory without one is a source root. That handles both the flat
layout (pkg/ at the top) and the src layout (src/pkg/) without configuration.
"""

import ast
import sys
from collections.abc import Iterable
from pathlib import PurePosixPath


def module_name(path: PurePosixPath, package_dirs: frozenset[PurePosixPath]) -> str:
    """Dotted module name for a file, given every directory that has __init__.py."""
    parts = [] if path.name == "__init__.py" else [path.stem]
    directory = path.parent
    while directory in package_dirs:
        parts.append(directory.name)
        directory = directory.parent
    return ".".join(reversed(parts))


def imported_names(tree: ast.Module, module: str, is_package: bool) -> list[str]:
    """Every absolute dotted name the module imports, nested imports included.

    "from pkg import name" yields "pkg.name": name may be a submodule or just an
    attribute of pkg, and resolve_internal() settles it by longest prefix.
    """
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = _resolve_from(node, module, is_package)
            if base is not None:
                names.extend(f"{base}.{alias.name}" if base else alias.name for alias in node.names)
    return names


def _resolve_from(node: ast.ImportFrom, module: str, is_package: bool) -> str | None:
    if node.level == 0:
        return node.module or ""
    # A package's __init__ is its own anchor; a plain module's anchor is its package.
    anchor = module.split(".") if is_package else module.split(".")[:-1]
    if node.level - 1 > len(anchor):
        return None  # "from ... import x" climbing above the top-level package
    anchor = anchor[: len(anchor) - (node.level - 1)]
    if node.module:
        anchor.append(node.module)
    return ".".join(anchor)


def resolve_internal(names: Iterable[str], modules: frozenset[str]) -> set[str]:
    """Map imported names to project modules by the longest matching prefix."""
    found: set[str] = set()
    for name in names:
        parts = name.split(".")
        for end in range(len(parts), 0, -1):
            candidate = ".".join(parts[:end])
            if candidate in modules:
                found.add(candidate)
                break
    return found


def external_packages(names: Iterable[str], modules: frozenset[str]) -> set[str]:
    """Top-level names of third-party packages, skipping the standard library."""
    top_level_internal = {module.split(".")[0] for module in modules}
    found: set[str] = set()
    for name in names:
        top = name.split(".")[0]
        if top and top not in top_level_internal and top not in sys.stdlib_module_names:
            found.add(top)
    return found
