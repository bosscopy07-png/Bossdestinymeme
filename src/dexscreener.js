// src/dexscreener.js
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const CHAIN = 'bsc';
const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_BUSD || '20');
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 3;
const BASE_URL = `https://api.dexscreener.com/latest/dex/trending?chain=${CHAIN}`;

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

// --- Fetch trending tokens ---
async function fetchTokens() {
  let results = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🌐 Fetching trending tokens from DexScreener (attempt ${attempt})...`);

      const axiosConfig = {
        timeout: 10000,
        headers: {
          'User-Agent': 'BossDestinyScanner/1.0',
          'Accept': 'application/json',
        },
      };

      // Optional proxy support
      if (process.env.DEXSCR_PROXY) {
        try {
          axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.DEXSCR_PROXY);
        } catch {
          console.warn('⚠️ Invalid proxy, skipping proxy usage.');
        }
      }

      const res = await axios.get(BASE_URL, axiosConfig);

      if (!res.data || !Array.isArray(res.data.pairs)) {
        console.warn(`⚠️ Attempt ${attempt}: No trending token data returned`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const tokens = res.data.pairs
        .filter((p) => safeFloat(p.liquidity?.usd) >= MIN_VALID_LIQUIDITY && safeFloat(p.priceUsd) > 0)
        .slice(0, DEFAULT_LIMIT)
        .map((p) => ({
          pairAddress: (p.pairAddress || '').toLowerCase(),
          address: p.baseToken?.address || p.token0?.address,
          symbol: p.baseToken?.symbol || p.token0?.symbol || 'TOKEN',
          name: p.baseToken?.name || p.token0?.name || 'Unknown',
          priceUsd: safeFloat(p.priceUsd),
          liquidity: safeFloat(p.liquidity?.usd),
          volume24h: safeFloat(p.volume?.usd24h || p.volume?.h24),
          txns24h: safeInt(p.txns24h?.buys || 0),
          dexId: p.dexId || 'unknown',
          url: p.url || null,
          fdv: safeFloat(p.fdv),
        }));

      results = tokens.sort((a, b) => b.liquidity - a.liquidity);
      break; // success
    } catch (err) {
      const code = err.response?.status;
      if (code === 429) {
        console.warn(`⚠️ Rate limited (429). Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
      } else if (code === 403) {
        console.error('🚫 Access denied (403). Possible rate block — retrying...');
      } else if (code === 404) {
        console.error(`❌ Endpoint not found (404): ${BASE_URL}`);
        break; // stop trying
      } else {
        console.error(`❌ Attempt ${attempt} failed:`, err.message);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.log(`✅ DexScreener fetched ${results.length} trending tokens`);
  if (results.length > 0) {
    console.log(
      '🔝 Top 3 tokens:',
      results.slice(0, 3).map((t) => `${t.symbol} ($${t.liquidity.toFixed(2)})`).join(' | ')
    );
  } else {
    console.warn('⚠️ No valid tokens found after retries.');
  }

  return results;
}

module.exports = { fetchTokens };
