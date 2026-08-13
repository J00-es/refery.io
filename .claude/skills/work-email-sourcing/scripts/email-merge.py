#!/usr/bin/env python3
"""Merge gap-fill results into the per-chunk CSVs and rebuild the rollups.

Usage:  python email-merge.py
Idempotent: safe to run more than once (dedupes by email).
"""
import csv, glob, os, collections, datetime, re, shutil

REPO = os.path.dirname(os.path.abspath(__file__))
os.chdir(REPO)
SP = (r"C:/Users/hsjoo/AppData/Local/Temp/claude/"
      r"C--Users-hsjoo-Desktop-refery-gh/b8d38064-1daf-4739-8a9c-9126725d9e48/scratchpad")

HEADER = ["company","domain","persona","full_name","title",
          "linkedin_url","email","source","domain_match","note"]
WAVES = [("batch", list("DEFGHIJK")), ("b2", list("LMNOPQRS")),
         ("yc", ["T","U","V","W","X","Y","Z","AA"])]
GROUPS = {1: ["D","E","F"], 2: ["G","H"], 3: ["I","J","K"],
          4: ["O","T","U","V","W","X","Y","AA"]}
REVIEW_RX = re.compile(r"extrapolated|verify|stale|caution|mis-?filed|corrected domain|may not be", re.I)


def chunk_file(L):
    for pre, letters in WAVES:
        if L in letters:
            return f"email-batch-{L}.csv" if pre == "batch" else f"email-{pre}-{L}.csv"
    raise KeyError(L)


def read(f):
    if not os.path.exists(f):
        return []
    with open(f, newline="", encoding="utf-8-sig") as fh:
        r = csv.reader(fh)
        next(r, None)
        return [x for x in r if any(x) and len(x) == len(HEADER)]


def write(f, rows):
    with open(f, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_MINIMAL)
        w.writerow(HEADER)
        w.writerows(rows)


# name -> chunk letter, built from EVERY chunk input file so it routes
# gap-fill AND top-up rows regardless of which agent produced them
name2chunk = {}
for _pre, _letters in WAVES:
    for L in _letters:
        c = os.path.join(SP, f"chunk-{L}.txt")
        if not os.path.exists(c):
            continue
        for line in open(c, encoding="utf-8-sig"):
            if "|" in line:
                name2chunk.setdefault(line.split("|")[0].strip().lower(), L)

# fall back to routing by domain for rows whose company name was rewritten
domain2chunk = {}
for _pre, _letters in WAVES:
    for L in _letters:
        c = os.path.join(SP, f"chunk-{L}.txt")
        if not os.path.exists(c):
            continue
        for line in open(c, encoding="utf-8-sig"):
            if "|" in line:
                domain2chunk.setdefault(line.split("|", 1)[1].strip().lower(), L)

# 1) distribute gap-fill rows into the right chunk CSVs
added = collections.Counter()
unrouted = []
for gf in sorted(glob.glob("email-gapfill-*.csv")):
    for row in read(gf):
        if not row[6].strip():
            continue
        L = (name2chunk.get(row[0].strip().lower())
             or domain2chunk.get(row[1].strip().lower()))
        if not L:
            unrouted.append(row)
            continue
        f = chunk_file(L)
        existing = read(f)
        have = {r[6].strip().lower() for r in existing}
        if row[6].strip().lower() in have:
            continue
        write(f, existing + [row])
        added[f] += 1

print("=== gap-fill merged into chunk files ===")
for f, n in sorted(added.items()):
    print(f"  +{n:<4} {f}")
if not added:
    print("  (nothing new)")
if unrouted:
    print(f"  !! {len(unrouted)} row(s) could not be routed to a chunk:")
    for r in unrouted[:10]:
        print("     ", r[0], r[6])

# 2) rebuild rollups: existing ALL + every chunk row, deduped by email, empties dropped
allrows = read("refery-emails-ALL.csv")
for _, letters in WAVES:
    for L in letters:
        allrows += read(chunk_file(L))

seen, merged, dropped_empty = set(), [], 0
for r in allrows:
    e = r[6].strip().lower()
    if not e or "@" not in e:
        dropped_empty += 1
        continue
    if e in seen:
        continue
    seen.add(e)
    merged.append(r)

send = [r for r in merged if r[8].strip().upper() == "Y" and not REVIEW_RX.search(r[9])]
review = [r for r in merged if r not in send]

for f in ["refery-emails-ALL.csv", "refery-emails-SEND.csv", "refery-emails-REVIEW.csv"]:
    if os.path.exists(f):
        shutil.copy2(f, f + ".bak")

write("refery-emails-ALL.csv", merged)
write("refery-emails-SEND.csv", send)
write("refery-emails-REVIEW.csv", review)

print("\n=== rollups rebuilt (previous versions saved as *.bak) ===")
print(f"  ALL    : {len(merged)}")
print(f"  SEND   : {len(send)}")
print(f"  REVIEW : {len(review)}")
print(f"  dropped rows with no email: {dropped_empty}")
print(f"  SEND+REVIEW == ALL : {len(send)+len(review) == len(merged)}")
print(f"\n  {datetime.datetime.now():%Y-%m-%d %H:%M}")
