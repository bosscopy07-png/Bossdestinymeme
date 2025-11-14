// FILE: core/scanner.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const { analyzeToken } = require('./analyzeToken');
const { pushSignal } = require('./signalSender');

const logger = pino({
  name: 'TokenScanner',
  level: process.env.LOG_LEVEL || 'info',
});

const SEEN_FILE = path.join(__dirname, '../seen_pairs.json');

// Load last seen pairs from JSON file
let lastSeen = new Set();
try {
  if (fs.existsSync(SEEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8'));
    lastSeen = new Set(data);
    logger.info(`Loaded ${lastSeen.size} previously seen tokens`);
  }
} catch (err) {
  logger.error({ err }, 'Failed to load seen pairs file');
}

/**
 * Save lastSeen set to JSON
 */
function saveSeenPairs() {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...lastSeen], null, 2));
    logger.info('Saved seen pairs');
  } catch (err) {
    logger.error({ err }, 'Failed to save seen pairs');
  }
}

/**
 * Scan new tokens from Dexscreener API
 */
async function scanNewTokens() {
  const url = 'https://api.dexscreener.com/latest/dex/tokens/bsc';
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

    // Persist seen pairs after each scan
    saveSeenPairs();

  } catch (err) {
    logger.error({ err }, 'Scanner API request failed, will retry');
    // Exponential backoff retry
    setTimeout(scanNewTokens, 3000 + Math.random() * 2000);
  }
}

// Start scanning every 3 seconds
setInterval(scanNewTokens, 3000);

module.exports = { scanNewTokens };
