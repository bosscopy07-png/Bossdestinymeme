// src/dexscreener.js
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

const CHAIN = "bsc";
const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || "80");
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_BUSD || "20");
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 3;
const BASE_URL = `https://api.dexscreener.com/latest/dex/trending?chain=${CHAIN}`;

const proxy = process.env.DEXSCR_PROXY
  ? new HttpsProxyAgent(process.env.DEXSCR_PROXY)
  : null;

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

async function fetchTokens() {
  let results = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🌐 Fetching tokens from DexScreener (attempt ${attempt})...`);

      const res = await axios.get(BASE_URL, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: "https://dexscreener.com/",
          Origin: "https://dexscreener.com",
        },
        httpsAgent: proxy || undefined,
      });

      const pairs = Array.isArray(res.data.pairs)
        ? res.data.pairs
        : Array.isArray(res.data.trending)
        ? res.data.trending
        : [];

      if (!pairs.length) {
        console.warn(`⚠️ No token data returned`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      results = pairs
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

      break;
    } catch (err) {
      const code = err.response?.status;
      if (code === 429) console.warn(`⚠️ Rate limit, retrying...`);
      else if (code === 403)
        console.warn(`🚫 403 Forbidden - Try enabling proxy`);
      else console.error(`❌ Attempt ${attempt} failed: ${err.message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.log(`✅ DexScreener fetched ${results.length} tokens`);
  if (results.length)
    console.log(
      "🔝 Top 3:",
      results.slice(0, 3).map((t) => `${t.symbol} ($${t.liquidity})`).join(" | ")
    );
  else console.warn("⚠️ No valid tokens found after retries.");

  return results;
}

module.exports = { fetchTokens };
