// FILE: core/state.js

import EventEmitter from "eventemitter3";
import { logInfo, logWarn, logError } from "../utils/logs.js";

/**
 * CORE RUNTIME KERNEL
 * Production-grade centralized state manager
 * Singleton + Event-driven
 */

class CoreState extends EventEmitter {
  constructor() {
    super();

    // =============================
    // SYSTEM LIFECYCLE
    // =============================
    this.systemStatus = "booting"; // booting | running | degraded | halted
    this.startedAt = Date.now();
    this.initialized = false;
    this.panicMode = false;

    // =============================
    // BOT
    // =============================
    this.bot = null;

    // =============================
    // CONTROL FLAGS
    // =============================
    this.tradingMode = "live"; // paper | live
    this.sniperEnabled = true;
    this.scannerRunning = true;
    this.signalingEnabled = true;

    // =============================
    // RUNTIME DATA
    // =============================
    this.activeSignals = new Map(); // address => { data, createdAt }
    this.watchlist = new Set();

    // =============================
    // PAPER ENGINE
    // =============================
    this.paper = {
      enabled: true,
      balance: 1000,
      trades: [],
      maxRiskPerTrade: 0.05
    };

    // =============================
    // RPC HEALTH
    // =============================
    this.rpc = {
      active: null,
      failed: new Set(),
      lastFailure: null
    };

    // =============================
    // METRICS
    // =============================
    this.stats = {
      scanned: 0,
      signaled: 0,
      sent: 0,
      buys: 0,
      sells: 0,
      errors: 0
    };

    // Auto-clean expired signals
    setInterval(() => this.cleanupSignals(), 60_000);
  }

  /* =====================================================
      INITIALIZATION
  ===================================================== */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.systemStatus = "running";
    logInfo("🧠 CoreState initialized & system running");
    this.emit("system:ready");
  }

  isOperational() {
    return this.systemStatus === "running" && !this.panicMode;
  }

  haltSystem(reason = "Manual halt") {
    if (this.systemStatus === "halted") return;

    this.systemStatus = "halted";
    this.panicMode = true;
    this.sniperEnabled = false;
    this.scannerRunning = false;
    this.signalingEnabled = false;

    logError(`🚨 SYSTEM HALTED: ${reason}`);
    this.emit("system:halted", reason);
  }

  degradeSystem(reason = "Unknown issue") {
    if (this.systemStatus === "halted") return;
    this.systemStatus = "degraded";
    logWarn(`⚠ System degraded: ${reason}`);
    this.emit("system:degraded", reason);
  }

  /* =====================================================
      BOT
  ===================================================== */
  registerBot(bot) {
    this.bot = bot;
    logInfo("🤖 Bot registered in CoreState");
  }

  getBot() {
    return this.bot;
  }

  /* =====================================================
      TRADING MODE
  ===================================================== */
  setTradingMode(mode) {
    if (!["paper", "live"].includes(mode)) {
      logWarn(`Invalid trading mode: ${mode}`);
      return false;
    }

    if (mode === "live" && this.panicMode) {
      logError("Cannot enable live trading during panic mode");
      return false;
    }

    this.tradingMode = mode;
    this.paper.enabled = mode === "paper";

    logInfo(`💱 Trading mode set to ${mode}`);
    this.emit("mode:changed", mode);
    return true;
  }

  /* =====================================================
      SIGNAL MANAGEMENT
  ===================================================== */
  addSignal(signal) {
    if (!signal?.address) return false;

    const key = signal.address.toLowerCase();
    if (this.activeSignals.has(key)) return false;

    this.activeSignals.set(key, {
      data: signal,
      createdAt: Date.now()
    });

    this.stats.signaled++;
    this.emit("signal:new", signal);
    return true;
  }

  cleanupSignals(ttlMs = 10 * 60 * 1000) {
    const now = Date.now();

    for (const [key, value] of this.activeSignals.entries()) {
      if (now - value.createdAt > ttlMs) {
        this.activeSignals.delete(key);
      }
    }
  }

  getSignals() {
    return [...this.activeSignals.values()].map(v => v.data);
  }

  hasSignal(address) {
    return this.activeSignals.has(address?.toLowerCase());
  }

  /* =====================================================
      PAPER TRADING ENGINE
  ===================================================== */
  recordPaperTrade({ address, side, amount, price }) {
    if (!this.paper.enabled) return false;
    if (!address || !side || !amount || !price) return false;

    const tradeValue = amount * price;
    const maxAllowed = this.paper.balance * this.paper.maxRiskPerTrade;

    if (tradeValue > maxAllowed) {
      logWarn("Paper trade exceeds max risk limit");
      return false;
    }

    if (side === "buy") {
      this.paper.balance -= tradeValue;
    }

    this.paper.trades.push({
      address,
      side,
      amount,
      price,
      time: Date.now()
    });

    if (side === "buy") this.stats.buys++;
    if (side === "sell") this.stats.sells++;

    this.emit("paper:trade", { address, side, amount, price });
    return true;
  }

  getPaperPnL() {
    return {
      balance: this.paper.balance,
      trades: this.paper.trades.length
    };
  }

  /* =====================================================
      METRICS
  ===================================================== */
  recordScan() { this.stats.scanned++; }
  recordSent() { this.stats.sent++; }
  recordError() { this.stats.errors++; }

  getStatsSnapshot() {
    return Object.freeze({ ...this.stats });
  }

  // 🔥 BACKWARD COMPATIBILITY (FIXES YOUR ERROR)
  getStats() {
    return this.getStatsSnapshot();
  }

  /* =====================================================
      HEALTH
  ===================================================== */
  getHealth() {
    return Object.freeze({
      uptimeMs: Date.now() - this.startedAt,
      systemStatus: this.systemStatus,
      activeSignals: this.activeSignals.size,
      watchlistSize: this.watchlist.size,
      tradingMode: this.tradingMode,
      sniperEnabled: this.sniperEnabled,
      scannerRunning: this.scannerRunning,
      signalingEnabled: this.signalingEnabled,
      panicMode: this.panicMode
    });
  }
}

/* =====================================================
    SINGLETON EXPORT
===================================================== */
const state = new CoreState();
export default state;

export function initState() {
  state.init();
  return state;
}

export function getState() {
  return state;
  }
