// src/dexscreener.js
const axios = require('axios');

const CHAIN = 'bsc';
const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_BUSD || '20');
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 3;

// GeckoTerminal trending API for BSC
const BASE_URL = `https://api.geckoterminal.com/api/v2/networks/bsc/pools/trending`;

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
      console.log(`🌐 Fetching trending tokens from GeckoTerminal (attempt ${attempt})...`);
      const res = await axios.get(BASE_URL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'BossDestinyScanner/1.0',
          'Accept': 'application/json',
        },
      });

      if (!res.data || !res.data.data) {
        console.warn(`⚠️ Attempt ${attempt}: No token data returned`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const tokens = res.data.data
        .filter((p) => safeFloat(p.liquidity_usd) >= MIN_VALID_LIQUIDITY && safeFloat(p.price_usd) > 0)
        .slice(0, DEFAULT_LIMIT)
        .map((p) => ({
          pairAddress: p.id || p.address || 'unknown',
          address: p.base_token?.address || p.quote_token?.address || 'unknown',
          symbol: p.base_token?.symbol || 'TOKEN',
          name: p.base_token?.name || 'Unknown',
          priceUsd: safeFloat(p.price_usd),
          liquidity: safeFloat(p.liquidity_usd),
          volume24h: safeFloat(p.volume_24h_usd),
          txns24h: safeInt(p.tx_count_24h),
          dexId: p.dex_id || 'gecko',
          url: p.url || null,
          fdv: safeFloat(p.fdv_usd),
        }));

      results.push(...tokens);
      break; // success
    } catch (err) {
      const code = err.response?.status;
      if (code === 429) {
        console.warn(`⚠️ Rate limited (429). Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
      } else if (code === 403) {
        console.error('🚫 Access denied (403) — possible IP block. Retrying...');
      } else if (code === 404) {
        console.error(`❌ Endpoint not found (404): ${BASE_URL}`);
        break;
      } else {
        console.error(`❌ Attempt ${attempt} failed:`, err.message);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  results = results.sort((a, b) => b.liquidity - a.liquidity);

  console.log(`✅ GeckoTerminal fetched ${results.length} BSC tokens`);
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
