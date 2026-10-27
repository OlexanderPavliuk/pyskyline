import ast
import textwrap

import pytest

from pyskyline.metrics.complexity import block_complexity, collect_functions
from pyskyline.models import FunctionMetrics


def functions_of(source: str) -> list[FunctionMetrics]:
    return collect_functions(ast.parse(textwrap.dedent(source)))


def complexity_of(source: str) -> int:
    (function,) = functions_of(source)
    return function.complexity


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        pytest.param("def f():\n    return 1\n", 1, id="straight line"),
        pytest.param("def f(x):\n    if x:\n        return 1\n", 2, id="if"),
        pytest.param(
            """\
            def f(x):
                if x > 0:
                    return 1
                elif x < 0:
                    return -1
                else:
                    return 0
            """,
            3,
            id="if-elif-else",
        ),
        pytest.param("def f(xs):\n    for x in xs:\n        pass\n", 2, id="for"),
        pytest.param("def f(x):\n    while x:\n        x -= 1\n", 2, id="while"),
        pytest.param("async def f(xs):\n    async for x in xs:\n        pass\n", 2, id="async for"),
        pytest.param(
            """\
            def f():
                try:
                    pass
                except ValueError:
                    pass
                except KeyError:
                    pass
                else:
                    pass
                finally:
                    pass
            """,
            3,
            id="try with two handlers",
        ),
        pytest.param("def f(a, b):\n    return a and b\n", 2, id="and"),
        pytest.param("def f(a, b, c):\n    return a and b or c\n", 3, id="and-or"),
        pytest.param("def f(a, b, c):\n    return a or b or c\n", 3, id="chained or"),
        pytest.param("def f(x):\n    return 1 if x else 2\n", 2, id="ternary"),
        pytest.param("def f(xs):\n    return [x for x in xs if x]\n", 3, id="comprehension"),
        pytest.param(
            """\
            def f(x):
                match x:
                    case 1:
                        pass
                    case 2:
                        pass
                    case _:
                        pass
            """,
            3,
            id="match with default",
        ),
        pytest.param(
            """\
            def f(x, ok):
                match x:
                    case _ if ok:
                        pass
            """,
            2,
            id="guarded wildcard",
        ),
        pytest.param("def f():\n    with open('a') as h:\n        pass\n", 1, id="with"),
        pytest.param(
            "def f():\n    return lambda x: 1 if x else 2\n", 2, id="lambda belongs to parent"
        ),
    ],
)
def test_complexity(source: str, expected: int) -> None:
    assert complexity_of(source) == expected


def test_nested_function_is_a_separate_block() -> None:
    outer, inner = functions_of(
        """\
        def outer(x):
            def inner(y):
                if y:
                    return 1
            if x:
                return inner(x)
        """
    )

    assert (outer.qualified_name, outer.complexity) == ("outer", 2)
    assert (inner.qualified_name, inner.complexity) == ("outer.<locals>.inner", 2)


def test_methods_get_class_prefix() -> None:
    names = [
        f.qualified_name
        for f in functions_of(
            """\
            class A:
                def m(self):
                    pass

                class B:
                    async def n(self):
                        pass

            def f():
                class C:
                    def k(self):
                        pass
            """
        )
    ]

    assert names == ["A.m", "A.B.n", "f", "f.<locals>.C.k"]


def test_parameters_include_every_kind() -> None:
    (function,) = functions_of("def f(a, /, b, *args, c, **kwargs):\n    pass\n")

    assert function.parameters == 5


def test_line_range() -> None:
    (function,) = functions_of(
        """\
        x = 1

        def f():
            a = 1
            return a
        """
    )

    assert (function.line_start, function.line_end) == (3, 5)


def test_module_complexity_ignores_function_bodies() -> None:
    tree = ast.parse(
        textwrap.dedent(
            """\
            import sys

            def f(x):
                if x:
                    return 1

            if __name__ == "__main__":
                f(sys.argv)
            """
        )
    )

    assert block_complexity(tree.body) == 2
