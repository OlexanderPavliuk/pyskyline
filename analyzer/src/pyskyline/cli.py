from importlib.metadata import version
from typing import Annotated

import typer

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
