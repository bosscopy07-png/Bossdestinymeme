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
    // BOT & SYSTEM
    // ----------------------------
    this.bot = null;
    this.initialized = false;

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
    // METRICS
    // ----------------------------
    this.stats = {
      signals: 0,
      buys: 0,
      sells: 0,
      errors: 0
    };
  }

  /* ============================
      BOT REGISTRATION
  ============================ */
  registerBot(bot) {
    this.bot = bot;
    logInfo("CoreState: Bot registered");
  }

  getBot() {
    return this.bot;
  }

  /* ============================
      SCANNER STATE
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

  isScannerRunning() {
    return this.scannerRunning;
  }

  /* ============================
      TRADING STATE
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
      logWarn("Invalid trading mode: " + mode);
      return;
    }
    this.tradingMode = mode;
    this.emit("mode:changed", mode);
    logInfo(`Trading mode set to ${mode}`);
  }

  /* ============================
      SIGNAL MANAGEMENT
  ============================ */
  addSignal(signal) {
    if (!signal?.address) return;
    this.activeSignals.set(signal.address.toLowerCase(), signal);
    this.stats.signals++;
    this.emit("signal:new", signal);
  }

  removeSignal(address) {
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

// ----------------------------
// SINGLETON EXPORT
// ----------------------------
const state = new CoreState();
export default state;
