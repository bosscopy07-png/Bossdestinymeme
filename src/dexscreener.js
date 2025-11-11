// src/dexscreener.js
const axios = require('axios');

const CHAIN = 'bsc';
const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_USD || '5');
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 3;
const BASE_URL = `https://api.dexscreener.com/latest/dex/tokens`;

function safeFloat(val, def = 0) {
  const f = parseFloat(val);
  return isNaN(f) ? def : f;
}

function safeInt(val, def = 0) {
  const i = parseInt(val);
  return isNaN(i) ? def : i;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch token pairs from DexScreener
 * Handles rate limit (429) and retries automatically
 */
async function fetchTokens() {
  let results = [];
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      console.log(`🌐 Fetching tokens from DexScreener (attempt ${attempt})...`);
      const res = await axios.get(BASE_URL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'BossDestinyScanner/1.0',
          'Accept': 'application/json'
        }
      });

      if (!res.data || !Array.isArray(res.data.pairs)) {
        console.warn(`⚠️ Attempt ${attempt}: No data from DexScreener tokens endpoint`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const pairs = res.data.pairs
        .filter(
          (p) =>
            safeFloat(p.liquidity?.usd) >= MIN_VALID_LIQUIDITY &&
            safeFloat(p.priceUsd) > 0
        )
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

      results.push(...pairs);
      break;
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`⚠️ Rate limited (429). Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
      } else if (err.response?.status === 404) {
        console.error(`❌ DexScreener fetchTokens attempt ${attempt} failed (404 - Endpoint not found)`);
      } else {
        console.error(`❌ DexScreener fetchTokens attempt ${attempt} failed:`, err.message);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  results = results.sort((a, b) => b.liquidity - a.liquidity);
  console.log(`✅ DexScreener fetched ${results.length} tokens from BSC`);

  if (results.length > 0) {
    console.log(
      '🔝 Top 3 tokens:',
      results
        .slice(0, 3)
        .map((t) => `${t.symbol} ($${t.liquidity.toFixed(2)})`)
        .join(' | ')
    );
  } else {
    console.warn('⚠️ No valid tokens found after retries.');
  }

  return results;
}

module.exports = { fetchTokens };
