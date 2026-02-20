// trader/presets.js
// Hardened sniper presets with type-safe validation and helpers

import config from "../config/index.js";
import { logInfo } from "../utils/logs.js";

/* ======================================================
   DEFAULT PRESETS
====================================================== */
const PRESETS_RAW = {
  safe: {
    name: "safe",
    maxSlippage: config.presets?.safe?.slippage ?? 3,
    minLiquidityUsd: config.presets?.safe?.minLiquidity ?? 50_000,
    aiMinScore: config.presets?.safe?.aiMinScore ?? 65,
    maxBuyPercent: 0.5
  },

  normal: {
    name: "normal",
    maxSlippage: config.presets?.normal?.slippage ?? 5,
    minLiquidityUsd: config.presets?.normal?.minLiquidity ?? 20_000,
    aiMinScore: config.presets?.normal?.aiMinScore ?? 40,
    maxBuyPercent: 1.0
  },

  degenerate: {
    name: "degenerate",
    maxSlippage: config.presets?.degenerate?.slippage ?? 10,
    minLiquidityUsd: config.presets?.degenerate?.minLiquidity ?? 5_000,
    aiMinScore: config.presets?.degenerate?.aiMinScore ?? 0,
    maxBuyPercent: 2.5
  },

  ultraAI: {
    name: "ultraAI",
    maxSlippage: config.presets?.ultraAI?.slippage ?? 5,
    minLiquidityUsd: config.presets?.ultraAI?.minLiquidity ?? 30_000,
    aiMinScore: config.presets?.ultraAI?.aiMinScore ?? 75,
    maxBuyPercent: 1.0
  }
};

/* ======================================================
   VALIDATE & FREEZE PRESETS
====================================================== */
function validatePreset(preset) {
  return Object.freeze({
    name: String(preset.name ?? "unknown"),
    maxSlippage: Number(preset.maxSlippage ?? 0),
    minLiquidityUsd: Number(preset.minLiquidityUsd ?? 0),
    aiMinScore: Number(preset.aiMinScore ?? 0),
    maxBuyPercent: Number(preset.maxBuyPercent ?? 0)
  });
}

export const PRESETS = Object.freeze(
  Object.fromEntries(
    Object.entries(PRESETS_RAW).map(([k, v]) => [k, validatePreset(v)])
  )
);

/* ======================================================
   SAFE RESOLVER
====================================================== */
export function getPreset(name = "normal") {
  const preset = PRESETS[name] || PRESETS.normal;
  logInfo(`Preset resolved: ${preset.name}`);
  return preset;
}

/* ======================================================
   HELPER: LIST ALL PRESET NAMES
====================================================== */
export function listPresetNames() {
  return Object.keys(PRESETS);
}

export default {
  PRESETS,
  getPreset,
  listPresetNames
};
