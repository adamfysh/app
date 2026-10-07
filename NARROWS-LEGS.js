/**
 * NARROWS-LEGS.js
 * Route-based (leg-based) exposure engine for CAPE.
 *
 * Why this exists
 * ---------------
 * CAPE's original line is   cargo x classWeight x vesselWeight x (days/30) x severity.
 * It is linear in duration (so it can exceed the cargo it describes), it treats
 * every vessel of a class alike, and it cannot tell one route from another.
 * This module replaces the time term with a bounded one that depends on the
 * vessel's actual route.
 *
 * The model (conditional, like the rest of CAPE: no unconditional probabilities)
 * ------------------------------------------------------------------------------
 * A vessel runs a repeating trade cycle of C days (laden voyage, ballast return,
 * port stays). Suppose a disruption is in force for D days. A vessel that spends
 * z days in or approaching a passage (transit, approach, queue) is caught by that
 * disruption if its crossing falls inside the window. Across a fleet that is
 * spread evenly around the cycle, the share caught is
 *
 *     p = min(1, (D + z) / C)
 *
 * and the share of the cargo value lost to that leg is  p x severity.
 * That is bounded at 1 by construction, so a long scenario cannot exceed cargo
 * value. Legs combine as  F = 1 - product(1 - hit_leg), assuming the timing of
 * different legs is independent, and  VaR = cargo x F.  The independent case is
 * the central estimate; the simple sum is returned too as an upper bound for the
 * case where the legs are hit together.
 *
 * Port calls enter through z = PRI dwell days at that port (handling is
 * exposure). A port only contributes if the scenario gives it a severity.
 *
 * Assumptions (flagged, not sourced): ZONE_DAYS below are engineering estimates
 * of time in or near each passage, queue included. Replace with AIS transit and
 * waiting-time statistics when available.
 */
(function (root) {
  'use strict';

  // days in or approaching the passage, queue included (ASSUMPTIONS)
  var ZONE_DAYS = {
    hormuz: 1.0, bab_el_mandeb: 1.0, suez: 2.0, malacca: 1.5, panama: 2.5,
    lombok: 0.7, bosphorus: 1.0, danish_straits: 0.8, gibraltar: 0.5
  };

  // Illustrative route templates. Days are sailing days at 14 knots from the
  // Narrows routing graph (see the Yanbu analysis); ports carry dwell from PRI.
  var ROUTES = {
    yanbu_ulsan_long: {
      label: 'Yanbu to Ulsan via Suez, Gibraltar, Cape, Malacca (Bab el-Mandeb closed)',
      returnFactor: 1.0,
      legs: [
        { kind: 'port', port: 'Yanbu' },
        { kind: 'sea', days: 1.3 },
        { kind: 'passage', corridor: 'suez' },
        { kind: 'sea', days: 5.7 + 0.3 },
        { kind: 'passage', corridor: 'gibraltar' },
        { kind: 'sea', days: 15.9 + 14.9 },
        { kind: 'passage', corridor: 'malacca' },
        { kind: 'sea', days: 9.0 },
        { kind: 'port', port: 'Ulsan' }
      ]
    },
    yanbu_ulsan_short: {
      label: 'Yanbu to Ulsan via Bab el-Mandeb and Malacca (Bab open)',
      returnFactor: 1.0,
      legs: [
        { kind: 'port', port: 'Yanbu' },
        { kind: 'sea', days: 3.0 },
        { kind: 'passage', corridor: 'bab_el_mandeb' },
        { kind: 'sea', days: 9.1 },
        { kind: 'passage', corridor: 'malacca' },
        { kind: 'sea', days: 9.0 }
      ]
    }
  };

  function exposure(durationDays, zoneDays, cycleDays) {
    if (!(cycleDays > 0)) return 0;
    return Math.min(1, Math.max(0, (durationDays + zoneDays) / cycleDays));
  }

  // laden sailing days + port days; the ballast return repeats the sailing time
  function cycleDays(legs, ports, returnFactor) {
    var sail = 0, port = 0;
    legs.forEach(function (l) {
      if (l.kind === 'sea') sail += l.days;
      if (l.kind === 'port') port += dwellDays(l.port, ports);
    });
    return sail * (1 + (returnFactor == null ? 1 : returnFactor)) + port;
  }

  function dwellDays(name, ports) {
    var p = ports && ports[name];
    var h = p && p.dwellH;
    return (h > 0 ? h : 48) / 24;      // 48 h if PRI has no dwell for the port
  }

  /**
   * vessel: { cargo_value, leg_route: template key | legs: [...] , returnFactor? }
   (leg_route, not route: CAPE vessels already carry a display string called route)
   * scenario: { durationDays, corridors: {key: severityPct}, ports: {name: severityPct} }
   * ports: PORT_RISK-style table (optional; supplies dwellH from PRI)
   */
  function routeVar(vessel, scenario, ports) {
    var tpl = vessel.leg_route ? ROUTES[vessel.leg_route] : null;
    var legs = vessel.legs || (tpl && tpl.legs);
    if (!legs) return null;
    var rf = vessel.returnFactor != null ? vessel.returnFactor : (tpl ? tpl.returnFactor : 1);
    var C = cycleDays(legs, ports, rf);
    var D = scenario.durationDays;
    var out = [], keep = 1, sum = 0;
    legs.forEach(function (l) {
      var z, sev, label;
      if (l.kind === 'passage') {
        z = ZONE_DAYS[l.corridor] || 1;
        sev = (scenario.corridors && scenario.corridors[l.corridor]) || 0;
        label = l.corridor;
      } else if (l.kind === 'port') {
        z = dwellDays(l.port, ports);
        sev = (scenario.ports && scenario.ports[l.port]) || 0;
        label = l.port;
      } else { return; }
      var p = exposure(D, z, C), hit = p * sev / 100;
      keep *= (1 - hit); sum += hit;
      out.push({ kind: l.kind, label: label, zoneDays: z, share: p, severity: sev, hit: hit });
    });
    var F = 1 - keep;
    return {
      cycleDays: C, legs: out, fraction: F,
      var: vessel.cargo_value * F,
      upperBound: vessel.cargo_value * Math.min(1, sum),
      naiveSum: vessel.cargo_value * sum
    };
  }

  // does this vessel's route touch the corridor at all?
  function usesCorridor(vessel, key) {
    var tpl = vessel.leg_route ? ROUTES[vessel.leg_route] : null;
    var legs = vessel.legs || (tpl && tpl.legs) || [];
    return legs.some(function (l) { return l.kind === 'passage' && l.corridor === key; });
  }

  var api = { ZONE_DAYS: ZONE_DAYS, ROUTES: ROUTES, exposure: exposure,
              cycleDays: cycleDays, routeVar: routeVar, usesCorridor: usesCorridor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NARROWS_LEGS = api;
})(typeof window !== 'undefined' ? window : globalThis);
