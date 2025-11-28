// FILE: scanner/index.js
// Production-ready scanner orchestrator (ESM)
// Replaces previous scanner/index.js with improved error handling,
// rate-limit backoff, queue-size protection, and unified token processing.

import pino from 'pino';
import PQueue from 'p-queue';
import onpair from './onpair/index.js';
import dsScanner from './dexscreener/index.js';
import gecko from './gecko/index.js';
import processor from '../signals/processor.js';
import generator from '../signals/generator.js';
import telegramSender from '../telegram/sender.js';
import config from '../config/index.js';
import { setTimeout as wait } from 'timers/promises';
import AbortController from 'abort-controller';

const log = pino({ name: 'Scanner', level: process.env.LOG_LEVEL || 'info' });

// Configurable values (env / config fallback)
const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY || 4));
const GEO_POLL_SEC = Math.max(30, Number(process.env.GECKO_POLL_SEC || 60));
const QUEUE_MAX_PENDING = Math.max(500, Number(process.env.SCAN_QUEUE_MAX || 1000));
const DEX_TIMEOUT_MS = Math.max(5000, Number(process.env.DEX_TIMEOUT_MS || 7000));

const queue = new PQueue({ concurrency: CONCURRENCY });
let geckoInterval = null;
let onpairEmitter = null;

// Small helper to abort fetches after timeout
async function fetchWithTimeout(fetchFn, timeoutMs = DEX_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetchFn({ signal: controller.signal });
    return result;
  } finally {
    clearTimeout(id);
  }
}

// Exponential retry with jitter
async function retry(fn, attempts = 3, baseDelay = 1000, name = 'op') {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRateLimit = err?.response?.status === 429;
      // backoff: increased wait on rate limiting
      const waitMs = isRateLimit ? Math.min(60_000, baseDelay * Math.pow(2, i)) : baseDelay * (i + 1);
      const jitter = Math.floor(Math.random() * 300);
      log.warn({ err: err?.message, attempt: i + 1, name }, `Retrying ${name} in ${waitMs + jitter}ms`);
      await wait(waitMs + jitter);
    }
  }
  throw lastErr;
}

/**
 * processToken - single token processing pipeline
 * - fetches dexscreener info
 * - analyzes token
 * - builds telegram message
 * - sends via telegram sender
 */
async function processToken(tokenAddress) {
  const token = String(tokenAddress).toLowerCase();
  log.info({ token }, 'processToken - start');

  // 1) fetch dexscreener token info (with timeout + retry)
  const ds = await retry(
    () => fetchWithTimeout(() => dsScanner.fetchToken(token), DEX_TIMEOUT_MS),
    3,
    1000,
    'dexscreener.fetchToken'
  ).catch((err) => {
    log.warn({ err: err?.message, token }, 'Dexscreener fetch failed — skipping token');
    return null;
  });

  if (!ds) {
    log.info({ token }, 'No dexscreener data — skipping');
    return;
  }

  // 2) analyze token (safe)
  let signal;
  try {
    signal = await processor.analyzeToken(token, ds.raw ?? ds);
  } catch (err) {
    log.error({ err: err?.message, token }, 'Processor analyzeToken failed');
    return;
  }

  if (!signal) {
    log.info({ token }, 'Processor returned no actionable signal');
    return;
  }

  // attach raw dex data for debugging/telemetry
  signal.details = signal.details || {};
  signal.details.dexRaw = ds.raw ?? ds;

  // 3) build telegram message (generator should be safe)
  let payload;
  try {
    payload = generator.buildTelegramMessage(signal);
  } catch (err) {
    log.error({ err: err?.message, token }, 'Generator buildTelegramMessage failed');
    return;
  }

  // 4) send via telegram sender (with retry)
  try {
    await retry(
      () => telegramSender.sendMessageToAdmins(payload.text, payload.options, { meta: payload.jsonPayload }),
      3,
      1000,
      'telegramSender.send'
    );
    log.info({ token, score: signal.score, risk: signal.riskLevel }, 'Signal sent');
  } catch (err) {
    log.error({ err: err?.message, token }, 'Failed to deliver signal to Telegram');
  }
}

/**
 * Safe queue-add wrapper that guards queue growth
 */
function enqueueToken(tokenAddress) {
  // guard pending size
  const pending = queue.size + queue.pending;
  if (pending >= QUEUE_MAX_PENDING) {
    log.warn({ pending, max: QUEUE_MAX_PENDING }, 'Queue full — rejecting new token to avoid OOM');
    return;
  }
  queue.add(() => processToken(tokenAddress)).catch((err) => {
    log.error({ err: err?.message, tokenAddress }, 'Queued job failed');
  });
}

/**
 * Start all scanners (onpair listener + gecko poll)
 */
export async function startScanners() {
  if (onpairEmitter) {
    log.warn('startScanners called but onpair listener already running');
    return;
  }

  // 1) start onpair listener
  try {
    onpairEmitter = await onpair.startListening();
    onpairEmitter.on('newPair', (payload) => {
      try {
        const tokenAddress = payload?.tokenAddress || payload?.pairAddress || payload?.token;
        if (!tokenAddress) return log.warn({ payload }, 'onpair newPair without tokenAddress');
        enqueueToken(tokenAddress);
      } catch (err) {
        log.error({ err: err?.message }, 'Error handling newPair event');
      }
    });
    log.info('onpair listener started');
  } catch (err) {
    log.error({ err: err?.message }, 'Failed to start onpair listener');
  }

  // 2) start gecko polling (only one interval)
  if (!geckoInterval) {
    geckoInterval = setInterval(async () => {
      try {
        const trending = await retry(() => gecko.fetchTrending(), 2, 1000, 'gecko.fetchTrending').catch((e) => {
          log.warn({ err: e?.message }, 'Gecko trending fetch failed — skipping this round');
          return null;
        });

        if (!Array.isArray(trending) || trending.length === 0) return;

        for (const t of trending) {
          if (!t?.address) continue;
          enqueueToken(t.address);
        }
      } catch (err) {
        log.warn({ err: err?.message }, 'Uncaught error in gecko interval');
      }
    }, GEO_POLL_SEC * 1000);

    log.info({ GEO_POLL_SEC }, 'Gecko polling started');
  } else {
    log.info('Gecko polling already running');
  }
}

/**
 * stopScanners - stop all listeners and timers gracefully
 */
export async function stopScanners() {
  try {
    if (geckoInterval) {
      clearInterval(geckoInterval);
      geckoInterval = null;
      log.info('Gecko polling stopped');
    }

    if (onpairEmitter && typeof onpair.stopListening === 'function') {
      await onpair.stopListening();
      onpairEmitter.removeAllListeners?.();
      onpairEmitter = null;
      log.info('onpair listener stopped');
    }

    // drain queue
    await queue.onIdle();
    log.info('Queue drained');
  } catch (err) {
    log.warn({ err: err?.message }, 'Error during stopScanners');
  }
}

// Export default convenience object
export default {
  startScanners,
  stopScanners,
  enqueueToken, // useful for manual testing
};
