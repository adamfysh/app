/**
 * NARROWS-SIGNALS.js
 * Cross-product signal data module for the Narrows analytics suite.
 * Feeds CAPE, CDM, and PRI.
 *
 * Version:  1.1, September 2026
 * Author:   Fysh, fysh@narrows.io
 *
 * Update protocol:       CAPE-METHODOLOGY.md Section 4.5
 * Threshold framework:   CAPE-METHODOLOGY.md Section 4.4
 *
 * RULES:
 * - Never update this file without human review and threshold level assignment.
 * - Every value must have a source and a last_reviewed date.
 * - No value may be marked T1 without documented validation against an independent source.
 * - The compound alert state must be re-evaluated after every L3 signal change.
 *
 * 2026-09-09 review: this update was authorized directly by Fysh ("fix the signals
 * file too") after the file was found ~3 months past its next_review_due. Every
 * changed value below is sourced to a dated news report or a NOAA/CPC product
 * (cited inline). Prediction-market blend_p / corridor_disruption_p numbers were
 * NOT independently re-pulled from Polymarket/Metaculus this cycle -- no live
 * market API was available -- so those fields are flagged repull_needed: true
 * and should be treated as stale until a fresh pull happens. Everything else
 * (JWC/ACLED qualitative state, ENSO, hurricane outlook, Panama transit figures)
 * reflects real, dated, sourced events as of 2026-09-09. Recommend a human
 * sanity-check of the L4 upgrades below before relying on them in a live pitch.
 */

'use strict';

// =============================================================================
// THRESHOLD LEVELS
// =============================================================================

const SIGNAL_LEVELS = {
  L1: { code: 'L1', label: 'Normal',          colour: '#3fb950', action: 'Log only. No product update required.'                                              },
  L2: { code: 'L2', label: 'Notable',         colour: '#f0a500', action: 'Flag for next weekly review. Product update not immediately required.'               },
  L3: { code: 'L3', label: 'Actionable',      colour: '#e08020', action: 'Update all products before next use. Signal monitor change flag must be visible.'    },
  L4: { code: 'L4', label: 'Compound Alert',  colour: '#f85149', action: 'Formal signal review. Narrative note required in all product outputs for affected corridors.' }
};

// =============================================================================
// ACLED CORRIDOR TEMPERATURE BANDS
// =============================================================================
// Band thresholds are measured in standard deviations above the 12-month
// rolling average incident count for the corridor bounding box.
//
// Normal:   below 1.0 SD
// Elevated: 1.0 to 2.0 SD
// High:     2.0 to 3.0 SD
// Critical: above 3.0 SD
//
// Uplifts below represent the additional VaR modifier when ACLED temperature
// is the primary (or sole) elevated signal. When JWC is also active, the JWC
// uplift is applied instead of the ACLED uplift to avoid double-counting.
// The larger of the two is used; they are not added.

const ACLED_BANDS = {
  NORMAL:   { label: 'Normal',   min_sd: 0.0, max_sd: 1.0, uplift: 0.00 },
  ELEVATED: { label: 'Elevated', min_sd: 1.0, max_sd: 2.0, uplift: 0.10 },
  HIGH:     { label: 'High',     min_sd: 2.0, max_sd: 3.0, uplift: 0.20 },
  CRITICAL: { label: 'Critical', min_sd: 3.0, max_sd: Infinity, uplift: 0.30 }
};

// =============================================================================
// SEASONAL MODIFIERS
// =============================================================================
// Structure: one entry per corridor. For corridors with monthly variation,
// a 12-element array indexed 0 (Jan) to 11 (Dec).
// Each element: { uplift, source, tier }
// For Panama hurricane season, uplift depends on NOAA intensity forecast
// (resolved at runtime via PANAMA_HURRICANE_SEASON.intensity).

const PANAMA_HURRICANE_SEASON = {
  intensity: 'below_average',
  // 'below_average' | 'normal' | 'above_average'
  // CORRECTED 2026-09-09: NOAA's May outlook (above_average) was superseded by
  // NOAA's own August update. NOAA maintained a below-normal call: 7-13 named
  // storms, 2-6 hurricanes, 0-2 major hurricanes, 75% chance of a below-normal
  // season -- attributed explicitly to the developing/strengthening El Nino
  // suppressing Atlantic activity (see ENSO_STATE; forecaster Matt Rosencrans:
  // "When El Nino emerges, it usually becomes the dominant factor in total
  // hurricane season activity"). Source: NOAA, "NOAA Maintains Prediction for
  // Below-Normal Atlantic Hurricane Season," Aug 7 2026,
  // https://www.noaa.gov/news-release/noaa-maintains-prediction-for-below-normal-atlantic-hurricane-season
  source: 'NOAA Atlantic hurricane season outlook, updated Aug 7 2026 (below-normal, driven by El Nino)',
  last_reviewed: '2026-09-09',
  uplift_below_average: 0.10,
  uplift_normal:        0.15,
  uplift_above_average: 0.30
};

const SEASONAL_TABLE = {

  hormuz: {
    // No documented seasonal pattern. Geopolitical risk dominates.
    pattern: 'flat',
    monthly: Array(12).fill({ uplift: 0.00, source: 'No documented seasonal pattern for Hormuz', tier: 'T1' })
  },

  bab_el_mandeb: {
    // Indian Ocean SW monsoon (Jun to Sep): +0.10
    // Indian Ocean NE monsoon (Nov to Jan): +0.05 (reduced)
    pattern: 'monthly',
    monthly: [
      { month: 0,  label: 'Jan', uplift: 0.05, source: 'IMD seasonal forecast, NE monsoon', tier: 'T2' },
      { month: 1,  label: 'Feb', uplift: 0.00, source: 'Inter-monsoon period',               tier: 'T2' },
      { month: 2,  label: 'Mar', uplift: 0.00, source: 'Inter-monsoon period',               tier: 'T2' },
      { month: 3,  label: 'Apr', uplift: 0.00, source: 'Inter-monsoon period',               tier: 'T2' },
      { month: 4,  label: 'May', uplift: 0.00, source: 'Pre-monsoon period',                 tier: 'T2' },
      { month: 5,  label: 'Jun', uplift: 0.10, source: 'IMD SW monsoon onset',               tier: 'T2' },
      { month: 6,  label: 'Jul', uplift: 0.10, source: 'IMD SW monsoon peak',                tier: 'T2' },
      { month: 7,  label: 'Aug', uplift: 0.10, source: 'IMD SW monsoon peak',                tier: 'T2' },
      { month: 8,  label: 'Sep', uplift: 0.10, source: 'IMD SW monsoon withdrawal',          tier: 'T2' },
      { month: 9,  label: 'Oct', uplift: 0.00, source: 'Post-monsoon transition',            tier: 'T2' },
      { month: 10, label: 'Nov', uplift: 0.05, source: 'IMD NE monsoon onset',               tier: 'T2' },
      { month: 11, label: 'Dec', uplift: 0.05, source: 'IMD NE monsoon, reduced',            tier: 'T2' }
    ]
  },

  malacca: {
    // Western Pacific typhoon season (Jun to Nov): +0.12
    pattern: 'monthly',
    monthly: [
      { month: 0,  label: 'Jan', uplift: 0.00, source: 'Off-season',                tier: 'T1' },
      { month: 1,  label: 'Feb', uplift: 0.00, source: 'Off-season',                tier: 'T1' },
      { month: 2,  label: 'Mar', uplift: 0.00, source: 'Off-season',                tier: 'T1' },
      { month: 3,  label: 'Apr', uplift: 0.00, source: 'Off-season',                tier: 'T1' },
      { month: 4,  label: 'May', uplift: 0.00, source: 'Pre-season',                tier: 'T1' },
      { month: 5,  label: 'Jun', uplift: 0.12, source: 'JMA typhoon season onset',  tier: 'T1' },
      { month: 6,  label: 'Jul', uplift: 0.12, source: 'JMA typhoon season active', tier: 'T1' },
      { month: 7,  label: 'Aug', uplift: 0.12, source: 'JMA typhoon season peak',   tier: 'T1' },
      { month: 8,  label: 'Sep', uplift: 0.12, source: 'JMA typhoon season peak',   tier: 'T1' },
      { month: 9,  label: 'Oct', uplift: 0.12, source: 'JMA typhoon season active', tier: 'T1' },
      { month: 10, label: 'Nov', uplift: 0.12, source: 'JMA typhoon season end',    tier: 'T1' },
      { month: 11, label: 'Dec', uplift: 0.00, source: 'Off-season',                tier: 'T1' }
    ]
  },

  panama: {
    // Atlantic hurricane season (Jun to Nov): +0.15 normal, +0.30 above-average
    // ENSO modifier is carried in EVENT signals, not here (it is not calendrical)
    pattern: 'monthly_intensity',
    monthly: [
      { month: 0,  label: 'Jan', uplift_flat: 0.00 },
      { month: 1,  label: 'Feb', uplift_flat: 0.00 },
      { month: 2,  label: 'Mar', uplift_flat: 0.00 },
      { month: 3,  label: 'Apr', uplift_flat: 0.00 },
      { month: 4,  label: 'May', uplift_flat: 0.00 },
      { month: 5,  label: 'Jun', hurricane_season: true },
      { month: 6,  label: 'Jul', hurricane_season: true },
      { month: 7,  label: 'Aug', hurricane_season: true },
      { month: 8,  label: 'Sep', hurricane_season: true },
      { month: 9,  label: 'Oct', hurricane_season: true },
      { month: 10, label: 'Nov', hurricane_season: true },
      { month: 11, label: 'Dec', uplift_flat: 0.00 }
    ],
    source: 'NOAA Atlantic hurricane season climatology',
    tier: 'T1'
  },

  bosphorus: {
    // Fog season (Dec to Feb peak). Year-round low base.
    pattern: 'monthly',
    monthly: [
      { month: 0,  label: 'Jan', uplift: 0.04, source: 'Turkish Coast Guard historical fog data', tier: 'T3' },
      { month: 1,  label: 'Feb', uplift: 0.04, source: 'Turkish Coast Guard historical fog data', tier: 'T3' },
      { month: 2,  label: 'Mar', uplift: 0.01, source: 'Post-peak fog incidence',                 tier: 'T3' },
      { month: 3,  label: 'Apr', uplift: 0.01, source: 'Low seasonal risk',                       tier: 'T3' },
      { month: 4,  label: 'May', uplift: 0.01, source: 'Low seasonal risk',                       tier: 'T3' },
      { month: 5,  label: 'Jun', uplift: 0.01, source: 'Low seasonal risk',                       tier: 'T3' },
      { month: 6,  label: 'Jul', uplift: 0.01, source: 'Low seasonal risk',                       tier: 'T3' },
      { month: 7,  label: 'Aug', uplift: 0.01, source: 'Low seasonal risk',                       tier: 'T3' },
      { month: 8,  label: 'Sep', uplift: 0.01, source: 'Low seasonal risk',                       tier: 'T3' },
      { month: 9,  label: 'Oct', uplift: 0.02, source: 'Autumn fog onset',                        tier: 'T3' },
      { month: 10, label: 'Nov', uplift: 0.03, source: 'Fog season building',                     tier: 'T3' },
      { month: 11, label: 'Dec', uplift: 0.04, source: 'Turkish Coast Guard historical fog data', tier: 'T3' }
    ]
  },

  danish_straits: {
    // Baltic ice season (Jan to Apr)
    pattern: 'monthly',
    monthly: [
      { month: 0,  label: 'Jan', uplift: 0.08, source: 'HELCOM ice service Baltic',              tier: 'T2' },
      { month: 1,  label: 'Feb', uplift: 0.08, source: 'HELCOM ice service Baltic',              tier: 'T2' },
      { month: 2,  label: 'Mar', uplift: 0.08, source: 'HELCOM ice service Baltic',              tier: 'T2' },
      { month: 3,  label: 'Apr', uplift: 0.04, source: 'HELCOM ice service Baltic, late-season', tier: 'T2' },
      { month: 4,  label: 'May', uplift: 0.00, source: 'Ice-free period',                        tier: 'T2' },
      { month: 5,  label: 'Jun', uplift: 0.00, source: 'Ice-free period',                        tier: 'T2' },
      { month: 6,  label: 'Jul', uplift: 0.00, source: 'Ice-free period',                        tier: 'T2' },
      { month: 7,  label: 'Aug', uplift: 0.00, source: 'Ice-free period',                        tier: 'T2' },
      { month: 8,  label: 'Sep', uplift: 0.00, source: 'Ice-free period',                        tier: 'T2' },
      { month: 9,  label: 'Oct', uplift: 0.00, source: 'Pre-freeze period',                      tier: 'T2' },
      { month: 10, label: 'Nov', uplift: 0.00, source: 'Freeze onset in severe winters only',    tier: 'T2' },
      { month: 11, label: 'Dec', uplift: 0.04, source: 'HELCOM ice service Baltic, early season',tier: 'T2' }
    ]
  }

};

// =============================================================================
// ENSO STATE
// =============================================================================
// Updated from NOAA CPC ENSO outlook (published monthly; check weekly).
// Only affects Panama corridor modifier.

const ENSO_STATE = {
  // Advisory states (NOAA language):
  // 'neutral' | 'la_nina_watch' | 'la_nina_advisory' | 'la_nina_warning'
  // | 'el_nino_watch' | 'el_nino_advisory' | 'el_nino_warning' | 'el_nino_developing'
  // UPGRADED 2026-09-09: NOAA CPC's Aug 13 2026 ENSO diagnostic discussion states
  // El Nino is "strengthening, with a greater than 90% chance of a very strong
  // event during the Northern Hemisphere fall and winter 2026-27," and a 69%
  // probability of historic strength (>+2.5C) for OND 2026. That is materially
  // stronger than the May "moderate-to-strong, 75%" framing this file previously
  // carried -- moved from developing to warning-tier.
  state: 'el_nino_warning',

  noaa_probability_moderate_strong: 0.90,  // >90% probability of a very strong event by NDJ 2026-27 (was 75% in May)
  noaa_probability_historic_strength_ond: 0.69,  // new field: P(>+2.5C) for OND 2026 specifically
  noaa_outlook_month: '2026-08',
  noaa_source: 'NOAA CPC ENSO Diagnostic Discussion, issued Aug 13 2026. https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml',

  // VaR uplifts applied to Panama corridor event_uplift
  uplift_el_nino_moderate: 0.35,
  uplift_el_nino_strong:   0.55,
  uplift_la_nina:         -0.10,  // Reduced drought risk; negative uplift is a credit

  // Current uplift applied
  current_uplift: 0.55,  // UPGRADED from 0.35: strong-event threshold now confirmed by NOAA, not just moderate
  current_uplift_tier: 'T2',

  threshold_level: 'L4',  // UPGRADED from L3: this has stopped being a forecast and started being an observed,
                           // materialized restriction -- see CORRIDOR_SIGNALS.panama for the actual Sept 2026
                           // transit-cut figures. Real-world impact, not just an advisory reclassification.
  last_reviewed: '2026-09-09',

  notes: 'NOAA CPC 2026-08-13 outlook: >90% probability of a very strong El Nino event by NDJ 2026-27, with 69% probability of historic strength (>+2.5C) for OND 2026 specifically -- a sharp upgrade from the May outlook this file was built on. The 2023-24 El Nino reduced Panama Canal daily transits from 36 to 18 over a 90-day restriction period; the 2026-27 event is tracking toward being stronger than that one. This is no longer a purely forward-looking signal: the Panama Canal Authority has already begun cutting daily transits in September 2026 (36 -> 34 on Sept 3, -> 32 from Sept 15), attributed to watershed rainfall running below expectations despite the rainy season -- consistent with El Nino-driven drought. Source: Rio Times, "Panama Canal Transits Cut to 34 a Day as Drought Tightens Shipping Again," Aug 31 2026. Threshold upgraded from L3 to L4 on that basis.'
};

// =============================================================================
// PREDICTION MARKET SIGNALS
// =============================================================================
// Updated weekly (Monday). See CAPE-METHODOLOGY.md Section 10.
// Blend method: simple average (Polymarket + Metaculus).
// Upgrade to Brier-score-weighted when sufficient history is available.
//
// corridor_disruption_p = blend_p x conditional_p_disruption
// conditional_p_disruption is Narrows analytical judgment, documented per Section 10.3.

const PREDICTION_MARKETS = {
  last_pull_date: '2026-05-19',
  // NOT independently re-pulled 2026-09-09: no live Polymarket/Metaculus API was
  // available during this review. blend_p / corridor_disruption_p below are the
  // stale May pull unless a signal-specific note says otherwise. Per-signal
  // qualitative reviewer notes ARE current as of 2026-09-09 and sourced to dated
  // news reporting -- use those for the narrative, not the blend_p numbers, until
  // a fresh market pull happens.
  repull_needed: true,
  repull_flagged_on: '2026-09-09',
  blend_method: 'simple_average',

  signals: {

    houthi_sustained_escalation: {
      label: 'Houthi Red Sea campaign sustained through Q3 2026',
      corridor: 'bab_el_mandeb',
      conditional_p_disruption: 0.85,
      conditional_source: 'CAPE-METHODOLOGY.md Section 10.3: Houthi sustained escalation conditional',
      polymarket_p: 0.82,
      metaculus_p: 0.80,
      blend_p: 0.81,
      corridor_disruption_p: 0.69,
      delta_7d: -0.02,
      delta_level: 'L1',
      threshold_level: 'L3',
      repull_needed: true,
      last_reviewed: '2026-09-09',
      note: 'blend_p not re-pulled, but directionally confirmed: Houthis claimed a strike on a Saudi tanker Jul 23 2026 and killed several seafarers in a missile strike on the cargo ship Tihamah off Yemen Aug 12 2026 (IMO Secretary-General called it "an indefensible attack on international shipping"). The campaign has sustained through Q3 2026 as this market question posited. Source: UN News, Aug 2026, https://news.un.org/en/story/2026/08/1168121'
    },

    iran_hormuz_escalation: {
      label: 'Iran direct military action restricting or threatening Hormuz transit in 2026',
      corridor: 'hormuz',
      conditional_p_disruption: 0.80,
      conditional_source: 'CAPE-METHODOLOGY.md Section 10.3: Hormuz closure as primary Iranian deterrence instrument',
      polymarket_p: 0.16,
      metaculus_p: 0.20,
      blend_p: 0.18,
      corridor_disruption_p: 0.14,
      delta_7d: -0.04,
      delta_level: 'L2',
      threshold_level: 'L2',
      repull_needed: true,
      last_reviewed: '2026-09-09',
      superseded_by_events: true,
      notes: 'STALE AND OVERTAKEN. This entry described a de-escalating pre-conflict probability as of May 2026. Events since then have moved past the question it was asking: a US/Israel-Iran war began Feb 28 2026; the Strait was reported effectively closed with commercial transits down as much as 95% from the pre-war daily average; the US reinstated a naval blockade of Iranian ports Jul 15 2026; the US Navy was still running active mine-clearing operations as of Aug 25 2026 (100+ suspected mines dealt with); and a ceasefire agreed in April/June 2026 has been repeatedly violated on both sides -- Trump declared it "over" in July 2026 per some reporting, while other sources describe it as a fragile truce holding "in name only." This is no longer a probability-of-escalation question; it already happened and remains live and unresolved. Do not use the 0.14 corridor_disruption_p figure above -- it predates the war. See CORRIDOR_SIGNALS.hormuz.reviewer_note for the sourced timeline. A fresh market pull (asking about re-escalation from the current fragile-ceasefire baseline, not the pre-war baseline) is needed before this signal is usable again. Sources: Wikipedia "2026 Strait of Hormuz crisis" and "2026 Iran war ceasefire"; Britannica "2026 Iran war".'
    },

    taiwan_strait_crisis: {
      label: 'Significant military confrontation in Taiwan Strait within 2 years',
      corridor: 'malacca',
      conditional_p_disruption: 0.50,
      conditional_source: 'CAPE-METHODOLOGY.md Section 10.3: Taiwan Strait, wide range 0.45 to 0.60',
      polymarket_p: 0.14,
      metaculus_p: 0.17,
      blend_p: 0.155,
      corridor_disruption_p: 0.08,
      delta_7d: 0.00,
      delta_level: 'L1',
      threshold_level: 'L1',
      repull_needed: true,
      last_reviewed: '2026-09-09',
      note: 'blend_p not re-pulled, but the underlying situation has moved since May: reporting describes a "Fourth Taiwan Strait Crisis" with China Coast Guard conducting what analysts call a "quasi-quarantine" -- the heaviest deployment of PRC vessels near Taiwan on record, some within 32nm of Taiwan\'s eastern coast, through at least June 2026. No shooting war and no formal blockade, but this is gray-zone pressure, not L1-quiet. No ACLED/JWC-style quantified uplift exists for Malacca to capture this, so it is carried here as a qualitative flag rather than a fabricated number. Recommend a CAPE-METHODOLOGY.md Section 10 discussion on whether Taiwan Strait gray-zone activity needs its own signal category. Source: Wikipedia "Fourth Taiwan Strait Crisis".'
    },

    panama_access_dispute: {
      label: 'US-Panama sovereignty dispute causing material canal access restriction in 2026',
      corridor: 'panama',
      conditional_p_disruption: 0.30,
      conditional_source: 'CAPE-METHODOLOGY.md Section 10.3: Access restriction less likely than political friction',
      polymarket_p: 0.08,
      metaculus_p: 0.12,
      blend_p: 0.10,
      corridor_disruption_p: 0.03,
      delta_7d: 0.00,
      delta_level: 'L1',
      threshold_level: 'L1',
      repull_needed: true,
      last_reviewed: '2026-09-09',
      notes: 'Political noise is elevated but the access restriction probability is materially lower. The ENSO signal is a stronger Panama risk driver than the political signal at current probabilities. No sourced update found this review cycle for the political dispute specifically -- carried forward unchanged rather than guessed at. Flag for a dedicated pull next cycle.'
    },

    panama_el_nino_2026_27: {
      label: 'Moderate-to-strong El Nino develops by NDJ 2026-27 (NOAA-driven)',
      corridor: 'panama',
      conditional_p_disruption: 0.70,
      conditional_source: 'CAPE-METHODOLOGY.md Section 10.3: El Nino, strong historical relationship with canal restriction',
      noaa_p: 0.90,  // UPDATED 2026-09-09: NOAA CPC Aug 13 2026 discussion, >90% probability of a very strong event by NDJ 2026-27 (was 0.75 in May). This is NOAA data used directly, not a prediction-market pull, so it IS refreshed here.
      blend_p: 0.90,
      corridor_disruption_p: 0.63,
      delta_7d: 0.15,
      delta_level: 'L3',
      threshold_level: 'L4',
      last_reviewed: '2026-09-09',
      notes: 'UPGRADED 2026-09-09. Strongest forward risk signal across all corridors for 2026-27, and no longer purely forward-looking: real transit restrictions are already in effect (see CORRIDOR_SIGNALS.panama and ENSO_STATE.notes for the Sept 2026 daily-transit-cut figures). See ENSO_STATE for full detail.'
    }

  }
};

// =============================================================================
// CORRIDOR EVENT SIGNALS
// =============================================================================
// Current live signal state for each corridor.
// Combines: JWC designation, ACLED temperature, ENSO (Panama only),
//           derived event_uplift, seasonal_uplift, and total_uplift.
//
// total_uplift = seasonal_uplift(current month) + event_uplift
// This is the modifier that enters the CAPE VaR formula:
//   Modified_VaR = base_VaR x (1 + seasonal_uplift + event_uplift)

const CORRIDOR_SIGNALS = {

  hormuz: {
    label: 'Strait of Hormuz',
    corridor_type: 'terminal_strait',
    // Note: CII routing optionality modifier does NOT apply to terminal straits.
    // All in-window vessels are captive regardless of CII rating.

    jwc: {
      active: true,
      listed_area: 'Persian Gulf and Strait of Hormuz, including Gulf of Oman approach zones',
      bulletin_ref: 'LMA market bulletin, Persian Gulf designation. Active as of May 2026. Bulletin TEXT not independently re-verified 2026-09-09 (no LMA feed access) -- uplift carried forward unchanged; flagged for a fresh pull given the ACLED override below now dominates anyway.',
      uplift: 0.20,
      tier: 'T2',
      last_reviewed: '2026-05-26'
    },

    acled: {
      // OVERRIDDEN 2026-09-09: reclassified CRITICAL by documented real-world events, not a fresh
      // ACLED API pull (none was available this review). A formal US/Israel-Iran war began 2026-02-28;
      // as of Aug 2026 reporting the Strait was described as near-totally shut to commercial transit
      // (as few as 7 vessels/day vs. the pre-war average, a ~95% reduction), the US reinstated a naval
      // blockade of Iranian ports 2026-07-15, 600+ tankers were reported trapped in the Persian Gulf,
      // and the US Navy was still conducting active mine-clearing operations as of 2026-08-25 (100+
      // suspected mines dealt with by then). That is well beyond the SD-band methodology's normal
      // range and is carried here as an analytical policy override, tier T3, pending a real ACLED pull.
      temperature: 'CRITICAL',
      incidents_l90d: null,      // not independently counted this review -- see qualitative override note above
      baseline_l12m_avg: 4.5,    // T3, carried from May pull
      baseline_sd: 2.1,
      sigma_above: null,         // SD-band framing does not meaningfully apply during a formal armed conflict
      uplift: 0.30,
      // ACLED CRITICAL band (0.30) now exceeds JWC (0.20) -- ACLED applied per the "larger of the two" rule.
      uplift_note: 'ACLED CRITICAL override (0.30) now exceeds JWC uplift (0.20). ACLED applied, reversing the May state where JWC was larger.',
      bounding_box: '22N to 30N, 48E to 60E',
      last_updated: '2026-09-09',
      tier: 'T3',
      sources: [
        'Wikipedia, "2026 Strait of Hormuz crisis" (updated through 2026-08-25: US Navy mine-clearing ops, naval blockade reinstated 2026-07-15, ~600 tankers trapped)',
        'Wikipedia, "2026 Iran war ceasefire" (fragile truce, repeated violations both sides)',
        'Britannica, "2026 Iran war" (conflict initiated 2026-02-28 by US and Israel; ceasefire attempts through June 2026)'
      ]
    },

    event_uplift: 0.30,   // ACLED CRITICAL override now applied (see acled.uplift_note above)
    seasonal_uplift: 0.00, // No seasonal pattern
    total_uplift: 0.30,

    prediction_p: 0.14,   // STALE -- see PREDICTION_MARKETS.signals.iran_hormuz_escalation.superseded_by_events
    prediction_last_reviewed: '2026-05-19',

    threshold_level: 'L4',
    threshold_drivers: [
      'jwc_active',
      'acled_critical',
      'active_armed_conflict_confirmed',
      'multi_corridor_compound_with_bab_el_mandeb'
    ],

    last_reviewed: '2026-09-09',
    reviewer: 'Fysh (update authorized 2026-09-09; researched/drafted by Claude against the sources cited above -- recommend a human sanity-check of the CRITICAL override before the NATO call)',
    reviewer_note: 'L4 compound alert active jointly with Bab-el-Mandeb, and far more firmly grounded than the May review: this corridor went from "elevated tension, ceasefire talks reducing risk" to an actual, ongoing war. A US/Israel-Iran conflict began 2026-02-28; a ceasefire agreed in April 2026 (with a further extension signed 2026-06-17) has been violated repeatedly by both sides and one account has Trump declaring it "over" in 2026-07; the Strait has been reported at or near full closure to commercial shipping at points this year (as low as ~5% of the pre-war daily transit rate); a US naval blockade of Iranian ports was reinstated 2026-07-15; and active mine-clearing was still ongoing as of 2026-08-25. This does not change the structural CDM/CASCADE finding -- Hormuz still has no sea diversion, so cargo does not reroute, it simply stops -- but it does mean that finding is no longer a hypothetical "if this closes" scenario. It is describing something that has actually happened, repeatedly, in 2026. That is a stronger, more concrete proof point for the pitch, not a weaker one, but it should be framed carefully given the real, ongoing human and military stakes involved. Compound state must be displayed in all CAPE outputs covering either corridor.'
  },

  bab_el_mandeb: {
    label: 'Bab-el-Mandeb / Red Sea',
    corridor_type: 'through_route',

    jwc: {
      active: true,
      listed_area: 'Red Sea and Gulf of Aden, including Bab-el-Mandeb approaches. Boundary has been revised multiple times since January 2024.',
      bulletin_ref: 'LMA market bulletin series, Red Sea designation from January 2024. Multiple revisions through 2024 to 2026. Bulletin text not independently re-verified 2026-09-09 (no LMA feed access) -- uplift carried forward unchanged.',
      uplift: 0.20,
      tier: 'T2',
      last_reviewed: '2026-05-26'
    },

    acled: {
      // UPGRADED 2026-09-09 from ELEVATED to HIGH by documented events, not a fresh ACLED pull: Houthis
      // claimed a strike on a Saudi tanker 2026-07-23 and killed several seafarers in a missile strike
      // on the cargo ship Tihamah off Yemen's coast 2026-08-12 (IMO Secretary-General: "an indefensible
      // attack on international shipping"). Carried as an analytical policy override, tier T3.
      temperature: 'HIGH',
      incidents_l90d: null,      // not independently re-counted this review -- see override note above
      baseline_l12m_avg: 8.0,    // T3, carried from May pull
      baseline_sd: 3.5,
      sigma_above: null,         // not recomputed this review; qualitative override applied instead
      uplift: 0.20,
      uplift_note: 'ACLED HIGH band (0.20) now ties JWC (0.20); either basis yields the same event_uplift.',
      bounding_box: '10N to 22N, 40E to 52E',
      last_updated: '2026-09-09',
      tier: 'T3',
      sources: [
        'UN News, Aug 2026, https://news.un.org/en/story/2026/08/1168121 (Tihamah attack, 2026-08-12)',
        'Reported Houthi claim of a strike on a Saudi tanker, 2026-07-23'
      ]
    },

    event_uplift: 0.20,   // JWC and ACLED HIGH now agree at 0.20
    seasonal_uplift: 0.10, // CORRECTED 2026-09-09: the May file left this at 0.00 with a June-1 "upcoming"
                            // trigger that has since passed. It is now September -- per SEASONAL_TABLE.bab_el_mandeb,
                            // month 8 (Sep) is SW monsoon withdrawal, uplift 0.10. This was simply stale, not re-researched.
    total_uplift: 0.30,

    upcoming_change: {
      date: '2026-10-01',
      description: 'Post-monsoon transition. Per SEASONAL_TABLE, seasonal uplift drops to 0.00 in October, reducing total modifier to 0.20 (assuming event_uplift is unchanged by then).',
      new_seasonal_uplift: 0.00,
      new_total_uplift: 0.20
    },

    prediction_p: 0.69,   // STALE, not re-pulled -- but directionally corroborated, see PREDICTION_MARKETS.signals.houthi_sustained_escalation
    prediction_last_reviewed: '2026-05-19',

    threshold_level: 'L4',
    threshold_drivers: [
      'jwc_active',
      'acled_high',
      'multi_corridor_compound_with_hormuz'
    ],

    last_reviewed: '2026-09-09',
    reviewer: 'Fysh (update authorized 2026-09-09; researched/drafted by Claude against the sources cited above)',
    reviewer_note: 'L4 compound alert active jointly with Hormuz, and if anything more firmly grounded than the May review gave it credit for: the Houthi campaign has not just "continued at reduced frequency," it has produced confirmed fatal attacks as recently as 2026-08-12 (Tihamah) and a claimed tanker strike 2026-07-23, against the backdrop of the broader Iran-Israel-US war that began 2026-02-28. The May reviewer_note about MV Atlantic Bridge rerouting Cape of Good Hope was not re-verified this cycle (illustrative fleet notes were separately audited and found correct in the Aug 2026 harmonization pass) and is carried forward unchanged. Seasonal uplift corrected from a stale 0.00 to the current-month 0.10 (SW monsoon withdrawal); see upcoming_change for the October step-down.'
  },

  malacca: {
    label: 'Strait of Malacca',
    corridor_type: 'through_route',

    jwc: {
      active: false,
      uplift: 0.00,
      last_reviewed: '2026-05-26'
    },

    acled: {
      temperature: 'NORMAL',
      incidents_l90d: 1,        // not independently re-pulled 2026-09-09; carried from May
      baseline_l12m_avg: 1.2,
      baseline_sd: 0.8,
      sigma_above: -0.25,   // Below average: genuinely quiet
      uplift: 0.00,
      bounding_box: '0N to 8N, 99E to 108E',
      last_updated: '2026-05-20',
      tier: 'T3'
    },

    event_uplift: 0.00,   // No ACLED/JWC-quantified event signal for Malacca itself. See reviewer_note
                           // and PREDICTION_MARKETS.signals.taiwan_strait_crisis for the qualitative
                           // Taiwan Strait gray-zone flag, which has no quantified uplift yet.
    seasonal_uplift: 0.12,  // CORRECTED 2026-09-09: the May file left this at 0.00 with a June-1 "upcoming"
                             // trigger that has since passed. It is now September, inside typhoon season
                             // (per SEASONAL_TABLE.malacca, month 8 = Sep, uplift 0.12). Stale value, not a new finding.
    total_uplift: 0.12,

    upcoming_change: {
      date: '2026-12-01',
      description: 'Typhoon season ends per SEASONAL_TABLE (Dec uplift 0.00).',
      new_seasonal_uplift: 0.00,
      new_total_uplift: 0.00
    },

    prediction_p: 0.08,   // STALE, not re-pulled -- see PREDICTION_MARKETS.signals.taiwan_strait_crisis
    prediction_last_reviewed: '2026-05-19',

    threshold_level: 'L2',
    threshold_drivers: ['taiwan_strait_gray_zone_escalation_qualitative'],

    last_reviewed: '2026-09-09',
    reviewer: 'Fysh (update authorized 2026-09-09; researched/drafted by Claude -- the L1->L2 move below is a judgment call worth a second look)',
    reviewer_note: 'UPGRADED from L1 to L2, not because Malacca itself has any new ACLED/JWC signal, but because the Taiwan Strait situation this corridor is a proxy for has moved: reporting through at least June 2026 describes a "Fourth Taiwan Strait Crisis" with China Coast Guard vessels conducting what analysts call a "quasi-quarantine" -- the heaviest PRC vessel deployment near Taiwan on record, some within 32nm of its eastern coast. No shooting war, no formal blockade, but this is a real qualitative step up from "no active signals," and there is currently no quantified uplift methodology for it. Recommend a CAPE-METHODOLOGY.md Section 10 discussion on whether Taiwan Strait gray-zone activity needs its own signal category before the next full review. Typhoon season uplift corrected from a stale 0.00 to the current-month 0.12.'
  },

  panama: {
    label: 'Panama Canal',
    corridor_type: 'through_route',

    jwc: {
      active: false,
      uplift: 0.00,
      last_reviewed: '2026-05-26'
    },

    acled: {
      temperature: 'NORMAL',
      incidents_l90d: 0,        // not independently re-pulled 2026-09-09; no conflict-incident driver here anyway -- this corridor's risk is drought, not unrest
      baseline_l12m_avg: 0.2,
      baseline_sd: 0.4,
      sigma_above: -0.5,
      uplift: 0.00,
      bounding_box: '5N to 12N, 76W to 84W',
      last_updated: '2026-05-20',
      tier: 'T3'
    },

    enso: {
      state: ENSO_STATE.state,
      uplift: ENSO_STATE.current_uplift,   // 0.55 (strong El Nino threshold, upgraded 2026-09-09 from 0.35 moderate)
      tier: ENSO_STATE.current_uplift_tier,
      noaa_probability: ENSO_STATE.noaa_probability_moderate_strong,
      source: ENSO_STATE.noaa_source,
      last_reviewed: ENSO_STATE.last_reviewed
    },

    hurricane_season: {
      active: true,           // CORRECTED 2026-09-09: season runs Jun-Nov: it is now September and this was
                                // stubbornly still 'false' -- simple staleness, not a new finding.
      intensity: PANAMA_HURRICANE_SEASON.intensity,   // 'below_average' -- see PANAMA_HURRICANE_SEASON for the NOAA correction
      current_uplift: PANAMA_HURRICANE_SEASON.uplift_below_average,  // 0.10, now the current-month contribution, not an "upcoming" one
      source: PANAMA_HURRICANE_SEASON.source,
      start_date: '2026-06-01'
    },

    // MATERIALIZED, not just forecast: the Panama Canal Authority has already begun cutting daily
    // transits in September 2026, citing watershed rainfall running below expectations despite the
    // rainy season -- consistent with El Nino-driven drought. This is a live, observable, dated event,
    // not a projection.
    observed_impact: {
      description: 'Panama Canal daily transit slots cut: 36 -> 34 on 2026-09-03, -> 32 from 2026-09-15. Neopanamax locks reduced from 10 to 9 daily slots; a draft-limit reduction for Neopanamax vessels also took effect 2026-09-02, preventing max cargo loads even within the remaining slots.',
      cause: 'Gatun Lake levels lower than anticipated; watershed rainfall below expectations despite the rainy season -- attributed to El Nino conditions.',
      source: 'Rio Times, "Panama Canal Transits Cut to 34 a Day as Drought Tightens Shipping Again," published 2026-08-31, https://www.riotimesonline.com/panama-canal-transit-cuts-september-2026/',
      last_reviewed: '2026-09-09'
    },

    event_uplift: 0.55,    // UPGRADED from 0.35: strong El Nino now confirmed by NOAA (see ENSO_STATE)
    seasonal_uplift: 0.10,  // UPGRADED from 0.00: hurricane season is now active and below-average intensity (see hurricane_season above)
    total_uplift: 0.65,

    upcoming_change: {
      date: '2026-11-30',
      description: 'Atlantic hurricane season ends per SEASONAL_TABLE; seasonal_uplift drops to 0.00, reducing total modifier to whatever ENSO event_uplift is at that point (currently 0.55). Separately, watch for a possible NOAA upgrade from "very strong" El Nino to a confirmed historic-strength (>+2.5C) event for OND 2026 -- that carries no separate uplift tier in this file yet and would need a methodology decision if it happens.',
      new_seasonal_uplift: 0.00,
      new_total_uplift: 0.55
    },

    prediction_p: 0.63,   // From panama_el_nino_2026_27 signal (NOAA-sourced, refreshed 2026-09-09); 0.03 from political signal (stale)
    prediction_last_reviewed: '2026-09-09',

    threshold_level: 'L4',
    threshold_drivers: [
      'enso_strong_confirmed_upgraded_from_moderate',
      'hurricane_season_active_below_average',
      'active_transit_restriction_confirmed_sept_2026'
    ],

    last_reviewed: '2026-09-09',
    reviewer: 'Fysh (update authorized 2026-09-09; researched/drafted by Claude against the sources cited above)',
    reviewer_note: 'UPGRADED from L3 to L4: this stopped being a forecast and became an observed, dated event between the May review and now. NOAA upgraded its ENSO call from "moderate-to-strong, 75% probability" to "very strong, >90% probability, with a 69% chance of historic strength (>+2.5C) for OND 2026" (CPC, 2026-08-13). NOAA separately corrected its own hurricane-season call from above-average to below-average, driven by that same El Nino suppressing Atlantic activity (2026-08-07 update). And, concretely: the Panama Canal Authority has already cut daily transits from 36 to 34 (2026-09-03) with a further cut to 32 scheduled for 2026-09-15, plus a Neopanamax draft-limit reduction from 2026-09-02 -- all sourced to reporting dated 2026-08-31. This is arguably the single most demo-relevant finding in this whole review: the cascade story CAPE tells about Panama (closure more than doubles diversion-route accumulation) is not hypothetical right now, it is describing a restriction that is actively tightening this week. Political disruption probability (US-Panama sovereignty dispute) remains materially lower and was not independently re-pulled this cycle -- carried forward at L1.'
  }

};

// =============================================================================
// COMPOUND ALERT STATE
// =============================================================================
// Evaluated holistically across all corridors after each signal review.
// Re-evaluate any time a corridor threshold level changes.

const COMPOUND_STATE = {
  level: 'L4',
  active: true,
  corridors: ['hormuz', 'bab_el_mandeb'],

  description: 'Hormuz and Bab-el-Mandeb are simultaneously carrying active JWC designations and, as of the 2026-09-09 review, ACLED-override temperatures of CRITICAL and HIGH respectively (see each corridor for sourcing). Both corridors are driven by overlapping Iran-Houthi geopolitical dynamics, which since the May review have escalated from elevated tension into an actual, ongoing US/Israel-Iran war (began 2026-02-28) with a repeatedly-violated ceasefire and sustained Houthi attacks on shipping (fatal strike as recently as 2026-08-12). This remains the highest-risk multi-corridor environment in the current analysis period, and is now grounded in observed events rather than tension indicators alone.',

  correlation_note: 'The two corridors are not independent. Iran directly controls Hormuz and materially supports Houthi operations in the Red Sea. An Iran-driven escalation event has meaningful probability of affecting both corridors simultaneously. Single-corridor analysis will understate aggregate portfolio exposure for vessels with exposure to either or both corridors. Confirmed by this review: Panama\'s L4 status (drought/ENSO-driven) is causally unrelated to this Hormuz/Bab-el-Mandeb pair and correctly remains outside this compound state -- consistent with the bilateral pair audit finding that Hormuz+Bab-el-Mandeb is the one genuinely-linked pair in the current corridor set.',

  cape_display_rule: 'When Hormuz or Bab-el-Mandeb are in scope (either selected individually or via All Corridors), CAPE must display the following note: "Compound corridor alert active. Hormuz and Bab-el-Mandeb signals are correlated. Multi-corridor accumulation exposure may exceed single-corridor analysis. Compound alert level: L4."',

  last_reviewed: '2026-09-09',
  reviewer: 'Fysh (update authorized 2026-09-09; researched/drafted by Claude)'
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Returns the seasonal uplift for a corridor in a given month.
 * @param {string} corridorId  - Key in SEASONAL_TABLE
 * @param {number} [month]     - 0-indexed month (0=Jan). Defaults to current month.
 * @returns {{ uplift: number, source: string, tier: string }}
 */
function getSeasonalUplift(corridorId, month) {
  const m = (month !== undefined) ? month : new Date().getMonth();
  const table = SEASONAL_TABLE[corridorId];
  if (!table) return { uplift: 0, source: 'No seasonal data for this corridor', tier: 'T3' };

  if (table.pattern === 'flat') {
    return table.monthly[0];
  }

  if (table.pattern === 'monthly') {
    const entry = table.monthly[m];
    return entry ? { uplift: entry.uplift, source: entry.source, tier: entry.tier }
                 : { uplift: 0, source: 'No data for this month', tier: 'T3' };
  }

  if (table.pattern === 'monthly_intensity') {
    const entry = table.monthly[m];
    if (!entry) return { uplift: 0, source: 'No data', tier: 'T3' };
    if (entry.uplift_flat !== undefined) return { uplift: entry.uplift_flat, source: 'Off-season', tier: 'T1' };
    if (entry.hurricane_season) {
      const intensity = PANAMA_HURRICANE_SEASON.intensity;
      const key = 'uplift_' + intensity;
      return {
        uplift: PANAMA_HURRICANE_SEASON[key],
        source: PANAMA_HURRICANE_SEASON.source + ' (' + intensity + ' intensity)',
        tier: 'T1'
      };
    }
  }

  return { uplift: 0, source: 'Unrecognised pattern', tier: 'T3' };
}

/**
 * Returns the combined modifier state for a corridor.
 * @param {string} corridorId
 * @returns {{ seasonal: number, event: number, total: number, level: string, last_reviewed: string }}
 */
function getCorridorModifiers(corridorId) {
  const sig = CORRIDOR_SIGNALS[corridorId];
  if (!sig) return { seasonal: 0, event: 0, total: 0, level: 'L1', last_reviewed: null };
  const seasonal = getSeasonalUplift(corridorId).uplift;
  const event    = sig.event_uplift;
  return {
    seasonal,
    event,
    total:        seasonal + event,
    level:        sig.threshold_level,
    last_reviewed: sig.last_reviewed
  };
}

/**
 * Returns the display colour and label for a threshold level.
 * @param {string} level  - 'L1' | 'L2' | 'L3' | 'L4'
 */
function getLevelDisplay(level) {
  return SIGNAL_LEVELS[level] || SIGNAL_LEVELS.L1;
}

/**
 * Returns a plain-language summary of upcoming modifier changes for a corridor.
 * @param {string} corridorId
 * @returns {string|null}
 */
function getUpcomingChange(corridorId) {
  const sig = CORRIDOR_SIGNALS[corridorId];
  if (!sig || !sig.upcoming_change) return null;
  return sig.upcoming_change.description + ' (' + sig.upcoming_change.date + ')';
}

// =============================================================================
// MODULE METADATA
// =============================================================================

const SIGNALS_METADATA = {
  version: '1.1',
  created: '2026-05-26',
  last_updated: '2026-09-09',
  next_review_due: '2026-09-11',  // day of the NATO call this update was made for; recommend weekly cadence after that given current volatility

  products: ['CAPE', 'CDM (planned)', 'PRI (planned)'],
  methodology_ref: 'CAPE-METHODOLOGY.md Sections 4.4 and 4.5',

  review_log: [
    {
      date: '2026-05-26',
      reviewer: 'Fysh',
      summary: 'Initial build. All four primary corridors populated with current real-world signal states. Compound L4 alert established for Hormuz and Bab-el-Mandeb. ENSO L3 for Panama. Malacca at L1. Seasonal modifier tables complete for all corridors including stubs for Bosphorus and Danish Straits.',
      signals_changed: ['all (initial build)']
    },
    {
      date: '2026-09-09',
      reviewer: 'Fysh (update authorized 2026-09-09 -- "let\'s fix the signals file too"; researched and drafted by Claude, sourced inline throughout, ~3.5 months after next_review_due lapsed)',
      summary: 'Full re-review against current, dated, sourced real-world events (not just re-dating). Hormuz: ACLED override to CRITICAL and event_uplift 0.20->0.30, reflecting that an actual US/Israel-Iran war (began 2026-02-28) with a repeatedly-violated ceasefire has superseded the May "declining tension" narrative -- iran_hormuz_escalation prediction-market entry marked superseded_by_events. Bab-el-Mandeb: ACLED upgraded ELEVATED->HIGH on a confirmed fatal attack (Tihamah, 2026-08-12) and a claimed tanker strike (2026-07-23); stale seasonal_uplift corrected 0.00->0.10 for the current month. Panama: ENSO upgraded moderate(0.35)->strong(0.55) per NOAA CPC 2026-08-13 (now >90% probability of a very strong event, 69% for historic strength OND); hurricane-season intensity CORRECTED above_average->below_average per NOAA\'s own 2026-08-07 update (El Nino suppresses Atlantic activity); threshold upgraded L3->L4 because this is no longer forecast-only -- the Panama Canal Authority has already cut daily transits 36->34 (2026-09-03) with 32 scheduled from 2026-09-15. Malacca upgraded L1->L2 on a qualitative "Fourth Taiwan Strait Crisis" gray-zone flag (no quantified methodology exists for it yet -- flagged as a methodology gap). All PREDICTION_MARKETS blend_p/corridor_disruption_p numbers are flagged repull_needed: true since no live Polymarket/Metaculus pull was available this cycle; only the NOAA-sourced panama_el_nino_2026_27 entry was refreshed with real numbers. Every changed field carries an inline source and a 2026-09-09 last_reviewed date per this file\'s own rules. Recommend a human sanity-check of the three L4-level judgment calls (Hormuz ACLED override, Panama threshold upgrade, Malacca L1->L2) before relying on this file live in front of NATO.',
      signals_changed: [
        'PANAMA_HURRICANE_SEASON.intensity',
        'ENSO_STATE (state, probabilities, current_uplift, threshold_level)',
        'PREDICTION_MARKETS.signals.houthi_sustained_escalation',
        'PREDICTION_MARKETS.signals.iran_hormuz_escalation',
        'PREDICTION_MARKETS.signals.taiwan_strait_crisis',
        'PREDICTION_MARKETS.signals.panama_access_dispute',
        'PREDICTION_MARKETS.signals.panama_el_nino_2026_27',
        'CORRIDOR_SIGNALS.hormuz',
        'CORRIDOR_SIGNALS.bab_el_mandeb',
        'CORRIDOR_SIGNALS.malacca',
        'CORRIDOR_SIGNALS.panama',
        'COMPOUND_STATE'
      ]
    }
  ]
};
