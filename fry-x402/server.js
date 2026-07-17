// fry-x402 — x402 pay-per-request API for fry.farm
// Algorand Global x402 Challenge entry. Dependency-isolated (algosdk 3.x) from the
// main fry.farm app (algosdk 2.x). Payments verify + settle via the GoPlausible
// mainnet facilitator, so leaderboard volume is tracked automatically.
//
// v2 (agentic): in addition to the read-only analytics endpoints (fleet/farm/rewards),
// this server exposes PAID transaction-BUILDER endpoints that return correctly
// constructed UNSIGNED atomic groups. Agents sign with their OWN wallet (no custody),
// then submit via the generic /actions/submit and poll /actions/status. A free
// /catalog describes every action so an agent can complete the journey unassisted.
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402-avm/express";
import { registerExactAvmScheme } from "@x402-avm/avm/exact/server";
import { HTTPFacilitatorClient } from "@x402-avm/core/server";
import { ALGORAND_MAINNET_CAIP2, USDC_MAINNET_ASA_ID } from "@x402-avm/avm";
import { declareDiscoveryExtension } from "@x402-avm/extensions/bazaar";
import algosdk from "algosdk";
import fs from "fs";

const PORT = Number(process.env.PORT || 3402);
const PAY_TO = process.env.PAY_TO;
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.goplausible.xyz";
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:5000";
// Prices default here (not compose env) so no `$` interpolation headaches in YAML.
const PRICE_FLEET = process.env.PRICE_FLEET || "$0.01";
const PRICE_FARM = process.env.PRICE_FARM || "$0.008";
const PRICE_REWARDS = process.env.PRICE_REWARDS || "$0.005";
// Agentic action pricing (USDC).
const PRICE_BUILD = process.env.PRICE_BUILD || "$0.01";
const PRICE_SUBMIT = process.env.PRICE_SUBMIT || "$0.005";
const PRICE_STATUS = process.env.PRICE_STATUS || "$0.001";

// Algod: ATLAS primary (token via env, never committed), Nodely public fallback.
const ALGOD_TOKEN = process.env.ALGOD_TOKEN || "";
const ATLAS_ALGOD_URL = process.env.ATLAS_ALGOD_URL || "http://100.69.195.100:8190";
const NODELY_ALGOD_URL = process.env.NODELY_ALGOD_URL || "https://mainnet-api.4160.nodely.dev";

// On-chain constants (mainnet) — ported from the fry.farm frontend (read-only reference).
const USDC_ASA = 31566704;
const FRY_ASA = 2485314946;
const GENESIS_APP_ID = 3636406117;
const GENESIS_TREASURY = PAY_TO; // genesis app treasury == payTo wallet
const P2P_APP_ID = 3495625484;
const P2P_OFFER_ASSET = FRY_ASA; // FRY -> ALGO market
const P2P_BOX_MBR = 47300;
const P2P_FEE_CREATE = 2000, P2P_FEE_ACCEPT = 5000, P2P_FEE_CANCEL = 2000;
const STAKE_BOX_PRICE = 2500 + 400 * 64; // 28100
const ZERO_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

if (!PAY_TO || PAY_TO.length !== 58) {
  console.error("FATAL: PAY_TO must be a 58-char Algorand address");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "256kb" }));

// === METRICS TRACKING (additive; generic perEndpoint keys) ===
const SNAP = "/data/metrics.json";
let metrics = {
  since: new Date().toISOString(),
  perEndpoint: {
    fleet: { challenges: 0, verified: 0, settled: 0 },
    farm: { challenges: 0, verified: 0, settled: 0 },
    rewards: { challenges: 0, verified: 0, settled: 0 },
  },
  totals: { challenges: 0, verified: 0, settled: 0 },
};

if (fs.existsSync(SNAP)) {
  try {
    metrics = JSON.parse(fs.readFileSync(SNAP, "utf8"));
    if (!metrics.perEndpoint) metrics.perEndpoint = {};
    if (!metrics.totals) metrics.totals = { challenges: 0, verified: 0, settled: 0 };
  } catch (e) {
    console.error("Failed to load metrics snapshot:", e.message);
  }
}

function saveSnap() {
  try { fs.writeFileSync(SNAP, JSON.stringify(metrics), "utf8"); }
  catch (e) { console.error("Failed to save metrics snapshot:", e.message); }
}
setInterval(saveSnap, 60000);
process.on("SIGTERM", () => { saveSnap(); process.exit(0); });

// Map a request path to a stable metric key. Free surfaces (catalog, /, health,
// _metrics) return null and are not metered.
function metricKey(path) {
  if (path.includes("/fleet")) return "fleet";
  if (path.includes("/farm") && !path.includes("lp-farm")) return "farm";
  if (path.includes("/rewards")) return "rewards";
  const m = path.match(/\/actions\/([a-zA-Z0-9/_-]+)/);
  if (m) return "action_" + m[1].replace(/\/build$/, "").replace(/[/]+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  return null;
}

app.use((req, res, next) => {
  const original_end = res.end;
  res.end = function (...args) {
    try {
      const key = metricKey(req.path);
      const status = res.statusCode;
      if (key && (status === 402 || status === 200)) {
        if (!metrics.perEndpoint[key]) metrics.perEndpoint[key] = { challenges: 0, verified: 0, settled: 0 };
        if (status === 402) { metrics.perEndpoint[key].challenges++; metrics.totals.challenges++; }
        else if (status === 200) {
          metrics.perEndpoint[key].verified++; metrics.perEndpoint[key].settled++;
          metrics.totals.verified++; metrics.totals.settled++;
        }
      }
    } catch (_e) { /* never break the response on metrics */ }
    return original_end.apply(res, args);
  };
  next();
});

app.get("/_metrics", (req, res) => {
  const token = req.headers["x-metrics-token"];
  if (token !== process.env.METRICS_TOKEN) return res.status(401).json({ error: "unauthorized" });
  res.json({ since: metrics.since, perEndpoint: metrics.perEndpoint, totals: metrics.totals });
});
// === END METRICS ===

app.disable("x-powered-by");

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);
registerExactAvmScheme(server);

// Public URL base for 402 resource fields. The edge (Bunny -> nginx) strips the
// /x402 prefix and terminates TLS, so req-derived URLs come out as
// http://fry.farm/<path> — resource must be pinned explicitly per route.
const PUBLIC_X402_BASE = process.env.PUBLIC_X402_BASE || "https://fry.farm/x402";

// Bazaar discovery input schema derived from a builder's params doc (same data as /catalog).
function paramDiscovery(params = {}) {
  const properties = {};
  for (const [k, d] of Object.entries(params)) {
    const doc = String(d);
    const type = /string\[\]/.test(doc) ? "array" : /uint64/.test(doc) ? "integer" : "string";
    properties[k] = type === "array" ? { type, items: { type: "string" }, description: doc } : { type, description: doc };
  }
  const required = Object.keys(params).filter((k) => !/optional/i.test(String(params[k])));
  return { properties, required };
}

// Example request body satisfying paramDiscovery's required fields (schema-valid placeholder values).
function exampleFromParams(params = {}) {
  const body = {};
  for (const [k, d] of Object.entries(params)) {
    const doc = String(d);
    if (/optional/i.test(doc)) continue;
    body[k] = /string\[\]/.test(doc) ? ["<base64>"] : /uint64/.test(doc) ? 0 : /address/.test(doc) ? "<algorand address>" : "<string>";
  }
  return body;
}

const accept = (price, description, publicPath, discovery) => ({
  accepts: {
    scheme: "exact",
    network: ALGORAND_MAINNET_CAIP2,
    payTo: PAY_TO,
    price,
    extra: { asset: USDC_MAINNET_ASA_ID },
  },
  description,
  ...(publicPath ? { resource: PUBLIC_X402_BASE + publicPath } : {}),
  ...(discovery ? { extensions: declareDiscoveryExtension(discovery) } : {}),
});

// ---------------------------------------------------------------------------
// Algod helpers — ATLAS primary (token), Nodely fallback. Per-call failover.
// ---------------------------------------------------------------------------
const emptySigner = algosdk.makeEmptyTransactionSigner();

async function algodTargets() {
  return [
    { name: "atlas", token: ALGOD_TOKEN ? { "X-Algo-API-Token": ALGOD_TOKEN } : "", url: ATLAS_ALGOD_URL },
    { name: "nodely", token: "", url: NODELY_ALGOD_URL },
  ];
}

// Run an operation against a fresh Algodv2, failing over ATLAS -> Nodely.
async function withAlgod(op) {
  const targets = await algodTargets();
  let lastErr;
  for (const t of targets) {
    try {
      const client = new algosdk.Algodv2(t.token, t.url, "");
      const out = await op(client);
      return { out, source: t.name };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("no algod reachable");
}

// Raw REST GET against algod, ATLAS -> Nodely, returns parsed JSON + source.
async function algodGet(path) {
  const targets = await algodTargets();
  let lastErr;
  for (const t of targets) {
    try {
      const headers = { accept: "application/json" };
      if (ALGOD_TOKEN && t.name === "atlas") headers["X-Algo-API-Token"] = ALGOD_TOKEN;
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(t.url + path, { headers, signal: ctl.signal }).finally(() => clearTimeout(to));
      if (!r.ok) throw new Error(`${t.name} ${path} -> ${r.status}`);
      return { json: await r.json(), source: t.name };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("algod unreachable");
}

async function suggestedParams() {
  const { out, source } = await withAlgod((c) => c.getTransactionParams().do());
  return { sp: out, source };
}

function flatSp(sp, fee) {
  const s = { ...sp };
  s.fee = BigInt(fee);
  s.flatFee = true;
  return s;
}

// Decode application global state into { key: number|Buffer }.
async function appGlobalState(appId) {
  const { json, source } = await algodGet(`/v2/applications/${appId}`);
  const gs = {};
  const raw = json?.params?.["global-state"] || [];
  for (const kv of raw) {
    const key = Buffer.from(kv.key, "base64").toString("utf8");
    if (kv.value.type === 2) gs[key] = Number(kv.value.uint);
    else gs[key] = Buffer.from(kv.value.bytes || "", "base64");
  }
  return { gs, appState: json, source };
}

function firstNum(gs, names, dflt) {
  for (const n of names) if (typeof gs[n] === "number") return gs[n];
  return dflt;
}

function b64Group(atc) {
  const group = atc.buildGroup(); // assigns group id
  return group.map((g) => Buffer.from(algosdk.encodeUnsignedTransaction(g.txn)).toString("base64"));
}

function appAddr(id) {
  const a = algosdk.getApplicationAddress(id);
  return typeof a === "string" ? a : a.toString();
}

function uint64BE(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return new Uint8Array(b);
}

// ---------------------------------------------------------------------------
// Action registry — one place defining every builder's price, params, group
// shape and handler. Drives both the payment routes map and the free /catalog.
// ---------------------------------------------------------------------------
const NETWORK_CAIP2 = ALGORAND_MAINNET_CAIP2;
const X402_META = {
  scheme: "exact",
  network: NETWORK_CAIP2,
  asset: String(USDC_MAINNET_ASA_ID),
  payTo: PAY_TO,
  maxTimeoutSeconds: 300,
  facilitator: FACILITATOR_URL,
  x402Version: 2,
};

function priceToAtomic(p) {
  const usd = Number(String(p).replace("$", ""));
  return Math.round(usd * 1e6);
}

function reqAddr(v, field) {
  if (typeof v !== "string" || !algosdk.isValidAddress(v)) throw new Error(`invalid or missing '${field}' (Algorand address)`);
  return v;
}
function reqPosInt(v, field) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error(`invalid or missing '${field}' (non-negative integer)`);
  return n;
}

const builders = {
  // ---- STAKING (FryStaking V3) ----
  "staking/stake": {
    price: PRICE_BUILD,
    summary: "Build a FryStaking V3 stake group (box MBR pay + stake pay + stake axfer + stakeTokens app call).",
    params: { sender: "address (agent wallet)", stakingId: "uint64 pool app id", stakeAmount: "uint64 (base units)", stakeTokenId: "uint64 (0=native ALGO; optional, read from pool if omitted)", updatedApr: "uint64 optional (computed from pool state if omitted)" },
    returns: "4-txn group: [pay boxMBR->app, stakePay->app, stakeAxfer->app, appl stakeTokens(uint64,uint64,pay,axfer,pay)].",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const stakingId = reqPosInt(b.stakingId, "stakingId");
      const stakeAmount = reqPosInt(b.stakeAmount, "stakeAmount");
      const { sp, source } = await suggestedParams();
      const { gs } = await appGlobalState(stakingId);
      const stakeTokenId = b.stakeTokenId !== undefined ? reqPosInt(b.stakeTokenId, "stakeTokenId")
        : firstNum(gs, ["stake_token", "stakeToken"], 0);
      const rewardTokenId = firstNum(gs, ["reward_token", "rewardToken"], FRY_ASA);
      const rewardAmt = firstNum(gs, ["reward_token_amount", "rewardTokenAmount"], 0);
      const totalStaked = firstNum(gs, ["total_staked", "totalStaked"], 0);
      const poolTime = firstNum(gs, ["pool_time", "poolTime"], 0);
      let updatedApr;
      if (b.updatedApr !== undefined) updatedApr = reqPosInt(b.updatedApr, "updatedApr");
      else {
        const apr = poolTime > 0 ? (rewardAmt / (totalStaked + stakeAmount)) * 100 * ((86400 * 360) / poolTime) : 0;
        updatedApr = Number.isFinite(apr) ? Math.floor(apr * 100) : 0;
      }
      const to = appAddr(stakingId);
      const boxTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: STAKE_BOX_PRICE, suggestedParams: sp });
      let stakePay, stakeAxfer;
      if (stakeTokenId === 0) {
        stakePay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: stakeAmount, suggestedParams: sp });
        stakeAxfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: 0, assetIndex: rewardTokenId || FRY_ASA, suggestedParams: sp });
      } else {
        stakePay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: 1000, suggestedParams: sp });
        stakeAxfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: stakeAmount, assetIndex: stakeTokenId, suggestedParams: sp });
      }
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: stakingId,
        method: algosdk.ABIMethod.fromSignature("stakeTokens(uint64,uint64,pay,axfer,pay)void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, 3000),
        methodArgs: [stakeAmount, updatedApr, { txn: stakePay, signer: emptySigner }, { txn: stakeAxfer, signer: emptySigner }, { txn: boxTx, signer: emptySigner }],
      });
      return { txnsB64: b64Group(atc), algodSource: source, computed: { stakeTokenId, updatedApr } };
    },
  },
  "staking/unstake": {
    price: PRICE_BUILD,
    summary: "Build a FryStaking V3 unstake app call (unstakeTokens(uint64,uint64)).",
    params: { sender: "address", stakingId: "uint64", unstakeAmount: "uint64 (base units)", updatedApr: "uint64 optional" },
    returns: "1-txn group: [appl unstakeTokens(unstakeAmount, updatedApr)] flat fee 0.003 ALGO.",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const stakingId = reqPosInt(b.stakingId, "stakingId");
      const unstakeAmount = reqPosInt(b.unstakeAmount, "unstakeAmount");
      const updatedApr = b.updatedApr !== undefined ? reqPosInt(b.updatedApr, "updatedApr") : 0;
      const { sp, source } = await suggestedParams();
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: stakingId, method: algosdk.ABIMethod.fromSignature("unstakeTokens(uint64,uint64)void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, 3000), methodArgs: [unstakeAmount, updatedApr],
      });
      return { txnsB64: b64Group(atc), algodSource: source };
    },
  },
  "staking/claim": {
    price: PRICE_BUILD,
    summary: "Build a FryStaking V3 reward claim (claimTokens(uint64)).",
    params: { sender: "address", stakingId: "uint64", updatedApr: "uint64 optional" },
    returns: "1-txn group: [appl claimTokens(updatedApr)] flat fee 0.002 ALGO.",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const stakingId = reqPosInt(b.stakingId, "stakingId");
      const updatedApr = b.updatedApr !== undefined ? reqPosInt(b.updatedApr, "updatedApr") : 0;
      const { sp, source } = await suggestedParams();
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: stakingId, method: algosdk.ABIMethod.fromSignature("claimTokens(uint64)void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, 2000), methodArgs: [updatedApr],
      });
      return { txnsB64: b64Group(atc), algodSource: source };
    },
  },
  // ---- LP FARMING (FryFarming) ----
  "lp-farm/stake": {
    price: PRICE_BUILD,
    summary: "Build a FryFarming LP stake group (box MBR + stake pay + stake axfer + stakeTokens app call).",
    params: { sender: "address", farmingId: "uint64 pool app id", stakeAmount: "uint64 (LP base units)", stakeTokenId: "uint64 (0=native; optional, read from pool)", updatedApr: "uint64 optional" },
    returns: "4-txn group: [pay boxMBR->app, stakePay->app, stakeAxfer->app, appl stakeTokens(uint64,uint64,pay,axfer,pay)].",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const farmingId = reqPosInt(b.farmingId, "farmingId");
      const stakeAmount = reqPosInt(b.stakeAmount, "stakeAmount");
      const { sp, source } = await suggestedParams();
      const { gs } = await appGlobalState(farmingId);
      const stakeTokenId = b.stakeTokenId !== undefined ? reqPosInt(b.stakeTokenId, "stakeTokenId")
        : firstNum(gs, ["stake_token", "stakeToken", "lp_token_a"], 0);
      const rewardAmt = firstNum(gs, ["reward_token_amount", "rewardTokenAmount"], 0);
      const totalStaked = firstNum(gs, ["total_staked", "totalStaked"], 0);
      const start = firstNum(gs, ["farm_start_time", "farmStartTime"], 0);
      const end = firstNum(gs, ["farm_end_time", "farmEndTime"], 0);
      const poolTime = end - start;
      let updatedApr;
      if (b.updatedApr !== undefined) updatedApr = reqPosInt(b.updatedApr, "updatedApr");
      else {
        const apr = poolTime > 0 ? (rewardAmt / (totalStaked + stakeAmount)) * 100 * ((86400 * 360) / poolTime) : 0;
        updatedApr = Number.isFinite(apr) ? Math.floor(apr * 100) : 0;
      }
      const to = appAddr(farmingId);
      const boxTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: STAKE_BOX_PRICE, suggestedParams: sp });
      let stakePay, stakeAxfer;
      if (stakeTokenId === 0) {
        stakePay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: stakeAmount, suggestedParams: sp });
        stakeAxfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: 0, assetIndex: FRY_ASA, suggestedParams: sp });
      } else {
        stakePay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: 1000, suggestedParams: sp });
        stakeAxfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: stakeAmount, assetIndex: stakeTokenId, suggestedParams: sp });
      }
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: farmingId, method: algosdk.ABIMethod.fromSignature("stakeTokens(uint64,uint64,pay,axfer,pay)void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, 3000),
        methodArgs: [stakeAmount, updatedApr, { txn: stakePay, signer: emptySigner }, { txn: stakeAxfer, signer: emptySigner }, { txn: boxTx, signer: emptySigner }],
      });
      return { txnsB64: b64Group(atc), algodSource: source, computed: { stakeTokenId, updatedApr } };
    },
  },
  "lp-farm/unstake": {
    price: PRICE_BUILD,
    summary: "Build a FryFarming unstake app call (unstakeTokens(uint64)).",
    params: { sender: "address", farmingId: "uint64", unstakeAmount: "uint64 (LP base units)" },
    returns: "1-txn group: [appl unstakeTokens(unstakeAmount)] flat fee 0.003 ALGO.",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const farmingId = reqPosInt(b.farmingId, "farmingId");
      const unstakeAmount = reqPosInt(b.unstakeAmount, "unstakeAmount");
      const { sp, source } = await suggestedParams();
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: farmingId, method: algosdk.ABIMethod.fromSignature("unstakeTokens(uint64)void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, 3000), methodArgs: [unstakeAmount],
      });
      return { txnsB64: b64Group(atc), algodSource: source };
    },
  },
  "lp-farm/claim": {
    price: PRICE_BUILD,
    summary: "Build a FryFarming reward claim (claimRewards()).",
    params: { sender: "address", farmingId: "uint64" },
    returns: "1-txn group: [appl claimRewards()] flat fee 0.002 ALGO.",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const farmingId = reqPosInt(b.farmingId, "farmingId");
      const { sp, source } = await suggestedParams();
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: farmingId, method: algosdk.ABIMethod.fromSignature("claimRewards()void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, 2000), methodArgs: [],
      });
      return { txnsB64: b64Group(atc), algodSource: source };
    },
  },
  // ---- GENESIS MINT (Fry Fee Genesis, ARC-72-ish) ----
  "genesis-mint/mint": {
    price: PRICE_BUILD,
    summary: "Build a Genesis NFT mint group (USDC axfer -> app + mint(axfer)uint64 app call).",
    params: { sender: "address (agent wallet, must hold mint_price USDC + be opted into the NFT ASA flow)" },
    returns: "2-txn group: [axfer USDC mint_price -> app addr, appl mint(axfer) with owner/balance boxes, foreignAsset USDC, account treasury].",
    paused: true,
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const { sp, source } = await suggestedParams();
      const { gs } = await appGlobalState(GENESIS_APP_ID);
      const paused = firstNum(gs, ["paused"], 0);
      const mintPrice = firstNum(gs, ["mint_price"], 175000000);
      const mintAsset = firstNum(gs, ["mint_asset_id"], USDC_ASA);
      const totalMinted = firstNum(gs, ["total_minted"], 0);
      const maxSupply = firstNum(gs, ["max_supply"], 2000);
      const nextTokenId = totalMinted + 1;
      const to = appAddr(GENESIS_APP_ID);
      const paymentTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: mintPrice, assetIndex: mintAsset, suggestedParams: sp });
      const ownersBox = { appIndex: 0, name: new Uint8Array([0x6f, ...uint64BE(nextTokenId)]) };
      const balancesBox = { appIndex: 0, name: new Uint8Array([0x62, ...algosdk.decodeAddress(sender).publicKey]) };
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: GENESIS_APP_ID, method: algosdk.ABIMethod.fromSignature("mint(axfer)uint64"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, 2000),
        methodArgs: [{ txn: paymentTxn, signer: emptySigner }],
        appForeignAssets: [mintAsset], appAccounts: [GENESIS_TREASURY], boxes: [ownersBox, balancesBox],
      });
      return {
        txnsB64: b64Group(atc), algodSource: source,
        warning: paused ? "MINT IS PAUSED on-chain (paused=1). This group is correctly built but will be rejected by the contract until an admin unpauses. Simulate will fail on the paused assert — expected." : undefined,
        onchain: { paused: !!paused, mintPrice, totalMinted, maxSupply, nextTokenId },
      };
    },
  },
  // ---- P2P SWAP (FryP2PSwap, FRY <-> ALGO market) ----
  "p2p/create": {
    price: PRICE_BUILD,
    summary: "Build a P2P create-offer group (escrow FRY axfer + box MBR pay + create_offer_asa app call).",
    params: { sender: "address", offerAmount: "uint64 FRY base units to escrow", requestAmount: "uint64 ALGO base units requested", counterparty: "address optional (zero addr = open)", expiry: "uint64 unix secs optional (0 = none)", offerAssetId: "uint64 optional (default FRY)" },
    returns: "3-txn group: [axfer FRY->app, pay boxMBR->app, appl create_offer_asa(axfer,pay,uint64 requestAmount,address counterparty,uint64 expiry)->offerId].",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const offerAmount = reqPosInt(b.offerAmount, "offerAmount");
      const requestAmount = reqPosInt(b.requestAmount, "requestAmount");
      const offerAssetId = b.offerAssetId !== undefined ? reqPosInt(b.offerAssetId, "offerAssetId") : P2P_OFFER_ASSET;
      const counterparty = b.counterparty ? reqAddr(b.counterparty, "counterparty") : ZERO_ADDRESS;
      const expiry = b.expiry !== undefined ? reqPosInt(b.expiry, "expiry") : 0;
      const { sp, source } = await suggestedParams();
      const to = appAddr(P2P_APP_ID);
      const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: offerAmount, assetIndex: offerAssetId, suggestedParams: sp });
      const boxPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: P2P_BOX_MBR, suggestedParams: sp });
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: P2P_APP_ID, method: algosdk.ABIMethod.fromSignature("create_offer_asa(axfer,pay,uint64,address,uint64)uint64"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, P2P_FEE_CREATE),
        methodArgs: [{ txn: axfer, signer: emptySigner }, { txn: boxPay, signer: emptySigner }, requestAmount, counterparty, expiry],
      });
      return { txnsB64: b64Group(atc), algodSource: source };
    },
  },
  "p2p/accept": {
    price: PRICE_BUILD,
    summary: "Build a P2P accept-offer group (ALGO payment + accept_offer_algo app call, box ref).",
    params: { sender: "address", offerId: "uint64", payAmount: "uint64 ALGO base units to pay the maker" },
    returns: "2-txn group: [pay ALGO->app, appl accept_offer_algo(uint64 offerId, pay)] with offer box ref, fee 0.005 ALGO.",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const offerId = reqPosInt(b.offerId, "offerId");
      const payAmount = reqPosInt(b.payAmount, "payAmount");
      const { sp, source } = await suggestedParams();
      const to = appAddr(P2P_APP_ID);
      const pay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: to, amount: payAmount, suggestedParams: sp });
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: P2P_APP_ID, method: algosdk.ABIMethod.fromSignature("accept_offer_algo(uint64,pay)void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, P2P_FEE_ACCEPT),
        methodArgs: [offerId, { txn: pay, signer: emptySigner }], boxes: [{ appIndex: 0, name: uint64BE(offerId) }],
      });
      return { txnsB64: b64Group(atc), algodSource: source };
    },
  },
  "p2p/cancel": {
    price: PRICE_BUILD,
    summary: "Build a P2P cancel-offer app call (cancel_offer(uint64), box ref).",
    params: { sender: "address (offer maker)", offerId: "uint64" },
    returns: "1-txn group: [appl cancel_offer(offerId)] with offer box ref, fee 0.002 ALGO.",
    build: async (b) => {
      const sender = reqAddr(b.sender, "sender");
      const offerId = reqPosInt(b.offerId, "offerId");
      const { sp, source } = await suggestedParams();
      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: P2P_APP_ID, method: algosdk.ABIMethod.fromSignature("cancel_offer(uint64)void"),
        sender, signer: emptySigner, suggestedParams: flatSp(sp, P2P_FEE_CANCEL),
        methodArgs: [offerId], boxes: [{ appIndex: 0, name: uint64BE(offerId) }],
      });
      return { txnsB64: b64Group(atc), algodSource: source };
    },
  },
};

// Build the payment routes map from the registry + submit/status.
const routes = {
  "GET /fleet": accept(PRICE_FLEET, "Live Fry Networks DePIN device-staking pool telemetry (aggregated)", "/fleet", {
    output: { example: { resource: "fleet", generatedAt: "2026-07-17T00:00:00.000Z", source: "fry.farm", network: "Fry Networks DePIN", poolCount: 1, pools: [] } },
  }),
  "GET /farm": accept(PRICE_FARM, "fry.farm farming/pool analytics — pools, TVL proxies, positions", "/farm", {
    output: { example: { resource: "farm", generatedAt: "2026-07-17T00:00:00.000Z", source: "fry.farm", farmingPoolCount: 1, farmTokenPoolCount: 1, farmingPools: [], farmTokenPools: [] } },
  }),
  "GET /rewards": accept(PRICE_REWARDS, "FRY reward emission status, daily budget, and leaderboard", "/rewards", {
    output: { example: { resource: "rewards", generatedAt: "2026-07-17T00:00:00.000Z", source: "fry.farm", token: "FRY", dailyBudget: {}, leaderboard: [] } },
  }),
  "POST /actions/submit": accept(PRICE_SUBMIT, "Submit a signed atomic group to Algorand mainnet; waits (<=8 rounds) for confirmation.", "/actions/submit", {
    bodyType: "json",
    input: { txnsB64: ["<base64 signed txn>"] },
    inputSchema: paramDiscovery({ txnsB64: "string[] base64-encoded SIGNED transactions of one atomic group (<=16)" }),
    output: { example: { status: "confirmed", round: 51000000, txids: ["TXID"] } },
  }),
  "GET /actions/status": accept(PRICE_STATUS, "Look up a transaction's pending/confirmed status by txid.", "/actions/status", {
    input: { txid: "<transaction id>" },
    inputSchema: paramDiscovery({ txid: "string transaction id (query param)" }),
    output: { example: { txid: "TXID", confirmed: true, round: 51000000, poolError: null } },
  }),
};
for (const [key, def] of Object.entries(builders)) {
  routes[`POST /actions/${key}/build`] = accept(def.price, def.summary, `/actions/${key}/build`, {
    bodyType: "json",
    input: exampleFromParams(def.params),
    inputSchema: paramDiscovery(def.params),
    output: { example: { action: key, network: "algorand-mainnet", txnsB64: ["<base64 unsigned txn>"], signingInstructions: "Sign every index of the group with your own wallet, then POST the signed group to /x402/actions/submit." } },
  });
}

// ---- FREE surfaces (declared before/after the gate; the gate only matches routes above) ----
const CATALOG = [
  { path: "/x402/fleet", price: PRICE_FLEET, data: "DePIN device-staking pool telemetry" },
  { path: "/x402/farm", price: PRICE_FARM, data: "farming/pool analytics (pools, TVL, positions)" },
  { path: "/x402/rewards", price: PRICE_REWARDS, data: "FRY reward emission, daily budget, leaderboard" },
];

app.get("/health", (_req, res) => res.json({ status: "ok", service: "fry-x402" }));

// Free, machine-readable catalog: everything an agent needs to complete a journey.
function catalogJson() {
  const actions = Object.entries(builders).map(([key, def]) => ({
    action: key,
    method: "POST",
    path: `/x402/actions/${key}/build`,
    priceUsdc: def.price,
    priceAtomic: priceToAtomic(def.price),
    params: def.params,
    returns: def.returns,
    ...(def.paused ? { paused: true, note: "On-chain paused; group builds correctly but the contract rejects until unpaused." } : {}),
    x402: X402_META,
  }));
  const submit = {
    action: "submit", method: "POST", path: "/x402/actions/submit",
    priceUsdc: PRICE_SUBMIT, priceAtomic: priceToAtomic(PRICE_SUBMIT),
    params: { txnsB64: "string[] base64-encoded SIGNED transactions of one atomic group (<=16)" },
    returns: "{ status: 'confirmed'|'pending', round?, txids[] }. Waits up to 8 rounds; returns pending (200) on timeout.",
    x402: X402_META,
  };
  const status = {
    action: "status", method: "GET", path: "/x402/actions/status",
    priceUsdc: PRICE_STATUS, priceAtomic: priceToAtomic(PRICE_STATUS),
    params: { txid: "string transaction id (query param)" },
    returns: "{ txid, confirmed, round?, poolError? }",
    x402: X402_META,
  };
  return {
    service: "fry.farm x402 agentic actions",
    description: "Paid, non-custodial transaction builders for autonomous agents. Each build endpoint returns an UNSIGNED atomic group; the agent signs with its own wallet and submits via /actions/submit. x402 payment is the only auth — no API keys, no accounts.",
    network: "algorand-mainnet",
    networkCaip2: NETWORK_CAIP2,
    asset: { name: "USDC", id: String(USDC_MAINNET_ASA_ID), decimals: 6 },
    payTo: PAY_TO,
    facilitator: FACILITATOR_URL,
    x402Version: 2,
    dataEndpoints: CATALOG,
    actions,
    submit,
    status,
    deferred: [
      { action: "launches/participate", reason: "No client-side participate transaction group exists in the fry.farm frontend; launchpad participation is not a single signable group." },
      { action: "streak/daily-claim", reason: "Backend-custodial + Turnstile + anti-sybil gated; deliberately not agent-accessible (no client group)." },
      { action: "depin/writes", reason: "All device-staking writes are payout-impacting (feed device-rewards); deferred under the ghost-guard rule." },
    ],
  };
}
app.get("/catalog", (_req, res) => res.json(catalogJson()));

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
    agentActions: { catalog: "/x402/catalog", count: Object.keys(builders).length, submit: "/x402/actions/submit", status: "/x402/actions/status" },
  };
  if ((req.headers.accept || "").includes("application/json")) return res.json(discovery);
  const rows = CATALOG.map(
    (e) => `<tr><td><code>${e.path}</code></td><td>${e.price} USDC</td><td>${e.data}</td></tr>`
  ).join("");
  const actionRows = Object.entries(builders).map(
    ([k, d]) => `<tr><td><code>/x402/actions/${k}/build</code></td><td>${d.price} USDC</td><td>${d.summary}</td></tr>`
  ).join("");
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>fry.farm x402 API</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b0e14;color:#e6edf3;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:48px 22px}
h1{font-size:1.9rem;margin:0 0 .2em;background:linear-gradient(90deg,#7cf,#4ade80);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:1.15rem;margin:1.8em 0 .4em;color:#cbd5e1}
.tag{color:#8b98a5;margin:0 0 1.6em}
table{width:100%;border-collapse:collapse;margin:1em 0}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #1c2230;vertical-align:top}
th{color:#8b98a5;font-weight:600;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}
code{background:#161b26;padding:2px 7px;border-radius:5px;color:#9ece6a;font-size:.9em}
.card{background:#11161f;border:1px solid #1c2230;border-radius:12px;padding:20px 22px;margin:1.2em 0}
.mut{color:#8b98a5;font-size:.9rem}
a{color:#7cf}
pre{background:#0d1119;border:1px solid #1c2230;border-radius:10px;padding:14px;overflow:auto;font-size:.86rem;color:#c9d3df}
.pill{display:inline-block;background:#132a1c;color:#4ade80;border:1px solid #1f5133;border-radius:999px;padding:2px 10px;font-size:.78rem;margin-bottom:14px}
</style></head><body><div class="wrap">
<div class="pill">Algorand mainnet · x402 · GoPlausible facilitator</div>
<h1>fry.farm x402 API</h1>
<p class="tag">Pay-per-request access to Fry Networks data <strong>and on-chain actions</strong> — priced in USDC, no API keys, built for AI agents.</p>
<h2>Data endpoints</h2>
<table><thead><tr><th>Endpoint</th><th>Price</th><th>Returns</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Agentic actions — transaction builders</h2>
<p class="mut">Each builder returns an <strong>unsigned</strong> atomic group. Sign with your own wallet, then <code>POST /x402/actions/submit</code>. Non-custodial — we never hold keys. Full machine-readable spec: <a href="/x402/catalog"><code>/x402/catalog</code></a>.</p>
<table><thead><tr><th>Action</th><th>Price</th><th>Builds</th></tr></thead><tbody>${actionRows}
<tr><td><code>/x402/actions/submit</code></td><td>${PRICE_SUBMIT} USDC</td><td>Submit a signed group; waits for confirmation</td></tr>
<tr><td><code>/x402/actions/status</code></td><td>${PRICE_STATUS} USDC</td><td>Look up a txid's status</td></tr>
</tbody></table>
<div class="card"><strong>How it works</strong>
<p class="mut">Request any paid endpoint with no payment → <code>HTTP 402</code> with the payment requirements (USDC amount, payTo, facilitator). Your x402 client pays, the facilitator verifies + settles on-chain, and you receive <code>200</code> + the data or unsigned group.</p>
<pre>curl -s https://fry.farm/x402/catalog        # free: every action + full 402 schema
curl -i  https://fry.farm/x402/actions/staking/claim/build   # 402 + payment requirements
# pay via x402 client with a JSON body { "sender": "&lt;addr&gt;", "stakingId": 123 } → 200 + unsigned group
# sign locally, then POST the signed group to /x402/actions/submit</pre></div>
<p class="mut">payTo: <code>${PAY_TO}</code><br>Facilitator: <a href="${FACILITATOR_URL}">${FACILITATOR_URL}</a><br>USDC ASA: <code>${USDC_MAINNET_ASA_ID}</code></p>
</div></body></html>`);
});

// ---- PAYMENT GATE (only intercepts the routes map above) ----
app.use(paymentMiddleware(routes, server));

// ---- PAID data handlers (unchanged; byte-compatible with shipped challenge) ----
async function bfetch(path, timeoutMs = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BACKEND_URL + path, { headers: { accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`upstream ${path} -> ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

app.get("/fleet", async (_req, res) => {
  try {
    const pools = await bfetch("/devicestaking/all");
    const arr = Array.isArray(pools?.data) ? pools.data : [];
    res.json({ resource: "fleet", generatedAt: new Date().toISOString(), source: "fry.farm", network: "Fry Networks DePIN", poolCount: arr.length, pools: arr });
  } catch (e) { res.status(502).json({ error: "upstream_unavailable", detail: String(e.message || e) }); }
});

app.get("/farm", async (_req, res) => {
  try {
    const [farming, farmTokens] = await Promise.all([
      bfetch("/farming/all").catch(() => ({ data: [] })),
      bfetch("/stakingfarmingtoken/pool").catch(() => ({ data: [] })),
    ]);
    const f = Array.isArray(farming?.data) ? farming.data : [];
    const ft = Array.isArray(farmTokens?.data) ? farmTokens.data : [];
    res.json({ resource: "farm", generatedAt: new Date().toISOString(), source: "fry.farm", farmingPoolCount: f.length, farmTokenPoolCount: ft.length, farmingPools: f, farmTokenPools: ft });
  } catch (e) { res.status(502).json({ error: "upstream_unavailable", detail: String(e.message || e) }); }
});

app.get("/rewards", async (_req, res) => {
  try {
    const [budget, leaderboard] = await Promise.all([
      bfetch("/rewards/daily-budget").catch(() => ({ data: null })),
      bfetch("/rewards/leaderboard").catch(() => ({ data: null })),
    ]);
    res.json({ resource: "rewards", generatedAt: new Date().toISOString(), source: "fry.farm", token: "FRY", dailyBudget: budget?.data ?? budget ?? null, leaderboard: leaderboard?.data ?? leaderboard ?? null });
  } catch (e) { res.status(502).json({ error: "upstream_unavailable", detail: String(e.message || e) }); }
});

// ---- PAID agentic action handlers (registered after the gate) ----
for (const [key, def] of Object.entries(builders)) {
  app.post(`/actions/${key}/build`, async (req, res) => {
    try {
      const out = await def.build(req.body || {});
      res.json({
        action: key,
        network: "algorand-mainnet",
        summary: def.summary,
        signingInstructions: "Base64-decode each element of txnsB64 to an unsigned transaction, sign the whole group with your wallet (all indexes), then POST the base64 SIGNED group to /x402/actions/submit. Do not reorder; the group id is already assigned.",
        ...out,
      });
    } catch (e) {
      res.status(400).json({ action: key, error: "build_failed", detail: String(e.message || e) });
    }
  });
}

// Generic submit: structural validation, bounded confirmation, never hangs/5xx after submit.
app.post("/actions/submit", async (req, res) => {
  try {
    const arr = req.body?.txnsB64;
    if (!Array.isArray(arr) || arr.length === 0) return res.status(400).json({ error: "bad_group", detail: "txnsB64 must be a non-empty array of base64 signed txns" });
    if (arr.length > 16) return res.status(400).json({ error: "bad_group", detail: "group exceeds 16 transactions" });
    let stxns, groupIds = new Set(), txids = [];
    try {
      stxns = arr.map((b) => {
        const raw = Buffer.from(b, "base64");
        const st = algosdk.decodeSignedTransaction(raw); // throws if not a valid signed txn
        const gid = st.txn.group ? Buffer.from(st.txn.group).toString("base64") : "";
        groupIds.add(gid);
        txids.push(st.txn.txID());
        return raw;
      });
    } catch (de) {
      return res.status(400).json({ error: "decode_failed", detail: String(de.message || de) });
    }
    if (arr.length > 1 && (groupIds.size !== 1 || groupIds.has(""))) {
      return res.status(400).json({ error: "group_mismatch", detail: "all transactions must share one non-empty group id" });
    }
    const concat = Buffer.concat(stxns);
    const { out: sendRes, source } = await withAlgod(async (c) => c.sendRawTransaction(concat).do());
    const txid = sendRes?.txid || sendRes?.txId || txids[0];
    // bounded wait <=8 rounds, never hang toward nginx 60s
    try {
      const { out: conf } = await withAlgod((c) => algosdk.waitForConfirmation(c, txid, 8));
      const round = conf?.["confirmed-round"] || conf?.confirmedRound;
      return res.json({ status: "confirmed", round: Number(round) || null, txids, algodSource: source });
    } catch (we) {
      return res.json({ status: "pending", txids, next: "/x402/actions/status", detail: String(we.message || we), algodSource: source });
    }
  } catch (e) {
    return res.status(400).json({ error: "submit_failed", detail: String(e.message || e) });
  }
});

// Cheap status lookup by txid.
app.get("/actions/status", async (req, res) => {
  try {
    const txid = req.query.txid;
    if (!txid || typeof txid !== "string") return res.status(400).json({ error: "bad_request", detail: "txid query param required" });
    const { json, source } = await algodGet(`/v2/transactions/pending/${encodeURIComponent(txid)}`);
    const round = json?.["confirmed-round"] || 0;
    res.json({ txid, confirmed: round > 0, round: round || null, poolError: json?.["pool-error"] || null, algodSource: source });
  } catch (e) {
    res.status(404).json({ txid: req.query.txid, confirmed: false, error: "not_found_or_expired", detail: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`fry-x402 listening on :${PORT} | payTo=${PAY_TO} | facilitator=${FACILITATOR_URL} | actions=${Object.keys(builders).length}`);
});
