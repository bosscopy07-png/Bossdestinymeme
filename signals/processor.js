/**
 * signals/processor.js
 *
 * Deep anti-rug heuristics and deterministic risk scoring.
 * Input: tokenAddress (string) and optional dexscreenerData (object)
 * Output: {
 *   id, token, score (0-100), riskLevel: LOW|MEDIUM|HIGH, flags:[], details:{}
 * }
 *
 * Notes:
 * - This module is ESM-style (import/export) to match the rest of the codebase.
 * - It tries to be defensive about missing data and will fall back gracefully.
 * - It uses the retry helper (retry) exported from utils/web3.js if available.
 */

import Pino from "pino";
import config from "../config/index.js";
import * as dsUtils from "../utils/dexscreener.js";
import { getProvider, retry as web3Retry } from "../utils/web3.js";
import axios from "axios";

const log = Pino({ level: config.LOG_LEVEL || "info" });

// --- Small local helpers (uid and safe number parsing) ---
function uid(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
function toNumberSafe(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// --- risk level helper ---
function riskFromScore(score) {
  if (score >= 75) return "LOW";
  if (score >= 45) return "MEDIUM";
  return "HIGH";
}

// --- bytecode heuristic flags ---
function basicBytecodeFlags(bytecode = "") {
  const flags = [];
  const b = (bytecode || "").toLowerCase();
  if (!b || b === "0x") {
    flags.push("no_bytecode");
    return flags;
  }
  const suspects = [
    "mint",
    "burn",
    "blacklist",
    "whitelist",
    "settax",
    "setfee",
    "feepercent",
    "maxtx",
    "maxwallet",
    "renounce",
    "owner",
    "onlyowner",
    "lock",
    "unlock",
    "pause",
    "swapandliquify",
    "sniper",
    "antibot",
    "trading",
    "transferOwnership",
    "isExcludedFromFee"
  ];
  for (const s of suspects) {
    if (b.includes(s.toLowerCase())) flags.push(`bytecode_contains_${s.toLowerCase()}`);
  }
  return flags;
}

// --- weighted score computation ---
function computeWeightsScore(metrics = {}, weights = {}) {
  let totalWeight = 0;
  let sum = 0;
  for (const k of Object.keys(weights)) {
    const w = Number(weights[k] ?? 0);
    totalWeight += w;
    const m = Number(metrics[k] ?? 0);
    sum += m * w;
  }
  if (totalWeight <= 0) return 0;
  const normalized = sum / totalWeight; // 0..1
  return Math.round(Math.max(0, Math.min(1, normalized)) * 100);
}

// liquidity-to-marketcap helper
function estimateLiquidityToMcRatio(dexData = {}) {
  try {
    const liqUSD = toNumberSafe(dexData.liquidity?.usd ?? dexData.liquidity ?? 0);
    const mc = toNumberSafe(dexData.marketCap ?? dexData.fdv ?? dexData.mc ?? 0);
    if (!mc || mc <= 0) return 0;
    return liqUSD / mc;
  } catch (e) {
    return 0;
  }
}

/**
 * Non-invasive honeypot heuristic & bytecode inspection.
 * Returns { flags:[], details:{} }
 */
async function honeypotHeuristic(dexData = {}, provider, tokenAddress) {
  const flags = [];
  const details = {};
  try {
    const liquidityUSD = toNumberSafe(dexData.liquidity?.usd ?? dexData.liquidity ?? 0);
    const holders = toNumberSafe(dexData.holders ?? dexData.holderCount ?? dexData.holdersCount ?? 0);
    const buyTax = toNumberSafe(dexData.buyTax ?? dexData.buy_tax ?? 0);
    const sellTax = toNumberSafe(dexData.sellTax ?? dexData.sell_tax ?? 0);

    details.liquidityUSD = liquidityUSD;
    details.holders = holders;
    details.buyTax = buyTax;
    details.sellTax = sellTax;

    // thresholds from config (fallbacks)
    const MIN_LIQUIDITY_USD = (config.ANTIRUG?.MIN_LIQUIDITY_BNB ?? 0.5) * (config.ANTIRUG?.BNB_USD_PRICE ?? 300);
    if (liquidityUSD < MIN_LIQUIDITY_USD) flags.push("low_liquidity_usd");
    if (holders < (config.ANTIRUG?.MIN_HOLDERS ?? 20)) flags.push("low_holder_count");
    if (buyTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25) || sellTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25)) {
      flags.push("high_tax");
    }

    // attempt to fetch bytecode (safe retry)
    try {
      let bytecode = "";
      if (typeof web3Retry === "function") {
        // web3Retry expects a function that returns a promise; we call provider.getCode inside it
        bytecode = await web3Retry(() => provider.getCode(tokenAddress));
      } else {
        // fallback direct call
        bytecode = await provider.getCode(tokenAddress);
      }
      details.bytecodeLength = (bytecode || "").length;
      const bcFlags = basicBytecodeFlags(bytecode);
      if (bcFlags.length) flags.push(...bcFlags);
    } catch (err) {
      log.warn({ err: err?.message }, "bytecode fetch failed");
      details.bytecodeError = err?.message ?? String(err);
    }
  } catch (e) {
    log.warn({ err: e?.message }, "honeypotHeuristic error");
  }

  return { flags: Array.from(new Set(flags)), details };
}

/**
 * analyzeToken(tokenAddress, dexscreenerData)
 * Main entry point.
 */
export async function analyzeToken(tokenAddress, dexscreenerData = {}) {
  const id = uid("sig_");
  const out = {
    id,
    token: tokenAddress,
    score: 0,
    riskLevel: "HIGH",
    flags: [],
    details: {},
    timestamp: Date.now()
  };

  if (!tokenAddress) {
    out.flags.push("invalid_address");
    return out;
  }

  const provider = getProvider();

  // obtain dexscreener data: try dsUtils.getPair or fallback to fetchTokenFromDexscreener
  let dsData = dexscreenerData && Object.keys(dexscreenerData).length ? dexscreenerData : {};
  try {
    if (!dsData || Object.keys(dsData).length === 0) {
      if (typeof dsUtils.getPair === "function") {
        dsData = await dsUtils.getPair(tokenAddress);
      } else if (typeof dsUtils.fetchTokenFromDexscreener === "function") {
        dsData = await dsUtils.fetchTokenFromDexscreener(tokenAddress);
      } else if (typeof dsUtils.fetch === "function") {
        dsData = await dsUtils.fetch(tokenAddress);
      } else {
        // last resort: call dexscreener API directly (conservative)
        const url = `${config.DEXSCREENER_API}${tokenAddress}`;
        try {
          const resp = await axios.get(url, { timeout: 8000 });
          dsData = resp.data || {};
        } catch (err) {
          log.warn({ err: err?.message }, "direct dexscreener fetch failed");
          dsData = {};
        }
      }
    }
  } catch (err) {
    log.warn({ err: err?.message, tokenAddress }, "failed to fetch dexscreener data");
    dsData = {};
  }

  // normalize numeric fields
  const liquidityUSD = toNumberSafe(dsData.liquidity?.usd ?? dsData.liquidity ?? 0);
  const price = toNumberSafe(dsData.priceUsd ?? dsData.price ?? dsData.tokenPrice ?? 0);
  const holders = toNumberSafe(dsData.holders ?? dsData.holderCount ?? 0);
  const ageSeconds = toNumberSafe(dsData.ageSeconds ?? dsData.age ?? 0);
  const volume24h = toNumberSafe(dsData.volume?.usd ?? dsData.volume ?? 0);
  const fdv = toNumberSafe(dsData.fdv ?? dsData.marketCap ?? dsData.market_cap ?? 0);

  out.details.dex = { liquidityUSD, price, holders, ageSeconds, volume24h, fdv };

  // 1) liquidity metric (higher better). Use SNIPER.MIN_LIQUIDITY_BNB as base if present.
  const bnbUsdPrice = config.ANTIRUG?.BNB_USD_PRICE ?? 300;
  const minLiquidityBNB = config.SNIPER?.MIN_LIQUIDITY_BNB ?? (config.ANTIRUG?.MIN_LIQUIDITY_BNB ?? 0.5);
  const liqThresholdUsd = minLiquidityBNB * bnbUsdPrice; // rough USD threshold
  const liquidityMetric = Math.max(0, Math.min(1, liquidityUSD / Math.max(1, liqThresholdUsd)));
  out.details.liquidityMetric = liquidityMetric;

  // 2) dev concentration metric (0..1, higher is worse)
  let devConcentrationMetric = 0;
  try {
    if (Array.isArray(dsData.topHolders) && dsData.topHolders.length) {
      const topShare = dsData.topHolders.slice(0, 5).reduce((s, h) => s + toNumberSafe(h.percent ?? h.share ?? 0), 0);
      devConcentrationMetric = Math.min(1, topShare / 50); // top5 50% => high concentration
      out.details.topHoldersTop5Percent = topShare;
    } else if (toNumberSafe(dsData.ownerHoldPercent, 0)) {
      devConcentrationMetric = Math.min(1, toNumberSafe(dsData.ownerHoldPercent) / 50);
      out.details.ownerHoldPercent = dsData.ownerHoldPercent;
    } else {
      devConcentrationMetric = 0;
    }
  } catch (e) {
    devConcentrationMetric = 0;
  }
  out.details.devConcentrationMetric = devConcentrationMetric;

  // 3) social/volume metric (volume relative to liquidity) — higher is better up to a point
  const volumeToLiq = liquidityUSD > 0 ? Math.min(1, volume24h / Math.max(1, liquidityUSD)) : 0;
  out.details.volumeToLiq = volumeToLiq;

  // 4) honeypot & bytecode heuristics
  const hp = await honeypotHeuristic(dsData, provider, tokenAddress);
  if (hp.flags && hp.flags.length) {
    out.flags.push(...hp.flags);
  }
  out.details.honeypotDetails = hp.details ?? {};

  // 5) LP lock detection (rudimentary)
  try {
    if (dsData.lpLocked === false || dsData.locked === false) {
      out.flags.push("unlocked_lp");
    } else if (dsData.lpLocked === true || dsData.locked === true) {
      // locked -> nothing
    } else if (dsData.liquidityLockInfo && dsData.liquidityLockInfo.locked === false) {
      out.flags.push("unlocked_lp");
      out.details.liquidityLockInfo = dsData.liquidityLockInfo;
    }
  } catch (e) {
    // ignore
  }

  // 6) metric vector (higher is better)
  const metrics = {
    liquidity: liquidityMetric,
    contract: 1 - devConcentrationMetric,
    social: Math.min(1, volumeToLiq * 5), // scale to reward some activity
    devWallets: 1 - devConcentrationMetric
  };

  // 7) apply weights (from config or default)
  const weights = config.ANTIRUG?.SCORE_WEIGHTS ?? {
    liquidity: 0.25,
    contract: 0.35,
    social: 0.2,
    devWallets: 0.2
  };

  const score = computeWeightsScore(metrics, weights);
  out.score = score;
  out.riskLevel = riskFromScore(score);

  // 8) derive flags from numeric thresholds
  if (hp.flags.includes("low_liquidity_usd") || liquidityMetric < 0.2) out.flags.push("low_liquidity");
  if (devConcentrationMetric > 0.6) out.flags.push("dev_concentration_high");
  if (volumeToLiq > 3) out.flags.push("abnormal_volume_spike");

  // 9) rug probability heuristic (simple)
  const rugProbability = Math.round((1 - score / 100) * 100);
  out.details.rugProbabilityPercent = rugProbability;

  // 10) unique flags
  out.flags = Array.from(new Set(out.flags));

  // 11) recommendations
  const recommended = {};
  const defaultBuyPercent = config.SNIPER?.DEFAULT_BUY_PERCENT ?? 0.5;
  if (out.riskLevel === "LOW") {
    recommended.recommendedBuyPercent = Math.min(2, defaultBuyPercent);
    recommended.minBuyUsd = Math.max(1, 1);
  } else if (out.riskLevel === "MEDIUM") {
    recommended.recommendedBuyPercent = Math.max(0, defaultBuyPercent / 2);
    recommended.minBuyUsd = Math.max(1, 2);
  } else {
    recommended.recommendedBuyPercent = 0;
    recommended.minBuyUsd = Math.max(1, 5);
  }
  out.details.recommended = recommended;

  // 12) annotate with dexscreener summary
  out.details.dexSummary = {
    name: dsData.name ?? dsData.token ?? dsData.symbol ?? "",
    symbol: dsData.symbol ?? dsData.tokenSymbol ?? "",
    pairUrl: dsData.url ?? dsData.pairUrl ?? dsData.pair ?? null
  };

  log.info({ id, tokenAddress, score: out.score, risk: out.riskLevel, flags: out.flags }, "Processed token");
  return out;
}

export default { analyzeToken };
