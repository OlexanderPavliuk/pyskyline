import textwrap

from pyskyline.metrics.lines import count_lines
from pyskyline.models import LineCounts


def lines_of(source: str) -> LineCounts:
    return count_lines(textwrap.dedent(source))


def test_empty_source_has_no_lines() -> None:
    assert count_lines("") == LineCounts(total=0, code=0, comment=0, blank=0)


def test_code_comment_and_blank_lines_are_separated() -> None:
    counts = lines_of(
        """\
        # header comment
        import os

        x = 1  # trailing comment counts as code
        """
    )

    assert counts == LineCounts(total=4, code=2, comment=1, blank=1)


def test_hash_inside_string_is_not_a_comment() -> None:
    assert count_lines('x = "# not a comment"\n') == LineCounts(total=1, code=1, comment=0, blank=0)


def test_lines_inside_multiline_string_are_code() -> None:
    counts = lines_of(
        '''\
        def f():
            """Docstring.

            # looks like a comment
            """
        '''
    )

    assert counts == LineCounts(total=5, code=5, comment=0, blank=0)


def test_windows_line_endings() -> None:
    assert count_lines("x = 1\r\n\r\n# done\r\n") == LineCounts(total=3, code=1, comment=1, blank=1)


def test_untokenizable_source_falls_back_to_text_count() -> None:
    counts = count_lines("x = (\n\n# comment\n")

    assert counts == LineCounts(total=3, code=1, comment=1, blank=1)
