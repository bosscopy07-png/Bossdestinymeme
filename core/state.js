// FILE: core/state.js

import EventEmitter from "eventemitter3";
import { logInfo, logWarn } from "../utils/logs.js";

/**
 * GLOBAL RUNTIME STATE
 * Single source of truth for bot, scanner & trading engine
 */
class CoreState extends EventEmitter {
  constructor() {
    super();

    // ----------------------------
    // SYSTEM
    // ----------------------------
    this.startedAt = Date.now();
    this.initialized = false;

    // ----------------------------
    // BOT
    // ----------------------------
    this.bot = null;

    // ----------------------------
    // MODES / CONTROL
    // ----------------------------
    this.tradingMode = "paper"; // paper | live
    this.sniperEnabled = true;
    this.scannerRunning = true;
    this.signalingEnabled = true;

    // ----------------------------
    // RUNTIME DATA
    // ----------------------------
    this.activeSignals = new Map(); // address => signal
    this.watchlist = new Set();

    // ----------------------------
    // PAPER TRADING (SIMULATION)
    // ----------------------------
    this.paper = {
      enabled: true,
      balance: 1000, // virtual USDC
      trades: [] // { address, side, amount, price, pnl, time }
    };

    // ----------------------------
    // RPC
    // ----------------------------
    this.rpc = {
      active: null,
      failed: new Set()
    };

    // ----------------------------
    // METRICS
    // ----------------------------
    this.stats = {
      scanned: 0,
      signaled: 0,
      sent: 0,
      buys: 0,
      sells: 0,
      errors: 0
    };
  }

  /* ============================
      INITIALIZATION
  ============================ */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    logInfo("🧠 CoreState initialized");
  }

  /* ============================
      BOT
  ============================ */
  registerBot(bot) {
    this.bot = bot;
    logInfo("🤖 Bot registered in CoreState");
  }

  getBot() {
    return this.bot;
  }

  /* ============================
      SCANNER
  ============================ */
  startScanner() {
    if (this.scannerRunning) return;
    this.scannerRunning = true;
    this.emit("scanner:start");
    logInfo("🔍 Scanner started");
  }

  stopScanner() {
    if (!this.scannerRunning) return;
    this.scannerRunning = false;
    this.emit("scanner:stop");
    logInfo("🛑 Scanner stopped");
  }

  /* ============================
      TRADING MODES
  ============================ */
  setTradingMode(mode) {
    if (!["paper", "live"].includes(mode)) {
      logWarn(`Invalid trading mode: ${mode}`);
      return;
    }

    this.tradingMode = mode;
    this.paper.enabled = mode === "paper";
    this.emit("mode:changed", mode);

    logInfo(`💱 Trading mode set to ${mode}`);
  }

  enableSniper() {
    this.sniperEnabled = true;
    this.emit("sniper:enabled");
    logInfo("🎯 Sniper ENABLED");
  }

  disableSniper() {
    this.sniperEnabled = false;
    this.emit("sniper:disabled");
    logInfo("🛑 Sniper DISABLED");
  }

  /* ============================
      SIGNALS
  ============================ */
  addSignal(signal) {
    if (!signal?.address) return;
    const key = signal.address.toLowerCase();

    if (this.activeSignals.has(key)) return;

    this.activeSignals.set(key, signal);
    this.stats.signaled++;
    this.emit("signal:new", signal);
  }

  removeSignal(address) {
    if (!address) return;
    this.activeSignals.delete(address.toLowerCase());
  }

  getSignals() {
    return [...this.activeSignals.values()];
  }

  /* ============================
      WATCHLIST
  ============================ */
  addWatch(address) {
    if (!address) return;
    this.watchlist.add(address.toLowerCase());
  }

  removeWatch(address) {
    if (!address) return;
    this.watchlist.delete(address.toLowerCase());
  }

  isWatched(address) {
    if (!address) return false;
    return this.watchlist.has(address.toLowerCase());
  }

  /* ============================
      PAPER TRADING
  ============================ */
  enablePaper() {
    this.paper.enabled = true;
    this.tradingMode = "paper";
    logInfo("🧪 Paper trading ENABLED");
  }

  disablePaper() {
    this.paper.enabled = false;
    logInfo("🧪 Paper trading DISABLED");
  }

  recordPaperTrade(trade) {
    if (!this.paper.enabled) return;

    this.paper.trades.push({
      ...trade,
      time: Date.now()
    });
  }

  updatePaperBalance(amount) {
    if (!this.paper.enabled) return;
    this.paper.balance += amount;
  }

  getPaperState() {
    return {
      enabled: this.paper.enabled,
      balance: this.paper.balance,
      trades: [...this.paper.trades]
    };
  }

  resetPaper() {
    this.paper.balance = 1000;
    this.paper.trades = [];
    logInfo("♻️ Paper trading reset");
  }

  /* ============================
      STATS
  ============================ */
  recordScan() {
    this.stats.scanned++;
  }

  recordSent() {
    this.stats.sent++;
  }

  recordBuy() {
    this.stats.buys++;
  }

  recordSell() {
    this.stats.sells++;
  }

  recordError() {
    this.stats.errors++;
  }

  getStats() {
    return { ...this.stats };
  }
}

/* ============================
    SINGLETON EXPORT
============================ */
const state = new CoreState();
export default state;

/* ============================
    SAFE ACCESSORS
============================ */
export function initState() {
  state.init();
  return state;
}

export function getState() {
  return state;
  }
