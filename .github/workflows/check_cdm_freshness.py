"""
check_cdm_freshness.py
Called by check-cdm-freshness.yml. rebuild_cdm_v3.py and the CAPE feed
scripts (narrows-pipeline repo) are run by hand, not on a schedule --
nothing previously monitored how old the deployed data files actually got
between manual reruns. This checks the freshness stamp already embedded in
each deployed file and fails loudly if any of them has crossed its
staleness threshold, so a forgotten rebuild gets noticed instead of
silently serving old figures on the live site.

Fix-118 (2026-09-10): originally checked only simulator_data.json. Extended
to also cover cape_tide_feed.json and cape_corridor_feed.json -- the exact
two files that went silently stale for weeks (cape_tide_feed.json: the
Fix-113/114/115 incident; cape_corridor_feed.json: still open as of this
commit, see the Harmonization Register) with nothing anywhere to catch it.
Also now checks NARROWS-SIGNALS.js's own self-declared next_review_due
date -- a genuinely different kind of staleness (a human review lapsing,
not a stale data rebuild) but the same failure mode: nothing was watching
it, and it was found ~3.5 months past due by coincidence, not by alarm.
"""

import json
import os
import re
import sys
from datetime import date, datetime

# (path, kind, max_age_days)
#   kind "json_date"      -> doc[JSON_FIELD] is a plain YYYY-MM-DD date string
#   kind "json_datetime"  -> doc["_meta"]["generated_at"] is an ISO datetime
#   kind "js_next_review" -> a `next_review_due: 'YYYY-MM-DD'` literal in JS source;
#                             fails once that date has passed, not on a rolling age
TARGETS = [
    ("simulator_data.json",       "json_date",      21),
    ("cape_tide_feed.json",       "json_datetime",  21),
    ("cape_corridor_feed.json",   "json_datetime",  21),
    ("NARROWS-SIGNALS.js",        "js_next_review", None),
]

PREFIX = os.environ.get("FRESHNESS_PATH_PREFIX", "")  # "" for app/, "public/" for 0526

failures = []

for fname, kind, max_age_days in TARGETS:
    path = os.path.join(PREFIX, fname)

    if not os.path.exists(path):
        print(f"::warning::{path} not found -- skipping (not all deploy targets carry every file).")
        continue

    try:
        if kind == "json_date":
            with open(path) as f:
                doc = json.load(f)
            stamp = doc.get("generated")
            if not stamp:
                failures.append(f"{path}: no 'generated' field -- cannot check freshness.")
                continue
            gen_date = date.fromisoformat(stamp)
            age_days = (date.today() - gen_date).days
            print(f"{path} generated {stamp} -- {age_days} day(s) old (limit: {max_age_days})")
            if age_days > max_age_days:
                failures.append(
                    f"{path} is {age_days} days old, over the {max_age_days}-day threshold. "
                    f"Someone needs to rerun narrows-pipeline/notebooks/rebuild_cdm_v3.py and redeploy."
                )

        elif kind == "json_datetime":
            with open(path) as f:
                doc = json.load(f)
            stamp = (doc.get("_meta") or {}).get("generated_at")
            if not stamp:
                failures.append(f"{path}: no '_meta.generated_at' field -- cannot check freshness.")
                continue
            gen_dt = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
            age_days = (datetime.now(gen_dt.tzinfo) - gen_dt).days
            print(f"{path} generated {stamp} -- {age_days} day(s) old (limit: {max_age_days})")
            if age_days > max_age_days:
                failures.append(
                    f"{path} is {age_days} days old, over the {max_age_days}-day threshold. "
                    f"Someone needs to rerun the CAPE feed scripts (narrows-pipeline/notebooks/"
                    f"21_cape_corridor_feed.py, 22_cape_tide_feed.py) and redeploy."
                )

        elif kind == "js_next_review":
            with open(path) as f:
                src = f.read()
            m = re.search(r"next_review_due:\s*'(\d{4}-\d{2}-\d{2})'", src)
            if not m:
                failures.append(f"{path}: no top-level 'next_review_due' field found -- cannot check freshness.")
                continue
            due_date = date.fromisoformat(m.group(1))
            days_over = (date.today() - due_date).days
            print(f"{path} next_review_due {due_date.isoformat()} -- "
                  f"{'due today' if days_over == 0 else (str(-days_over) + ' day(s) away' if days_over < 0 else str(days_over) + ' day(s) overdue')}")
            if days_over > 0:
                failures.append(
                    f"{path} is {days_over} day(s) past its own next_review_due "
                    f"({due_date.isoformat()}). A human needs to re-review the corridor signals "
                    f"and set a new next_review_due -- this is a content review lapsing, not a "
                    f"data rebuild, so no script can close this one automatically."
                )

    except (OSError, json.JSONDecodeError, ValueError) as e:
        failures.append(f"{path}: could not check freshness ({e}).")

if failures:
    for msg in failures:
        print(f"::error::{msg}")
    sys.exit(1)

print("Freshness check passed for all present targets.")
