"""
check_cdm_freshness.py
Called by check-cdm-freshness.yml. rebuild_cdm_v2.py (narrows-pipeline repo) is
run by hand, not on a schedule — nothing previously monitored how old the
deployed simulator_data.json actually got between manual reruns. This checks
the "generated" date already embedded in the deployed file and fails loudly
if it has crossed the staleness threshold, so a forgotten rebuild gets noticed
instead of silently serving old dependency figures.
"""

import json
import os
import sys
from datetime import date

PATH = "simulator_data.json"
MAX_AGE_DAYS = int(os.environ.get("MAX_AGE_DAYS", "21"))
# 21 days is a deliberate early-warning threshold — tighter than the
# "quarterly at best" cadence noted in the CDM repair brief, so a forgotten
# rebuild is caught well before it becomes a real staleness problem.

try:
    with open(PATH) as f:
        doc = json.load(f)
except (OSError, json.JSONDecodeError) as e:
    print(f"::error::Could not read/parse {PATH}: {e}")
    sys.exit(1)

generated = doc.get("generated")
if not generated:
    print(f"::error::{PATH} has no 'generated' field — cannot check freshness.")
    sys.exit(1)

try:
    gen_date = date.fromisoformat(generated)
except ValueError:
    print(f"::error::'generated' field is not a valid date: {generated!r}")
    sys.exit(1)

age_days = (date.today() - gen_date).days
print(f"{PATH} generated {generated} — {age_days} day(s) old (limit: {MAX_AGE_DAYS})")

if age_days > MAX_AGE_DAYS:
    print(
        f"::error::{PATH} is {age_days} days old, over the {MAX_AGE_DAYS}-day "
        f"threshold. Someone needs to rerun "
        f"narrows-pipeline/notebooks/rebuild_cdm_v2.py and redeploy."
    )
    sys.exit(1)

print("Freshness check passed.")
