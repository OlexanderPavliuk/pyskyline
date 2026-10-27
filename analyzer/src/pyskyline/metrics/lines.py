import io
import tokenize

from pyskyline.models import LineCounts

# Tokens that carry no code: line breaks, indentation bookkeeping, end of file.
_LAYOUT_TOKENS = frozenset(
    {
        tokenize.NL,
        tokenize.NEWLINE,
        tokenize.INDENT,
        tokenize.DEDENT,
        tokenize.ENDMARKER,
    }
)


def count_lines(source: str) -> LineCounts:
    """Classify every line as code, comment or blank.

    A line with code and a trailing comment counts as code. Every line a token
    spans counts as code, so lines inside a multi-line string (docstrings too)
    are code even when they look blank or start with "#".
    """
    total = len(source.splitlines())
    code_rows: set[int] = set()
    comment_rows: set[int] = set()
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.type == tokenize.COMMENT:
                comment_rows.add(token.start[0])
            elif token.type not in _LAYOUT_TOKENS:
                code_rows.update(range(token.start[0], token.end[0] + 1))
    except (tokenize.TokenError, SyntaxError):
        # Source that cannot be tokenized (unclosed bracket, bad indentation)
        # still gets an approximate count instead of none.
        return _count_lines_by_text(source)

    code = len(code_rows)
    comment = len(comment_rows - code_rows)
    return LineCounts(total=total, code=code, comment=comment, blank=total - code - comment)


def _count_lines_by_text(source: str) -> LineCounts:
    code = comment = blank = 0
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped:
            blank += 1
        elif stripped.startswith("#"):
            comment += 1
        else:
            code += 1
    return LineCounts(total=code + comment + blank, code=code, comment=comment, blank=blank)
