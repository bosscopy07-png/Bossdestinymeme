// trader/pnl.js
// Unified PnL engine (paper + live), race-safe, multi-position aware

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { generatePnLImage } from "../utils/image.js";
import { logInfo, logWarn, logError } from "../utils/logs.js";

const DB = path.join(process.cwd(), "pnl.json");
const LOCK = DB + ".lock";

/* ======================================================
   MUTEX
====================================================== */
async function withLock(fn) {
  while (true) {
    try {
      await fs.open(LOCK, "wx");
      break;
    } catch {
      await new Promise(r => setTimeout(r, 15));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.unlink(LOCK).catch(() => {});
  }
}

/* ======================================================
   DB
====================================================== */
const DEFAULT_DB = {
  balanceUsd: 1000,
  realizedUsd: 0,
  trades: [],
  positions: [],
  stats: {
    wins: 0,
    losses: 0
  }
};

async function read() {
  try {
    return JSON.parse(await fs.readFile(DB, "utf8"));
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

async function write(db) {
  const tmp = DB + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB);
}

/* ======================================================
   RECORD BUY
====================================================== */
export async function recordTrade(trade) {
  return withLock(async () => {
    const db = await read();

    const id = trade.id ?? crypto.randomUUID();

    if (trade.side === "buy") {
      db.positions.push({
        id,
        mode: trade.mode ?? "paper",
        token: trade.token,
        entryPrice: trade.priceUsd,
        tokens: trade.tokens,
        usdInvested: trade.usd,
        openedAt: trade.timestamp ?? Date.now()
      });
    }

    db.trades.push({ ...trade, id });
    await write(db);

    logInfo(`📘 Trade recorded: ${id}`);
    return id;
  });
}

/* ======================================================
   RECORD SELL
====================================================== */
export async function recordClose({
  positionId,
  soldPriceUsd,
  soldUsd,
  closedAt = Date.now()
}) {
  return withLock(async () => {
    const db = await read();

    const idx = db.positions.findIndex(p => p.id === positionId);
    if (idx === -1) {
      logWarn(`No open position found: ${positionId}`);
      return;
    }

    const pos = db.positions[idx];
    const pnlUsd = soldUsd - pos.usdInvested;

    db.realizedUsd += pnlUsd;
    db.balanceUsd += soldUsd;
    pnlUsd >= 0 ? db.stats.wins++ : db.stats.losses++;

    db.trades.push({
      id: crypto.randomUUID(),
      side: "sell",
      mode: pos.mode,
      token: pos.token,
      soldPriceUsd,
      soldUsd,
      pnlUsd,
      closedAt
    });

    db.positions.splice(idx, 1);
    await write(db);

    logInfo(`📕 Closed ${pos.token} | PnL: $${pnlUsd.toFixed(2)}`);
  });
}

/* ======================================================
   SUMMARY
====================================================== */
export async function getSummary() {
  const db = await read();

  const total = db.stats.wins + db.stats.losses;
  const winRate = total ? (db.stats.wins / total) * 100 : 0;

  return {
    balanceUsd: db.balanceUsd,
    realizedUsd: db.realizedUsd,
    openPositions: db.positions.length,
    totalTrades: db.trades.length,
    wins: db.stats.wins,
    losses: db.stats.losses,
    winRate: winRate.toFixed(2) + "%"
  };
}

/* ======================================================
   EXPORT IMAGE
====================================================== */
export async function exportChart() {
  const db = await read();
  const file = await generatePnLImage(db.trades, "pnl.png");
  logInfo("📊 PnL chart generated");
  return file;
}

export default {
  recordTrade,
  recordClose,
  getSummary,
  exportChart
};
