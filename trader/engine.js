/**
 * FILE: /trader/engine.js
 *
 * Hyper Beast Trading Engine v2 (Production Grade)
 */

import Pino from "pino";
import config from "../config/index.js";
import { getWeb3, rotateRPC } from "../core/rpcManager.js";
import {
  canTrade,
  recordLoss,
  recordWin,
  getTradingStatus
} from "../core/tradingGuard.js";
import { buildTelegramMessage, processSignalCandidate } from "../signals/generator.js";
import { placeBuyOrder, placeSellOrder, checkBalance } from "./exchange.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });

class TradingEngine {
  constructor() {
    this.active = false;
    this.positions = new Map();        // address → position
    this.locks = new Set();            // in-flight tokens
    this.monitorInterval = null;
    this.bot = null;
  }

  /* ============================================
     Dependency Injection
  ============================================ */
  attachBot(botInstance) {
    this.bot = botInstance;
  }

  /* ============================================
     Initialization
  ============================================ */
  async init() {
    if (this.active) return;

    log.info("💹 Initializing Trading Engine...");

    try {
      const balance = await checkBalance();
      log.info(`💰 Wallet balance: $${balance}`);
      this.active = true;
    } catch (err) {
      log.error({ err }, "Wallet initialization failed");
    }
  }

  /* ============================================
     LOCK SYSTEM (Prevents Double Buys)
  ============================================ */
  acquireLock(token) {
    if (this.locks.has(token)) return false;
    this.locks.add(token);
    return true;
  }

  releaseLock(token) {
    this.locks.delete(token);
  }

  /* ============================================
     TRADE EXECUTION
  ============================================ */
  async executeTrade(signal, type = "BUY") {
    if (!this.active) return { status: "skipped", reason: "Engine inactive" };
    if (!signal?.token) return { status: "skipped", reason: "Invalid signal" };

    const token = signal.token;

    if (!this.acquireLock(token)) {
      return { status: "skipped", reason: "Trade already in progress" };
    }

    try {
      if (signal.riskLevel === "HIGH") {
        return { status: "skipped", reason: "High risk" };
      }

      const amountUSD =
        signal.details?.recommended?.minBuyUsd ??
        config.SNIPER?.MAX_TRADE_USD ??
        10;

      const balance = await checkBalance();

      if (balance < amountUSD || !canTrade(amountUSD)) {
        return { status: "skipped", reason: "Insufficient balance / guard" };
      }

      /* -------- PAPER MODE -------- */
      if (config.TRADING_MODE === "paper") {
        const fakePosition = {
          token,
          entryUSD: amountUSD,
          entryTime: Date.now(),
          status: "OPEN",
          paper: true
        };

        this.positions.set(token, fakePosition);

        log.info({ token }, "Paper trade executed");
        return { status: "paper_success", position: fakePosition };
      }

      /* -------- LIVE MODE -------- */
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Trade timeout")), 20_000)
      );

      const trade = placeBuyOrder(token, amountUSD);

      const result = await Promise.race([trade, timeout]);

      const position = {
        token,
        entryUSD: amountUSD,
        txHash: result?.txHash,
        entryTime: Date.now(),
        status: "OPEN",
        paper: false
      };

      this.positions.set(token, position);

      log.info({ token, result }, "Live trade executed");

      return { status: "success", result };

    } catch (err) {
      log.error({ token, err }, "Trade execution failed");

      await rotateRPC();

      if (this.bot && config.ADMIN_CHAT_ID) {
        await this.bot.telegram.sendMessage(
          config.ADMIN_CHAT_ID,
          `❌ Trade failed for ${token}\n${err.message}`
        );
      }

      return { status: "error", error: err.message };

    } finally {
      this.releaseLock(token);
    }
  }

  /* ============================================
     SIGNAL PROCESSING
  ============================================ */
  async processSignal(signal) {
    if (!signal?.token) return null;

    await processSignalCandidate(signal);

    return buildTelegramMessage(signal);
  }

  /* ============================================
     ENGINE LOOP
  ============================================ */
  async runEngine(signals = []) {
    if (!this.active) await this.init();

    const results = [];

    for (const signal of signals) {
      try {
        const payload = await this.processSignal(signal);
        const tradeResult = await this.executeTrade(signal);

        results.push({ payload, tradeResult });
      } catch (err) {
        log.error({ err, token: signal?.token }, "Engine loop error");
      }
    }

    return results;
  }

  /* ============================================
     RPC MONITOR
  ============================================ */
  startMonitoring(interval = 15_000) {
    if (this.monitorInterval) return;

    log.info("⚡ Engine monitoring started");

    this.monitorInterval = setInterval(async () => {
      try {
        const web3 = await getWeb3();
        await web3.eth.getBlockNumber();
      } catch {
        log.warn("⚠️ RPC unhealthy, rotating...");
        await rotateRPC();
      }
    }, interval);
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      log.info("🛑 Engine monitoring stopped");
    }
  }

  /* ============================================
     STATUS
  ============================================ */
  getStatus() {
    return {
      active: this.active,
      openPositions: [...this.positions.values()],
      locks: [...this.locks],
      ...getTradingStatus()
    };
  }
}

export default new TradingEngine();
