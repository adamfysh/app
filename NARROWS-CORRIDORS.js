/* NARROWS-CORRIDORS.js
 * Shared corridor/passage/JWC/port-risk/speed assumptions for Narrows tools.
 *
 * Extracted from CASCADE+ (0526/public/cascade-plus.html) on 2026-09-18 —
 * decision D14 in NARROWS-CASCADE-PLUS-DECISION-LEDGER.md. Same treatment
 * NARROWS-RATES.js already got for bunker/charter day rates: one real file,
 * loaded live, instead of the same data hand-copied into every tool that
 * needs it (the exact "patch after patch" pattern Fysh flagged repeatedly
 * across CAPE and CASCADE+).
 *
 * Loaded via a plain blocking <script src="NARROWS-CORRIDORS.js"></script>,
 * the same way NARROWS-RATES.js is loaded — not an ES module, no build
 * step, works from a Cloudflare Pages static file exactly as-is. Sets one
 * global, window.NARROWS_CORRIDORS, and does nothing else.
 *
 * THIS FILE IS THE REAL SOURCE. CASCADE+ has no local fallback copy of this
 * data any more — if this file 404s, CASCADE+ will not load, the same
 * failure mode NARROWS-RATES.js already has today. That is intentional:
 * a silent fallback copy is exactly the two-sources-of-truth problem this
 * extraction exists to remove.
 *
 * NOTE ON "SHARED": 0526/public/ and app/ are separate repos/deployments —
 * there is no single cross-origin file both tools load. This works the
 * same way NARROWS-RATES.js and NARROWS-SIGNALS.js already do: a
 * byte-identical copy lives in each repo, and both are meant to be kept in
 * sync by hand whenever one changes. "Shared" means "one file, copy-pasted
 * to both places and never allowed to drift" — not literally one URL.
 *
 * STATUS (2026-09-19): CASCADE+ (0526/public/cascade-plus.html) reads
 * PASSAGES, CORRIDORS, REAL_ROUTES, TERMINAL_ENDPOINTS, RATE_KEY,
 * CARGO_DETAIL, TERMINAL_DECLINE_COST, CLASS_SPEED_KN, CII_SPEED_FACTOR,
 * and PORT_RISK from this file. CAPE (app/cape.html) has its own copy of
 * this file (decision D30) and reads PORT_RISK from it — CAPE's own local
 * PORT_RISK table (the one this file's copy was originally ported FROM)
 * is now a fallback only, used if this file fails to load. CAPE's `CORR`
 * object is DELIBERATELY NOT part of this migration: it uses a different
 * shape (tier/type/region fields CASCADE+'s CORRIDORS doesn't have, no
 * `primary` passage tag, no real multi-passage voyage model) built for
 * CAPE's own trade-exposure VaR model rather than CASCADE+'s routing
 * simulator. Reconciling the two is real, separate, deliberately deferred
 * work — see D14/D28 in the CASCADE+ decision ledger and D30's own note
 * before attempting that merge.
 */
(function(){

// ---- Passage tags -----------------------------------------------------
// Every real passage tag narrows-routing-api's graph carries (11, plus the
// two permanent defaults — northwest, bering — that are always blocked and
// have no tool-facing label). `voyage:true` marks the 7 that also have
// their own CASCADE+ FLEET bucket; the rest (sunda, dardanelles,
// south_africa, chili) are real places a diverted vessel can land with no
// dedicated bucket of its own — see CASCADE-PLUS-METHODOLOGY-DRAFT.md
// Section 3/5.
const PASSAGES = {
  babalmandab:  { label:'Bab el-Mandeb',           jwc:true,  voyage:true  },
  suez:         { label:'Suez Canal',              jwc:false, voyage:true  },
  gibraltar:    { label:'Gibraltar',               jwc:false, voyage:true  },
  malacca:      { label:'Malacca Strait',          jwc:false, voyage:true  },
  panama:       { label:'Panama Canal',            jwc:false, voyage:true  },
  ormuz:        { label:'Strait of Hormuz',        jwc:true,  voyage:true  },
  bosporus:     { label:'Bosphorus',               jwc:false, voyage:true  },
  sunda:        { label:'Sunda Strait',            jwc:false, voyage:false },
  dardanelles:  { label:'Dardanelles',             jwc:false, voyage:false },
  south_africa: { label:'Cape of Good Hope',       jwc:false, voyage:false },
  chili:        { label:'Cape Horn / Chile Strait',jwc:false, voyage:false },
};

// ---- Corridors (CASCADE+'s fleet buckets / filter chips) --------------
// `primary` is the passage tag each corridor blocks to test its diversion;
// the real exposure list a voyage actually shows is whatever the routing
// engine returns, not this field — this is just which single tag to block.
const CORRIDORS = {
  bab:            { label:'Bab el-Mandeb',  jwc:true,  real:true, primary:'babalmandab' },
  suez:           { label:'Suez',           jwc:false, real:true, primary:'suez'        },
  malacca:        { label:'Malacca',        jwc:false, real:true, primary:'malacca'     },
  panama:         { label:'Panama',         jwc:false, real:true, primary:'panama'      },
  gibraltar:      { label:'Gibraltar',      jwc:false, real:true, primary:'gibraltar'   },
  hormuz:         { label:'Hormuz',         jwc:true,  real:true, primary:'ormuz'       },
  bosphorus:      { label:'Bosphorus',      jwc:false, real:true, primary:'bosporus'    },
  danish_straits: { label:'Danish Straits', jwc:false, real:false },
  // Added 2026-09-19 (decision D31) — real, named blue-water chokepoints the
  // same tracked fleet classes actually use, same "terminal/flat-estimate"
  // treatment Danish Straits already has: `narrows-routing-api`'s graph has
  // no passage tag for any of these four either (confirmed the same way the
  // Danish Straits gap was — no fabricated real-routing cost, an honest
  // flat one instead). jwc:false on all four is NOT a claim they are clear
  // of JWC Listed Area status — it means this session did not have a
  // current JWC list to check them against, so false (not fabricated true)
  // is the honest default. Verify before treating that flag as confirmed.
  torres:         { label:'Torres Strait',        jwc:false, real:false },
  mozambique:     { label:'Mozambique Channel',   jwc:false, real:false },
  parana:         { label:'Paraná / Río de la Plata', jwc:false, real:false },
  mississippi:    { label:'Mississippi River Ship Channel', jwc:false, real:false },
};

// One representative real voyage per real corridor, real port coordinates
// (WPI-derived). Confirmed against narrows-routing-api's own graph during
// the 2026-09-18 audit — see decision D18-D22.
const REAL_ROUTES = {
  bab:       { from:[56.369167,25.173056], to:[4.483333,51.9],    fromLabel:'Al Fujayrah, UAE',  toLabel:'Rotterdam, NL' },
  suez:      { from:[39.183333,21.483333], to:[4.483333,51.9],    fromLabel:'Jiddah, SA',         toLabel:'Rotterdam, NL' },
  malacca:   { from:[79.85,6.95],          to:[121.5,31.216667],  fromLabel:'Colombo, LK',        toLabel:'Shanghai, CN' },
  panama:    { from:[-95.283333,29.75],    to:[121.5,31.216667],  fromLabel:'Houston, US',        toLabel:'Shanghai, CN' },
  gibraltar: { from:[-74.016667,40.7],     to:[8.922,44.398],     fromLabel:'New York, US',       toLabel:'Genova, IT' },
  hormuz:    { from:[50.166667,26.633333],to:[103.85,1.283333],   fromLabel:'Ras Tannurah, SA',   toLabel:'Singapore (Keppel)' },
  bosphorus: { from:[37.783333,44.716667],to:[8.922,44.398],      fromLabel:'Novorossiysk, RU',   toLabel:'Genova, IT' },
};

// Terminal (non-real) corridor endpoints — illustrative only, for the
// detail panel. No route is computed because the routing graph has no
// passage tag for Danish Straits at all (a narrows-pipeline gap, not a
// tool-level choice — see decision D4/D20). Same reasoning for the four
// added 2026-09-19 (D31): real named ports, real trades, no graph tag.
// `from` coordinates are representative (matched to the precision already
// used for PASSAGE_COORDS in cascade-plus.html — real locations, not
// survey-grade), and `toLabel` is a market description rather than a
// single port, same as Danish Straits, since no route geometry exists to
// draw a real line to.
const TERMINAL_ENDPOINTS = {
  danish_straits: { fromLabel:'Primorsk, RU', from:[28.633333,60.366667], toLabel:'North Sea / Atlantic export markets' },
  // Weipa, QLD — real bauxite/alumina export port; the standing real trade
  // that actually uses Torres Strait as a shortcut to North Asia rather
  // than routing around Australia's south/west coast.
  torres:      { fromLabel:'Weipa, AU', from:[141.92,-12.63], toLabel:'North Asia (China/Japan/Korea) bulk import markets' },
  // Richards Bay, ZA — real major coal export port; Asia-bound coal traffic
  // from southern/eastern Africa is the standing real trade routed past the
  // Mozambique Channel.
  mozambique:  { fromLabel:'Richards Bay, ZA', from:[32.08,-28.78], toLabel:'South & East Asia coal/crude import markets' },
  // Rosario, AR — the real hub of the "up-river" grain port complex trade
  // press calls Argentina's/South America's grain superhighway.
  parana:      { fromLabel:'Rosario, AR', from:[-60.64,-32.95], toLabel:'China/Asia soybean and grain import markets' },
  // Baton Rouge, US — the real deep-draft loading point at the head of the
  // Mississippi River Ship Channel (the reach actively being dredged for
  // larger vessels); real, quantified U.S. grain/petrochemical export gateway.
  mississippi: { fromLabel:'Baton Rouge, US', from:[-91.15,30.45], toLabel:'Europe & Asia grain import markets' },
};

// Vessel-class → NARROWS-RATES.js rate-table key, cargo description, and
// the flat per-class cost used for terminal (non-real-routing) corridors.
const RATE_KEY = { Suezmax:'Suezmax', Container:'Container', LNG:'LNG_Carrier', Aframax:'Aframax', Bulk:'Handymax', VLCC:'VLCC', Neopanamax:'Neopanamax', LPG:'LPG' };
const CARGO_DETAIL = { Suezmax:'Crude oil, ~1M bbl', VLCC:'Crude oil, ~2M bbl', Aframax:'Crude/products, ~600k bbl', Container:'Mixed containers, 4,000-8,000 TEU', LNG:'LNG, ~170,000m³', Bulk:'Grain or coal, 40-60k dwt', Neopanamax:'Mixed containers, ~13,000 TEU', LPG:'LPG, ~40,000m³' };
// Bulk added 2026-09-19 (D31) — the four new terminal corridors are real
// grain/bulk trades (Torres Strait, Mozambique Channel, Paraná, Mississippi
// all carry Bulk-class demo vessels), and without an entry here their
// divert button silently no-ops (computeDivertCost returns null,
// divertVessel() bails — a real functional gap, not a labeling one).
// $280,000 is NOT independently sourced the way the routing-based costs
// are — same honest-estimate category as CLASS_SPEED_KN/CII_SPEED_FACTOR
// below. Derived by scaling Handymax's own day-rate (NARROWS-RATES.js:
// $26,000/day bunker+charter) by roughly the same days-equivalent the
// existing Aframax/Suezmax figures imply against their own day rates
// (~11 days) — an extrapolation of this table's own existing pattern, not
// a fresh guess, but still worth a real sourcing pass before this becomes
// customer-facing, same flag as the speed table.
const TERMINAL_DECLINE_COST = { VLCC:900000, Aframax:550000, Suezmax:700000, LNG:750000, Bulk:280000 };

// Per-class service speed + CII-adjusted slow-steaming penalty. Known
// limitation (see METHODOLOGY-DRAFT Section 4): engineering estimates, not
// independently sourced from a classification society or IMO CII guidance
// yet.
const CLASS_SPEED_KN = { VLCC:13, Suezmax:14, Aframax:13, Container:20, LNG:19, Bulk:13, Neopanamax:19, LPG:15 };
const CII_SPEED_FACTOR = { A:1.00, B:0.97, C:0.93, D:0.88, E:0.82 };

// PRI (Port Risk Index) × bunker/waypoint risk. Canonical source is CAPE's
// own PORT_RISK table (app/cape.html) — CASCADE+'s copy was ported from it
// on 2026-09-18 (decision D23). This file now holds that copy; CAPE itself
// has not yet been switched to read from here (see file header).
const PORT_RISK = {
  'Djibouti': { pri:1.54, tier:'Moderate', rank:716, dwellH:72, dwellSrc:'port_level_curated', jwc:true, asOf:'2026-09-18', note:'Gulf of Aden approach. Bunker stop for Cape-diverting vessels.' },
  'Aden': { pri:3.53, tier:'Critical', rank:1, dwellH:120, dwellSrc:'port_level_curated', jwc:true, asOf:'2026-09-18', note:'Yemen coast. Active conflict.' },
  'Hudaydah': { pri:3.20, tier:'Critical', rank:12, dwellH:121, dwellSrc:'lpi_formula_fallback', jwc:true, asOf:'2026-09-18', note:'Houthi-controlled. PRI record is the nearest port, Al Ahmadi; Hodeidah itself is not in the PRI port list. PRI record: Al Ahmadi (5 km).' },
  'Fujairah': { pri:1.31, tier:'Moderate', rank:1432, dwellH:24, dwellSrc:'unctad_2021_country_median', jwc:true, asOf:'2026-09-18', note:'Gulf of Oman, near the Hormuz listed area. PRI record: Al Fujayrah (1 km).' },
  'Ras Tanura': { pri:1.22, tier:'Moderate', rank:1825, dwellH:74, dwellSrc:'lpi_formula_fallback', jwc:true, asOf:'2026-09-18', note:'Persian Gulf listed area. Main Saudi crude export terminal. PRI record: Ras  Tannurah (1 km).' },
  'Shuaiba': { pri:1.12, tier:'Moderate', rank:2513, dwellH:82, dwellSrc:'lpi_formula_fallback', jwc:true, asOf:'2026-09-18', note:'Kuwait, Persian Gulf listed area. PRI record: Mina Ash Shuaybah (2 km).' },
  'Port Sudan': { pri:2.34, tier:'Elevated', rank:130, dwellH:113, dwellSrc:'lpi_formula_fallback', jwc:true, asOf:'2026-09-18', note:'Red Sea. Conflict in the Sudanese interior.' },
  'Singapore': { pri:0.96, tier:'Moderate', rank:3340, dwellH:25, dwellSrc:'unctad_2021_country_median', jwc:false, asOf:'2026-09-18', note:'Major bunkering hub. PRI record: Keppel - (East Singapore) (3 km).' },
  'Colombo': { pri:0.79, tier:'Moderate', rank:3651, dwellH:24, dwellSrc:'port_level_curated', jwc:false, asOf:'2026-09-18', note:'Sri Lanka.' },
  'Port Said': { pri:0.96, tier:'Moderate', rank:3337, dwellH:86, dwellSrc:'lpi_formula_fallback', jwc:false, asOf:'2026-09-18', note:'Suez Canal northern approach. PRI record: Bur Sa\'id (1 km).' },
  'Port Klang': { pri:0.68, tier:'Moderate', rank:3748, dwellH:20, dwellSrc:'port_level_curated', jwc:false, asOf:'2026-09-18', note:'Malaysia.' },
  'Durban': { pri:1.10, tier:'Moderate', rank:2659, dwellH:48, dwellSrc:'port_level_curated', jwc:false, asOf:'2026-09-18', note:'South Africa. Cape diversion bunker stop.' },
  'Las Palmas': { pri:0.59, tier:'Moderate', rank:3772, dwellH:16, dwellSrc:'unctad_2021_country_median', jwc:false, asOf:'2026-09-18', note:'Canary Islands. Atlantic transit hub.' },
  'Gibraltar': { pri:1.49, tier:'Moderate', rank:828, dwellH:63, dwellSrc:'lpi_formula_fallback', jwc:false, asOf:'2026-09-18', note:'Mediterranean approach. PRI record: Europa Point (1 km).' },
  'Rotterdam': { pri:0.67, tier:'Moderate', rank:3753, dwellH:20, dwellSrc:'port_level_curated', jwc:false, asOf:'2026-09-18', note:'North Sea hub.' },
  'Balboa': { pri:1.07, tier:'Moderate', rank:2856, dwellH:21, dwellSrc:'unctad_2021_country_median', jwc:false, asOf:'2026-09-18', note:'Panama Canal Pacific approach.' },
  'Colon': { pri:1.20, tier:'Moderate', rank:1975, dwellH:21, dwellSrc:'unctad_2021_country_median', jwc:false, asOf:'2026-09-18', note:'Panama Canal Atlantic approach. PRI record: Puerto Colon (2 km).' },
  'Istanbul': { pri:0.85, tier:'Moderate', rank:3580, dwellH:48, dwellSrc:'port_level_curated', jwc:false, asOf:'2026-09-18', note:'Bosphorus.' },
  'Odessa': { pri:1.73, tier:'Moderate', rank:476, dwellH:102, dwellSrc:'lpi_formula_fallback', jwc:true, asOf:'2026-09-18', note:'Ukraine. Active war zone. PRI record: Odesa (1 km).' },
  'Novorossiysk': { pri:1.48, tier:'Moderate', rank:833, dwellH:60, dwellSrc:'port_level_curated', jwc:true, asOf:'2026-09-18', note:'Russia, Black Sea. Sanctions exposure.' },
  'Salalah': { pri:1.06, tier:'Moderate', rank:2932, dwellH:78, dwellSrc:'lpi_formula_fallback', jwc:true, asOf:'2026-09-18', note:'Oman. Gulf of Aden adjacency. PRI record: Mina Raysut (3 km).' },
  'Yanbu': { pri:1.25, tier:'Moderate', rank:1655, dwellH:74, dwellSrc:'lpi_formula_fallback', jwc:false, asOf:'2026-10-05', note:'Red Sea export outlet for the East-West pipeline. Houthi blockade of Bab el-Mandeb declared 20 July 2026; war risk reported at about 3% of vessel value. Current JWC listing not checked: confirm before relying on this flag.' },
  'Ulsan': { pri:1.00, tier:'Moderate', rank:3174, dwellH:17, dwellSrc:'unctad_2021_country_median', jwc:false, asOf:'2026-10-05', note:'South Korea. Discharge port in the Yanbu analysis.' },
  'Ain Sukhna': { pri:0.97, tier:'Moderate', rank:3306, dwellH:86, dwellSrc:'lpi_formula_fallback', jwc:false, asOf:'2026-10-05', note:'Red Sea end of the SUMED pipeline. PRI record: Ain Sukhna Terminal (2 km).' },
  'Sidi Kerir': { pri:1.44, tier:'Moderate', rank:943, dwellH:86, dwellSrc:'lpi_formula_fallback', jwc:false, asOf:'2026-10-05', note:'Mediterranean end of the SUMED pipeline. PRI record: Sidi Kerir (Kurayr) (5 km).' },
};

window.NARROWS_CORRIDORS = {
  PASSAGES, CORRIDORS, REAL_ROUTES, TERMINAL_ENDPOINTS,
  RATE_KEY, CARGO_DETAIL, TERMINAL_DECLINE_COST,
  CLASS_SPEED_KN, CII_SPEED_FACTOR, PORT_RISK,
};

})();
