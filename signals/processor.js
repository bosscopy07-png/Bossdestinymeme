/**
 * FILE: signals/processor.js
 *
 * Hyper Beast Token / Pair Signal Processor
 * - Anti-rug heuristics
 * - Owner concentration
 * - Liquidity/volume scoring
 * - Honeypot & suspicious bytecode detection
 * - Telegram-ready enriched payload
 */

import Pino from "pino";
import { ethers } from "ethers";
import axios from "axios";
import config from "../config/index.js";
import * as dsUtils from "../utils/dexscreener.js";
import { getProvider, withRetries } from "../utils/web3.js";
import { notifyTelegram } from "../telegram/sender.js";
import { logInfo, logError } from "../utils/logs.js";

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
  if (!bytecode || bytecode === "0x") return ["no_bytecode"];
  const flags = [];
  const b = bytecode.toLowerCase();
  const suspects = [
    "mint","burn","blacklist","whitelist","settax","setfee","maxtx","maxwallet",
    "renounce","owner","onlyowner","lock","unlock","pause","swapandliquify",
    "sniper","antibot","trading","transferownership","isexcludedfromfee"
  ];
  for (const s of suspects) if (b.includes(s)) flags.push(`bytecode_contains_${s}`);
  return flags;
}

function computeWeightsScore(metrics = {}, weights = {}) {
  let sum = 0, totalWeight = 0;
  for (const k of Object.keys(weights)) {
    const w = Number(weights[k] ?? 0);
    totalWeight += w;
    sum += toNumberSafe(metrics[k]) * w;
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
    if (buyTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25) || sellTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25)) flags.push("high_tax");

    // --- Fetch bytecode once ---
    const bytecode = await withRetries(() => provider.getCode(tokenAddress));
    details.bytecodeLength = bytecode.length;
    flags.push(...basicBytecodeFlags(bytecode));

  } catch (err) {
    log.warn({ err: err?.message }, "honeypotHeuristic failed");
    details.bytecodeError = err?.message ?? String(err);
  }
  return { flags: Array.from(new Set(flags)), details };
}

// --- Main analyzer ---
export async function analyzeToken(tokenAddress, dsRaw = {}) {
  const id = uid("sig_");
  const out = { id, token: tokenAddress, score: 100, riskLevel: "LOW", flags: [], details: {}, timestamp: Date.now() };
  if (!tokenAddress) { out.flags.push("invalid_address"); return out; }

  const provider = getProvider();

  // --- Dexscreener fetch & fallback ---
  let dsData = dsRaw && Object.keys(dsRaw).length ? dsRaw : {};
  if (!dsData || Object.keys(dsData).length === 0) {
    try {
      if (typeof dsUtils.getCached === "function") dsData = dsUtils.getCached(tokenAddress) ?? {};
      else if (typeof dsUtils.fetchToken === "function") dsData = await dsUtils.fetchToken(tokenAddress) ?? {};
      else {
        const resp = await axios.get(`${config.DEXSCREENER_API}${tokenAddress}`, { timeout: 8000 });
        dsData = resp.data ?? {};
      }
    } catch (err) {
      log.warn({ err: err?.message, tokenAddress }, "Dexscreener fetch failed");
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
    const ownerAddr = await withRetries(async () => tokenContract.owner?.() ?? "0x0000000000000000000000000000000000000000");
    if (ownerAddr && totalSupply > 0n) {
      const ownerBalance = await withRetries(() => tokenContract.balanceOf(ownerAddr));
      const ownerPct = Number((ownerBalance * 10000n / totalSupply)/100);
      out.details.ownerPct = ownerPct;
      if (ownerPct > 50) { out.score -= 30; out.flags.push("highOwnerPct"); }
      else if (ownerPct > 30) { out.score -= 15; out.flags.push("moderateOwnerPct"); }
    }
  } catch (e) { log.debug({ err: e?.message, tokenAddress }, "Owner concentration skipped"); }

  // --- Honeypot & bytecode analysis ---
  const hp = await honeypotHeuristic(dsData, provider, tokenAddress);
  out.flags.push(...hp.flags);
  out.details.honeypotDetails = hp.details ?? {};

  // --- Volume / liquidity heuristics ---
  if (volume24h > 1_000_000) out.flags.push("highVolume");
  if (volume24h > 5_000_000) out.score -= 10;

  const liqThresholdUsd = (config.SNIPER?.MIN_LIQUIDITY_BNB ?? 0.5) * (config.ANTIRUG?.BNB_USD_PRICE ?? 300);
  const liquidityMetric = Math.min(1, liquidityUSD / Math.max(1, liqThresholdUsd));
  out.details.liquidityMetric = liquidityMetric;

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

  if (liquidityMetric < 0.2) out.flags.push("low_liquidity");
  if ((out.details.ownerPct ?? 0) > 60) out.flags.push("dev_concentration_high");
  if (volume24h / Math.max(1, liquidityUSD) > 3) out.flags.push("abnormal_volume_spike");

  out.flags = Array.from(new Set(out.flags));

  // --- Recommendations ---
  const recommended = {};
  const defaultBuyPercent = config.SNIPER?.DEFAULT_BUY_PERCENT ?? 0.5;
  if (out.riskLevel === "LOW") { recommended.recommendedBuyPercent = Math.min(2, defaultBuyPercent); recommended.minBuyUsd = Math.max(1, 1); }
  else if (out.riskLevel === "MEDIUM") { recommended.recommendedBuyPercent = Math.max(0, defaultBuyPercent/2); recommended.minBuyUsd = 2; }
  else { recommended.recommendedBuyPercent = 0; recommended.minBuyUsd = 5; }
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

// --- Signal processor ---
export function initSignalProcessor() { logInfo("🧠 Signal processor ready"); }

export function processSignal(signal) {
  // --- Risk filter: only send LOW/MEDIUM signals ---
  if (!signal || signal.score < (config.SNIPER?.MIN_SCORE ?? 40)) return;
  notifyTelegram(signal);
}

export default { analyzeToken };
