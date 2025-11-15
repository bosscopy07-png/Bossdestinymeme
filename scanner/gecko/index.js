/**
 * FILE: scanner/gecko/index.js
 *
 * Gecko trending scanner (ESM):
 * - Fetches trending token list to augment memecoin signals
 * - Tries GeckoTerminal first, falls back to CoinGecko
 * - Cached in-memory (NodeCache) to respect rate limits
 * - Returns array of trending tokens: { name, symbol, address, url }
 */

import axios from 'axios';
import NodeCache from 'node-cache';
import Pino from 'pino';
import config from '../../config/index.js';

const log = Pino({ level: config.LOG_LEVEL || 'info' });
const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 }); // trending updated often

const COINGECKO_TRENDING = 'https://api.coingecko.com/api/v3/search/trending';
const GECKOTERMINAL = 'https://geckoterminal.com/api/charts/v2/trending'; // hypothetical

/**
 * fetchTrending - tries GeckoTerminal first, then CoinGecko
 */
export async function fetchTrending() {
  const cached = cache.get('trending');
  if (cached) return cached;

  // 1️⃣ Try GeckoTerminal
  try {
    const resp = await axios.get(GECKOTERMINAL, { timeout: config.RPC_TIMEOUT_MS || 10_000 });
    if (resp?.data && Array.isArray(resp.data)) {
      const list = resp.data.map((it) => ({
        name: it.name ?? '',
        symbol: it.symbol ?? '',
        address: it.address?.toLowerCase?.() ?? null,
        url: it.url ?? null,
      }));
      cache.set('trending', list);
      log.info({ count: list.length }, 'GeckoTerminal trending fetched');
      return list;
    }
  } catch (err) {
    log.debug('GeckoTerminal fetch failed, falling back to CoinGecko', err?.message);
  }

  // 2️⃣ Fallback to CoinGecko
  try {
    const resp = await axios.get(COINGECKO_TRENDING, { timeout: config.RPC_TIMEOUT_MS || 10_000 });
    const coins = resp?.data?.coins ?? [];
    const list = coins.map((c) => {
      const item = c.item || {};
      return {
        name: item.name ?? '',
        symbol: item.symbol ?? '',
        address: null,
        url: `https://www.coingecko.com/en/coins/${encodeURIComponent(item.id ?? '')}`,
      };
    });
    cache.set('trending', list);
    log.info({ count: list.length }, 'CoinGecko trending fetched');
    return list;
  } catch (err) {
    log.warn({ err: err?.message }, 'Failed to fetch trending from CoinGecko');
    return [];
  }
}

export default { fetchTrending };
