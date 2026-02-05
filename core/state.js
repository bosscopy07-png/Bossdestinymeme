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
    // MODES
    // ----------------------------
    this.tradingMode = "paper"; // paper | live
    this.sniperEnabled = false;
    this.scannerRunning = false;

    // ----------------------------
    // RUNTIME DATA
    // ----------------------------
    this.activeSignals = new Map(); // address => signal
    this.watchlist = new Set();

    // ----------------------------
    // RPC
    // ----------------------------
    this.rpc = {
      active: null,
      failed: new Set(),
    };

    // ----------------------------
    // METRICS
    // ----------------------------
    this.stats = {
      scanned: 0,
      signaled: 0,
      buys: 0,
      sells: 0,
      errors: 0,
    };
  }

  /* ============================
      INITIALIZATION
  ============================ */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    logInfo("CoreState initialized");
  }

  /* ============================
      BOT
  ============================ */
  registerBot(bot) {
    this.bot = bot;
    logInfo("CoreState: Bot registered");
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
    logInfo("Scanner started");
  }

  stopScanner() {
    if (!this.scannerRunning) return;
    this.scannerRunning = false;
    this.emit("scanner:stop");
    logInfo("Scanner stopped");
  }

  /* ============================
      TRADING
  ============================ */
  enableSniper() {
    this.sniperEnabled = true;
    this.emit("sniper:enabled");
    logInfo("Sniper ENABLED");
  }

  disableSniper() {
    this.sniperEnabled = false;
    this.emit("sniper:disabled");
    logInfo("Sniper DISABLED");
  }

  setTradingMode(mode) {
    if (!["paper", "live"].includes(mode)) {
      logWarn(`Invalid trading mode: ${mode}`);
      return;
    }
    this.tradingMode = mode;
    this.emit("mode:changed", mode);
    logInfo(`Trading mode set to ${mode}`);
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
    this.watchlist.add(address.toLowerCase());
  }

  removeWatch(address) {
    this.watchlist.delete(address.toLowerCase());
  }

  isWatched(address) {
    return this.watchlist.has(address.toLowerCase());
  }

  /* ============================
      STATS
  ============================ */
  recordScan() {
    this.stats.scanned++;
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
    SAFE INITIALIZER
============================ */
export function initState() {
  state.init();
  return state;
}

export function getState() {
  return state;
  }
