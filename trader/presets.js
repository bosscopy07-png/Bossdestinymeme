// trader/presets.js
// Fully hardened sniper presets (safe, normal, degenerate, ultraAI)

import config from "../config/index.js";

// Build preset object with external config override support
const PRESETS = Object.freeze({
  safe: Object.freeze({
    name: "safe",
    maxSlippage: config.presets?.safe?.slippage ?? 3,
    minLiquidityUsd: config.presets?.safe?.minLiquidity ?? 50_000,
    aiMinScore: config.presets?.safe?.aiMinScore ?? 65,
    maxBuyPercent: 0.5
  }),

  normal: Object.freeze({
    name: "normal",
    maxSlippage: config.presets?.normal?.slippage ?? 5,
    minLiquidityUsd: config.presets?.normal?.minLiquidity ?? 20_000,
    aiMinScore: config.presets?.normal?.aiMinScore ?? 40,
    maxBuyPercent: 1.0
  }),

  degenerate: Object.freeze({
    name: "degenerate",
    maxSlippage: config.presets?.degenerate?.slippage ?? 10,
    minLiquidityUsd: config.presets?.degenerate?.minLiquidity ?? 5_000,
    aiMinScore: config.presets?.degenerate?.aiMinScore ?? 0,
    maxBuyPercent: 2.5
  }),

  ultraAI: Object.freeze({
    name: "ultraAI",
    maxSlippage: config.presets?.ultraAI?.slippage ?? 5,
    minLiquidityUsd: config.presets?.ultraAI?.minLiquidity ?? 30_000,
    aiMinScore: config.presets?.ultraAI?.aiMinScore ?? 75,
    maxBuyPercent: 1.0
  })
});

/**
 * Resolve a preset safely
 * Prevents undefined or typo names from breaking the trading engine
 */
export function getPreset(name = "normal") {
  return PRESETS[name] || PRESETS.normal;
}

export default {
  PRESETS,
  getPreset
};
