/**
 * trader/sniper.js
 *
 * High-level sniper controller:
 * - Accepts signal objects (from signals/processor)
 * - Runs pre-buy checks (risk thresholds, liquidity, taxes, block delay)
 * - Coordinates with liveTrader or paperTrader to execute buys
 * - Monitors position for TP/SL / Trailing
 * - Logs trades to pnl.js
 *
 * Decoupled from Telegram; optional confirmCallback provided for interactive approval.
 */

import Pino from "pino";
import config from "../config/index.js";
import { analyzeToken } from "../signals/processor.js";
import { getProvider, uid } from "../utils/web3.js";
import dsUtils from "../utils/dexscreener.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });

const activeSnipes = new Map();

// --- pre-buy checks ---
export async function preBuyChecks(signal) {
  if (!signal) return { ok: false, reason: "no_signal" };
  if (signal.riskLevel === "HIGH") return { ok: false, reason: "high_risk" };

  const liq = Number(signal.details?.dex?.liquidityUSD ?? 0);
  if (liq < (config.SNIPER.MIN_LIQUIDITY_BNB * 300)) return { ok: false, reason: "insufficient_liquidity" };

  if (config.SNIPER.BLOCK_DELAY && config.SNIPER.BLOCK_DELAY > 0) {
    try {
      const block = await getProvider().getBlockNumber();
      const createdBlock = signal.details?.dex?.pairCreatedBlock ?? null;
      if (createdBlock && (block - createdBlock) < config.SNIPER.BLOCK_DELAY) {
        return { ok: false, reason: "block_delay_not_met" };
      }
    } catch (e) {
      log.warn({ err: e?.message }, "preBuyChecks: block fetch failed");
    }
  }

  return { ok: true, reason: null };
}

// --- compute buy amount in USD ---
function computeBuyAmountUsd(recommend = {}, walletBalanceUsd = 100) {
  const pct = Number(recommend.recommendedBuyPercent ?? config.SNIPER.DEFAULT_BUY_PERCENT ?? 0.5);
  const amountUsd = Math.max(1, (pct / 100) * walletBalanceUsd);
  return Math.max(amountUsd, Number(recommend.minBuyUsd ?? 1));
}

// --- execute snipe ---
export async function executeSnipe(signal, options = {}) {
  const id = signal.id ?? uid("snipe_");
  if (activeSnipes.has(signal.token)) {
    log.info({ token: signal.token }, "Duplicate snipe attempt aborted");
    return { ok: false, error: "already_active" };
  }
  activeSnipes.set(signal.token, true);

  try {
    // refresh token analysis
    const fresh = await analyzeToken(signal.token, signal.details?.dexRaw ?? {});
    Object.assign(signal, fresh);

    // pre-buy validation
    const check = await preBuyChecks(signal);
    if (!check.ok) return { ok: false, error: check.reason };

    // user confirmation callback
    if (typeof options.confirmCallback === "function") {
      const confirm = await options.confirmCallback(signal);
      if (!confirm) return { ok: false, error: "user_declined" };
    }

    // select trader (live or paper)
    const liveAllowed = config.LIVE_MODE === true || String(config.LIVE_MODE).toLowerCase() === "true";
    const useLive = liveAllowed && (options.mode === "live" || config.SNIPER.FORCE_LIVE === true);
    const trader = useLive
      ? (await import("./liveTrader.js")).default
      : (await import("./paperTrader.js")).default;

    // wallet balance
    let walletUsd = 100;
    if (typeof trader.getWalletUsd === "function") {
      try { walletUsd = await trader.getWalletUsd(options.walletKey); } 
      catch { walletUsd = 100; }
    }

    const buyUsd = computeBuyAmountUsd(signal.details?.recommended ?? {}, walletUsd);
    if (buyUsd < Number(options.minBuyUsd ?? 1)) return { ok: false, error: "buy_amount_below_min" };

    // auto approval if live
    if (useLive && typeof trader.approveIfNeeded === "function" && config.SNIPER.AUTO_APPROVE) {
      try { await trader.approveIfNeeded(signal.token, config.ROUTER_ADDRESS); } 
      catch (err) { log.warn({ err: err?.message }, "approveIfNeeded failed"); }
    }

    // execute buy
    log.info({ token: signal.token, buyUsd, mode: useLive ? "LIVE" : "PAPER" }, "Executing snipe");
    const buyResult = await trader.buy(signal.token, {
      usdAmount: buyUsd,
      maxSlippagePercent: config.SNIPER.MAX_SLIPPAGE,
      walletKey: options.walletKey,
    });

    // record trade to pnl.js
    try {
      const pnl = await import("./pnl.js");
      if (pnl && typeof pnl.recordTrade === "function") {
        await pnl.recordTrade({
          id,
          token: signal.token,
          tx: buyResult.txHash ?? null,
          entryUsd: buyResult.amountInUsd ?? buyUsd,
          entryTokens: buyResult.amountOutTokens ?? 0,
          entryPrice: buyResult.tokenPriceAtBuy ?? null,
          mode: useLive ? "LIVE" : "PAPER",
          timestamp: Date.now(),
        });
      }
    } catch {}

    // start monitoring position
    monitorPosition(buyResult, signal, { trader, id }).catch((err) => log.error({ err: err?.message }, "monitorPosition failed"));

    return { ok: true, buyResult, id };
  } catch (err) {
    log.error({ err: err?.message, token: signal.token }, "executeSnipe error");
    return { ok: false, error: err?.message };
  } finally {
    setTimeout(() => activeSnipes.delete(signal.token), (config.SNIPER.COOLDOWN_SECONDS ?? 30) * 1000);
  }
}

// --- monitor position for TP/SL/trailing ---
async function monitorPosition(buyResult = {}, signal = {}, opts = {}) {
  const trader = opts.trader;
  const id = opts.id;
  const tpPercent = config.SNIPER.AUTO_SELL_TP ?? 20;
  const slPercent = config.SNIPER.AUTO_SELL_SL ?? 10;
  const trailing = config.SNIPER.TRAILING_STOP_ENABLED ?? false;
  const trailingPercent = config.SNIPER.TRAILING_STOP_PERCENT ?? 5;
  const token = signal.token;

  let entryUsd = buyResult.amountInUsd ?? 0;
  let entryPrice = buyResult.tokenPriceAtBuy ?? null;
  let highestPrice = entryPrice ?? 0;

  const pollingIntervalMs = 10_000;
  let closed = false;

  while (!closed) {
    try {
      const ds = await dsUtils.getPair(token);
      const currentPrice = Number(ds?.priceUsd ?? ds?.price ?? 0);
      if (currentPrice > highestPrice) highestPrice = currentPrice;

      if (entryPrice && currentPrice) {
        const pct = ((currentPrice - entryPrice) / entryPrice) * 100;

        if (pct >= tpPercent || pct <= -Math.abs(slPercent)) {
          await trader.sell(token, { walletKey: buyResult.walletKey, amountTokens: buyResult.amountOutTokens });
          closed = true; break;
        }

        if (trailing && ((highestPrice - currentPrice) / highestPrice) * 100 >= trailingPercent) {
          await trader.sell(token, { walletKey: buyResult.walletKey, amountTokens: buyResult.amountOutTokens });
          closed = true; break;
        }
      }
    } catch (e) { log.warn({ e: e?.message }, "monitorPosition polling error"); }

    await new Promise((r) => setTimeout(r, pollingIntervalMs));
  }

  // record close
  try {
    const pnl = await import("./pnl.js");
    if (pnl && typeof pnl.recordClose === "function") await pnl.recordClose({ id, token, closedAt: Date.now() });
  } catch {}
}

export default { executeSnipe, preBuyChecks };
