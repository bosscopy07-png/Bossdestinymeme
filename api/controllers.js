// FILE: api/controllers.js
import fs from "fs/promises";
import path from "path";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";

// -----------------------------------------------------------------------------
// GLOBAL STATE
// -----------------------------------------------------------------------------
global.API_SIGNALS = global.API_SIGNALS || [];   // filled by generator.js

// Resolve seen pairs file
const SEEN_PAIRS_PATH =
  config.persistence?.seenPairsFile ||
  path.join(process.cwd(), "seen_pairs.json");

// Resolve log file
const LOG_FILE =
  config.PATHS?.LOGS
    ? path.join(process.cwd(), config.PATHS.LOGS, "system.log")
    : path.join(process.cwd(), "system.log");

// -----------------------------------------------------------------------------
// SAFE JSON READER
// -----------------------------------------------------------------------------
async function readJsonSafe(filePath, fallback = {}) {
  try {
    const raw = await fs.readFile(filePath, "utf8");

    if (!raw.trim()) return fallback;

    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// -----------------------------------------------------------------------------
// GET LATEST SIGNALS (from global API_SIGNALS)
// -----------------------------------------------------------------------------
export async function getSignals(limit = 100) {
  try {
    const all = Array.isArray(global.API_SIGNALS)
      ? global.API_SIGNALS
      : [];

    return all.slice(0, limit);
  } catch (err) {
    logError("getSignals error: " + err.message);
    throw new Error("failed_to_fetch_signals");
  }
}

// -----------------------------------------------------------------------------
// GET SEEN PAIRS (normalize any format → array)
// -----------------------------------------------------------------------------
export async function getPairs() {
  try {
    const data = await readJsonSafe(SEEN_PAIRS_PATH, {});

    if (Array.isArray(data)) {
      // Already proper format
      return data;
    }

    if (typeof data === "object") {
      // Convert map form → array
      return Object.entries(data).map(([pair, ts]) => ({
        pair,
        firstSeen: ts,
      }));
    }

    return [];
  } catch (err) {
    logError("getPairs error: " + err.message);
    throw new Error("failed_to_fetch_pairs");
  }
}

// -----------------------------------------------------------------------------
// GET SNIPER STATUS (runtime + config snapshot)
// -----------------------------------------------------------------------------
export async function getSniperStatus() {
  try {
    return {
      liveMode:
        config.LIVE_MODE === true ||
        process.env.LIVE_MODE === "true",

      paperMode:
        config.PAPER_MODE !== false &&
        process.env.PAPER_MODE !== "false",

      presets: config.presets || {},

      // Light snapshot of recent activity
      recentSignals: (global.API_SIGNALS || []).slice(0, 10),
    };
  } catch (err) {
    logError("getSniperStatus error: " + err.message);
    throw new Error("failed_to_fetch_status");
  }
}

// -----------------------------------------------------------------------------
// GET LAST N LINES OF LOG FILE (extreme performance-safe)
// -----------------------------------------------------------------------------
export async function getLogs(lines = 200) {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");

    if (!raw.trim()) return ["<empty log file>"];

    const parts = raw.split("\n");

    // Avoid memory explosion for huge logs
    if (parts.length > lines) {
      return parts.slice(parts.length - lines);
    }

    return parts;
  } catch (err) {
    return [
      `Log file unavailable: ${LOG_FILE}`,
      `Reason: ${err.message}`,
    ];
  }
}
