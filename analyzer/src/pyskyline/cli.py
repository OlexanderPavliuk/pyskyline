from importlib.metadata import version
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from pyskyline.export import to_json
from pyskyline.metrics.file import analyze_file
from pyskyline.project import analyze_project
from pyskyline.remote import CloneError, cloned, is_remote

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


@app.command()
def analyze(
    source: Annotated[
        str,
        typer.Argument(help="Project directory, or a git URL to clone and analyze."),
    ],
    output: Annotated[
        Path,
        typer.Option("--output", "-o", help="Where to write the city JSON."),
    ] = Path("city.json"),
    history: Annotated[
        bool,
        typer.Option(help="Read change history from git."),
    ] = True,
    depth: Annotated[
        int | None,
        typer.Option(min=1, help="For URLs: clone only the latest N commits."),
    ] = None,
    workers: Annotated[
        int | None,
        typer.Option(min=1, help="Worker processes. Default: automatic."),
    ] = None,
) -> None:
    """Analyze every Python file in a project and write the city JSON."""
    console = Console()
    if is_remote(source):
        console.print(f"cloning {source}")
        try:
            with cloned(source, depth=depth) as checkout:
                report = analyze_project(checkout, with_history=history, workers=workers)
        except CloneError as error:
            console.print(f"[red]clone failed: {error}[/red]")
            raise typer.Exit(code=1) from error
    else:
        path = Path(source)
        if not path.is_dir():
            console.print(f"[red]{source} is not a directory[/red]")
            raise typer.Exit(code=1)
        report = analyze_project(path, with_history=history, workers=workers)
    output.write_text(to_json(report), encoding="utf-8")

    files = report.files
    failed = [file for file in files if file.metrics.error is not None]
    code_lines = sum(file.metrics.lines.code for file in files)
    functions = sum(len(file.metrics.functions) for file in files)
    console.print(
        f"[bold]{report.name}[/bold]: {len(files)} files, {code_lines} lines of code, "
        f"{functions} functions"
    )
    if failed:
        console.print(f"[yellow]{len(failed)} files could not be parsed[/yellow]")
    if not report.has_history and history:
        console.print("[dim]no git history found, hotspots are not computed[/dim]")

    ranked = sorted(
        files,
        key=lambda file: (file.hotspot, file.metrics.total_complexity),
        reverse=True,
    )[:10]
    if ranked:
        table = Table(
            title="hotspots" if report.has_history else "most complex files",
            show_edge=False,
            header_style="bold",
        )
        table.add_column("file")
        table.add_column("complexity", justify="right")
        table.add_column("commits", justify="right")
        table.add_column("hotspot", justify="right")
        for file in ranked:
            table.add_row(
                file.path,
                str(file.metrics.total_complexity),
                str(file.history.commits) if file.history else "-",
                f"{file.hotspot:.2f}",
            )
        console.print(table)
    console.print(f"written to {output}")


def _complexity_cell(complexity: int) -> str:
    # Common McCabe guidance: up to 5 is simple, 6-10 is fine, above 10 deserves a look.
    if complexity > 10:
        return f"[red]{complexity}[/red]"
    if complexity > 5:
        return f"[yellow]{complexity}[/yellow]"
    return str(complexity)
