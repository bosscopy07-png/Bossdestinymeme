// FILE: utils/antiRugAI.js // Quantum‑Sniper — AI‑Driven Anti‑Rug Detection Engine // Destiny’s elite blockchain sniper protection system

import { getDexScreenerData } from "../integrations/dexscreener.js"; import { analyzeContract } from "../integrations/contractScanner.js"; import { getHoldersCount } from "../integrations/holders.js"; import { getLiquidityUSD } from "../integrations/liquidity.js";

/**

AI‑Based Risk Scoring Model

Score Range: 0–100 (higher = safer) */ export async function getRiskScore(tokenAddress) { const result = { address: tokenAddress, score: 0, passed: false, reasons: [], };


// Load env thresholds const MIN_LIQUIDITY = Number(process.env.MIN_LIQUIDITY || 3000); const MAX_TAX_BUY = Number(process.env.MAX_TAX_BUY || 15); const MAX_TAX_SELL = Number(process.env.MAX_TAX_SELL || 15); const MIN_HOLDERS = Number(process.env.MIN_HOLDERS || 50);

try { // ----------------------------- // 1. Dexscreener Data // ----------------------------- const dex = await getDexScreenerData(tokenAddress);

if (!dex) {
  result.reasons.push("Dex data unavailable (high risk)");
  return result;
}

const liquidity = getLiquidityUSD(dex);
const buyTax = dex.taxes?.buy || 0;
const sellTax = dex.taxes?.sell || 0;

// Liquidity check
if (liquidity < MIN_LIQUIDITY) {
  result.reasons.push(`Low liquidity: $${liquidity}`);
} else {
  result.score += 25;
}

// Tax checks
if (buyTax > MAX_TAX_BUY) {
  result.reasons.push(`Buy tax too high: ${buyTax}%`);
} else {
  result.score += 10;
}

if (sellTax > MAX_TAX_SELL) {
  result.reasons.push(`Sell tax too high: ${sellTax}%`);
} else {
  result.score += 10;
}

// -----------------------------
// 2. Contract Scanner (honeypot + owner perms)
// -----------------------------
const scan = await analyzeContract(tokenAddress);

if (scan?.isHoneypot) {
  result.reasons.push("Honeypot detected (cannot sell)");
  return result;
}

if (scan?.ownerCanMint) result.reasons.push("Owner can mint infinite supply");
if (scan?.ownerCanBlacklist) result.reasons.push("Owner can blacklist wallets");
if (scan?.ownerCanDisableTrading) result.reasons.push("Owner can disable trading");

// Reward clean contracts
if (!scan?.ownerCanMint && !scan?.ownerCanBlacklist && !scan?.ownerCanDisableTrading) {
  result.score += 25;
}

// -----------------------------
// 3. Holder Distribution
// -----------------------------
const holders = await getHoldersCount(tokenAddress);

if (holders < MIN_HOLDERS) {
  result.reasons.push(`Too few holders: ${holders}`);
} else {
  result.score += 15;
}

// -----------------------------
// 4. Dev Wallet Concentration
// -----------------------------
const devHold = scan?.topHolderPercent || 0;

if (devHold > 40) {
  result.reasons.push(`Dev holds dangerously high supply: ${devHold}%`);
} else {
  result.score += 15;
}

// -----------------------------
// Final Result
// -----------------------------
result.passed = result.score >= 60;

return result;

} catch (err) { result.reasons.push(AI risk check failed: ${err.message}); return result; } }

/**

Helper — Pretty print for bot / API */ export function formatRiskReport(r) { return 🧠 *AI Risk Report* Token: \${r.address}`


Score: ${r.score}/100 Status: ${r.passed ? "✅ SAFE" : "❌ HIGH RISK"}

Reasons:

${r.reasons.join("\n- ")}`; }
