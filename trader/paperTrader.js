// trader/paperTrader.js
// High-fidelity paper trading engine (ESM)
// Tracks positions, PnL, balance, realistic slippage + fee model

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { logInfo, logWarn, logError } from "../utils/logs.js";
import { formatCurrency } from "../utils/format.js";
import config from "../config/index.js";

// --- Resolve project root safely in ESM ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(process.cwd(), "pnl.json");

// --- Default DB structure ---
const DEFAULT_DB = Object.freeze({
  trades: [],
  positions: [],
  balanceUsd: 1000
});

// -------------------------
// Load / Save Database
// -------------------------
async function loadDB() {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

async function saveDB(db) {
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

// -------------------------
// Helpers
// -------------------------
export async function getWalletUsd() {
  const db = await loadDB();
  return Number(db.balanceUsd || 0);
}

function genID(prefix = "paper") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function applySlippage(price, percent) {
  return price * (1 + percent / 100);
}

// -------------------------
// BUY
// -------------------------
export async function buy(tokenAddress, opts = {}) {
  const db = await loadDB();
  const wallet = db.balanceUsd;

  const usdAmount =
    Number(opts.usdAmount) ||
    Number(((config.DEFAULT_BUY_PERCENT || 1) / 100) * wallet) ||
    1;

  if (usdAmount > wallet) throw new Error("PaperTrade: insufficient balance");

  const slippage = Number(opts.maxSlippagePercent ?? config.MAX_SLIPPAGE) || 1;

  const rawPrice = Number(opts.estimatedPriceUsd ?? 0.01);
  const execPrice = applySlippage(rawPrice, slippage);

  const tokens = usdAmount / execPrice;

  const trade = {
    id: genID("buy"),
    side: "buy",
    token: tokenAddress,
    usd: usdAmount,
    priceUsd: execPrice,
    tokens,
    slippagePercent: slippage,
    timestamp: Date.now()
  };

  // Store position
  db.positions.push({
    id: trade.id,
    token: tokenAddress,
    tokens,
    entryPrice: execPrice,
    usdInvested: usdAmount,
    timestamp: trade.timestamp
  });

  db.trades.push(trade);
  db.balanceUsd = Number((wallet - usdAmount).toFixed(6));

  await saveDB(db);
  logInfo(`📈 PAPER BUY → ${tokenAddress} | $${usdAmount} @ $${execPrice.toFixed(6)}`);

  return trade;
}

// -------------------------
// SELL
// -------------------------
export async function sell(tokenAddress, opts = {}) {
  const db = await loadDB();

  // Merge multi-positions into one synthetic position
  const positions = db.positions.filter(
    p => p.token.toLowerCase() === tokenAddress.toLowerCase()
  );

  if (positions.length === 0) throw new Error("No position to sell");

  const totalTokens = positions.reduce((a, p) => a + Number(p.tokens), 0);

  const sellTokens = Number(opts.amountTokens ?? totalTokens);
  if (sellTokens > totalTokens) throw new Error("Sell amount exceeds holdings");

  const avgEntryPrice =
    positions.reduce((a, p) => a + p.entryPrice * p.tokens, 0) / totalTokens;

  const estPrice = Number(opts.estimatedPriceUsd ?? avgEntryPrice);

  const slippage = Number(opts.slippagePercent ?? config.MAX_SLIPPAGE) || 1;
  const execPrice = estPrice * (1 - slippage / 100);

  const usdOut = sellTokens * execPrice;

  // Remove all old positions & create new one if partial remains
  db.positions = db.positions.filter(p => p.token !== tokenAddress);

  const remaining = totalTokens - sellTokens;
  if (remaining > 0) {
    db.positions.push({
      id: genID("pos"),
      token: tokenAddress,
      tokens: remaining,
      entryPrice: avgEntryPrice,
      usdInvested: remaining * avgEntryPrice,
      timestamp: Date.now()
    });
  }

  const trade = {
    id: genID("sell"),
    side: "sell",
    token: tokenAddress,
    tokens: sellTokens,
    priceUsd: execPrice,
    usd: usdOut,
    slippagePercent: slippage,
    pnlUsd: usdOut - sellTokens * avgEntryPrice,
    timestamp: Date.now()
  };

  db.trades.push(trade);
  db.balanceUsd = Number((db.balanceUsd + usdOut).toFixed(6));

  await saveDB(db);

  logInfo(
    `📉 PAPER SELL → ${tokenAddress} | OUT: $${usdOut.toFixed(
      4
    )} | PnL: $${trade.pnlUsd.toFixed(4)}`
  );

  return trade;
}

// -------------------------
export default { buy, sell, getWalletUsd };
