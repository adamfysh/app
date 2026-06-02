/**
 * NARROWS-RATES.js
 * Shared vessel rate assumptions and corridor exposure weights for the Narrows analytics suite.
 * Consumed by CAPE.html and CDM (index.html).
 *
 * Version:     1.0, May 2026
 * Author:      Fysh, fysh@narrows.io
 *
 * Update protocol:
 *   - vesselRates: update in sync with narrows_config.json when Baltic Exchange / broker
 *     quotes shift materially (>10%). Increment version and last_updated.
 *   - corridorWeights: derived from AIS annual transit analysis. Review quarterly.
 *   - capeDefaults: only change if the baseline market reference period changes.
 *   - Never auto-generate this file. Human review required for every edit.
 *   - This file must load synchronously before any dependent script block.
 *
 * Relationship to narrows_config.json:
 *   narrows_config.json is the async authoritative source for CDM vesselRates at runtime.
 *   NARROWS-RATES.js provides the same values as a synchronous fallback and as the
 *   single edit point for CAPE, which does not fetch narrows_config.json.
 *   Keep vesselRates in both files in sync when updating rates.
 */

'use strict';

window.NARROWS_RATES = Object.freeze({

  version:      '1.0',
  last_updated: '2026-06-02',
  source:       'Yahoo Finance auto-update 2026-06-02 (Brent 93.9 USD/bbl, BDI n/a)',

  // ---------------------------------------------------------------------------
  // Vessel day rates
  // Used by CAPE to compute diversion cost scaling and by CDM as the pre-load
  // fallback before narrows_config.json resolves.
  // Authoritative source at runtime: narrows_config.json vesselRates.
  // ---------------------------------------------------------------------------
  vesselRates: Object.freeze({
    VLCC:       Object.freeze({ bunkerPerDay: 30000, charterPerDay: 84789, cargoValueM: 120 }),
    Aframax:    Object.freeze({ bunkerPerDay: 15000, charterPerDay: 33038, cargoValueM: 65 }),
    Capesize:   Object.freeze({ bunkerPerDay: 15000, charterPerDay: 35000, cargoValueM: 40 }),
    Handymax:  Object.freeze({ bunkerPerDay: 10000, charterPerDay: 16000, cargoValueM: 18 }),
    RoRo:        Object.freeze({ bunkerPerDay: 12000, charterPerDay: 20000, cargoValueM: 55 }),
    LNG_Carrier:Object.freeze({ bunkerPerDay: 25000, charterPerDay: 60000, cargoValueM: 180 }),
    Container:  Object.freeze({ bunkerPerDay: 18000, charterPerDay: 25000, cargoValueM: 80 }),
    Suezmax:Object.freeze({ bunkerPerDay: 18000, charterPerDay: 41548, cargoValueM: 90 }),
    LPG:Object.freeze({ bunkerPerDay: 12000, charterPerDay: 20000, cargoValueM: 55 }),
    Neopanamax:Object.freeze({ bunkerPerDay: 22000, charterPerDay: 20000, cargoValueM: 100 })
  }),

  // ---------------------------------------------------------------------------
  // CAPE assumption defaults
  // Initial values for the CAPE assumptions panel (bunker slider, opex, war risk).
  // These are the reset targets; users can override via the sliders at runtime.
  // Base rates calibrated to Q2 2024 market.
  // ---------------------------------------------------------------------------
  capeDefaults: Object.freeze({
    bunkerPricePerTonne: 600,  // $/t VLSFO. Slider range 200–1400.
    opexMultiplier:      1.0,  // 1.0 = model baseline opex. Range 0.5–3.0.
    warRiskMultiplier:   1.0   // 1.0 = standard war risk loading. Range 0.5–3.0.
  }),

  // ---------------------------------------------------------------------------
  // Corridor exposure weights
  // Fraction of a vessel class's annual cargo-ton-miles transiting each chokepoint.
  // Used by CAPE for cargo-at-risk calculations.
  // Derived from AIS-based annual transit analysis, Q2 2024.
  // Keys match the corridor identifiers in CAPE's corridor selector.
  // ---------------------------------------------------------------------------
  corridorWeights: Object.freeze({
    vlcc:       Object.freeze({ hormuz: .65, bab_el_mandeb: .30, malacca: .38, panama: .05, suez: .08, lombok: .12, bosphorus: .03, danish_straits: .02 }),
    suezmax:    Object.freeze({ hormuz: .50, bab_el_mandeb: .27, malacca: .33, panama: .05, suez: .25, lombok: .10, bosphorus: .15, danish_straits: .05 }),
    aframax:    Object.freeze({ hormuz: .45, bab_el_mandeb: .25, malacca: .37, panama: .04, suez: .20, lombok: .15, bosphorus: .22, danish_straits: .08 }),
    lng:        Object.freeze({ hormuz: .35, bab_el_mandeb: .22, malacca: .22, panama: .28, suez: .15, lombok: .08, bosphorus: .12, danish_straits: .18 }),
    lpg:        Object.freeze({ hormuz: .40, bab_el_mandeb: .24, malacca: .26, panama: .22, suez: .18, lombok: .10, bosphorus: .14, danish_straits: .12 }),
    neopanamax: Object.freeze({ hormuz: .06, bab_el_mandeb: .09, malacca: .13, panama: .12, suez: .20, lombok: .04, bosphorus: .06, danish_straits: .08 }),
    capesize:   Object.freeze({ hormuz: .06, bab_el_mandeb: .07, malacca: .22, panama: .03, suez: .05, lombok: .18, bosphorus: .04, danish_straits: .03 }),
    handymax:   Object.freeze({ hormuz: .08, bab_el_mandeb: .10, malacca: .14, panama: .38, suez: .12, lombok: .06, bosphorus: .18, danish_straits: .10 })
  })

});
