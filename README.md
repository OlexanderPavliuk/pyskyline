# pyskyline

Turn a Python codebase into a 3D city.

- Each file is a building; its height is the number of lines of code.
- Color shows cyclomatic complexity.
- Packages form districts; imports are bridges between buildings.
- Hotspots, files that are both complex and changed often, stand out.

> Work in progress. Right now the CLI measures a single file:
>
> ```bash
> pyskyline inspect path/to/module.py
> ```

## Metrics

- **Lines**: every physical line is code, comment or blank. A line with code and a
  trailing comment is code; lines inside multi-line strings, docstrings included, are code.
- **Cyclomatic complexity** (McCabe): each block starts at 1 and gains 1 for every
  `if`/`elif`, ternary, `for`/`while`, `except`, non-default `match` case, comprehension
  `for`/`if`, and extra `and`/`or` operand. The module and each function are separate
  blocks; nested functions do not add to their parent.

## Layout

| Folder | What it is |
|---|---|
| `analyzer/` | Python package and CLI that analyzes a codebase and writes JSON |
| `web/` | Three.js viewer that renders the city (planned) |

## Development

Requires [uv](https://docs.astral.sh/uv/).

```bash
cd analyzer
uv sync
uv run pyskyline --version
uv run ruff check
uv run ruff format --check
uv run mypy
uv run pytest
```

## License

[MIT](LICENSE)
