// trader/sniper.js
import Pino from "pino";
import config from "../config/index.js";
import paperTrader from "./paperTrader.js";
import liveTrader from "./liveTrader.js";
import routerHelper from "./router.js";
import pnl from "./pnl.js";
import { analyzeToken } from "../signals/processor.js";
import { fetchTokenInfo } from "../utils/dexscreener.js";
import { getProvider, uid } from "../utils/web3.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });
const activeSnipes = new Map();
const DEFAULT_POLL_MS = 10_000;

// --- unified pre-buy checks ---
export async function preBuyChecks(signal) {
  if (!signal) return { ok: false, reason: "no_signal" };
  if (signal.riskLevel === "HIGH") return { ok: false, reason: "high_risk" };

  const liquidity = Number(signal.details?.dex?.liquidityUSD ?? 0);
  if (liquidity < (config.SNIPER.MIN_LIQUIDITY_BNB * 300)) 
    return { ok: false, reason: "insufficient_liquidity" };

  if (config.SNIPER.BLOCK_DELAY > 0) {
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

  return { ok: true };
}

// --- compute buy amount in USD ---
function computeBuyAmountUsd(recommend = {}, walletBalanceUsd = 100) {
  const pct = Number(recommend.recommendedBuyPercent ?? config.SNIPER.DEFAULT_BUY_PERCENT ?? 0.5);
  const amountUsd = Math.max(1, (pct / 100) * walletBalanceUsd);
  return Math.max(amountUsd, Number(recommend.minBuyUsd ?? 1));
}

// --- execute a snipe ---
export async function executeSnipe(signal, options = {}) {
  const id = signal.id ?? uid("snipe_");
  if (activeSnipes.has(signal.token)) {
    log.info({ token: signal.token }, "Duplicate snipe attempt aborted");
    return { ok: false, error: "already_active" };
  }
  activeSnipes.set(signal.token, true);

  try {
    const fresh = await analyzeToken(signal.token, signal.details?.dexRaw ?? {});
    Object.assign(signal, fresh);

    const check = await preBuyChecks(signal);
    if (!check.ok) return { ok: false, error: check.reason };

    if (typeof options.confirmCallback === "function") {
      const confirm = await options.confirmCallback(signal);
      if (!confirm) return { ok: false, error: "user_declined" };
    }

    const liveAllowed = config.LIVE_MODE === true || String(config.LIVE_MODE).toLowerCase() === "true";
    const useLive = liveAllowed && (options.mode === "live" || config.SNIPER.FORCE_LIVE === true);
    const trader = useLive ? liveTrader : paperTrader;

    let walletUsd = 100;
    if (typeof trader.getWalletUsd === "function") {
      try { walletUsd = await trader.getWalletUsd(options.walletKey); } catch {}
    }

    const buyUsd = computeBuyAmountUsd(signal.details?.recommended ?? {}, walletUsd);
    if (buyUsd < Number(options.minBuyUsd ?? 1)) return { ok: false, error: "buy_amount_below_min" };

    if (useLive && typeof trader.approveIfNeeded === "function" && config.SNIPER.AUTO_APPROVE) {
      try { await trader.approveIfNeeded(signal.token, config.ROUTER_ADDRESS); } catch {}
    }

    log.info({ token: signal.token, buyUsd, mode: useLive ? "LIVE" : "PAPER" }, "Executing snipe");

    const buyResult = await trader.buy(signal.token, {
      usdAmount: buyUsd,
      maxSlippagePercent: config.SNIPER.MAX_SLIPPAGE,
      walletKey: options.walletKey,
    });

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

    // monitor position async
    monitorPosition(buyResult, signal, { trader, id }).catch(e => 
      log.error({ err: e?.message }, "monitorPosition failed")
    );

    return { ok: true, buyResult, id };
  } catch (err) {
    log.error({ err: err?.message, token: signal.token }, "executeSnipe error");
    return { ok: false, error: err?.message };
  } finally {
    setTimeout(() => activeSnipes.delete(signal.token), (config.SNIPER.COOLDOWN_SECONDS ?? 30) * 1000);
  }
}

// --- monitor TP/SL/trailing ---
async function monitorPosition(buyResult = {}, signal = {}, opts = {}) {
  const trader = opts.trader;
  const id = opts.id;
  const tpPercent = config.SNIPER.AUTO_SELL_TP ?? 20;
  const slPercent = config.SNIPER.AUTO_SELL_SL ?? 10;
  const trailing = config.SNIPER.TRAILING_STOP_ENABLED ?? false;
  const trailingPercent = config.SNIPER.TRAILING_STOP_PERCENT ?? 5;
  const token = signal.token;

  let entryPrice = buyResult.tokenPriceAtBuy ?? 0;
  let highestPrice = entryPrice;
  const pollingIntervalMs = opts.pollMs ?? DEFAULT_POLL_MS;
  let closed = false;

  while (!closed) {
    try {
      const ds = await fetchTokenInfo(token);
      const currentPrice = Number(ds?.pairs?.[0]?.priceUsd ?? 0);
      if (currentPrice > highestPrice) highestPrice = currentPrice;

      if (entryPrice && currentPrice) {
        const pctChange = ((currentPrice - entryPrice) / entryPrice) * 100;

        if (pctChange >= tpPercent || pctChange <= -Math.abs(slPercent)) {
          await trader.sell(token, { walletKey: buyResult.walletKey, amountTokens: buyResult.amountOutTokens });
          closed = true;
        }

        if (trailing && ((highestPrice - currentPrice) / highestPrice) * 100 >= trailingPercent) {
          await trader.sell(token, { walletKey: buyResult.walletKey, amountTokens: buyResult.amountOutTokens });
          closed = true;
        }
      }
    } catch (e) {
      log.warn({ e: e?.message }, "monitorPosition polling error");
    }
    await new Promise(r => setTimeout(r, pollingIntervalMs));
  }

  try {
    await pnl.recordClose({ id, token, closedAt: Date.now() });
  } catch {}
}

export default { executeSnipe, preBuyChecks };
