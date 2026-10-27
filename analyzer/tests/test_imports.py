import ast
import textwrap
from pathlib import PurePosixPath

import pytest

from pyskyline.imports import (
    external_packages,
    imported_names,
    module_name,
    resolve_internal,
)

PACKAGE_DIRS = frozenset(
    {
        PurePosixPath("src/shop"),
        PurePosixPath("src/shop/cart"),
        PurePosixPath("tools"),
    }
)


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("src/shop/__init__.py", "shop"),
        ("src/shop/models.py", "shop.models"),
        ("src/shop/cart/__init__.py", "shop.cart"),
        ("src/shop/cart/pricing.py", "shop.cart.pricing"),
        ("tools/lint.py", "tools.lint"),
        ("setup.py", "setup"),
        ("scripts/run.py", "run"),
    ],
)
def test_module_name(path: str, expected: str) -> None:
    assert module_name(PurePosixPath(path), PACKAGE_DIRS) == expected


def names_in(source: str, module: str = "shop.cart.pricing", is_package: bool = False) -> list[str]:
    return imported_names(ast.parse(textwrap.dedent(source)), module, is_package)


def test_absolute_imports() -> None:
    assert names_in("import os, shop.models\nfrom shop import cart\n") == [
        "os",
        "shop.models",
        "shop.cart",
    ]


def test_relative_imports_from_module() -> None:
    assert names_in("from . import tax\nfrom .. import models\nfrom ..models import Item\n") == [
        "shop.cart.tax",
        "shop.models",
        "shop.models.Item",
    ]


def test_relative_import_from_package_init() -> None:
    names = names_in("from . import pricing\nfrom .pricing import total\n", "shop.cart", True)

    assert names == ["shop.cart.pricing", "shop.cart.pricing.total"]


def test_relative_import_above_top_level_is_ignored() -> None:
    assert names_in("from .... import x\n") == []


def test_imports_inside_functions_count() -> None:
    assert names_in("def f():\n    import json\n") == ["json"]


MODULES = frozenset({"shop", "shop.models", "shop.cart", "shop.cart.pricing"})


def test_resolve_internal_uses_longest_prefix() -> None:
    names = ["shop.models.Item", "shop.cart.pricing", "shop.helper", "os.path", "shop.cart.*"]

    assert resolve_internal(names, MODULES) == {
        "shop.models",
        "shop.cart.pricing",
        "shop",
        "shop.cart",
    }


def test_external_packages_skip_stdlib_and_project() -> None:
    names = ["os.path", "requests.adapters", "shop.models", "numpy", "__future__.annotations"]

    assert external_packages(names, MODULES) == {"requests", "numpy"}
