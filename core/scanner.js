// core/scanner.js
const axios = require('axios');
const { pushSignal } = require('./signalSender');

let lastSeen = new Set();

async function scanNewTokens() {
  try {
    const url = "https://api.dexscreener.com/latest/dex/tokens/bsc";
    const res = await axios.get(url);

    const pairs = res.data.pairs || [];
    for (let pair of pairs) {
      const address = pair.baseToken.address;

      if (!lastSeen.has(address)) {
        lastSeen.add(address);

        const signal = await analyzeToken(pair);
        if (signal) {
          await pushSignal(signal);
        }
      }
    }
  } catch (err) {
    console.error("Scanner error:", err.message);
  }
}

setInterval(scanNewTokens, 3000); // every 3 secs - hyper speed
module.exports = { scanNewTokens };
