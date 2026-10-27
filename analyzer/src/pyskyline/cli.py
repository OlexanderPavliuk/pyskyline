from importlib.metadata import version
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from pyskyline.metrics.file import analyze_file

app = typer.Typer(
    help="Turn a Python codebase into a 3D city.",
    no_args_is_help=True,
)


def _print_version(value: bool) -> None:
    if value:
        # Read from installed package metadata so pyproject.toml stays the single source.
        typer.echo(f"pyskyline {version('pyskyline')}")
        raise typer.Exit()


@app.callback()
def main(
    _version: Annotated[
        bool,
        typer.Option(
            "--version",
            callback=_print_version,
            is_eager=True,
            help="Show the version and exit.",
        ),
    ] = False,
) -> None:
    """Turn a Python codebase into a 3D city."""


@app.command()
def inspect(
    path: Annotated[
        Path,
        typer.Argument(exists=True, dir_okay=False, help="Python file to measure."),
    ],
) -> None:
    """Show line counts and complexity for one Python file."""
    console = Console()
    metrics = analyze_file(path)
    if metrics.error is not None:
        console.print(f"[red]{path}: {metrics.error}[/red]")
        raise typer.Exit(code=1)

    lines = metrics.lines
    console.print(f"[bold]{path}[/bold]")
    console.print(
        f"lines {lines.total}  code {lines.code}  comment {lines.comment}  blank {lines.blank}"
    )
    console.print(
        f"classes {metrics.classes}  functions {len(metrics.functions)}  "
        f"complexity total {metrics.total_complexity}  max {metrics.max_complexity}  "
        f"average {metrics.average_complexity:.1f}"
    )
    if not metrics.functions:
        return

    table = Table(show_edge=False, header_style="bold")
    table.add_column("function")
    table.add_column("lines", justify="right")
    table.add_column("params", justify="right")
    table.add_column("complexity", justify="right")
    for function in metrics.functions:
        table.add_row(
            function.qualified_name,
            f"{function.line_start}-{function.line_end}",
            str(function.parameters),
            _complexity_cell(function.complexity),
        )
    console.print(table)


def _complexity_cell(complexity: int) -> str:
    # Common McCabe guidance: up to 5 is simple, 6-10 is fine, above 10 deserves a look.
    if complexity > 10:
        return f"[red]{complexity}[/red]"
    if complexity > 5:
        return f"[yellow]{complexity}[/yellow]"
    return str(complexity)
