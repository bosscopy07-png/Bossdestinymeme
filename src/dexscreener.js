// src/dexscreener.js
const axios = require("axios");

const CHAIN = "bsc";
const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || "80");
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_BUSD || "20");
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 3;

// ✅ Primary endpoint (tokens) + fallback (trending)
const BASE_URLS = [
  `https://api.dexscreener.com/latest/dex/tokens?chain=${CHAIN}`,
  `https://api.dexscreener.com/latest/dex/trending?chain=${CHAIN}`
];

// --- Helpers ---
function safeFloat(val, def = 0) {
  const f = parseFloat(val);
  return isNaN(f) ? def : f;
}

function safeInt(val, def = 0) {
  const i = parseInt(val);
  return isNaN(i) ? def : i;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Fetch tokens from DexScreener ---
async function fetchTokens() {
  let results = [];
  let success = false;

  for (let attempt = 1; attempt <= MAX_RETRIES && !success; attempt++) {
    for (const url of BASE_URLS) {
      try {
        console.log(`🌐 Fetching tokens from DexScreener (attempt ${attempt})...`);
        const res = await axios.get(url, {
          timeout: 12000,
          headers: {
            "User-Agent": "BossDestinyScanner/2.0 (+https://dexscreener.com)",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://dexscreener.com/",
            "Origin": "https://dexscreener.com",
            "Cache-Control": "no-cache",
          },
        });

        const data = res.data;
        const pairs = Array.isArray(data.pairs)
          ? data.pairs
          : Array.isArray(data.trending)
          ? data.trending
          : [];

        if (pairs.length === 0) {
          console.warn(`⚠️ Attempt ${attempt}: No token pairs returned from ${url}`);
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        const tokens = pairs
          .filter(
            (p) =>
              safeFloat(p.liquidity?.usd) >= MIN_VALID_LIQUIDITY &&
              safeFloat(p.priceUsd) > 0
          )
          .slice(0, DEFAULT_LIMIT)
          .map((p) => ({
            pairAddress: (p.pairAddress || "").toLowerCase(),
            address: p.baseToken?.address || p.token0?.address,
            symbol: p.baseToken?.symbol || p.token0?.symbol || "TOKEN",
            name: p.baseToken?.name || p.token0?.name || "Unknown",
            priceUsd: safeFloat(p.priceUsd),
            liquidity: safeFloat(p.liquidity?.usd),
            volume24h: safeFloat(p.volume?.usd24h || p.volume?.h24),
            txns24h: safeInt(p.txns24h?.buys || 0),
            dexId: p.dexId || "unknown",
            url: p.url || null,
            fdv: safeFloat(p.fdv),
          }));

        results = tokens.sort((a, b) => b.liquidity - a.liquidity);
        success = true;
        break;
      } catch (err) {
        const status = err.response?.status;
        if (status === 429) {
          console.warn(`⚠️ Rate limited (429). Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
        } else if (status === 403) {
          console.error(`🚫 Access denied (403) - likely IP or header block. Retrying...`);
        } else if (status === 404) {
          console.error(`❌ Not found (404): ${url}`);
        } else {
          console.error(`❌ DexScreener fetchTokens failed: ${err.message}`);
        }
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  console.log(`✅ DexScreener fetched ${results.length} BSC tokens`);
  if (results.length > 0) {
    console.log(
      "🔝 Top 3 tokens:",
      results
        .slice(0, 3)
        .map((t) => `${t.symbol} ($${t.liquidity.toFixed(2)})`)
        .join(" | ")
    );
  } else {
    console.warn("⚠️ No valid tokens found after retries.");
  }

  return results;
}

module.exports = { fetchTokens };
