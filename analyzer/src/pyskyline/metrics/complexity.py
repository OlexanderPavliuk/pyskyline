"""McCabe cyclomatic complexity, computed from the AST.

A block (the module or one function) starts at 1 and gains 1 for every point
where control flow can branch. Nested functions are separate blocks and do not
add to their parent; class bodies and lambdas belong to the enclosing block.
"""

import ast

from pyskyline.models import FunctionMetrics

type FunctionNode = ast.FunctionDef | ast.AsyncFunctionDef

_FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)


def block_complexity(body: list[ast.stmt]) -> int:
    complexity = 1
    # Explicit stack instead of recursion: generated files can nest deeper than
    # Python's recursion limit.
    stack: list[ast.AST] = list(body)
    while stack:
        node = stack.pop()
        if isinstance(node, _FUNCTION_TYPES):
            continue
        complexity += _decision_points(node)
        stack.extend(ast.iter_child_nodes(node))
    return complexity


def _decision_points(node: ast.AST) -> int:
    match node:
        # elif is an If nested in orelse, so it is counted here too.
        case ast.If() | ast.IfExp() | ast.For() | ast.AsyncFor() | ast.While():
            return 1
        case ast.ExceptHandler():
            return 1
        # "a and b or c" has two short-circuit branches.
        case ast.BoolOp(values=values):
            return len(values) - 1
        # Each "for" in a comprehension loops, each "if" filters.
        case ast.comprehension(ifs=ifs):
            return 1 + len(ifs)
        case ast.match_case(pattern=pattern, guard=guard):
            # An unguarded "case _:" or "case name:" always matches: it is the
            # default branch, like "else", and adds no new path.
            irrefutable = isinstance(pattern, ast.MatchAs) and pattern.pattern is None
            return 0 if irrefutable and guard is None else 1
        case _:
            return 0


def collect_functions(tree: ast.Module) -> list[FunctionMetrics]:
    """Find every function and method in source order, nested ones included."""
    functions: list[FunctionMetrics] = []
    # Children are pushed in reverse so they pop in source order.
    stack: list[tuple[ast.AST, str]] = [(tree, "")]
    while stack:
        node, prefix = stack.pop()
        if isinstance(node, _FUNCTION_TYPES):
            qualified_name = prefix + node.name
            functions.append(_function_metrics(node, qualified_name))
            child_prefix = f"{qualified_name}.<locals>."
        elif isinstance(node, ast.ClassDef):
            child_prefix = f"{prefix}{node.name}."
        else:
            child_prefix = prefix
        children = list(ast.iter_child_nodes(node))
        stack.extend((child, child_prefix) for child in reversed(children))
    return functions


def _function_metrics(node: FunctionNode, qualified_name: str) -> FunctionMetrics:
    return FunctionMetrics(
        name=node.name,
        qualified_name=qualified_name,
        line_start=node.lineno,
        line_end=node.end_lineno or node.lineno,
        parameters=_count_parameters(node.args),
        complexity=block_complexity(node.body),
    )


def _count_parameters(args: ast.arguments) -> int:
    named = len(args.posonlyargs) + len(args.args) + len(args.kwonlyargs)
    return named + (args.vararg is not None) + (args.kwarg is not None)
