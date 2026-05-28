"""
fetch_rates.py
Called by update-rates.yml. Fetches Brent and BDI from Yahoo Finance,
estimates vessel day rates, and updates narrows_config.json + NARROWS-RATES.js.

Do not run this file directly in production — always via the GitHub Action
so the git commit step can record provenance.
"""

import json, re, sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# 1. Fetch market signals
# ---------------------------------------------------------------------------

def fetch(ticker: str):
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="5d")
        if hist.empty:
            return None
        return float(hist["Close"].iloc[-1])
    except Exception as e:
        print(f"Warning: could not fetch {ticker}: {e}", file=sys.stderr)
        return None


brent = fetch("BZ=F")   # Brent crude front-month, USD/bbl
bdi   = fetch("^BDI")   # Baltic Dry Index

print(f"Brent: {brent}  BDI: {bdi}")

# Load existing rates as fallback
cfg_path = Path("narrows_config.json")
cfg = json.loads(cfg_path.read_text())
existing = cfg["vesselRates"]

def fallback(key, sub):
    return existing.get(key, {}).get(sub, 0)


# ---------------------------------------------------------------------------
# 2. Estimate day rates
# ---------------------------------------------------------------------------

def clamp(val, lo, hi):
    return int(max(lo, min(hi, val)))


if brent and brent > 20:
    vlcc_bunker   = clamp(0.85 * brent * 165 + 6_000,   30_000, 120_000)
    vlcc_charter  = clamp(brent * 850 + 5_000,           25_000, 200_000)
    afra_bunker   = clamp(0.85 * brent * 55 + 2_500,    15_000,  55_000)
    afra_charter  = clamp(brent * 320 + 3_000,           10_000,  80_000)
    cape_bunker   = clamp(0.85 * brent * 55 + 2_500,    15_000,  55_000)
    cont_bunker   = clamp(0.85 * brent * 75 + 3_000,    18_000,  65_000)
    roro_bunker   = clamp(0.85 * brent * 45 + 2_000,    12_000,  45_000)
    lng_bunker    = clamp(0.85 * brent * 120 + 5_000,   25_000,  90_000)
    handy_bunker  = clamp(0.85 * brent * 35 + 1_500,    10_000,  38_000)
else:
    print("Brent unavailable — keeping existing bunker rates")
    vlcc_bunker  = fallback("VLCC",        "bunkerPerDay")
    afra_bunker  = fallback("Aframax",     "bunkerPerDay")
    cape_bunker  = fallback("Capesize",    "bunkerPerDay")
    cont_bunker  = fallback("Container",   "bunkerPerDay")
    roro_bunker  = fallback("RoRo",        "bunkerPerDay")
    lng_bunker   = fallback("LNG_Carrier", "bunkerPerDay")
    handy_bunker = fallback("Handymax",    "bunkerPerDay")
    vlcc_charter = fallback("VLCC",        "charterPerDay")
    afra_charter = fallback("Aframax",     "charterPerDay")


if bdi and bdi > 100:
    cape_charter  = clamp(bdi * 8.5,   8_000, 100_000)
    handy_charter = clamp(bdi * 4.2,   5_000,  45_000)
else:
    print("BDI unavailable — keeping existing BDI-linked charter rates")
    cape_charter  = fallback("Capesize", "charterPerDay")
    handy_charter = fallback("Handymax", "charterPerDay")

# Container, RoRo, LNG charter held — no reliable public proxy
cont_charter = fallback("Container",   "charterPerDay")
roro_charter = fallback("RoRo",        "charterPerDay")
lng_charter  = fallback("LNG_Carrier", "charterPerDay")

new_rates = {
    "VLCC":        {"bunkerPerDay": vlcc_bunker,  "charterPerDay": vlcc_charter,  "cargoValueM": existing.get("VLCC",        {}).get("cargoValueM", 120)},
    "Aframax":     {"bunkerPerDay": afra_bunker,  "charterPerDay": afra_charter,  "cargoValueM": existing.get("Aframax",     {}).get("cargoValueM",  65)},
    "Capesize":    {"bunkerPerDay": cape_bunker,  "charterPerDay": cape_charter,  "cargoValueM": existing.get("Capesize",    {}).get("cargoValueM",  40)},
    "Handymax":    {"bunkerPerDay": handy_bunker, "charterPerDay": handy_charter, "cargoValueM": existing.get("Handymax",    {}).get("cargoValueM",  18)},
    "RoRo":        {"bunkerPerDay": roro_bunker,  "charterPerDay": roro_charter,  "cargoValueM": existing.get("RoRo",        {}).get("cargoValueM",  55)},
    "LNG_Carrier": {"bunkerPerDay": lng_bunker,   "charterPerDay": lng_charter,   "cargoValueM": existing.get("LNG_Carrier", {}).get("cargoValueM", 180)},
    "Container":   {"bunkerPerDay": cont_bunker,  "charterPerDay": cont_charter,  "cargoValueM": existing.get("Container",   {}).get("cargoValueM",  80)},
}

today     = datetime.now(timezone.utc).strftime("%Y-%m-%d")
brent_str = f"{brent:.1f}" if brent else "n/a"
bdi_str   = f"{int(bdi)}"  if bdi   else "n/a"
source    = f"Yahoo Finance auto-update {today} (Brent {brent_str} USD/bbl, BDI {bdi_str})"


# ---------------------------------------------------------------------------
# 3. Update narrows_config.json
# ---------------------------------------------------------------------------

cfg["vesselRates"] = new_rates
cfg["_meta"]["ratesUpdated"] = today
cfg["_meta"]["ratesSource"]  = source
if brent:
    cfg["_meta"]["rateBaselines"]["brent"] = round(brent, 1)
if bdi:
    cfg["_meta"]["rateBaselines"]["bdi"] = int(bdi)

cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
print(f"narrows_config.json updated")


# ---------------------------------------------------------------------------
# 4. Update NARROWS-RATES.js
# ---------------------------------------------------------------------------
# Uses explicit string markers rather than regex over nested braces.

rates_path = Path("NARROWS-RATES.js")
js = rates_path.read_text()

# -- scalar fields: last_updated, source --
js = re.sub(r"(  last_updated:\s*')[^']*(')", f"\\g<1>{today}\\g<2>", js)
js = re.sub(r"(  source:\s*')[^']*(')",       f"\\g<1>{source}\\g<2>", js)

# -- vesselRates block --
# Delimiter lines that exist verbatim in NARROWS-RATES.js
START_MARKER = "  vesselRates: Object.freeze({"
END_MARKER   = "  }),"  # the line that closes vesselRates Object.freeze, followed by a comma

start = js.index(START_MARKER)
# Find the END_MARKER line that follows START
after_start = js[start + len(START_MARKER):]
rel = after_start.index("\n" + END_MARKER)
end = start + len(START_MARKER) + rel  # index of the \n just before END_MARKER

# Build the new inner block
PAD = {"VLCC": "       ", "Aframax": "    ", "Capesize": "   ",
       "Handymax": "  ", "RoRo": "        ", "LNG_Carrier": "",
       "Container": "  "}
rows = []
for cls, r in new_rates.items():
    p = PAD.get(cls, "")
    rows.append(
        f"    {cls}:{p}Object.freeze({{ bunkerPerDay: {r['bunkerPerDay']}, "
        f"charterPerDay: {r['charterPerDay']}, cargoValueM: {r['cargoValueM']} }})"
    )
inner = ",\n".join(rows)

js = js[:start] + START_MARKER + "\n" + inner + "\n" + js[end + 1:]

rates_path.write_text(js)
print(f"NARROWS-RATES.js updated")

# Spot-check
d = json.loads(cfg_path.read_text())
vr = d["vesselRates"]
print(f"  VLCC:     bunker=${vr['VLCC']['bunkerPerDay']:,}/d  charter=${vr['VLCC']['charterPerDay']:,}/d")
print(f"  Capesize: bunker=${vr['Capesize']['bunkerPerDay']:,}/d  charter=${vr['Capesize']['charterPerDay']:,}/d")
print(f"  Source: {source}")
