# pyskyline

Turn a Python codebase into a 3D city. This package is the analyzer: it measures every file
(lines, McCabe complexity, imports, git history, hotspot score) and writes a JSON file that the
[web viewer](https://olexanderpavliuk.github.io/pyskyline/) renders as a city.

```bash
pyskyline analyze path/to/project -o city.json
pyskyline analyze https://github.com/pallets/flask -o flask.json
pyskyline inspect path/to/module.py
```

Open the viewer and drop `city.json` onto it. See the
[project README](https://github.com/OlexanderPavliuk/pyskyline) for how the metrics are defined.
