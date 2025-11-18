// trader/pnl.js
// Records trades for paper & live modes, enhanced PnL calc, and image generation.

import fs from "fs/promises";
import path from "path";
import { generatePnLImage } from "../utils/image.js";
import { logInfo, logWarn, logError } from "../utils/logs.js";

const DB = path.join(process.cwd(), "pnl.json");

async function read() {
  try {
    const raw = await fs.readFile(DB, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    logWarn("DB read failed, initializing new DB:", err.message);
    return { trades: [], realizedUsd: 0, balanceUsd: 1000, positions: [] };
  }
}

async function write(obj) {
  try {
    await fs.writeFile(DB, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    logError("DB write failed:", err.message);
    throw err;
  }
}

/**
 * Record a trade (buy/sell)
 */
export async function recordTrade(trade) {
  const db = await read();

  // Update positions for buys
  if (trade.side === "buy") {
    db.positions.push({
      id: trade.id,
      token: trade.token,
      entryPrice: trade.priceUsd,
      tokens: trade.tokens,
      usdInvested: trade.usd,
      timestamp: trade.timestamp,
    });
  }

  db.trades.push(trade);
  await write(db);
  logInfo(`Recorded trade ${trade.id ?? trade.tx ?? "unknown"}`);
  return trade;
}

/**
 * Close a trade (sell)
 * Calculates PnL automatically
 */
export async function recordClose({ id, token, soldPriceUsd, soldUsd, closedAt = Date.now() }) {
  const db = await read();

  const posIndex = db.positions.findIndex(p => p.id === id || p.token === token);
  if (posIndex === -1) {
    logWarn(`No open position found for ${id ?? token}`);
    return;
  }

  const position = db.positions[posIndex];

  const pnlUsd = soldUsd - position.usdInvested;
  db.realizedUsd = (db.realizedUsd || 0) + pnlUsd;
  db.balanceUsd = (db.balanceUsd || 0) + soldUsd;

  // Mark trade as closed
  const trade = db.trades.find(t => t.id === id);
  if (trade) {
    trade.closedAt = closedAt;
    trade.pnlUsd = pnlUsd;
    trade.soldPriceUsd = soldPriceUsd;
    trade.soldUsd = soldUsd;
  }

  // Remove position
  db.positions.splice(posIndex, 1);

  await write(db);
  logInfo(`Closed position ${id ?? token}, PnL: $${pnlUsd.toFixed(2)}`);
}

/**
 * Get PnL summary
 */
export async function getSummary() {
  const db = await read();

  const unrealizedUsd = db.positions.reduce((sum, p) => sum + (p.tokens * p.entryPrice), 0);

  const summary = {
    totalTrades: db.trades.length,
    realizedUsd: db.realizedUsd || 0,
    balanceUsd: db.balanceUsd || 1000,
    unrealizedUsd,
    positions: db.positions.length,
  };

  return summary;
}

/**
 * Export chart (image) for PnL visualization
 */
export async function exportChart() {
  const db = await read();
  try {
    const file = await generatePnLImage(db.trades, "pnl.png");
    logInfo("PnL chart generated");
    return file;
  } catch (err) {
    logError("Failed to generate PnL chart:", err.message);
    throw err;
  }
}

export default { recordTrade, recordClose, getSummary, exportChart };
