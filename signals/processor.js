/**
 * FILE: signals/processor.js
 *
 * Hyper Beast Token / Pair Signal Processor
 *
 * Computes anti-rug heuristics, owner concentration, liquidity/volume scoring,
 * bytecode suspicious detection, honeypot checks, and generates enriched details
 * for Telegram/trading bots.
 *
 * Returns: { id, token, score, riskLevel, flags, details }
 */

import Pino from "pino";
import { ethers } from "ethers";
import axios from "axios";
import config from "../config/index.js";
import * as dsUtils from "../utils/dexscreener.js";
import { getProvider, withRetries } from "../utils/web3.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });

// --- Helpers ---
function uid(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
function toNumberSafe(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function riskFromScore(score) {
  if (score >= 75) return "LOW";
  if (score >= 45) return "MEDIUM";
  return "HIGH";
}
function basicBytecodeFlags(bytecode = "") {
  const flags = [];
  const b = (bytecode || "").toLowerCase();
  if (!b || b === "0x") {
    flags.push("no_bytecode");
    return flags;
  }
  const suspects = [
    "mint", "burn", "blacklist", "whitelist", "settax", "setfee", "maxtx", "maxwallet",
    "renounce", "owner", "onlyowner", "lock", "unlock", "pause", "swapandliquify",
    "sniper", "antibot", "trading", "transferownership", "isexcludedfromfee"
  ];
  for (const s of suspects) {
    if (b.includes(s.toLowerCase())) flags.push(`bytecode_contains_${s.toLowerCase()}`);
  }
  return flags;
}
function computeWeightsScore(metrics = {}, weights = {}) {
  let totalWeight = 0, sum = 0;
  for (const k of Object.keys(weights)) {
    const w = Number(weights[k] ?? 0);
    totalWeight += w;
    const m = Number(metrics[k] ?? 0);
    sum += m * w;
  }
  if (totalWeight <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, sum / totalWeight)) * 100);
}

// --- Honeypot & bytecode analysis ---
async function honeypotHeuristic(dexData = {}, provider, tokenAddress) {
  const flags = [];
  const details = {};
  try {
    const liquidityUSD = toNumberSafe(dexData.liquidity?.usd ?? dexData.liquidity ?? 0);
    const holders = toNumberSafe(dexData.holders ?? dexData.holderCount ?? 0);
    const buyTax = toNumberSafe(dexData.buyTax ?? dexData.buy_tax ?? 0);
    const sellTax = toNumberSafe(dexData.sellTax ?? dexData.sell_tax ?? 0);

    details.liquidityUSD = liquidityUSD;
    details.holders = holders;
    details.buyTax = buyTax;
    details.sellTax = sellTax;

    const MIN_LIQ = (config.ANTIRUG?.MIN_LIQUIDITY_BNB ?? 0.5) * (config.ANTIRUG?.BNB_USD_PRICE ?? 300);
    if (liquidityUSD < MIN_LIQ) flags.push("low_liquidity_usd");
    if (holders < (config.ANTIRUG?.MIN_HOLDERS ?? 20)) flags.push("low_holder_count");
    if (buyTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25) || sellTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25)) {
      flags.push("high_tax");
    }

    let bytecode = "";
    try {
      bytecode = await withRetries(() => provider.getCode(tokenAddress));
      const bcFlags = basicBytecodeFlags(bytecode);
      if (bcFlags.length) flags.push(...bcFlags);
      details.bytecodeLength = bytecode.length;
    } catch (err) {
      log.warn({ err: err?.message }, "Bytecode fetch failed");
      details.bytecodeError = err?.message ?? String(err);
    }

  } catch (e) {
    log.warn({ err: e?.message }, "honeypotHeuristic error");
  }

  return { flags: Array.from(new Set(flags)), details };
}

// --- Main analyzer ---
export async function analyzeToken(tokenAddress, dsRaw = {}) {
  const id = uid("sig_");
  const out = {
    id,
    token: tokenAddress,
    score: 100,
    riskLevel: "LOW",
    flags: [],
    details: {},
    timestamp: Date.now()
  };

  if (!tokenAddress) {
    out.flags.push("invalid_address");
    return out;
  }

  const provider = getProvider();

  // --- Fetch Dexscreener data if needed ---
  let dsData = dsRaw && Object.keys(dsRaw).length ? dsRaw : {};
  if (!dsData || Object.keys(dsData).length === 0) {
    try {
      if (typeof dsUtils.getPair === "function") dsData = await dsUtils.getPair(tokenAddress);
      else if (typeof dsUtils.fetchTokenFromDexscreener === "function") dsData = await dsUtils.fetchTokenFromDexscreener(tokenAddress);
      else {
        const resp = await axios.get(`${config.DEXSCREENER_API}${tokenAddress}`, { timeout: 8000 });
        dsData = resp.data || {};
      }
    } catch (err) {
      log.warn({ err: err?.message, tokenAddress }, "Failed fetching Dexscreener data");
      dsData = {};
    }
  }

  // --- Normalize numeric fields ---
  const liquidityUSD = toNumberSafe(dsData.liquidity?.usd ?? dsData.liquidity ?? 0);
  const priceUSD = toNumberSafe(dsData.priceUsd ?? dsData.price ?? 0);
  const holders = toNumberSafe(dsData.holders ?? dsData.holderCount ?? 0);
  const volume24h = toNumberSafe(dsData.volume?.usd ?? dsData.volume ?? 0);
  const fdv = toNumberSafe(dsData.fdv ?? dsData.marketCap ?? 0);

  out.details.dex = { liquidityUSD, priceUSD, holders, volume24h, fdv };

  // --- Owner concentration ---
  try {
    const tokenContract = new ethers.Contract(tokenAddress, [
      'function totalSupply() view returns (uint256)',
      'function balanceOf(address) view returns (uint256)',
      'function owner() view returns (address)'
    ], provider);

    const totalSupply = await withRetries(() => tokenContract.totalSupply());
    const ownerAddr = await withRetries(() => tokenContract.owner?.());
    if (ownerAddr && totalSupply > 0n) {
      const ownerBalance = await withRetries(() => tokenContract.balanceOf(ownerAddr));
      const ownerPct = Number(ownerBalance * 100n / totalSupply);
      out.details.ownerPct = ownerPct;
      if (ownerPct > 50) { out.score -= 30; out.flags.push("highOwnerPct"); }
      else if (ownerPct > 30) { out.score -= 15; out.flags.push("moderateOwnerPct"); }
    }
  } catch (e) {
    log.debug({ err: e?.message, tokenAddress }, "Owner concentration skipped");
  }

  // --- Honeypot & bytecode ---
  const hp = await honeypotHeuristic(dsData, provider, tokenAddress);
  if (hp.flags.length) out.flags.push(...hp.flags);
  out.details.honeypotDetails = hp.details ?? {};

  // --- Contract suspicious functions ---
  try {
    const bytecode = await withRetries(() => provider.getCode(tokenAddress));
    const suspiciousPatterns = /(mint|blacklist|setFee|setTradingEnabled|withdraw|emergencyWithdraw)/i;
    if (suspiciousPatterns.test(bytecode)) { out.score -= 20; out.flags.push("suspiciousBytecode"); }
  } catch {}

  // --- Volume heuristics ---
  if (volume24h > 1_000_000) out.flags.push("highVolume");
  if (volume24h > 5_000_000) out.score -= 10;

  // --- Liquidity weighting & metrics ---
  const liqThresholdUsd = (config.SNIPER?.MIN_LIQUIDITY_BNB ?? 0.5) * (config.ANTIRUG?.BNB_USD_PRICE ?? 300);
  const liquidityMetric = Math.min(1, liquidityUSD / Math.max(1, liqThresholdUsd));
  out.details.liquidityMetric = liquidityMetric;

  // --- Weighted scoring vector ---
  const metrics = {
    liquidity: liquidityMetric,
    contract: 1 - ((out.details.ownerPct ?? 0) / 100),
    social: Math.min(1, volume24h / Math.max(1, liquidityUSD) * 5),
    devWallets: 1 - ((out.details.ownerPct ?? 0) / 100)
  };
  const weights = config.ANTIRUG?.SCORE_WEIGHTS ?? { liquidity:0.25, contract:0.35, social:0.2, devWallets:0.2 };
  const score = computeWeightsScore(metrics, weights);
  out.score = score;
  out.riskLevel = riskFromScore(score);

  // --- Flags from thresholds ---
  if (liquidityMetric < 0.2) out.flags.push("low_liquidity");
  if ((out.details.ownerPct ?? 0) > 60) out.flags.push("dev_concentration_high");
  if (volume24h / Math.max(1, liquidityUSD) > 3) out.flags.push("abnormal_volume_spike");

  out.flags = Array.from(new Set(out.flags));

  // --- Recommendations ---
  const recommended = {};
  const defaultBuyPercent = config.SNIPER?.DEFAULT_BUY_PERCENT ?? 0.5;
  if (out.riskLevel === "LOW") {
    recommended.recommendedBuyPercent = Math.min(2, defaultBuyPercent);
    recommended.minBuyUsd = Math.max(1,1);
  } else if (out.riskLevel === "MEDIUM") {
    recommended.recommendedBuyPercent = Math.max(0, defaultBuyPercent/2);
    recommended.minBuyUsd = Math.max(1,2);
  } else {
    recommended.recommendedBuyPercent = 0;
    recommended.minBuyUsd = Math.max(1,5);
  }
  out.details.recommended = recommended;

  // --- Dex summary ---
  out.details.dexSummary = {
    name: dsData.name ?? dsData.token ?? dsData.symbol ?? "",
    symbol: dsData.symbol ?? dsData.tokenSymbol ?? "",
    pairUrl: dsData.url ?? dsData.pairUrl ?? dsData.pair ?? null
  };

  log.info({ id, tokenAddress, score: out.score, risk: out.riskLevel, flags: out.flags }, "Processed token");
  return out;
}

export default { analyzeToken };
