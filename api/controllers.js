// FILE: api/controllers.js
import fs from "fs/promises";
import path from "path";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";

// -----------------------------------------------------------------------------
// GLOBAL STATE
// -----------------------------------------------------------------------------
global.API_SIGNALS = global.API_SIGNALS || []; // Populated by signal generator
global.TRADING_ENGINE = global.TRADING_ENGINE || null; // Your trading engine instance

// -----------------------------------------------------------------------------
// CONFIGURED FILE PATHS
// -----------------------------------------------------------------------------
const SEEN_PAIRS_PATH =
  config.persistence?.seenPairsFile || path.join(process.cwd(), "seen_pairs.json");

const LOG_FILE =
  config.LOG?.directory
    ? path.join(process.cwd(), config.LOG.directory, "system.log")
    : path.join(process.cwd(), "system.log");

// -----------------------------------------------------------------------------
// PAIRS CACHE
// -----------------------------------------------------------------------------
let pairsCache = [];
let lastPairsLoad = 0;
const PAIRS_CACHE_TTL = 5 * 1000; // 5 seconds

// -----------------------------------------------------------------------------
// SAFE JSON READER
// -----------------------------------------------------------------------------
async function readJsonSafe(filePath, fallback = {}) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    logError(`Failed to read JSON file ${filePath}: ${e.message}`);
    return fallback;
  }
}

// -----------------------------------------------------------------------------
// SIGNAL VALIDATION
// -----------------------------------------------------------------------------
function validateSignal(signal) {
  if (!signal || typeof signal !== "object") return false;
  if (!signal.token || typeof signal.token !== "string") return false;
  if (!signal.price || typeof signal.price !== "number") return false;
  if (!signal.time || typeof signal.time !== "number") return false;
  return true;
}

// -----------------------------------------------------------------------------
// GET LATEST SIGNALS
// -----------------------------------------------------------------------------
export async function getSignals(limit = 100) {
  try {
    const validSignals = Array.isArray(global.API_SIGNALS)
      ? global.API_SIGNALS.filter(validateSignal)
      : [];
    return validSignals.slice(-limit).reverse(); // newest first
  } catch (err) {
    logError("getSignals error: " + err.message);
    throw new Error("failed_to_fetch_signals");
  }
}

// -----------------------------------------------------------------------------
// GET SEEN PAIRS WITH CACHE
// -----------------------------------------------------------------------------
export async function getPairs() {
  try {
    const now = Date.now();
    if (pairsCache.length && now - lastPairsLoad < PAIRS_CACHE_TTL) {
      return pairsCache;
    }

    const data = await readJsonSafe(SEEN_PAIRS_PATH, {});

    let normalized = [];
    if (Array.isArray(data)) normalized = data;
    else if (typeof data === "object")
      normalized = Object.entries(data).map(([pair, ts]) => ({ pair, firstSeen: ts }));

    pairsCache = normalized;
    lastPairsLoad = now;

    return normalized;
  } catch (err) {
    logError("getPairs error: " + err.message);
    throw new Error("failed_to_fetch_pairs");
  }
}

// -----------------------------------------------------------------------------
// GET SNIPER STATUS (INCLUDES ENGINE STATE & RECENT SIGNALS)
// -----------------------------------------------------------------------------
export async function getSniperStatus(apiKey = null) {
  try {
    // Optional API key check
    if (config.API?.KEY && config.API.KEY !== apiKey) {
      throw new Error("unauthorized");
    }

    const engineStatus = global.TRADING_ENGINE?.getStatus?.() || {};

    return {
      liveMode: config.LIVE_MODE === true,
      paperMode: config.PAPER_MODE === true,
      presets: config.presets || {},
      recentSignals: (global.API_SIGNALS || []).slice(-10).reverse(),
      engine: engineStatus,
    };
  } catch (err) {
    logError("getSniperStatus error: " + err.message);
    throw new Error(err.message || "failed_to_fetch_status");
  }
}

// -----------------------------------------------------------------------------
// GET LAST N LINES OF LOG FILE
// -----------------------------------------------------------------------------
export async function getLogs(lines = 200, apiKey = null) {
  try {
    if (config.API?.KEY && config.API.KEY !== apiKey) {
      throw new Error("unauthorized");
    }

    const raw = await fs.readFile(LOG_FILE, "utf8");
    if (!raw.trim()) return ["<empty log file>"];

    const parts = raw.split("\n");
    return parts.length > lines ? parts.slice(parts.length - lines) : parts;
  } catch (err) {
    logError("getLogs error: " + err.message);
    return [`Log file unavailable: ${LOG_FILE}`, `Reason: ${err.message}`];
  }
  }
