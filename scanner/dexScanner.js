// FILE: scanner/dexScanner.js
/**
 * DexScreener search scanner (ESM)
 * - Uses `/search?q=` endpoint
 * - Returns array of token/pair info
 * - Handles retries, timeouts, and logging
 */

import axios from 'axios';
import Pino from 'pino';
import config from '../config/index.js';
import AbortController from 'abort-controller';
import { setTimeout as wait } from 'timers/promises';

const log = Pino({ name: 'DexScanner', level: config.LOG_LEVEL || 'info' });
const BASE_URL = 'https://api.dexscreener.com/latest/dex/search?q=';

const TIMEOUT_MS = config.DEX_TIMEOUT_MS || 7000;

/**
 * fetchTokens - search DexScreener by symbol or address
 * @param {string} query
 * @returns {Promise<Array>} - array of token/pair objects
 */
export async function fetchTokens(query) {
  if (!query) return [];

  const url = `${BASE_URL}${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await axios.get(url, { signal: controller.signal });

    const results = resp?.data?.pairs ?? [];
    if (!Array.isArray(results)) return [];

    return results.map((pair) => ({
      name: pair?.baseToken?.name || pair?.name || '',
      symbol: pair?.baseToken?.symbol || pair?.symbol || '',
      address: pair?.baseToken?.address || null,
      pairAddress: pair?.pairAddress || null,
      liquidity: pair?.liquidity?.usd || 0,
      price: pair?.price || 0,
      volume: pair?.volume?.h24 || 0,
      raw: pair,
    }));
  } catch (err) {
    if (axios.isAxiosError(err)) {
      log.warn({ err: err.message, query }, 'Dexscreener fetch error');
    } else {
      log.error({ err: err?.message, query }, 'Unknown Dexscreener fetch error');
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * fetchTokens with retry
 */
export async function fetchTokensWithRetry(query, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchTokens(query);
    } catch (err) {
      lastErr = err;
      const waitMs = Math.min(10_000, 1000 * Math.pow(2, i)) + Math.floor(Math.random() * 300);
      log.warn({ err: err?.message, attempt: i + 1, query }, `Retrying fetch in ${waitMs}ms`);
      await wait(waitMs);
    }
  }
  log.error({ err: lastErr?.message, query }, 'Failed to fetch token after retries');
  return [];
}

export default { fetchTokens, fetchTokensWithRetry };
