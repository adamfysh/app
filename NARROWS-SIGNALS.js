/**
 * NARROWS-SIGNALS.js
 * Cross-product signal data module for the Narrows analytics suite.
 * Feeds CAPE, CDM, and PRI.
 *
 * Version:  1.0, May 2026
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
  intensity: 'above_average',
  // 'below_average' | 'normal' | 'above_average'
  source: 'NOAA 2026 Atlantic hurricane season outlook, May 2026',
  last_reviewed: '2026-05-26',
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
  state: 'el_nino_developing',

  noaa_probability_moderate_strong: 0.75,  // 75% probability moderate-to-strong El Nino by NDJ 2026-27
  noaa_outlook_month: '2026-05',
  noaa_source: 'NOAA CPC ENSO outlook, May 2026. https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/',

  // VaR uplifts applied to Panama corridor event_uplift
  uplift_el_nino_moderate: 0.35,
  uplift_el_nino_strong:   0.55,
  uplift_la_nina:         -0.10,  // Reduced drought risk; negative uplift is a credit

  // Current uplift applied
  current_uplift: 0.35,  // Moderate El Nino threshold; upgrade to 0.55 if strong confirmed
  current_uplift_tier: 'T2',

  threshold_level: 'L3',  // NOAA advisory-level reclassification = L3
  last_reviewed: '2026-05-26',

  notes: 'NOAA 2026-05 outlook: 75% probability moderate-to-strong El Nino by NDJ 2026-27. The 2023-24 El Nino reduced Panama Canal daily transits from 36 to 18 over a 90-day restriction period. The 2026-27 season is the current dominant forward-looking risk signal for Panama-routed cargo. Uplift upgraded from 0.35 to 0.55 if NOAA confirms strong El Nino advisory.'
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
      threshold_level: 'L3'
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
      delta_level: 'L2',  // -4pp in 7 days: below L3 threshold of 5pp, but notable declining signal
      threshold_level: 'L2',
      notes: 'Declining from previous peak. US-Iran ceasefire talks and nuclear deal discussions are the driver. If talks collapse, expect rapid reversion toward L3. Monitor weekly.'
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
      threshold_level: 'L1'
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
      notes: 'Political noise is elevated but the access restriction probability is materially lower. The ENSO signal is a stronger Panama risk driver than the political signal at current probabilities.'
    },

    panama_el_nino_2026_27: {
      label: 'Moderate-to-strong El Nino develops by NDJ 2026-27 (NOAA-driven)',
      corridor: 'panama',
      conditional_p_disruption: 0.70,
      conditional_source: 'CAPE-METHODOLOGY.md Section 10.3: El Nino, strong historical relationship with canal restriction',
      noaa_p: 0.75,  // NOAA ENSO outlook used directly; not a prediction market question
      blend_p: 0.75,
      corridor_disruption_p: 0.53,
      delta_7d: 0.00,
      delta_level: 'L1',
      threshold_level: 'L3',
      notes: 'Strongest forward risk signal across all corridors for 2026-27. See ENSO_STATE for full detail.'
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
      bulletin_ref: 'LMA market bulletin, Persian Gulf designation. Active as of May 2026.',
      uplift: 0.20,
      tier: 'T2',
      last_reviewed: '2026-05-26'
    },

    acled: {
      temperature: 'ELEVATED',
      incidents_l90d: 8,         // T3: approximate, from manual ACLED data pull
      baseline_l12m_avg: 4.5,    // T3
      baseline_sd: 2.1,
      sigma_above: 1.7,          // (8 - 4.5) / 2.1 = approx 1.67 sigma: Elevated band
      uplift: 0.00,
      // ACLED uplift not applied: JWC uplift is the active event modifier and is larger.
      // The rule is: use the larger of JWC uplift or ACLED uplift, not both.
      uplift_note: 'JWC uplift (0.20) exceeds ACLED Elevated band uplift (0.10). JWC applied.',
      bounding_box: '22N to 30N, 48E to 60E',
      last_updated: '2026-05-20',
      tier: 'T3'
    },

    event_uplift: 0.20,   // JWC only (see acled.uplift_note)
    seasonal_uplift: 0.00, // No seasonal pattern
    total_uplift: 0.20,

    prediction_p: 0.14,   // From iran_hormuz_escalation signal
    prediction_last_reviewed: '2026-05-19',

    threshold_level: 'L4',
    threshold_drivers: [
      'jwc_active',
      'acled_elevated',
      'multi_corridor_compound_with_bab_el_mandeb'
    ],

    last_reviewed: '2026-05-26',
    reviewer: 'Fysh',
    reviewer_note: 'L4 compound alert active jointly with Bab-el-Mandeb. Both corridors share the Iran-Houthi geopolitical driver. US-Iran ceasefire talks have modestly reduced near-term Hormuz escalation probability (iran_hormuz_escalation now L2 declining) but JWC designation remains active and ACLED is above baseline. Compound state must be displayed in all CAPE outputs covering either corridor.'
  },

  bab_el_mandeb: {
    label: 'Bab-el-Mandeb / Red Sea',
    corridor_type: 'through_route',

    jwc: {
      active: true,
      listed_area: 'Red Sea and Gulf of Aden, including Bab-el-Mandeb approaches. Boundary has been revised multiple times since January 2024.',
      bulletin_ref: 'LMA market bulletin series, Red Sea designation from January 2024. Multiple revisions through 2024 to 2026.',
      uplift: 0.20,
      tier: 'T2',
      last_reviewed: '2026-05-26'
    },

    acled: {
      temperature: 'ELEVATED',
      incidents_l90d: 14,        // T3: decreased from 2024 peak (~45/quarter) but above baseline
      baseline_l12m_avg: 8.0,    // T3
      baseline_sd: 3.5,
      sigma_above: 1.7,          // (14 - 8) / 3.5 = approx 1.71 sigma: Elevated band
      uplift: 0.00,
      uplift_note: 'JWC uplift (0.20) exceeds ACLED Elevated band uplift (0.10). JWC applied.',
      bounding_box: '10N to 22N, 40E to 52E',
      last_updated: '2026-05-20',
      tier: 'T3'
    },

    event_uplift: 0.20,   // JWC only
    seasonal_uplift: 0.00, // May: pre-SW monsoon. SW monsoon starts June 1 (+0.10 from June).
    total_uplift: 0.20,

    upcoming_change: {
      date: '2026-06-01',
      description: 'Indian Ocean SW monsoon starts. Seasonal uplift +0.10 adds to event uplift. Total modifier becomes +0.30.',
      new_seasonal_uplift: 0.10,
      new_total_uplift: 0.30
    },

    prediction_p: 0.69,   // From houthi_sustained_escalation signal
    prediction_last_reviewed: '2026-05-19',

    threshold_level: 'L4',
    threshold_drivers: [
      'jwc_active',
      'acled_elevated',
      'multi_corridor_compound_with_hormuz'
    ],

    last_reviewed: '2026-05-26',
    reviewer: 'Fysh',
    reviewer_note: 'L4 compound alert active jointly with Hormuz. Houthi campaign ongoing but attack frequency has decreased from 2024 peak. JWC designation boundary is current as of this review. Demo vessel MV Atlantic Bridge (Suezmax, D-rated) is on this corridor and is currently rerouting Cape of Good Hope (+17 days, CII under pressure). Upcoming: SW monsoon adds +0.10 seasonal uplift from June 1, raising total modifier to 0.30.'
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
      incidents_l90d: 1,
      baseline_l12m_avg: 1.2,
      baseline_sd: 0.8,
      sigma_above: -0.25,   // Below average: genuinely quiet
      uplift: 0.00,
      bounding_box: '0N to 8N, 99E to 108E',
      last_updated: '2026-05-20',
      tier: 'T3'
    },

    event_uplift: 0.00,
    seasonal_uplift: 0.00,  // May: typhoon season not yet active. Starts June 1 (+0.12).
    total_uplift: 0.00,

    upcoming_change: {
      date: '2026-06-01',
      description: 'Western Pacific typhoon season starts. Seasonal uplift +0.12 applies from June 1.',
      new_seasonal_uplift: 0.12,
      new_total_uplift: 0.12
    },

    prediction_p: 0.08,   // From taiwan_strait_crisis signal
    prediction_last_reviewed: '2026-05-19',

    threshold_level: 'L1',
    threshold_drivers: [],

    last_reviewed: '2026-05-26',
    reviewer: 'Fysh',
    reviewer_note: 'No active signals. Currently the lowest-risk corridor in the portfolio. Typhoon season uplift of +0.12 starts June 1. Monitor Taiwan Strait: any escalation in that situation would require rapid reclassification to L3.'
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
      incidents_l90d: 0,
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
      uplift: ENSO_STATE.current_uplift,   // 0.35 (moderate El Nino threshold)
      tier: ENSO_STATE.current_uplift_tier,
      noaa_probability: ENSO_STATE.noaa_probability_moderate_strong,
      source: ENSO_STATE.noaa_source,
      last_reviewed: ENSO_STATE.last_reviewed
    },

    hurricane_season: {
      active: false,         // Starts June 1
      intensity: PANAMA_HURRICANE_SEASON.intensity,
      upcoming_uplift: PANAMA_HURRICANE_SEASON.uplift_above_average,  // 0.30 (above-average)
      source: PANAMA_HURRICANE_SEASON.source,
      start_date: '2026-06-01'
    },

    event_uplift: 0.35,    // ENSO developing El Nino. ACLED and JWC both zero.
    seasonal_uplift: 0.00,  // Hurricane season not yet active (starts June 1)
    total_uplift: 0.35,

    upcoming_change: {
      date: '2026-06-01',
      description: 'Atlantic hurricane season starts (above-average forecast). Seasonal uplift +0.30 adds to ENSO event uplift. Total modifier becomes +0.65.',
      new_seasonal_uplift: 0.30,
      new_total_uplift: 0.65,
      note: 'The June 1 compound of ENSO + above-average hurricane season represents the highest total modifier across all corridors for the 2026-27 season. Panama-routed cargo accumulation exposure is material.'
    },

    prediction_p: 0.53,   // From panama_el_nino_2026_27 signal (dominant); 0.03 from political signal
    prediction_last_reviewed: '2026-05-26',

    threshold_level: 'L3',
    threshold_drivers: ['enso_developing_el_nino', 'hurricane_season_above_average_forecast_imminent'],

    last_reviewed: '2026-05-26',
    reviewer: 'Fysh',
    reviewer_note: 'ENSO is the primary Panama risk driver. Political disruption probability (US-Panama) is materially lower and currently L1. The ENSO signal alone is the strongest single forward-looking signal across all four corridors for 2026-27. Upcoming: hurricane season (above-average forecast) starts June 1, raising total modifier to 0.65. This is the most significant accumulation exposure developing in the near term.'
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

  description: 'Hormuz and Bab-el-Mandeb are simultaneously carrying active JWC designations and elevated ACLED temperatures. Both corridors are driven by overlapping Iran-Houthi geopolitical dynamics. This is the highest-risk multi-corridor environment in the current analysis period.',

  correlation_note: 'The two corridors are not independent. Iran directly controls Hormuz and materially supports Houthi operations in the Red Sea. An Iran-driven escalation event has meaningful probability of affecting both corridors simultaneously. Single-corridor analysis will understate aggregate portfolio exposure for vessels with exposure to either or both corridors.',

  cape_display_rule: 'When Hormuz or Bab-el-Mandeb are in scope (either selected individually or via All Corridors), CAPE must display the following note: "Compound corridor alert active. Hormuz and Bab-el-Mandeb signals are correlated. Multi-corridor accumulation exposure may exceed single-corridor analysis. Compound alert level: L4."',

  last_reviewed: '2026-05-26',
  reviewer: 'Fysh'
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
  version: '1.0',
  created: '2026-05-26',
  last_updated: '2026-05-26',
  next_review_due: '2026-06-02',

  products: ['CAPE', 'CDM (planned)', 'PRI (planned)'],
  methodology_ref: 'CAPE-METHODOLOGY.md Sections 4.4 and 4.5',

  review_log: [
    {
      date: '2026-05-26',
      reviewer: 'Fysh',
      summary: 'Initial build. All four primary corridors populated with current real-world signal states. Compound L4 alert established for Hormuz and Bab-el-Mandeb. ENSO L3 for Panama. Malacca at L1. Seasonal modifier tables complete for all corridors including stubs for Bosphorus and Danish Straits.',
      signals_changed: ['all (initial build)']
    }
  ]
};
