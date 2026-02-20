// trader/paperTrader.js
// High-fidelity persistent paper trading engine (v2)

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { logInfo, logWarn, logError } from "../utils/logs.js";
import config from "../config/index.js";

const DB_FILE = path.join(process.cwd(), "paper_pnl.json");
const LOCK_FILE = DB_FILE + ".lock";

/* ======================================================
   DEFAULT DB
====================================================== */
const DEFAULT_DB = {
  balanceUsd: 1000,
  peakBalance: 1000,
  positions: {}, // token => { tokens, avgEntry }
  trades: [],
  stats: {
    wins: 0,
    losses: 0,
    maxDrawdown: 0
  }
};

/* ======================================================
   SIMPLE MUTEX
====================================================== */
async function withLock(fn) {
  while (true) {
    try {
      await fs.open(LOCK_FILE, "wx");
      break;
    } catch {
      await new Promise(r => setTimeout(r, 20));
    }
  }

  try {
    return await fn();
  } finally {
    await fs.unlink(LOCK_FILE).catch(() => {});
  }
}

/* ======================================================
   DB HELPERS
====================================================== */
async function loadDB() {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

async function saveDB(db) {
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

/* ======================================================
   UTIL
====================================================== */
function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function validatePrice(price) {
  if (!price || !Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid price feed");
  }
}

function applySlippage(price, percent, side) {
  const p = percent / 100;
  return side === "buy" ? price * (1 + p) : price * (1 - p);
}

/* ======================================================
   BUY
====================================================== */
export async function paperBuy({ token, priceUsd }) {
  validatePrice(priceUsd);

  return withLock(async () => {
    const db = await loadDB();

    const riskPct = config.PAPER_RISK_PERCENT ?? 5;
    const usdAmount = (db.balanceUsd * riskPct) / 100;

    if (usdAmount < 1) {
      logWarn("Paper buy skipped: too small balance");
      return;
    }

    const execPrice = applySlippage(
      priceUsd,
      config.MAX_SLIPPAGE ?? 1,
      "buy"
    );

    const tokens = usdAmount / execPrice;
    db.balanceUsd -= usdAmount;

    const pos = db.positions[token] || { tokens: 0, avgEntry: 0 };
    const totalValue =
      pos.tokens * pos.avgEntry + tokens * execPrice;

    pos.tokens += tokens;
    pos.avgEntry = totalValue / pos.tokens;
    db.positions[token] = pos;

    db.trades.push({
      id: id("buy"),
      side: "buy",
      token,
      usd: usdAmount,
      price: execPrice,
      tokens,
      time: Date.now()
    });

    await saveDB(db);
    logInfo(`📘 PAPER BUY ${token} $${usdAmount.toFixed(2)}`);
  });
}

/* ======================================================
   SELL (supports partial)
====================================================== */
export async function paperSell({ token, priceUsd, reason, fraction = 1 }) {
  validatePrice(priceUsd);

  return withLock(async () => {
    const db = await loadDB();
    const pos = db.positions[token];
    if (!pos) return;

    const sellTokens = pos.tokens * fraction;
    if (sellTokens <= 0) return;

    const execPrice = applySlippage(
      priceUsd,
      config.MAX_SLIPPAGE ?? 1,
      "sell"
    );

    const usdOut = sellTokens * execPrice;
    const cost = sellTokens * pos.avgEntry;
    const pnl = usdOut - cost;

    pos.tokens -= sellTokens;
    if (pos.tokens <= 0) delete db.positions[token];

    db.balanceUsd += usdOut;

    db.peakBalance = Math.max(db.peakBalance, db.balanceUsd);
    const dd =
      (db.peakBalance - db.balanceUsd) / db.peakBalance;
    db.stats.maxDrawdown = Math.max(db.stats.maxDrawdown, dd);

    pnl > 0 ? db.stats.wins++ : db.stats.losses++;

    db.trades.push({
      id: id("sell"),
      side: "sell",
      token,
      usd: usdOut,
      price: execPrice,
      pnl,
      reason,
      time: Date.now()
    });

    await saveDB(db);
    logInfo(`📕 PAPER SELL ${token} PnL: $${pnl.toFixed(2)} (${reason})`);
  });
}

/* ======================================================
   MONITOR ENGINE
====================================================== */
export async function evaluatePaperPosition({ token, currentPrice }) {
  validatePrice(currentPrice);

  const db = await loadDB();
  const pos = db.positions[token];
  if (!pos) return;

  const change =
    (currentPrice - pos.avgEntry) / pos.avgEntry;

  if (change >= 0.3) {
    await paperSell({ token, priceUsd: currentPrice, reason: "TP", fraction: 0.5 });
  }

  if (change <= -0.2) {
    await paperSell({ token, priceUsd: currentPrice, reason: "SL" });
  }
}

/* ======================================================
   READ API
====================================================== */
export async function getPaperSummary() {
  const db = await loadDB();
  return {
    balance: db.balanceUsd,
    openPositions: Object.keys(db.positions).length,
    trades: db.trades.length,
    winRate:
      db.trades.length === 0
        ? 0
        : (db.stats.wins / db.trades.length) * 100,
    maxDrawdown: (db.stats.maxDrawdown * 100).toFixed(2) + "%"
  };
}

export default {
  paperBuy,
  paperSell,
  evaluatePaperPosition,
  getPaperSummary
};
