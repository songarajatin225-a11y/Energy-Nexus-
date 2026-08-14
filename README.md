# Energy Nexus

**The Intelligence Layer for Industrial Energy**
Connect. Predict. Optimise. Orchestrate.

Energy Nexus OS is an industrial energy operating system: it connects every energy-producing and
energy-consuming asset on a plant into one model, forecasts what happens next, continuously
optimises generation, storage and consumption, and acts only inside a safety envelope the customer
has signed.

This repository contains a **fully interactive front-end prototype** of that platform — 20 screens,
80 connected assets across 8 industrial sites, a live AI agent, a working optimisation studio and a
cluster network map. It runs as a static site with no backend.

> **Prototype disclaimer.** Every value in this repository is simulated from a deterministic
> generator. No screen shows real customer data, no control path reaches real plant equipment, and
> no market record settles real money. Capabilities that depend on regulatory change are labelled
> `SIMULATION`, `PILOT` or `REGULATION DEPENDENT` throughout the interface.

---

## Product vision

The platform answers five questions at all times, and every screen resolves to one of them:

| # | Question | Where it is answered |
|---|----------|----------------------|
| 1 | What is happening? | Command Center, Digital Twin, Assets |
| 2 | Why is it happening? | Nexus Intelligence |
| 3 | What should happen next? | Optimisation Studio, Forecasts |
| 4 | What is the value? | Analytics, Reports |
| 5 | Is it safe? | Safety Centre, Command Audit |

The company climbs a ladder in which each rung is independently saleable and generates the data,
trust and installed base the next one requires. It does **not** attempt the energy internet on day
one.

---

## Architecture

The interface is deliberately **beautiful on the surface and brutally simple underneath**: a premium
design system over plain static files, with no framework, no build step and no runtime dependency.

```
Energy assets → Energy data layer → Digital twin → Forecasting → Optimisation
   → Nexus intelligence → AI energy agent → Safe action → Verified savings
   → Flexibility → Industrial clusters → Energy network → Energy internet
```

**Runtime model.** Each page ships a thin `<main>`; `js/app.js` injects the shared sidebar and
topbar around it on `DOMContentLoaded`, then dispatches `enx:ready`. Page modules listen for that
event, load the datasets they need through `js/data.js`, and render. Demo mode broadcasts `enx:tick`
every three seconds; site changes broadcast `enx:sitechange`; theme changes broadcast `enx:theme`.
Charts and maps re-render on all three.

**Modules**

| File | Responsibility |
|------|----------------|
| `js/router.js` | Navigation model and the inline icon set |
| `js/data.js` | Centralised JSON loading, caching and cross-dataset selectors |
| `js/app.js` | Shell, theme, demo clock, state, formatting, toast/modal/drawer, CSV export |
| `js/charts.js` | Hand-built SVG chart engine: line, area, band, bar, donut, gauge, heatmap, waterfall, sparkline |
| `js/twin.js` | Single-line topology renderer and the asset inspector drawer |
| `js/network.js` | India cluster map — shared projection for outline and nodes, with label collision resolution |
| `js/<page>.js` | One module per screen |

---

## Technology stack

- **HTML5**, **CSS3** (custom properties, grid, flexbox), **vanilla JavaScript (ES6+)**
- **SVG** for every chart, the topology and the network map — no canvas, no chart library
- **JSON** as the demo data layer
- **No** React, Vue, Angular, Next.js, jQuery, D3, Chart.js or any runtime dependency
- **No build step.** What is in the repository is what runs in the browser.

**Fonts** use a system stack that prefers Inter / IBM Plex Sans if installed and falls back to
`system-ui`. Monospaced telemetry prefers IBM Plex Mono / JetBrains Mono. This is a deliberate
trade: no external font request means nothing to block, nothing to fail offline, and no
render-blocking round trip.

---

## Folder structure

```
energy-nexus/
├── index.html              Public landing page
├── dashboard.html          Energy Command Center
├── sites.html              Site network (cards + table)
├── site-detail.html        Single-site deep dive (?site=ENX-HSR-001)
├── assets.html             Estate-wide asset register
├── digital-twin.html       Site model, topology, constraint register
├── agent.html              Nexus Intelligence — decision queue and autonomy
├── optimisation.html       Optimisation Studio with simulation
├── forecasts.html          7-day forecasts with confidence bands
├── flexibility.html        Flexibility Command and dispatch simulation
├── marketplace.html        Nexus Market (simulated)
├── network.html            Industrial cluster network map
├── energy-internet.html    Long-term vision and roadmap
├── analytics.html          Energy intelligence, savings engine, benchmarking
├── reports.html            Report catalogue and savings ledger
├── safety.html             Safety centre and command audit
├── settings.html           Appearance, demo mode, integrations
├── onboarding.html         Seven-step commissioning wizard
├── help.html               Screen guide and interface conventions
├── 404.html                Not-found page
│
├── css/    theme · main · components · dashboard · charts · responsive
├── js/     app · router · data · charts · twin · network + one module per page
├── data/   sites · assets · telemetry · forecasts · alerts · agents
│           optimisation · transactions · network · flexibility · audit · market
├── assets/ logo.svg · logo-mark.svg · favicon.svg
├── tools/  generate-data.js
└── README.md
```

---

## Running locally

The app fetches JSON, so it needs a web server — opening `index.html` over `file://` will fail CORS
(the interface detects this and says so rather than showing a blank screen).

```bash
# any one of these
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

Then open <http://localhost:8000>.

---

## GitHub Pages deployment

The repository is deployment-ready as-is:

1. **Settings → Pages → Source:** deploy from branch, folder `/ (root)`.
2. Open `https://<user>.github.io/<repo>/`.

Everything uses relative paths, there are no absolute filesystem references and no localhost URLs.
A `.nojekyll` file is included so Jekyll does not reprocess the assets, and `404.html` is served for
unknown routes.

---

## Demo mode

Demo mode is on by default and is what makes the prototype feel live:

- The telemetry cursor advances one 15-minute step roughly every twelve seconds
- Energy flow animation, topology values and the telemetry ribbon update
- KPI counters, the energy profile chart and the agent panel re-render
- Network nodes pulse; the LIVE indicator breathes

A persistent amber banner reads **SIMULATED TELEMETRY** whenever it is active. Turning it off holds
every value at its last reading. The toggle lives in the topbar and in Settings.

---

## Data model

All datasets are generated deterministically by `tools/generate-data.js` — a seeded PRNG means
regeneration is byte-identical:

```bash
node tools/generate-data.js
```

Telemetry is stored **indexed by minute-of-day rather than absolute timestamps**, so the demo always
renders as "today" without regeneration.

| Dataset | Contents |
|---------|----------|
| `sites.json` | 8 flagship sites (of a 108-site estate) with estate totals |
| `assets.json` | 80 assets across 11 categories, with per-type telemetry |
| `telemetry.json` | 24 h at 15-minute resolution × 12 series, plus a 30-day daily rollup |
| `forecasts.json` | 168-hour load, solar, price and SoC forecasts with P10/P50/P90 bands |
| `alerts.json` | 20 alerts with severity, recommendation and financial impact |
| `agents.json` | 15 AI decisions with rationale, constraints and counterfactual |
| `optimisation.json` | 20 optimisation runs with before/after energy mix |
| `flexibility.json` | Capacity breakdown by source and 8 dispatch events |
| `market.json` | 20 simulated market records, each labelled with its regulatory regime |
| `network.json` | 10 industrial clusters and their coordination links |
| `transactions.json` | 20 verified-savings ledger entries with M&V method |
| `audit.json` | 20 immutable command-audit entries |

IDs are consistent across every dataset (`ENX-HSR-001` → `ENX-HSR-001-BESS-003`), so the whole OS
renders from one unified energy model. Site energy balances: grid + solar + battery ≈ measured load
at every interval.

---

## Roadmap

| Version | Capability | Horizon |
|---------|-----------|---------|
| V1 | Monitoring | M1–M6 |
| V2 | Forecasting | M4–M12 |
| V3 | Optimisation | M9–M18 |
| V4 | AI Energy Agent | M15–M26 |
| V5 | Multi-site Orchestration | M22–M32 |
| V6 | Energy Router | Y3–Y6 |
| V7 | Flexibility Marketplace | M26–Y5 |
| V8 | Multi-energy Marketplace | Y5+ |
| V9 | Energy Internet | Y5–Y10 |

The Energy Router and flexibility-aggregation tracks run in parallel from roughly month 26.

---

## Safety model

Autonomy is earned per asset class, never granted at commissioning. Every deployment starts at
Tier 1 without exception.

- **Tier 1 — human in the loop.** Recommends with rationale and quantified value; a human executes.
- **Tier 2 — semi-autonomous.** Executes inside a signed envelope, escalates anything outside it.
- **Tier 3 — fully autonomous.** Executes freely inside the envelope; humans set objectives only.

**Two decisions never become autonomous at any tier:** diesel dispatch (statutory and consent
exposure) and regulated energy transactions (counterparty and settlement liability). Both remain
recommend-and-approve for the life of the product.

Enforcement is layered: the constraint register is signed at commissioning and applied independently
in the optimiser, in the edge controller and in physical interlocks. Write access needs a two-key
ceremony. The edge rejects any cloud instruction outside the envelope. Loss of connectivity holds
the last valid schedule, then reverts to native controllers. A kill switch exists in software and in
hardware.

---

## Accessibility

- Semantic HTML with landmarks, a skip link and correct heading order
- Full keyboard navigation; topology and map nodes are focusable and activate on Enter/Space
- Visible focus rings everywhere; focus is trapped in modals and restored on close
- ARIA labels on icon buttons, charts, selects and live regions
- Colour is never the only signal — status carries an icon, a label and a shape
- `prefers-reduced-motion` respected, with a manual override in Settings
- `/` focuses global search; `Esc` closes any overlay

---

## Performance

- No external requests: no CDN, no web fonts, no analytics, no tracking
- Total JS is roughly 120 KB unminified across 25 modules; CSS roughly 60 KB
- Charts render into sized SVG and re-render only on resize, theme change or data tick
- Datasets are fetched once per session and cached in memory
- Zero console errors across all 20 screens

---

## Limitations

This is a front-end prototype, and the boundaries matter:

- **No backend, no persistence.** Preferences live in `localStorage`; approvals and applied plans
  reset on reload.
- **No real telemetry.** Nothing connects to a meter, gateway, SCADA system or plant network.
- **The optimiser is illustrative.** It applies weighted heuristics against the constraint list, not
  a real solver. A production system would run a constrained optimisation against the twin.
- **Forecasts are pre-generated**, not produced by a trained model. The MAPE figures are plausible
  targets, not measured results.
- **Reports export CSV, not rendered PDF.**
- **The market does not clear.** Every record is simulated and labelled with the regime it would
  require.
- **The India map is simplified geometry** for cluster orientation, not a survey boundary.
- **Financial figures are modelled** from the business case, including the Year-3 base case of
  1,150 MW under management and 78 MW of flexibility.

---

## Credits

Built as a design and engineering prototype for the Energy Nexus industrial energy OS concept.
Product strategy, staged roadmap, autonomy tiers and safety architecture derive from the underlying
Industrial Energy OS business case.
