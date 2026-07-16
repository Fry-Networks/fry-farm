// fry-x402 — x402 pay-per-request DePIN data API for fry.farm
// Algorand Global x402 Challenge entry. Dependency-isolated (algosdk 3.x) from the
// main fry.farm app (algosdk 2.x). Payments verify + settle via the GoPlausible
// mainnet facilitator, so leaderboard volume is tracked automatically.
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402-avm/express";
import { registerExactAvmScheme } from "@x402-avm/avm/exact/server";
import { HTTPFacilitatorClient } from "@x402-avm/core/server";
import { ALGORAND_MAINNET_CAIP2, USDC_MAINNET_ASA_ID } from "@x402-avm/avm";

const PORT = Number(process.env.PORT || 3402);
const PAY_TO = process.env.PAY_TO;
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.goplausible.xyz";
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:5000";
// Prices default here (not compose env) so no `$` interpolation headaches in YAML.
const PRICE_FLEET = process.env.PRICE_FLEET || "$0.01";
const PRICE_FARM = process.env.PRICE_FARM || "$0.008";
const PRICE_REWARDS = process.env.PRICE_REWARDS || "$0.005";

if (!PAY_TO || PAY_TO.length !== 58) {
  console.error("FATAL: PAY_TO must be a 58-char Algorand address");
  process.exit(1);
}

const app = express();

// === METRICS TRACKING ===
import fs from 'fs';

const SNAP = '/data/metrics.json';
let metrics = {
  since: new Date().toISOString(),
  perEndpoint: {
    fleet: { challenges: 0, verified: 0, settled: 0 },
    farm: { challenges: 0, verified: 0, settled: 0 },
    rewards: { challenges: 0, verified: 0, settled: 0 }
  },
  totals: { challenges: 0, verified: 0, settled: 0 }
};

if (fs.existsSync(SNAP)) {
  try {
    const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
    metrics = snap;
  } catch(e) {
    console.error('Failed to load metrics snapshot:', e.message);
  }
}

function saveSnap() {
  try {
    fs.writeFileSync(SNAP, JSON.stringify(metrics), 'utf8');
  } catch(e) {
    console.error('Failed to save metrics snapshot:', e.message);
  }
}

setInterval(saveSnap, 60000);

process.on('SIGTERM', () => {
  saveSnap();
  process.exit(0);
});

app.use((req, res, next) => {
  const original_end = res.end;
  res.end = function(...args) {
    const path = req.path;
    const status = res.statusCode;
    
    let endpoint = null;
    if (path.includes('/fleet')) endpoint = 'fleet';
    else if (path.includes('/farm')) endpoint = 'farm';
    else if (path.includes('/rewards')) endpoint = 'rewards';
    
    if (endpoint && (status === 402 || status === 200)) {
      if (status === 402) {
        metrics.perEndpoint[endpoint].challenges++;
        metrics.totals.challenges++;
      } else if (status === 200) {
        metrics.perEndpoint[endpoint].verified++;
        metrics.perEndpoint[endpoint].settled++;
        metrics.totals.verified++;
        metrics.totals.settled++;
      }
    }
    
    return original_end.apply(res, args);
  };
  next();
});

app.get('/_metrics', (req, res) => {
  const token = req.headers['x-metrics-token'];
  if (token !== process.env.METRICS_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.json({ since: metrics.since, perEndpoint: metrics.perEndpoint, totals: metrics.totals });
});
// === END METRICS ===

app.disable("x-powered-by");

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);
registerExactAvmScheme(server);

const accept = (price, description) => ({
  accepts: {
    scheme: "exact",
    network: ALGORAND_MAINNET_CAIP2,
    payTo: PAY_TO,
    price,
    extra: { asset: USDC_MAINNET_ASA_ID },
  },
  description,
});

const routes = {
  "GET /fleet": accept(PRICE_FLEET, "Live Fry Networks DePIN device-staking pool telemetry (aggregated)"),
  "GET /farm": accept(PRICE_FARM, "fry.farm farming/pool analytics — pools, TVL proxies, positions"),
  "GET /rewards": accept(PRICE_REWARDS, "FRY reward emission status, daily budget, and leaderboard"),
};

// ---- FREE surfaces (declared before the payment gate; the gate only matches routes above) ----
const CATALOG = [
  { path: "/x402/fleet", price: PRICE_FLEET, data: "DePIN device-staking pool telemetry" },
  { path: "/x402/farm", price: PRICE_FARM, data: "farming/pool analytics (pools, TVL, positions)" },
  { path: "/x402/rewards", price: PRICE_REWARDS, data: "FRY reward emission, daily budget, leaderboard" },
];

app.get("/health", (_req, res) => res.json({ status: "ok", service: "fry-x402" }));

app.get("/", (req, res) => {
  const discovery = {
    service: "fry.farm x402 DePIN Data API",
    description:
      "Per-request access to live Fry Networks DePIN telemetry and fry.farm DeFi analytics, " +
      "priced in USDC and settled through the GoPlausible facilitator on Algorand mainnet. " +
      "No API keys — pay per call. Built for humans and autonomous AI agents.",
    network: "algorand-mainnet",
    asset: { name: "USDC", id: USDC_MAINNET_ASA_ID, decimals: 6 },
    payTo: PAY_TO,
    facilitator: FACILITATOR_URL,
    protocol: "x402",
    endpoints: CATALOG,
  };
  if ((req.headers.accept || "").includes("application/json")) return res.json(discovery);
  const rows = CATALOG.map(
    (e) => `<tr><td><code>${e.path}</code></td><td>${e.price} USDC</td><td>${e.data}</td></tr>`
  ).join("");
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>fry.farm x402 DePIN Data API</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b0e14;color:#e6edf3;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:48px 22px}
h1{font-size:1.9rem;margin:0 0 .2em;background:linear-gradient(90deg,#7cf,#4ade80);-webkit-background-clip:text;background-clip:text;color:transparent}
.tag{color:#8b98a5;margin:0 0 1.6em}
table{width:100%;border-collapse:collapse;margin:1.4em 0}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #1c2230}
th{color:#8b98a5;font-weight:600;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}
code{background:#161b26;padding:2px 7px;border-radius:5px;color:#9ece6a;font-size:.92em}
.card{background:#11161f;border:1px solid #1c2230;border-radius:12px;padding:20px 22px;margin:1.2em 0}
.mut{color:#8b98a5;font-size:.9rem}
a{color:#7cf}
pre{background:#0d1119;border:1px solid #1c2230;border-radius:10px;padding:14px;overflow:auto;font-size:.86rem;color:#c9d3df}
.pill{display:inline-block;background:#132a1c;color:#4ade80;border:1px solid #1f5133;border-radius:999px;padding:2px 10px;font-size:.78rem;margin-bottom:14px}
</style></head><body><div class="wrap">
<div class="pill">Algorand mainnet · x402 · GoPlausible facilitator</div>
<h1>fry.farm x402 DePIN Data API</h1>
<p class="tag">Pay-per-request access to Fry Networks DePIN telemetry &amp; fry.farm DeFi analytics — priced in USDC, no API keys, built for AI agents.</p>
<table><thead><tr><th>Endpoint</th><th>Price</th><th>Returns</th></tr></thead><tbody>${rows}</tbody></table>
<div class="card"><strong>How it works</strong>
<p class="mut">Request a paid endpoint with no payment → you get <code>HTTP 402</code> with the payment requirements (USDC amount, payTo, facilitator). Your client builds and signs a USDC transfer, resends it in the <code>PAYMENT-SIGNATURE</code> header, the facilitator verifies + settles on-chain, and you receive <code>200</code> with the data.</p>
<pre>curl -i https://fry.farm/x402/fleet
# → 402 Payment Required + payment requirements JSON
# pay via x402 client, then:
curl -H "PAYMENT-SIGNATURE: &lt;base64&gt;" https://fry.farm/x402/fleet
# → 200 + live telemetry</pre></div>
<p class="mut">Receiving address (payTo): <code>${PAY_TO}</code><br>Facilitator: <a href="${FACILITATOR_URL}">${FACILITATOR_URL}</a><br>USDC ASA: <code>${USDC_MAINNET_ASA_ID}</code></p>
<p class="mut">Machine-readable discovery: <code>GET /x402/</code> with <code>Accept: application/json</code>.</p>
</div></body></html>`);
});

// ---- PAYMENT GATE (only intercepts the routes map above) ----
app.use(paymentMiddleware(routes, server));

// ---- PAID handlers: read-only aggregation of internal fry.farm backend data ----
async function bfetch(path, timeoutMs = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BACKEND_URL + path, {
      headers: { accept: "application/json" },
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`upstream ${path} -> ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

app.get("/fleet", async (_req, res) => {
  try {
    const pools = await bfetch("/devicestaking/all");
    const arr = Array.isArray(pools?.data) ? pools.data : [];
    res.json({
      resource: "fleet",
      generatedAt: new Date().toISOString(),
      source: "fry.farm",
      network: "Fry Networks DePIN",
      poolCount: arr.length,
      pools: arr,
    });
  } catch (e) {
    res.status(502).json({ error: "upstream_unavailable", detail: String(e.message || e) });
  }
});

app.get("/farm", async (_req, res) => {
  try {
    const [farming, farmTokens] = await Promise.all([
      bfetch("/farming/all").catch(() => ({ data: [] })),
      bfetch("/stakingfarmingtoken/pool").catch(() => ({ data: [] })),
    ]);
    const f = Array.isArray(farming?.data) ? farming.data : [];
    const ft = Array.isArray(farmTokens?.data) ? farmTokens.data : [];
    res.json({
      resource: "farm",
      generatedAt: new Date().toISOString(),
      source: "fry.farm",
      farmingPoolCount: f.length,
      farmTokenPoolCount: ft.length,
      farmingPools: f,
      farmTokenPools: ft,
    });
  } catch (e) {
    res.status(502).json({ error: "upstream_unavailable", detail: String(e.message || e) });
  }
});

app.get("/rewards", async (_req, res) => {
  try {
    const [budget, leaderboard] = await Promise.all([
      bfetch("/rewards/daily-budget").catch(() => ({ data: null })),
      bfetch("/rewards/leaderboard").catch(() => ({ data: null })),
    ]);
    res.json({
      resource: "rewards",
      generatedAt: new Date().toISOString(),
      source: "fry.farm",
      token: "FRY",
      dailyBudget: budget?.data ?? budget ?? null,
      leaderboard: leaderboard?.data ?? leaderboard ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: "upstream_unavailable", detail: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`fry-x402 listening on :${PORT} | payTo=${PAY_TO} | facilitator=${FACILITATOR_URL}`);
});
