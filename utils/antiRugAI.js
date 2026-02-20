/**
 * FILE: utils/antiRugAI.js
 * Quantum-Sniper — AI-Driven Anti-Rug Detection Engine
 * Destiny's elite blockchain sniper protection system
 */

import { getDexScreenerData } from "../integrations/dexscreener.js";
import { analyzeContract } from "../integrations/contractScanner.js";
import { getHoldersCount } from "../integrations/holders.js";
import { getLiquidityUSD } from "../integrations/liquidity.js";
import { logInfo, logWarn, logError } from "./logs.js";

// Default thresholds from ENV or safe defaults
const THRESHOLDS = {
  MIN_LIQUIDITY: Number(process.env.MIN_LIQUIDITY || 3000),
  MAX_TAX_BUY: Number(process.env.MAX_TAX_BUY || 15),
  MAX_TAX_SELL: Number(process.env.MAX_TAX_SELL || 15),
  MIN_HOLDERS: Number(process.env.MIN_HOLDERS || 50),
  DEV_HOLD_MAX: Number(process.env.DEV_HOLD_MAX || 40),
  PASS_SCORE: Number(process.env.AI_PASS_SCORE || 60)
};

/**
 * getRiskScore
 * @param {string} tokenAddress
 * @returns {Promise<{score:number, passed:boolean, reasons:string[], address:string}>}
 */
export async function getRiskScore(tokenAddress) {
  const result = {
    address: tokenAddress,
    score: 0,
    passed: false,
    reasons: []
  };

  if (!tokenAddress) {
    result.reasons.push("Token address missing");
    return result;
  }

  try {
    // -----------------------------
    // 1. Dexscreener Data
    // -----------------------------
    const dex = await getDexScreenerData(tokenAddress);
    if (!dex) {
      result.reasons.push("Dex data unavailable (high risk)");
      return result;
    }

    const liquidity = getLiquidityUSD(dex);
    const buyTax = dex.taxes?.buy || 0;
    const sellTax = dex.taxes?.sell || 0;

    // Liquidity check
    if (liquidity < THRESHOLDS.MIN_LIQUIDITY) {
      result.reasons.push(`Low liquidity: $${liquidity}`);
    } else {
      result.score += 25;
    }

    // Tax checks
    if (buyTax > THRESHOLDS.MAX_TAX_BUY) {
      result.reasons.push(`Buy tax too high: ${buyTax}%`);
    } else {
      result.score += 10;
    }

    if (sellTax > THRESHOLDS.MAX_TAX_SELL) {
      result.reasons.push(`Sell tax too high: ${sellTax}%`);
    } else {
      result.score += 10;
    }

    // -----------------------------
    // 2. Contract Scanner
    // -----------------------------
    const scan = await analyzeContract(tokenAddress);

    if (scan?.isHoneypot) {
      result.reasons.push("Honeypot detected (cannot sell)");
      return result;
    }

    if (scan?.ownerCanMint) result.reasons.push("Owner can mint infinite supply");
    if (scan?.ownerCanBlacklist) result.reasons.push("Owner can blacklist wallets");
    if (scan?.ownerCanDisableTrading) result.reasons.push("Owner can disable trading");

    if (!scan?.ownerCanMint && !scan?.ownerCanBlacklist && !scan?.ownerCanDisableTrading) {
      result.score += 25;
    }

    // -----------------------------
    // 3. Holder Distribution
    // -----------------------------
    const holders = await getHoldersCount(tokenAddress);
    if (holders < THRESHOLDS.MIN_HOLDERS) {
      result.reasons.push(`Too few holders: ${holders}`);
    } else {
      result.score += 15;
    }

    // -----------------------------
    // 4. Dev Wallet Concentration
    // -----------------------------
    const devHold = scan?.topHolderPercent || 0;
    if (devHold > THRESHOLDS.DEV_HOLD_MAX) {
      result.reasons.push(`Dev holds dangerously high supply: ${devHold}%`);
    } else {
      result.score += 15;
    }

    // -----------------------------
    // 5. Final result
    // -----------------------------
    result.passed = result.score >= THRESHOLDS.PASS_SCORE;

    logInfo({ token: tokenAddress, score: result.score, passed: result.passed }, "Risk score computed");
    return result;

  } catch (err) {
    result.reasons.push(`AI risk check failed: ${err.message}`);
    logError({ token: tokenAddress, err: err.message }, "getRiskScore error");
    return result;
  }
}

/**
 * formatRiskReport
 * Pretty-print report for Telegram / API
 */
export function formatRiskReport(r) {
  return `🧠 *AI Risk Report*
Token: ${r.address}
Score: ${r.score}/100
Status: ${r.passed ? "✅ SAFE" : "❌ HIGH RISK"}

Reasons:
- ${r.reasons.join("\n- ")}
`;
}

export default { getRiskScore, formatRiskReport };
