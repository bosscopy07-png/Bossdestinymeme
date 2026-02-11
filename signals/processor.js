
/**
 * FILE: signals/processor.js
 *
 * Hyper Beast Token / Pair Signal Processor
 * - Anti-rug heuristics
 * - Owner concentration
 * - Liquidity/volume scoring
 * - Honeypot & suspicious bytecode detection
 * - Guarded Telegram emission
 */

import Pino from "pino";
import { ethers } from "ethers";
import config from "../config/index.js";
import * as dsUtils from "../utils/dexscreener.js";
import { getProvider, withRetries } from "../utils/web3.js";
import { notifyTelegram } from "../telegram/sender.js";
import { passesGuards } from "../core/guards.js";
import { getState } from "../core/state.js";
import { logInfo } from "../utils/logs.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });

/* =========================
   HELPERS
========================= */
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

/* =========================
   BYTECODE FLAGS
========================= */
function basicBytecodeFlags(bytecode = "") {
  if (!bytecode || bytecode === "0x") return ["no_bytecode"];
  const flags = [];
  const suspects = [
    "mint","burn","blacklist","whitelist","settax","setfee","maxtx","maxwallet",
    "renounce","owner","onlyowner","lock","unlock","pause","swapandliquify",
    "sniper","antibot","trading","transferownership","isexcludedfromfee"
  ];
  const b = bytecode.toLowerCase();
  for (const s of suspects) if (b.includes(s)) flags.push(`bytecode_${s}`);
  return flags;
}

/* =========================
   HONEYPOT HEURISTIC
========================= */
async function honeypotHeuristic(dexData, provider, tokenAddress) {
  const flags = [];
  const details = {};
  try {
    const liquidityUSD = toNumberSafe(dexData.liquidity?.usd ?? dexData.liquidity);
    const holders = toNumberSafe(dexData.holders ?? dexData.holderCount);
    const buyTax = toNumberSafe(dexData.buyTax ?? dexData.buy_tax);
    const sellTax = toNumberSafe(dexData.sellTax ?? dexData.sell_tax);

    details.liquidityUSD = liquidityUSD;
    details.holders = holders;
    details.buyTax = buyTax;
    details.sellTax = sellTax;

    const minLiqUsd =
      (config.ANTIRUG?.MIN_LIQUIDITY_BNB ?? 0.5) *
      (config.ANTIRUG?.BNB_USD_PRICE ?? 300);

    if (liquidityUSD < minLiqUsd) flags.push("low_liquidity_usd");
    if (holders < (config.ANTIRUG?.MIN_HOLDERS ?? 20)) flags.push("low_holders");
    if (buyTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25) ||
        sellTax > (config.ANTIRUG?.HIGH_TAX_THRESHOLD_PERCENT ?? 25)) {
      flags.push("high_tax");
    }

    const bytecode = await withRetries(() => provider.getCode(tokenAddress));
    details.bytecodeLength = bytecode.length;
    flags.push(...basicBytecodeFlags(bytecode));
  } catch (err) {
    details.error = err.message;
    flags.push("honeypot_check_failed");
  }

  return { flags: [...new Set(flags)], details };
}

/* =========================
   MAIN ANALYZER
========================= */
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
  let dsData = dsRaw;

  if (!Object.keys(dsData).length) {
    dsData =
      dsUtils.getCached?.(tokenAddress) ??
      (await dsUtils.fetchToken?.(tokenAddress)) ??
      {};
  }

  const liquidityUSD = toNumberSafe(dsData.liquidity?.usd ?? dsData.liquidity);
  const volume24h = toNumberSafe(dsData.volume?.usd ?? dsData.volume);
  const holders = toNumberSafe(dsData.holders);
  const fdv = toNumberSafe(dsData.fdv);

  out.details.dex = { liquidityUSD, volume24h, holders, fdv };

  // Owner concentration
  try {
    const token = new ethers.Contract(
      tokenAddress,
      [
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "function owner() view returns (address)"
      ],
      provider
    );

    const total = await withRetries(() => token.totalSupply());
    const owner = await withRetries(() => token.owner?.());
    if (owner && total > 0n) {
      const bal = await withRetries(() => token.balanceOf(owner));
      const pct = Number((bal * 10000n) / total) / 100;
      out.details.ownerPct = pct;
      if (pct > 50) out.flags.push("owner_gt_50");
      if (pct > 30) out.score -= 15;
    }
  } catch {}

  const hp = await honeypotHeuristic(dsData, provider, tokenAddress);
  out.flags.push(...hp.flags);
  out.details.honeypot = hp.details;

  const liqMetric = Math.min(
    1,
    liquidityUSD /
      ((config.SNIPER?.MIN_LIQUIDITY_BNB ?? 0.5) *
        (config.ANTIRUG?.BNB_USD_PRICE ?? 300))
  );

  out.score = Math.round(liqMetric * 100);
  out.riskLevel = riskFromScore(out.score);
  out.flags = [...new Set(out.flags)];

  return out;
}

/* =========================
   SIGNAL EMITTER
========================= */
export function processSignal(signal) {
  if (!signal) return;

  const state = getState();

  // Only process if signaling enabled
  if (!state.control?.signaling) return;

  // Guarded token filter
  if (!passesGuards(signal.token)) return;

  state.stats.signaled = (state.stats.signaled || 0) + 1;

  // Send signal to Telegram
  notifyTelegram(signal);
}

/* =========================
   INIT
========================= */
export function initSignalProcessor() {
  logInfo("🧠 Signal processor initialized");
}

export default { analyzeToken, processSignal, initSignalProcessor };
