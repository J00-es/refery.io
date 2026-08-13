#!/usr/bin/env python3
"""Status of the work-email sourcing pipeline.

Usage:  python email-status.py
Run from the repo root. Read-only: it never modifies a CSV.
"""
import csv, glob, os, collections, sys

REPO = os.path.dirname(os.path.abspath(__file__))
os.chdir(REPO)

# chunk letter -> output file naming convention used by each wave
WAVES = [("batch", "DEFGHIJK"), ("b2", "LMNOPQRS"), ("yc", ["T","U","V","W","X","Y","Z","AA"])]
HEADER = ["company","domain","persona","full_name","title",
          "linkedin_url","email","source","domain_match","note"]


def chunk_files():
    out = []
    for prefix, letters in WAVES:
        for L in letters:
            f = f"email-{prefix}-{L}.csv" if prefix != "batch" else f"email-batch-{L}.csv"
            out.append((L, f))
    return out


def read(f):
    if not os.path.exists(f):
        return None, []
    with open(f, newline="", encoding="utf-8-sig") as fh:
        r = csv.reader(fh)
        hdr = next(r, [])
        return hdr, [row for row in r if any(row)]


def main():
    print("=" * 78)
    print("PER-CHUNK COVERAGE")
    print("=" * 78)
    print(f"{'CHUNK':<6}{'FILE':<24}{'COMPANIES':>10}{'ROWS':>7}{'P1':>5}{'P2':>5}{'P3':>5}  STATUS")
    print("-" * 78)

    t_rows = t_co = 0
    problems = []
    all_emails = collections.Counter()

    for L, f in chunk_files():
        hdr, rows = read(f)
        if hdr is None:
            print(f"{L:<6}{f:<24}{'-':>10}{'-':>7}{'-':>5}{'-':>5}{'-':>5}  MISSING")
            problems.append(f"{f} is missing")
            continue

        bad = [i for i, r in enumerate(rows, 2) if len(r) != len(HEADER)]
        if hdr != HEADER:
            problems.append(f"{f} header mismatch")
        if bad:
            problems.append(f"{f} malformed row(s) at line {bad[:5]}")

        comp = {r[0].strip().lower() for r in rows if len(r) > 0 and r[0].strip()}
        per = collections.Counter(r[2].strip() for r in rows if len(r) > 2)
        for r in rows:
            if len(r) > 6 and r[6].strip():
                all_emails[r[6].strip().lower()] += 1

        t_rows += len(rows); t_co += len(comp)
        status = "OK" if not bad and hdr == HEADER else "CHECK"
        print(f"{L:<6}{f:<24}{len(comp):>10}{len(rows):>7}"
              f"{per.get('P1',0):>5}{per.get('P2',0):>5}{per.get('P3',0):>5}  {status}")

    print("-" * 78)
    print(f"{'TOTAL':<30}{t_co:>10}{t_rows:>7}")

    dupes = {e: c for e, c in all_emails.items() if c > 1}
    print(f"\nunique emails across all chunks : {len(all_emails)}")
    print(f"duplicate emails                : {len(dupes)}")
    for e, c in list(dupes.items())[:10]:
        print(f"    {e} x{c}")

    print("\n" + "=" * 78)
    print("ROLLUPS")
    print("=" * 78)
    roll = {}
    for f in ["refery-emails-ALL.csv", "refery-emails-SEND.csv",
              "refery-emails-REVIEW.csv", "email-master.csv"]:
        hdr, rows = read(f)
        if hdr is None:
            continue
        roll[f] = len(rows)
        widths = collections.Counter(len(r) for r in rows)
        ok = "OK" if set(widths) == {len(HEADER)} else f"RAGGED {dict(widths)}"
        mtime = __import__("datetime").datetime.fromtimestamp(os.path.getmtime(f))
        print(f"{f:<28}{len(rows):>6} rows   {mtime:%Y-%m-%d %H:%M}   {ok}")

    a = roll.get("refery-emails-ALL.csv")
    s = roll.get("refery-emails-SEND.csv", 0)
    r_ = roll.get("refery-emails-REVIEW.csv", 0)
    if a is not None:
        print(f"\nSEND + REVIEW = {s + r_}  vs  ALL = {a}   "
              f"{'consistent' if s + r_ == a else 'MISMATCH'}")
        if a < t_rows:
            problems.append(f"ALL ({a}) has fewer rows than the chunks ({t_rows}) - rollup may be stale")

    print("\n" + "=" * 78)
    if problems:
        print(f"PROBLEMS ({len(problems)})")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("NO PROBLEMS FOUND")


if __name__ == "__main__":
    main()
