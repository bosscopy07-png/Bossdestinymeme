let tradingEnabled = true;
let dailyLoss = 0;
let lastResetTs = Date.now();
let lossStreak = 0;

const MAX_DAILY_LOSS = Number(process.env.MAX_DAILY_LOSS || 50);
const MAX_TRADE_USD = Number(process.env.MAX_TRADE_USD || 25);
const MAX_LOSS_STREAK = Number(process.env.MAX_LOSS_STREAK || 5);

function isNewDay(tsA, tsB) {
  return new Date(tsA).toDateString() !== new Date(tsB).toDateString();
}

function resetIfNewDay() {
  const now = Date.now();
  if (isNewDay(now, lastResetTs)) {
    dailyLoss = 0;
    lossStreak = 0;
    lastResetTs = now;
    console.info("🔄 Daily risk counters reset");
  }
}

function normalizeAmount(amount) {
  return Number(Number(amount).toFixed(2));
}

export function canTrade(amountUsd) {
  resetIfNewDay();

  const tradeAmount = normalizeAmount(amountUsd);

  if (process.env.TRADING_DISABLED === "true") {
    throw new Error("🚨 Trading disabled via env");
  }

  if (!tradingEnabled) {
    throw new Error("🚨 Trading disabled (kill switch active)");
  }

  if (!Number.isFinite(tradeAmount) || tradeAmount <= 0) {
    throw new Error("🚨 Invalid trade amount");
  }

  if (tradeAmount > MAX_TRADE_USD) {
    throw new Error(`🚨 Trade exceeds max size ($${MAX_TRADE_USD})`);
  }

  if (dailyLoss >= MAX_DAILY_LOSS) {
    throw new Error("🚨 Daily loss limit reached");
  }

  if (lossStreak >= MAX_LOSS_STREAK) {
    throw new Error("🚨 Max loss streak reached");
  }

  return true;
}

export function recordLoss(amountUsd) {
  resetIfNewDay();

  const loss = normalizeAmount(amountUsd);
  dailyLoss += loss;
  lossStreak++;

  console.warn(
    `📉 Loss recorded: $${loss} | Daily: $${dailyLoss} | Streak: ${lossStreak}`
  );

  if (dailyLoss >= MAX_DAILY_LOSS) {
    disableTrading("Daily loss limit breached");
  }

  if (lossStreak >= MAX_LOSS_STREAK) {
    disableTrading("Max loss streak breached");
  }
}

export function recordWin(amountUsd) {
  resetIfNewDay();

  const profit = normalizeAmount(amountUsd);
  lossStreak = 0;

  console.info(`📈 Win recorded: +$${profit}`);
}

export function disableTrading(reason = "Manual stop") {
  tradingEnabled = false;
  console.error("⛔ TRADING STOPPED:", reason);
}

export function enableTrading() {
  tradingEnabled = true;
  lossStreak = 0;
  console.warn("▶️ TRADING ENABLED");
}

export function getTradingStatus() {
  resetIfNewDay();

  return {
    tradingEnabled,
    dailyLoss: normalizeAmount(dailyLoss),
    lossStreak,
    limits: {
      maxDailyLoss: MAX_DAILY_LOSS,
      maxTradeUsd: MAX_TRADE_USD,
      maxLossStreak: MAX_LOSS_STREAK
    },
    envDisabled: process.env.TRADING_DISABLED === "true"
  };
}
