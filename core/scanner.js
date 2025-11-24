// FILE: core/scanner.js
import axios from "axios";
import fs from "fs";
import path from "path";
import pino from "pino";
import { fileURLToPath } from "url";

import { analyzeToken } from './analyzeToken.js';
import { pushSignal } from './signalSender.js';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({
  name: "TokenScanner",
  level: process.env.LOG_LEVEL || "info",
});

const SEEN_FILE = process.env.SEEN_PAIRS_FILE || "/tmp/seen_pairs.json";

// Load last seen pairs
let lastSeen = new Set();
try {
  if (fs.existsSync(SEEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
    lastSeen = new Set(data);
    logger.info(`Loaded ${lastSeen.size} previously seen tokens`);
  }
} catch (err) {
  logger.error({ err }, "Failed to load seen pairs file");
}

/**
 * Save lastSeen set to JSON
 */
function saveSeenPairs() {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...lastSeen], null, 2));
    logger.info("Saved seen pairs");
  } catch (err) {
    logger.error({ err }, "Failed to save seen pairs");
  }
}

/**
 * Scan new tokens from Dexscreener API
 */
export async function scanNewTokens() {
  const url = 'https://api.dexscreener.com/latest/dex/search?q=bsc';
  try {
    const res = await axios.get(url, { timeout: 5000 });
    const pairs = res.data.pairs || [];

    for (let pair of pairs) {
      const address = pair.baseToken?.address;
      if (!address) continue;

      if (!lastSeen.has(address)) {
        lastSeen.add(address);
        const signal = await analyzeToken(pair);

        if (signal) {
          await pushSignal(signal);
        }
      }
    }

    saveSeenPairs();
  } catch (err) {
  if (err.response?.status === 429) {
    logger.warn("Rate limited by Dexscreener, retrying in 30s...");
    setTimeout(scanNewTokens, 30_000); // wait 30 seconds before retry
  } else {
    logger.error({ err }, "Scanner API request failed, will retry...");
    setTimeout(scanNewTokens, 5000 + Math.random() * 5000); // retry after 5–10s
  }
}

// Auto-scan every 15 seconds instead of 3
setInterval(scanNewTokens, 15_000);
