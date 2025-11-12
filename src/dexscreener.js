// src/dexscreener.js
const axios = require('axios');

const CHAIN = 'bsc';
const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_BUSD || '20');
const MIN_TXS = parseInt(process.env.MIN_TXS || '5');
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 3;
const BASE_URL = `https://api.geckoterminal.com/api/v2/networks/${CHAIN}/pools/trending`; // GeckoTerminal endpoint

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

// --- Fetch trending tokens/pools ---
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

      if (!res.data || !Array.isArray(res.data.data)) {
        console.warn(`⚠️ Attempt ${attempt}: No pool data returned from GeckoTerminal`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const tokens = res.data.data
        .map((item) => {
          const attr = item.attributes || {};
          return {
            pairAddress: (attr.address || '').toLowerCase(),
            symbol: attr.name || 'TOKEN',
            address: attr.base_token?.address || attr.quote_token?.address || null,
            name: attr.base_token?.name || 'Unknown',
            priceUsd: safeFloat(attr.base_token_price_usd || 0),
            liquidity: safeFloat(attr.reserve_in_usd || attr.liquidity_usd),
            volume24h: safeFloat(attr.volume_usd || 0),
            txns24h: safeInt(attr.transactions?.h24?.buys || 0),
            dexId: attr.dex_id || 'unknown',
            url: attr.url || null,
            fdv: safeFloat(attr.fdv || 0),
          };
        })
        .filter((p) => p.liquidity >= MIN_VALID_LIQUIDITY && p.txns24h >= MIN_TXS)
        .slice(0, DEFAULT_LIMIT)
        .sort((a, b) => b.liquidity - a.liquidity);

      results.push(...tokens);
      break; // success
    } catch (err) {
      const code = err.response?.status;
      if (code === 429) {
        console.warn(`⚠️ Rate limited (429). Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
      } else if (code === 403) {
        console.error('🚫 Access denied (403) — possible rate block. Retrying...');
      } else if (code === 404) {
        console.error(`❌ Endpoint not found (404): ${BASE_URL}`);
        break;
      } else {
        console.error(`❌ Attempt ${attempt} failed:`, err.message);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.log(`✅ GeckoTerminal fetched ${results.length} tokens/pools`);
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
