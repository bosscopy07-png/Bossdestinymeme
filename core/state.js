// FILE: core/state.js

import EventEmitter from "eventemitter3";
import { logInfo, logWarn, logError } from "../utils/logs.js";

/**
 * CORE RUNTIME KERNEL
 * Production-grade centralized state manager
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
    this.tradingMode = "paper"; // paper | live
    this.sniperEnabled = true;
    this.scannerRunning = true;
    this.signalingEnabled = true;

    // =============================
    // RUNTIME DATA
    // =============================
    this.activeSignals = new Map(); // address => { signal, createdAt }
    this.watchlist = new Set();

    // =============================
    // PAPER ENGINE
    // =============================
    this.paper = {
      enabled: true,
      balance: 1000,
      trades: [],
      maxRiskPerTrade: 0.05 // 5% per trade cap
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

    // Auto-clean expired signals every 60s
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
  }

  haltSystem(reason = "Manual halt") {
    this.systemStatus = "halted";
    this.panicMode = true;
    this.sniperEnabled = false;
    this.scannerRunning = false;
    logError(`🚨 SYSTEM HALTED: ${reason}`);
    this.emit("system:halted", reason);
  }

  degradeSystem(reason = "Unknown issue") {
    if (this.systemStatus === "halted") return;
    this.systemStatus = "degraded";
    logWarn(`⚠ System degraded: ${reason}`);
    this.emit("system:degraded", reason);
  }

  isOperational() {
    return this.systemStatus === "running" && !this.panicMode;
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
      TRADING MODE SAFETY
  ===================================================== */
  setTradingMode(mode) {
    if (!["paper", "live"].includes(mode)) {
      logWarn(`Invalid trading mode: ${mode}`);
      return;
    }

    if (mode === "live" && this.panicMode) {
      logError("Cannot enable live trading while panicMode is active");
      return;
    }

    this.tradingMode = mode;
    this.paper.enabled = mode === "paper";

    logInfo(`💱 Trading mode set to ${mode}`);
    this.emit("mode:changed", mode);
  }

  /* =====================================================
      SIGNAL MANAGEMENT (WITH TTL)
  ===================================================== */
  addSignal(signal) {
    if (!signal?.address) return;

    const key = signal.address.toLowerCase();
    if (this.activeSignals.has(key)) return;

    this.activeSignals.set(key, {
      data: signal,
      createdAt: Date.now()
    });

    this.stats.signaled++;
    this.emit("signal:new", signal);
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
    return Array.from(this.activeSignals.values()).map(v => v.data);
  }

  /* =====================================================
      PAPER TRADING ENGINE
  ===================================================== */
  recordPaperTrade({ address, side, amount, price }) {
    if (!this.paper.enabled) return;

    const tradeValue = amount * price;
    const maxAllowed = this.paper.balance * this.paper.maxRiskPerTrade;

    if (tradeValue > maxAllowed) {
      logWarn("Paper trade exceeds max risk per trade limit");
      return;
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

    this.stats.buys += side === "buy" ? 1 : 0;
    this.stats.sells += side === "sell" ? 1 : 0;
  }

  getPaperPnL() {
    return this.paper.trades.length;
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

  /* =====================================================
      HEALTH CHECK
  ===================================================== */
  getHealth() {
    return {
      uptimeMs: Date.now() - this.startedAt,
      systemStatus: this.systemStatus,
      activeSignals: this.activeSignals.size,
      watchlistSize: this.watchlist.size,
      tradingMode: this.tradingMode,
      panicMode: this.panicMode
    };
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
