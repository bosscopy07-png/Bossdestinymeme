/**
 * FILE: /trader/engine.js
 *
 * Hyper Beast Trading Engine
 * - Unified ESM trading engine for memecoin bot
 * - Handles signal processing, trade execution, risk management
 * - Integrates Telegram alerts, RPC rotation, and logging
 */

import Pino from "pino";
import config from "../config/index.js";
import { getWeb3, rotateRPC } from "../core/rpcManager.js";
import { canTrade, recordLoss, getTradingStatus } from "../core/tradingGuard.js";
import { buildTelegramMessage } from "../signals/generator.js";
import { processSignalCandidate } from "../signals/generator.js";
import { sendAdminNotification } from "../telegram/sender.js";

// Optional: replace with real exchange adapter
import { placeBuyOrder, placeSellOrder, checkBalance } from "./exchange.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });

export class TradingEngine {
  constructor() {
    this.active = false;
    this.positions = [];
  }

  async init() {
    log.info("💹 Initializing Hyper Beast Trading Engine...");
    try {
      const balance = await checkBalance();
      log.info(`💰 Wallet balance: $${balance}`);
      this.active = true;
    } catch (err) {
      log.error({ err }, "Failed to initialize trading engine wallet");
    }
  }

  async executeTrade(signal, type = "BUY") {
    if (!this.active) return { status: "skipped", reason: "Engine inactive" };
    if (!signal || !signal.token) return { status: "skipped", reason: "Invalid signal" };

    try {
      // Risk check
      if (signal.riskLevel === "HIGH") {
        log.warn({ token: signal.token }, "Trade skipped due to high risk");
        return { status: "skipped", reason: "High risk" };
      }

      // Amount to buy
      const amountUSD = signal.details?.recommended?.minBuyUsd ?? config.SNIPER?.MAX_TRADE_USD ?? 10;

      // Check balance & trading guard
      const balance = await checkBalance();
      if (balance < amountUSD || !canTrade(amountUSD)) {
        log.warn({ token: signal.token, balance }, "Trade blocked by guard/insufficient funds");
        return { status: "skipped", reason: "Insufficient balance / trading guard" };
      }

      // Execute order
      const result = await placeBuyOrder(signal.token, amountUSD);
      log.info({ token: signal.token, result }, "Trade executed");

      // Record loss & store position
      recordLoss(amountUSD);
      this.positions.push({ signal, result });

      return { status: "success", result };
    } catch (err) {
      log.error({ token: signal.token, err }, "Trade execution failed");
      await sendAdminNotification(global.bot, `❌ Trade failed: ${signal.token} - ${err.message}`);
      await rotateRPC();
      return { status: "error", error: err.message };
    }
  }

  async processSignal(signal) {
    if (!signal || !signal.token) return null;

    // Run candidate processing (anti-rug / scoring)
    await processSignalCandidate(signal);

    // Build Telegram payload
    const payload = buildTelegramMessage(signal);
    log.info({ token: signal.token }, "Signal processed & Telegram-ready");

    return payload;
  }

  async runEngine(signals = []) {
    if (!this.active) await this.init();
    const results = [];

    for (const signal of signals) {
      try {
        const payload = await this.processSignal(signal);
        const tradeResult = await this.executeTrade(signal);
        results.push({ payload, tradeResult });
      } catch (err) {
        log.error({ err, signalId: signal.id }, "Engine loop error");
      }
    }

    return results;
  }

  startMonitoring(interval = 15_000) {
    if (!this.active) this.init();

    log.info("⚡ Trading engine monitoring started");
    setInterval(async () => {
      try {
        const web3 = await getWeb3();
        await web3.eth.getBlockNumber();
      } catch {
        log.warn("⚠️ RPC unhealthy, rotating...");
        await rotateRPC();
      }
    }, interval);
  }

  getStatus() {
    return { active: this.active, positions: this.positions, ...getTradingStatus() };
  }
}

// Export singleton instance
export default new TradingEngine();
