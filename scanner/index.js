/**
 * FILE: scanner/index.js
 *
 * Scanner orchestrator (production-ready):
 * - Starts onpair listener
 * - Processes each new pair with dexscreener & processor
 * - Builds Telegram messages & forwards to telegram/sender
 * - Polls Gecko trending periodically
 * - Fully resilient to API failures and throttled for concurrency
 */

import pino from 'pino';
import PQueue from 'p-queue';
import onpair from './onpair/index.js';
import dsScanner from './dexscreener/index.js';
import gecko from './gecko/index.js';
import processor from '../signals/processor.js';
import generator from '../signals/generator.js';
import telegramSender from '../telegram/sender.js';
import config from '../config/index.js';

const log = pino({ level: config.LOG_LEVEL || 'info' });

// concurrency queue for processing tokens
const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY || 4));
const queue = new PQueue({ concurrency: CONCURRENCY });

let geckoInterval = null;

// utility: retry wrapper
async function retry(fn, attempts = 3, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
      else throw err;
    }
  }
}

/**
 * processNewPairPayload - orchestrate full processing for a new pair
 */
async function processNewPairPayload(payload) {
  const token = payload.tokenAddress;
  log.info({ token, pair: payload.pairAddress }, 'Processing new pair');

  try {
    // 1) fetch dexscreener token info with retry
    const ds = await retry(() => dsScanner.fetchToken(token), 3, 2000);
    if (!ds) return log.warn({ token }, 'Dexscreener returned no data — skipping');

    // 2) analyze token
    const signal = await processor.analyzeToken(token, ds.raw ?? ds);
    signal.details.dexRaw = ds.raw ?? ds;

    // 3) build telegram message
    const { text, options, jsonPayload } = generator.buildTelegramMessage(signal);

    // 4) send via telegram sender (optional retry)
    await retry(() => telegramSender.sendMessageToAdmins(text, options, { meta: jsonPayload }), 3, 2000);

    log.info({ token, score: signal.score, risk: signal.riskLevel }, 'Signal processed and sent');
  } catch (err) {
    log.error({ err: err?.message, token }, 'Failed to process new pair payload');
  }
}

/**
 * startScanners - initialize watchers
 */
export async function startScanners() {
  // start onpair listener
  const emitter = await onpair.startListening();
  emitter.on('newPair', (payload) => queue.add(() => processNewPairPayload(payload)));

  // start gecko trending poll
  const GEO_POLL = Number(process.env.GECKO_POLL_SEC || 60);
  geckoInterval = setInterval(async () => {
    try {
      const trending = await gecko.fetchTrending();
      if (!Array.isArray(trending) || !trending.length) return;

      for (const t of trending) {
        if (!t.address) continue;
        queue.add(async () => {
          try {
            const ds = await dsScanner.fetchToken(t.address);
            const signal = await processor.analyzeToken(t.address, ds?.raw ?? ds);
            signal.details.dexRaw = ds?.raw ?? ds;
            const { text, options, jsonPayload } = generator.buildTelegramMessage(signal);
            await telegramSender.sendMessageToAdmins(text, options, { meta: jsonPayload });
          } catch (e) {
            log.warn({ e: e?.message, token: t.address }, 'Failed trending processing');
          }
        });
      }
    } catch (err) {
      log.warn({ err: err?.message }, 'Gecko trending poll failed');
    }
  }, GEO_POLL * 1000);

  log.info('Scanners started (onpair + gecko polling)');
}

/**
 * stopScanners - stops polling and listeners
 */
export async function stopScanners() {
  try {
    if (geckoInterval) clearInterval(geckoInterval);
    await onpair.stopListening();
    await queue.onIdle();
    log.info('Scanners stopped');
  } catch (err) {
    log.warn({ err: err?.message }, 'Errors during stopScanners');
  }
}

export default {
  startScanners,
  stopScanners,
};
