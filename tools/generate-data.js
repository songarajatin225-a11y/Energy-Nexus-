#!/usr/bin/env node
/**
 * Energy Nexus — demo dataset generator.
 *
 * Deterministic by design: a seeded PRNG means `node tools/generate-data.js`
 * always reproduces byte-identical JSON. The app never generates data at
 * runtime, so every screen reads from one unified energy model.
 *
 * Telemetry is stored as minute-of-day indexed arrays rather than absolute
 * timestamps, so the demo always renders as "today" without regeneration.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data');

/* ---------- deterministic PRNG (mulberry32) ---------- */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20260814);
const jitter = (amp) => (r() - 0.5) * 2 * amp;
const round = (n, d = 2) => Number(n.toFixed(d));

/* ---------- tariff model (ToD blocks, ₹/kWh) ---------- */
// Indian C&I time-of-day structure: morning + evening peaks, cheap night.
function tariffAt(hour) {
  if (hour >= 6 && hour < 9) return { rate: 9.8, block: 'PEAK' };
  if (hour >= 18 && hour < 22) return { rate: 10.4, block: 'PEAK' };
  if (hour >= 22 || hour < 6) return { rate: 5.4, block: 'OFF-PEAK' };
  return { rate: 7.2, block: 'NORMAL' };
}

// Grid carbon intensity — coal-heavy at night, softened by midday solar.
function carbonAt(hour) {
  const solarDip = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  return round(710 - solarDip * 190 + jitter(12), 0);
}

/* ---------- sites ---------- */
const SITES = [
  {
    siteId: 'ENX-HSR-001', name: 'Hosur Manufacturing Cluster',
    location: 'Hosur, Tamil Nadu', cluster: 'Bengaluru–Hosur', clusterId: 'CL-BLR-HSR',
    industry: 'Auto Components', shifts: 3, connectedLoadMW: 12.4, peakMW: 10.2,
    solarMW: 4.2, bess: { powerMW: 5, capacityMWh: 10, soc: 62 }, dgMW: 3.5,
    energyCost: 8.14, savingsPercent: 8.7, agentTier: 2, health: 99.8, lat: 12.74, lng: 77.83,
  },
  {
    siteId: 'ENX-BLR-002', name: 'Bengaluru Electronics Park',
    location: 'Bengaluru, Karnataka', cluster: 'Bengaluru–Hosur', clusterId: 'CL-BLR-HSR',
    industry: 'Electronics / EMS', shifts: 2, connectedLoadMW: 8.6, peakMW: 6.9,
    solarMW: 2.8, bess: { powerMW: 3, capacityMWh: 6, soc: 71 }, dgMW: 2.0,
    energyCost: 7.86, savingsPercent: 9.4, agentTier: 2, health: 99.6, lat: 12.97, lng: 77.59,
  },
  {
    siteId: 'ENX-CHN-003', name: 'Sriperumbudur Auto Plant',
    location: 'Sriperumbudur, Tamil Nadu', cluster: 'Chennai–Sriperumbudur', clusterId: 'CL-CHN-SPD',
    industry: 'Automotive OEM', shifts: 3, connectedLoadMW: 18.2, peakMW: 15.4,
    solarMW: 6.5, bess: { powerMW: 8, capacityMWh: 16, soc: 48 }, dgMW: 6.0,
    energyCost: 8.42, savingsPercent: 7.9, agentTier: 2, health: 99.9, lat: 12.97, lng: 79.94,
  },
  {
    siteId: 'ENX-PUN-004', name: 'Chakan Powertrain Facility',
    location: 'Chakan, Maharashtra', cluster: 'Pune–Chakan', clusterId: 'CL-PUN-CHK',
    industry: 'Automotive / Capital Goods', shifts: 3, connectedLoadMW: 14.1, peakMW: 11.8,
    solarMW: 3.9, bess: { powerMW: 4, capacityMWh: 8, soc: 55 }, dgMW: 4.5,
    energyCost: 8.68, savingsPercent: 6.8, agentTier: 1, health: 98.9, lat: 18.76, lng: 73.86,
  },
  {
    siteId: 'ENX-AHM-005', name: 'Sanand Chemical Complex',
    location: 'Sanand, Gujarat', cluster: 'Ahmedabad–Sanand', clusterId: 'CL-AHM-SND',
    industry: 'Speciality Chemicals', shifts: 3, connectedLoadMW: 22.5, peakMW: 19.6,
    solarMW: 8.4, bess: { powerMW: 6, capacityMWh: 12, soc: 39 }, dgMW: 8.0,
    energyCost: 7.94, savingsPercent: 10.2, agentTier: 3, health: 99.7, lat: 22.99, lng: 72.38,
  },
  {
    siteId: 'ENX-HYD-006', name: 'Hyderabad Pharma Campus',
    location: 'Hyderabad, Telangana', cluster: 'Hyderabad', clusterId: 'CL-HYD',
    industry: 'Pharmaceuticals', shifts: 3, connectedLoadMW: 9.8, peakMW: 8.4,
    solarMW: 2.4, bess: { powerMW: 3, capacityMWh: 9, soc: 66 }, dgMW: 3.0,
    energyCost: 8.05, savingsPercent: 8.1, agentTier: 2, health: 99.4, lat: 17.39, lng: 78.49,
  },
  {
    siteId: 'ENX-NOI-007', name: 'Greater Noida Mobile Plant',
    location: 'Greater Noida, Uttar Pradesh', cluster: 'Noida–Gurugram', clusterId: 'CL-NCR',
    industry: 'Mobile Manufacturing', shifts: 2, connectedLoadMW: 11.3, peakMW: 9.1,
    solarMW: 3.1, bess: { powerMW: 4, capacityMWh: 8, soc: 58 }, dgMW: 4.0,
    energyCost: 9.12, savingsPercent: 7.4, agentTier: 1, health: 97.8, lat: 28.47, lng: 77.50,
  },
  {
    siteId: 'ENX-CBE-008', name: 'Coimbatore Textile Mill',
    location: 'Coimbatore, Tamil Nadu', cluster: 'Coimbatore–Tiruppur', clusterId: 'CL-CBE',
    industry: 'Textiles', shifts: 3, connectedLoadMW: 7.4, peakMW: 6.6,
    solarMW: 2.2, bess: { powerMW: 2, capacityMWh: 4, soc: 44 }, dgMW: 2.5,
    energyCost: 7.68, savingsPercent: 11.3, agentTier: 2, health: 99.1, lat: 11.02, lng: 76.96,
  },
];

/* ---------- load shape ---------- */
// Industrial load: a high flat base (continuous process) plus shift ramps.
function loadShape(hour, shifts) {
  const base = 0.58;
  let s = base;
  if (shifts === 3) {
    s += 0.26 * Math.max(0, Math.sin(((hour - 5) / 24) * Math.PI * 2) * 0.5 + 0.5);
    s += hour >= 9 && hour < 18 ? 0.12 : 0;
  } else {
    // 2-shift: sharp weekday ramp 07:00–23:00, deep night trough.
    s += hour >= 7 && hour < 23 ? 0.34 : -0.14;
  }
  // Lunch/changeover dip.
  if (hour >= 13 && hour < 14) s -= 0.05;
  return Math.max(0.28, Math.min(1.0, s));
}

function solarShape(hour) {
  if (hour < 6.2 || hour > 18.4) return 0;
  const x = (hour - 6.2) / (18.4 - 6.2);
  return Math.max(0, Math.sin(x * Math.PI)) ** 1.15;
}

/* ---------- telemetry: 24h @ 15 min ---------- */
const STEPS = 96;
const telemetry = { meta: meta('24-hour site telemetry at 15-minute resolution'), intervalMinutes: 15, steps: STEPS, series: {} };

SITES.forEach((site) => {
  const t = [], loadMW = [], solarMW = [], bessMW = [], gridMW = [], dgMW = [],
    socPct = [], tariff = [], carbon = [], pf = [], freq = [], voltage = [];
  let soc = site.bess.soc;

  // Pass 1: the unoptimised baseline (no battery, lower solar self-consumption).
  // Its peak is the ceiling the optimiser must stay under — charging may never
  // create a demand peak higher than the site had before Nexus.
  let baselinePeak = 0;
  for (let i = 0; i < STEPS; i++) {
    const hour = (i * 15) / 60;
    const load = site.peakMW * loadShape(hour, site.shifts);
    const solar = site.solarMW * solarShape(hour) * 0.86;
    baselinePeak = Math.max(baselinePeak, load - solar * 0.72);
  }
  const mdCeiling = Math.min(site.peakMW * 0.88, baselinePeak * 0.97);

  for (let i = 0; i < STEPS; i++) {
    const hour = (i * 15) / 60;
    const { rate } = tariffAt(hour);
    const load = round(site.peakMW * loadShape(hour, site.shifts) + jitter(0.14), 3);
    const solar = round(site.solarMW * solarShape(hour) * (0.86 + jitter(0.05)), 3);

    // Battery policy: charge on solar surplus + off-peak, discharge into peak.
    let bess = 0;
    const surplus = solar - load;
    if (surplus > 0.2 && soc < 92) bess = -Math.min(site.bess.powerMW, surplus * 0.8);
    else if (rate >= 9.5 && soc > 28) bess = Math.min(site.bess.powerMW, load * 0.22);
    else if (rate <= 5.5 && soc < 70) bess = -site.bess.powerMW * 0.45;

    // Charging draws from the grid, so an unconstrained off-peak charge can
    // create a new maximum-demand peak — exactly what the optimiser exists to
    // prevent. Clamp charging to keep grid import under the MD ceiling.
    if (bess < 0) {
      bess = Math.max(bess, Math.min(0, -(mdCeiling - load + solar)));
    }

    // SoC integration over a 15-minute step, with round-trip efficiency.
    const deltaMWh = (-bess * 0.25) * (bess < 0 ? 0.94 : 1 / 0.94);
    soc = Math.max(12, Math.min(96, soc + (deltaMWh / site.bess.capacityMWh) * 100));

    const grid = round(Math.max(0, load - solar - bess), 3);
    t.push(i * 15);
    loadMW.push(load);
    solarMW.push(solar);
    bessMW.push(round(bess, 3));
    gridMW.push(grid);
    dgMW.push(0);
    socPct.push(round(soc, 1));
    tariff.push(rate);
    carbon.push(carbonAt(hour));
    pf.push(round(0.968 + jitter(0.016), 3));
    freq.push(round(49.98 + jitter(0.06), 2));
    voltage.push(round(11 + jitter(0.14), 2));
  }
  telemetry.series[site.siteId] = { t, loadMW, solarMW, bessMW, gridMW, dgMW, socPct, tariff, carbon, pf, freq, voltage };
});

/* ---------- 30-day daily rollup (drives the 7D / 30D ranges) ---------- */
// dayOffset 0 is today, -29 is thirty days back; the app maps these to real dates.
telemetry.daily = {};
SITES.forEach((site) => {
  const s = telemetry.series[site.siteId];
  const baseLoadMWh = s.loadMW.reduce((a, b) => a + b, 0) * 0.25;
  const baseSolarMWh = s.solarMW.reduce((a, b) => a + b, 0) * 0.25;
  const rows = [];
  for (let d = -29; d <= 0; d++) {
    // Sundays run a maintenance profile; a light trend improves through the month
    // as the agent's envelope widens.
    const dow = (new Date().getDay() + d % 7 + 7) % 7;
    const weekend = dow === 0 ? 0.63 : dow === 6 ? 0.88 : 1;
    const trend = 1 - (d + 29) * 0.0016;
    const cloud = 0.72 + r() * 0.34;
    const loadMWh = round(baseLoadMWh * weekend * trend * (0.96 + jitter(0.05)), 1);
    const solarMWh = round(baseSolarMWh * cloud, 1);
    const gridMWh = round(Math.max(0, loadMWh - solarMWh * 0.92), 1);
    rows.push({
      dayOffset: d,
      loadMWh,
      solarMWh,
      gridMWh,
      peakMW: round(site.peakMW * weekend * (0.86 + r() * 0.13), 2),
      costINR: Math.round(gridMWh * 1000 * site.energyCost),
      carbonT: round(gridMWh * 0.71, 1),
      savingsINR: Math.round(loadMWh * 1000 * site.energyCost * (site.savingsPercent / 100)),
    });
  }
  telemetry.daily[site.siteId] = rows;
});

/* ---------- assets ---------- */
const assets = { meta: meta('Connected energy assets across all demo sites'), assets: [] };
let assetSeq = 0;
function asset(site, type, name, spec) {
  assetSeq += 1;
  const statusRoll = r();
  const status = statusRoll > 0.94 ? 'WARNING' : statusRoll > 0.985 ? 'OFFLINE' : 'ONLINE';
  return Object.assign({
    assetId: `${site.siteId}-${type.toUpperCase()}-${String(assetSeq).padStart(3, '0')}`,
    siteId: site.siteId, siteName: site.name, type, name, status,
    health: round(96 + r() * 3.9, 1),
    utilisationPct: round(48 + r() * 44, 1),
    commissioned: `20${20 + Math.floor(r() * 5)}-0${1 + Math.floor(r() * 8)}-1${Math.floor(r() * 9)}`,
  }, spec);
}

SITES.forEach((site) => {
  const A = assets.assets;
  A.push(asset(site, 'grid', 'Grid Incomer 11 kV', {
    ratedMW: site.connectedLoadMW, controllable: false, tier: 1,
    telemetry: { voltageKV: 11.02, frequencyHz: 50.01, powerFactor: 0.97 },
  }));
  A.push(asset(site, 'solar', 'Rooftop + Ground Mount PV', {
    ratedMW: site.solarMW, controllable: false, tier: 1,
    telemetry: { specificYield: round(4.1 + r() * 0.9, 2), prPct: round(78 + r() * 6, 1) },
  }));
  A.push(asset(site, 'bess', `BESS ${site.bess.powerMW} MW / ${site.bess.capacityMWh} MWh`, {
    ratedMW: site.bess.powerMW, capacityMWh: site.bess.capacityMWh, controllable: true, tier: site.agentTier,
    telemetry: { socPct: site.bess.soc, cycles: Math.floor(320 + r() * 480), sohPct: round(94 + r() * 4, 1) },
  }));
  A.push(asset(site, 'dg', `DG Set ${site.dgMW} MW`, {
    ratedMW: site.dgMW, controllable: true, tier: 1,
    note: 'Diesel dispatch is permanently human-approved',
    telemetry: { runHoursYTD: Math.floor(40 + r() * 180), fuelLPerKWh: round(0.27 + r() * 0.04, 3) },
  }));
  A.push(asset(site, 'chiller', 'Chiller Plant', {
    ratedMW: round(site.peakMW * 0.16, 2), controllable: true, tier: Math.min(2, site.agentTier),
    telemetry: { copActual: round(4.1 + r() * 1.3, 2), chwSupplyC: round(6.5 + r() * 1.4, 1) },
  }));
  A.push(asset(site, 'hvac', 'HVAC / AHU Network', {
    ratedMW: round(site.peakMW * 0.11, 2), controllable: true, tier: Math.min(2, site.agentTier),
    telemetry: { zoneTempC: round(23.5 + r() * 2, 1), setpointC: 24 },
  }));
  A.push(asset(site, 'compressor', 'Compressed Air System', {
    ratedMW: round(site.peakMW * 0.09, 2), controllable: true, tier: Math.min(2, site.agentTier),
    telemetry: { pressureBar: round(6.4 + r() * 0.5, 2), specificPower: round(0.11 + r() * 0.02, 3) },
  }));
  A.push(asset(site, 'production', `${site.industry} Line`, {
    ratedMW: round(site.peakMW * 0.42, 2), controllable: true, tier: 1,
    note: 'Production shifting always requires human approval',
    telemetry: { oeePct: round(72 + r() * 16, 1), energyPerUnit: round(0.8 + r() * 0.6, 3) },
  }));
  if (site.peakMW > 9) {
    A.push(asset(site, 'ev', 'EV Charging Hub', {
      ratedMW: round(0.3 + r() * 0.9, 2), controllable: true, tier: 3,
      telemetry: { activeSessions: Math.floor(r() * 12), connectors: 8 + Math.floor(r() * 12) },
    }));
  }
  if (site.industry.match(/Chemical|Pharma|Textile/)) {
    A.push(asset(site, 'thermal', 'Thermal Storage / Process Heat', {
      ratedMW: round(site.peakMW * 0.18, 2), controllable: true, tier: 2,
      telemetry: { storedMWh: round(r() * 8, 2), tempC: round(88 + r() * 60, 1) },
    }));
  }
  A.push(asset(site, 'meter', 'Sub-meter Network', {
    ratedMW: 0, controllable: false, tier: 1,
    telemetry: { meterCount: 18 + Math.floor(r() * 40), pollSeconds: 15 },
  }));
});

/* ---------- forecasts: 7 days @ 1 h with confidence bands ---------- */
const forecasts = { meta: meta('7-day forecasts with P10/P50/P90 confidence bands'), horizonHours: 168, series: {} };
SITES.forEach((site) => {
  const load = [], solar = [], p10 = [], p90 = [], solarP10 = [], solarP90 = [], price = [], soc = [];
  for (let h = 0; h < 168; h++) {
    const hod = h % 24;
    const day = Math.floor(h / 24);
    // Sunday (day index 6) runs a maintenance-shift profile.
    const weekend = day === 6 ? 0.62 : 1;
    const base = site.peakMW * loadShape(hod, site.shifts) * weekend;
    const spread = 0.06 + (h / 168) * 0.09; // uncertainty widens with horizon
    load.push(round(base, 3));
    p10.push(round(base * (1 - spread), 3));
    p90.push(round(base * (1 + spread), 3));
    const sol = site.solarMW * solarShape(hod) * (day === 3 ? 0.54 : 0.88); // day 3 = cloud cover
    solar.push(round(sol, 3));
    solarP10.push(round(sol * (1 - spread * 2.1), 3));
    solarP90.push(round(sol * (1 + spread * 1.4), 3));
    price.push(tariffAt(hod).rate);
    soc.push(round(45 + 30 * Math.sin((hod / 24) * Math.PI * 2 - 1.2), 1));
  }
  forecasts.series[site.siteId] = {
    load, loadP10: p10, loadP90: p90, solar, solarP10, solarP90, price, soc,
    accuracy: { loadMapePct: round(4.2 + r() * 2.6, 1), solarMapePct: round(7.1 + r() * 3.4, 1), peakHitRatePct: round(88 + r() * 8, 1) },
  };
});

/* ---------- alerts ---------- */
const ALERT_TEMPLATES = [
  ['CRITICAL', 'Peak demand excursion probability 94%', 'Maximum demand is tracking to exceed the contracted 10.2 MVA ceiling within 40 minutes.', 'Discharge BESS at 1.8 MW and shed non-critical HVAC for 35 minutes.', 248000],
  ['WARNING', 'BESS degradation anomaly detected', 'Cell-group voltage divergence on rack 4 exceeds the 28 mV plausibility band.', 'Schedule OEM inspection; hold rack 4 out of the dispatch stack.', 0],
  ['OPTIMISATION', 'Solar surplus available for 42 minutes', 'Forecast PV output exceeds site load by 1.4 MW from 12:20.', 'Charge BESS at 1.4 MW to capture surplus before curtailment.', 18400],
  ['AI INSIGHT', 'Chiller sequencing could reduce energy cost by 4.8%', 'Chiller 2 is running at 41% part load where CoP falls below 3.4.', 'Re-sequence to single-chiller operation until 16:00.', 31600],
  ['WARNING', 'Power factor drift below 0.95', 'APFC bank stage 3 is not switching in under inductive load.', 'Inspect contactor stage 3; PF penalty exposure begins at 0.95.', 42000],
  ['OPTIMISATION', 'Off-peak charging window opens in 22 minutes', 'Tariff drops to ₹5.40/kWh at 22:00 with 61% SoC headroom.', 'Charge BESS to 85% before the 06:00 peak block.', 26800],
  ['CRITICAL', 'Compressed air leak signature detected', 'Off-shift baseline flow is 18% above the commissioning benchmark.', 'Dispatch leak survey; estimated continuous loss 34 kW.', 186000],
  ['AI INSIGHT', 'Production shift opportunity identified', 'Moving the grinding line 90 minutes later avoids the evening peak block.', 'Requires human approval — production sequencing is Tier 1.', 74000],
  ['WARNING', 'Inverter 3 underperforming vs string model', 'Measured yield is 11% below the modelled expectation at matched irradiance.', 'Check string 3B for soiling or partial shading.', 12400],
  ['OPTIMISATION', 'Thermal storage charge window available', 'Ambient temperature favours chiller CoP of 5.2 until 08:00.', 'Charge thermal storage 3.1 MWh ahead of the afternoon cooling peak.', 22900],
  ['AI INSIGHT', 'Contracted demand appears over-subscribed', 'Rolling 12-month peak is 14% below the sanctioned load.', 'Model a contract-demand reduction; indicative annual saving ₹19.4L.', 194000],
  ['WARNING', 'Edge gateway heartbeat degraded', 'Two heartbeats missed in the last 15 minutes on gateway GW-02.', 'Agent has reverted the affected assets to Tier 1 automatically.', 0],
  ['OPTIMISATION', 'EV charging deferral available', 'Nine sessions have departure slack beyond the evening peak block.', 'Defer 0.6 MW of charging to 22:15 — Tier 3, no approval needed.', 8600],
  ['CRITICAL', 'DG start requested outside consent hours', 'A manual DG start was attempted at 02:14, outside consented run hours.', 'Blocked at the edge. Escalated for human review.', 0],
  ['AI INSIGHT', 'Energy intensity drifting on line 2', 'kWh per unit is 6.2% above the 90-day trailing baseline.', 'Investigate compressed-air pressure setpoint creep.', 58000],
  ['OPTIMISATION', 'Flexibility event opportunity', 'A 2-hour, 3.2 MW curtailment window is available at ₹4.10/kWh.', 'Commit 2.4 MW from BESS and non-critical HVAC.', 19700],
  ['WARNING', 'Transformer 2 oil temperature elevated', 'Winding temperature reached 78 °C at 82% loading.', 'Rebalance feeders 3 and 4; inspect cooling fans.', 0],
  ['AI INSIGHT', 'Open-access scheduling window approaching', 'Day-ahead open-access nomination closes in 3 hours.', 'Human approval required — regulated transactions are Tier 1.', 128000],
  ['OPTIMISATION', 'Night setback not applied on AHU group 2', 'Six AHUs held daytime setpoints through the 22:00–06:00 block.', 'Apply the night setback schedule; 0.4 MW average reduction.', 31200],
  ['WARNING', 'Meter M-114 reporting implausible values', 'Reported 0 kW for 45 minutes against non-zero downstream load.', 'Data held out of the twin; reconciliation flagged.', 0],
];
const alerts = { meta: meta('Active and recent alerts across the demo estate'), alerts: [] };
ALERT_TEMPLATES.forEach((a, i) => {
  const site = SITES[i % SITES.length];
  const siteAssets = assets.assets.filter((x) => x.siteId === site.siteId);
  const target = siteAssets[Math.floor(r() * siteAssets.length)];
  alerts.alerts.push({
    alertId: `ALT-${String(1000 + i)}`,
    severity: a[0], title: a[1], detail: a[2], recommendation: a[3],
    financialImpactINR: a[4],
    siteId: site.siteId, siteName: site.name,
    assetId: target.assetId, assetName: target.name,
    minuteOfDay: Math.floor(r() * 1440),
    acknowledged: r() > 0.72,
    action: a[0] === 'CRITICAL' ? 'Review now' : a[0] === 'OPTIMISATION' ? 'Simulate' : 'Investigate',
  });
});

/* ---------- AI agent decisions ---------- */
const DECISIONS = [
  ['Charge BESS from solar surplus', 'bess', 2, 'Forecast shows 1.4 MW of PV surplus for 42 minutes from 12:20. Charging now displaces evening peak import at ₹10.40/kWh.', 'BESS charges at 1.4 MW, reaching 78% SoC by 13:05.', 18400, 94, 'Production untouched · Battery reserve 25% held · Peak limit protected · Warranty throughput respected', 'Surplus is exported at a net-billing rate of ₹3.10/kWh — ₹18,400 of value is forgone.', 'EXECUTED'],
  ['Discharge BESS into evening peak', 'bess', 2, 'Maximum demand is forecast to reach 9.8 MW against a 10.2 MVA ceiling during the 18:00 peak block.', 'BESS discharges 1.8 MW for 95 minutes, holding MD at 8.1 MW.', 42800, 91, 'MD ceiling protected · SoC floor 20% held · Degradation cost ₹1,240 netted off', 'MD excursion probability rises to 68%; a single excursion resets the billing peak for 12 months.', 'EXECUTED'],
  ['Re-sequence chiller plant', 'chiller', 2, 'Chiller 2 is at 41% part load where measured CoP falls to 3.4 against 5.1 for single-chiller operation.', 'Chiller 2 stops; chiller 1 ramps to 74%. Chilled-water supply holds at 7 °C.', 31600, 89, 'CHW supply temperature band 6–8 °C · Process cooling protected · Compressor start limits respected', 'Part-load penalty continues, costing about ₹1,320 per hour until the load rises.', 'EXECUTED'],
  ['Defer EV charging past peak', 'ev', 3, 'Nine of fourteen sessions have departure slack beyond 22:00. Deferral avoids the peak tariff block entirely.', '0.6 MW of charging moves to the 22:15 off-peak window. All vehicles meet departure SoC.', 8600, 96, 'Departure SoC guaranteed · Connector limits respected · No impact on production', 'Charging completes in the peak block at ₹10.40/kWh instead of ₹5.40/kWh.', 'EXECUTED'],
  ['Shift grinding line by 90 minutes', 'production', 1, 'Order-book slack allows the grinding line to start at 19:30 instead of 18:00, avoiding the evening peak.', 'Line 3 start moves to 19:30. Shift pattern and labour cost unchanged.', 74000, 82, 'Order commitments verified · Changeover cost ₹6,400 netted off · Labour rules respected', 'The line draws 2.1 MW through the most expensive tariff block of the day.', 'PENDING APPROVAL'],
  ['Pre-cool thermal storage', 'thermal', 2, 'Ambient conditions give a chiller CoP of 5.2 before 08:00, against 3.9 in the afternoon.', 'Thermal storage charges 3.1 MWh overnight, displacing afternoon chiller load.', 22900, 87, 'Storage temperature limits held · Process cooling reserve maintained · No production impact', 'Afternoon cooling is met at a CoP of 3.9, costing about ₹22,900 more per day.', 'EXECUTED'],
  ['Reduce non-critical HVAC for flexibility event', 'hvac', 2, 'A 2-hour flexibility window clears at ₹4.10/kWh. Office and non-process HVAC can give 0.8 MW.', 'Setpoints rise 1.5 °C in non-process zones for 120 minutes, then recover.', 19700, 85, 'Process zones excluded · Comfort band 24–25.5 °C · Recovery time 25 minutes · Envelope signed by plant head', 'The flexibility revenue opportunity lapses unclaimed.', 'EXECUTED'],
  ['Start DG set for peak avoidance', 'dg', 1, 'Marginal DG cost is ₹14.20/kWh against a peak grid rate of ₹10.40/kWh.', 'The agent recommends against DG start. Grid import remains the cheaper option.', 0, 98, 'Consent run-hours checked · Ambient air-quality restriction active · Marginal cost unfavourable', 'No action needed — declining to act is the correct outcome here.', 'DECLINED'],
  ['Nominate open-access schedule', 'grid', 1, 'Day-ahead open-access nomination closes in 3 hours. Forecast load supports a 6 MW block.', 'Recommendation only. A licensed intermediary executes any regulated transaction.', 128000, 79, 'Regulated transaction — permanently human-approved · Scheduling penalties modelled · Deviation risk quantified', 'The nomination window closes and the block reverts to higher-cost grid supply.', 'PENDING APPROVAL'],
  ['Correct power factor', 'meter', 2, 'PF has drifted to 0.943, below the 0.95 incentive threshold, exposing the site to a penalty.', 'APFC stage 3 switches in, restoring PF to 0.978.', 42000, 93, 'Capacitor switching limits respected · Harmonic distortion monitored · No resonance risk', 'The PF penalty accrues at roughly ₹3,500 per day.', 'EXECUTED'],
  ['Hold BESS rack 4 out of dispatch', 'bess', 2, 'Cell-group voltage divergence on rack 4 exceeds the 28 mV plausibility band.', 'Rack 4 is isolated from the dispatch stack. Available power drops to 4.2 MW.', 0, 97, 'Safety first — available capacity reduced · OEM inspection raised · Warranty position preserved', 'Continued cycling of a diverging rack risks accelerated degradation and a warranty dispute.', 'EXECUTED'],
  ['Apply AHU night setback', 'hvac', 2, 'Six AHUs held daytime setpoints through the night block, costing 0.4 MW of avoidable load.', 'Night setback schedule is applied from 22:00 to 06:00.', 31200, 92, 'Non-process zones only · Morning pull-down verified · Comfort restored by 06:30', 'About 3.2 MWh per night is consumed with no occupancy benefit.', 'EXECUTED'],
  ['Reduce contract demand', 'grid', 1, 'The rolling 12-month peak is 14% below sanctioned load, so fixed demand charges are over-paid.', 'Recommendation to file a contract-demand reduction with the utility.', 194000, 76, 'Commercial change — human approval required · Reconnection cost modelled · Growth headroom retained', 'Fixed demand charges continue on unused sanctioned capacity.', 'PENDING APPROVAL'],
  ['Curtail compressed-air leak load', 'compressor', 2, 'Off-shift baseline flow is 18% above the commissioning benchmark, indicating a leak.', 'Isolate the zone 4 header off-shift pending a leak survey.', 186000, 84, 'Process air pressure maintained · Zone 4 has no off-shift demand · Reversible in 30 seconds', 'A continuous 34 kW loss persists, worth about ₹186,000 a year.', 'PENDING APPROVAL'],
  ['Re-plan after gateway heartbeat loss', 'grid', 2, 'Two heartbeats were missed on gateway GW-02 within 15 minutes.', 'Affected assets revert to Tier 1 and hold their last valid safe schedule.', 0, 99, 'Dead-man behaviour triggered · Last valid schedule held · Native controllers resume on timeout', 'Operating on stale state risks acting on data that no longer reflects the plant.', 'EXECUTED'],
];
const agents = { meta: meta('AI Energy Agent decision log with rationale and counterfactuals'), decisions: [] };
DECISIONS.forEach((d, i) => {
  const site = SITES[i % SITES.length];
  agents.decisions.push({
    decisionId: `AID-${String(2000 + i)}`,
    title: d[0], assetType: d[1], tier: d[2],
    why: d[3], whatHappens: d[4], expectedValueINR: d[5], confidencePct: d[6],
    constraints: d[7].split(' · '), counterfactual: d[8], status: d[9],
    siteId: site.siteId, siteName: site.name,
    minuteOfDay: Math.floor(r() * 1440),
  });
});

/* ---------- optimisation events ---------- */
const optimisation = { meta: meta('Optimisation runs with before/after energy mix'), runs: [] };
for (let i = 0; i < 20; i++) {
  const site = SITES[i % SITES.length];
  const gridBefore = round(site.peakMW * (0.72 + r() * 0.12), 2);
  const solarBefore = round(site.solarMW * (0.42 + r() * 0.18), 2);
  const gridAfter = round(gridBefore * (0.76 + r() * 0.09), 2);
  const solarAfter = round(Math.min(site.solarMW, solarBefore * (1.14 + r() * 0.16)), 2);
  const bessAfter = round(Math.min(site.bess.powerMW, gridBefore - gridAfter), 2);
  optimisation.runs.push({
    runId: `OPT-${String(3000 + i)}`,
    siteId: site.siteId, siteName: site.name,
    minuteOfDay: Math.floor(r() * 1440),
    before: { gridMW: gridBefore, solarMW: solarBefore, bessMW: 0, dgMW: 0 },
    after: { gridMW: gridAfter, solarMW: solarAfter, bessMW: bessAfter, dgMW: 0 },
    savingINRPerDay: Math.round((gridBefore - gridAfter) * 24 * 1000 * 0.28 * (0.8 + r() * 0.5)),
    peakReductionMW: round(gridBefore - gridAfter, 2),
    carbonReductionTCO2e: round((gridBefore - gridAfter) * 24 * 0.71 / 1000 * 10, 2),
    objective: ['Cost', 'Peak', 'Carbon', 'Blended'][Math.floor(r() * 4)],
    status: r() > 0.3 ? 'APPLIED' : 'SIMULATED',
  });
}

/* ---------- market records ---------- */
const market = { meta: meta('Simulated flexibility and energy market activity — not a live exchange'), records: [] };
const PRODUCTS = ['Flexibility · 2h block', 'Solar surplus', 'BESS discharge', 'Thermal shift', 'Open access block', 'Demand response'];
for (let i = 0; i < 20; i++) {
  const site = SITES[i % SITES.length];
  const side = r() > 0.5 ? 'OFFER' : 'BID';
  market.records.push({
    recordId: `MKT-${String(4000 + i)}`,
    side, product: PRODUCTS[Math.floor(r() * PRODUCTS.length)],
    mw: round(0.4 + r() * 4.2, 2),
    priceINRPerKWh: round(3.2 + r() * 4.6, 2),
    durationMin: [30, 60, 90, 120, 240][Math.floor(r() * 5)],
    siteId: site.siteId, location: site.location, cluster: site.cluster,
    status: ['CLEARED', 'OPEN', 'SETTLED', 'WITHDRAWN'][Math.floor(r() * 4)],
    settlement: r() > 0.5 ? 'T+1' : 'T+2',
    regime: ['SIMULATION', 'PILOT', 'REGULATION DEPENDENT'][Math.floor(r() * 3)],
    minuteOfDay: Math.floor(r() * 1440),
  });
}

/* ---------- network / clusters ---------- */
// Cluster ranking follows the business case: Bengaluru–Hosur launches first.
const NETWORK_NODES = [
  { nodeId: 'CL-BLR-HSR', name: 'Bengaluru–Hosur', state: 'Karnataka / Tamil Nadu', sites: 24, euMW: 268, flexMW: 19.4, priority: 1, status: 'LIVE', lat: 12.86, lng: 77.71, industries: 'Electronics, auto components, aerospace' },
  { nodeId: 'CL-CHN-SPD', name: 'Chennai–Sriperumbudur', state: 'Tamil Nadu', sites: 19, euMW: 231, flexMW: 16.2, priority: 2, status: 'LIVE', lat: 12.97, lng: 79.94, industries: 'Automotive OEM, tier-1, EV assembly' },
  { nodeId: 'CL-PUN-CHK', name: 'Pune–Chakan', state: 'Maharashtra', sites: 17, euMW: 194, flexMW: 13.1, priority: 3, status: 'LIVE', lat: 18.76, lng: 73.86, industries: 'Automotive, capital goods' },
  { nodeId: 'CL-AHM-SND', name: 'Ahmedabad–Sanand', state: 'Gujarat', sites: 14, euMW: 178, flexMW: 12.6, priority: 4, status: 'LIVE', lat: 22.99, lng: 72.38, industries: 'Chemicals, pharma, textiles' },
  { nodeId: 'CL-HYD', name: 'Hyderabad', state: 'Telangana', sites: 11, euMW: 106, flexMW: 7.2, priority: 5, status: 'LIVE', lat: 17.39, lng: 78.49, industries: 'Pharma, electronics, aerospace' },
  { nodeId: 'CL-NCR', name: 'Noida–Gurugram', state: 'Delhi NCR', sites: 9, euMW: 84, flexMW: 5.1, priority: 6, status: 'RAMPING', lat: 28.47, lng: 77.50, industries: 'EMS, mobile, data centres' },
  { nodeId: 'CL-CBE', name: 'Coimbatore–Tiruppur', state: 'Tamil Nadu', sites: 7, euMW: 52, flexMW: 3.1, priority: 7, status: 'RAMPING', lat: 11.02, lng: 76.96, industries: 'Textiles, pumps, foundries' },
  { nodeId: 'CL-JMS', name: 'Jamshedpur–Kolkata', state: 'Jharkhand / West Bengal', sites: 4, euMW: 21, flexMW: 0.9, priority: 8, status: 'PILOT', lat: 22.80, lng: 86.20, industries: 'Metals, heavy engineering' },
  { nodeId: 'CL-IND', name: 'Indore–Pithampur', state: 'Madhya Pradesh', sites: 2, euMW: 12, flexMW: 0.3, priority: 9, status: 'PILOT', lat: 22.72, lng: 75.86, industries: 'Auto, pharma' },
  { nodeId: 'CL-KOC', name: 'Kochi–Ernakulam', state: 'Kerala', sites: 1, euMW: 4, flexMW: 0.1, priority: 10, status: 'PILOT', lat: 9.93, lng: 76.27, industries: 'Rubber, food processing' },
];
const network = {
  meta: meta('Industrial cluster network — cluster-first expansion model'),
  totals: {
    sites: NETWORK_NODES.reduce((s, n) => s + n.sites, 0),
    euMW: NETWORK_NODES.reduce((s, n) => s + n.euMW, 0),
    flexMW: round(NETWORK_NODES.reduce((s, n) => s + n.flexMW, 0), 1),
  },
  nodes: NETWORK_NODES,
  links: [
    ['CL-BLR-HSR', 'CL-CHN-SPD'], ['CL-BLR-HSR', 'CL-CBE'], ['CL-CHN-SPD', 'CL-CBE'],
    ['CL-BLR-HSR', 'CL-HYD'], ['CL-HYD', 'CL-PUN-CHK'], ['CL-PUN-CHK', 'CL-AHM-SND'],
    ['CL-AHM-SND', 'CL-NCR'], ['CL-NCR', 'CL-JMS'], ['CL-PUN-CHK', 'CL-IND'],
    ['CL-IND', 'CL-AHM-SND'], ['CL-CBE', 'CL-KOC'], ['CL-JMS', 'CL-HYD'],
  ].map(([a, b]) => ({ from: a, to: b })),
};

/* ---------- audit trail ---------- */
const audit = { meta: meta('Immutable command audit trail'), entries: [] };
const ACTORS = ['NEXUS AGENT', 'NEXUS AGENT', 'NEXUS AGENT', 'R. Iyer (Plant Head)', 'S. Menon (Electrical Head)', 'A. Kulkarni (Energy Manager)'];
const COMMANDS = ['SETPOINT_WRITE', 'DISPATCH_BESS', 'SCHEDULE_CHANGE', 'ENVELOPE_UPDATE', 'MODE_CHANGE', 'TIER_CHANGE', 'REJECT_WRITE', 'KILL_SWITCH_TEST'];
for (let i = 0; i < 20; i++) {
  const site = SITES[i % SITES.length];
  const siteAssets = assets.assets.filter((x) => x.siteId === site.siteId && x.controllable);
  const target = siteAssets[Math.floor(r() * siteAssets.length)];
  const cmd = COMMANDS[Math.floor(r() * COMMANDS.length)];
  const rejected = cmd === 'REJECT_WRITE';
  audit.entries.push({
    auditId: `AUD-${String(5000 + i)}`,
    minuteOfDay: Math.floor(r() * 1440),
    actor: ACTORS[Math.floor(r() * ACTORS.length)],
    siteId: site.siteId, siteName: site.name,
    assetId: target.assetId, assetName: target.name,
    command: cmd,
    reason: rejected ? 'Instruction fell outside the signed safety envelope' : 'Optimiser plan step within signed envelope',
    expectedValueINR: rejected ? 0 : Math.round(2000 + r() * 48000),
    result: rejected ? 'REJECTED AT EDGE' : 'ACCEPTED',
    approval: target.tier === 1 ? 'HUMAN' : target.tier === 2 ? 'ENVELOPE' : 'STANDING',
    status: rejected ? 'BLOCKED' : 'COMPLETE',
  });
}

/* ---------- transactions (verified savings ledger) ---------- */
const transactions = { meta: meta('Verified savings ledger — M&V settled'), entries: [] };
for (let i = 0; i < 20; i++) {
  const site = SITES[i % SITES.length];
  const gross = Math.round(180000 + r() * 940000);
  transactions.entries.push({
    txnId: `TXN-${String(6000 + i)}`,
    siteId: site.siteId, siteName: site.name,
    period: `2026-${String(1 + (i % 8)).padStart(2, '0')}`,
    category: ['Peak shaving', 'Solar self-consumption', 'Tariff arbitrage', 'Efficiency', 'Power factor', 'Flexibility revenue'][Math.floor(r() * 6)],
    grossSavingINR: gross,
    verificationMethod: ['IPMVP Option C', 'IPMVP Option B', 'IPMVP Option A'][Math.floor(r() * 3)],
    verifiedSavingINR: Math.round(gross * (0.82 + r() * 0.16)),
    nexusFeeINR: Math.round(gross * 0.18),
    status: r() > 0.25 ? 'VERIFIED' : 'PENDING M&V',
  });
}

/* ---------- flexibility ---------- */
const flexibility = {
  meta: meta('Flexibility portfolio — certified, committed and reserved capacity'),
  totalMW: 78,
  availableMW: 42,
  committedMW: 18,
  reservedMW: 18,
  breakdown: [
    { source: 'BESS', mw: 28.4, responseSeconds: 2, durationMin: 120, certainty: 'FIRM', tier: 2 },
    { source: 'HVAC', mw: 14.2, responseSeconds: 60, durationMin: 90, certainty: 'FIRM', tier: 2 },
    { source: 'Chiller', mw: 11.8, responseSeconds: 120, durationMin: 60, certainty: 'FIRM', tier: 2 },
    { source: 'Compressor', mw: 8.1, responseSeconds: 90, durationMin: 45, certainty: 'PROBABLE', tier: 2 },
    { source: 'EV charging', mw: 6.4, responseSeconds: 30, durationMin: 180, certainty: 'FIRM', tier: 3 },
    { source: 'Thermal storage', mw: 5.6, responseSeconds: 300, durationMin: 240, certainty: 'PROBABLE', tier: 2 },
    { source: 'Production', mw: 3.5, responseSeconds: 1800, durationMin: 120, certainty: 'HUMAN APPROVAL', tier: 1 },
  ],
  events: Array.from({ length: 8 }, (_, i) => ({
    eventId: `FLX-${7000 + i}`,
    minuteOfDay: 60 * (7 + i * 2),
    requestedMW: round(1.2 + r() * 3.4, 2),
    deliveredMW: round(1.1 + r() * 3.3, 2),
    priceINRPerKWh: round(3.4 + r() * 3.2, 2),
    durationMin: [30, 60, 120][Math.floor(r() * 3)],
    status: ['DELIVERED', 'DELIVERED', 'PARTIAL', 'SCHEDULED'][Math.floor(r() * 4)],
    regime: 'PILOT',
  })),
};

/* ---------- sites.json (with derived live values) ---------- */
const sites = {
  meta: meta('Industrial sites under management (8 flagship sites of 108 in the estate)'),
  estate: { totalSites: 108, euMW: 1150, managedTWh: 5.2, verifiedSavingsCr: 165, flexibilityMW: 78, renewableMW: 560 },
  sites: SITES.map((s) => {
    const series = telemetry.series[s.siteId];
    const now = 48; // canonical "current" index used for card previews
    return Object.assign({}, s, {
      currentDemandMW: series.loadMW[now],
      currentSolarMW: series.solarMW[now],
      currentGridMW: series.gridMW[now],
      dailyMWh: round(series.loadMW.reduce((a, b) => a + b, 0) * 0.25, 1),
      carbonIntensity: series.carbon[now],
    });
  }),
};

function meta(description) {
  return {
    generator: 'tools/generate-data.js',
    description,
    disclaimer: 'SIMULATED TELEMETRY — demonstration dataset. Not actual customer data.',
    version: 1,
  };
}

/* ---------- write ---------- */
const files = {
  'sites.json': sites,
  'assets.json': assets,
  'telemetry.json': telemetry,
  'forecasts.json': forecasts,
  'alerts.json': alerts,
  'agents.json': agents,
  'optimisation.json': optimisation,
  'transactions.json': transactions,
  'network.json': network,
  'flexibility.json': flexibility,
  'audit.json': audit,
  'market.json': market,
};

fs.mkdirSync(OUT, { recursive: true });
Object.entries(files).forEach(([name, payload]) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(payload, null, 1));
  const kb = (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(1);
  console.log(`  ${name.padEnd(20)} ${kb.padStart(8)} KB`);
});
console.log(`\n  ${sites.sites.length} sites · ${assets.assets.length} assets · ${alerts.alerts.length} alerts · ${agents.decisions.length} AI decisions`);
console.log(`  network: ${network.totals.sites} sites · ${network.totals.euMW} MW · ${network.totals.flexMW} MW flex`);
