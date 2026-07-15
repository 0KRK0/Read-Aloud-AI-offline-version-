# Lexora AI — PDF -> Excel (our own engine: camelot + pandas/openpyxl, no paid API).
# Usage: python3 pdf2excel.py input.pdf output.xlsx
# Tries lattice (ruled tables, best quality) first, then stream (whitespace tables).
import sys

import camelot
import pandas as pd

src, dst = sys.argv[1], sys.argv[2]
tables = []

try:
    got = camelot.read_pdf(src, pages="all", flavor="lattice")
    tables = [t for t in got if t.df.size > 1]
except Exception as e:
    sys.stderr.write("lattice pass failed: %s\n" % e)

if not tables:
    try:
        got = camelot.read_pdf(src, pages="all", flavor="stream")
        tables = [t for t in got if t.df.size > 1]
    except Exception as e:
        sys.stderr.write("stream pass failed: %s\n" % e)

if not tables:
    sys.stderr.write("no tables found in this PDF - it works best on PDFs with ruled/visible tables\n")
    sys.exit(2)

with pd.ExcelWriter(dst, engine="openpyxl") as w:
    for i, tb in enumerate(tables):
        page = getattr(tb, "page", None) or "?"
        name = ("Table %d (p%s)" % (i + 1, page))[:31]
        tb.df.to_excel(w, sheet_name=name, index=False, header=False)

print("%d table(s) extracted" % len(tables))
