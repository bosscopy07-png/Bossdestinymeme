/**
 * FILE: scanner/onpair/index.js
 *
 * PancakeSwap V2 PairCreated listener (ESM edition).
 * Stable, clean and fully self-contained.
 */

import fs from 'fs/promises';
import path from 'path';
import EventEmitter from 'events';
import Pino from 'pino';
import { ethers } from 'ethers';
import config from '../../config/index.js';
import { getProvider, uid } from '../../utils/web3.js';
import { fileURLToPath } from 'url';

// Required for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------
// FIX: Stable and guaranteed path for seen file
// ---------------------------------------------
const SEEN_PAIRS_FILE = path.resolve(process.cwd(), 'seen_pairs.json');

const log = Pino({ level: config.LOG_LEVEL || 'info' });
const EMIT = new EventEmitter();

const FACTORY_ADDRESS = config.FACTORY_ADDRESS;
const POLL_RECONNECT_MS = 15_000;

// PancakeSwap v2 ABI (minimal)
const FACTORY_ABI = [
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint)"
];

let seenPairs = new Set();
let listening = false;
let factoryContract = null;

/** Load previously seen LP pairs */
async function loadSeenPairs() {
  try {
    let exists = await fs.stat(SEEN_PAIRS_FILE).then(() => true).catch(() => false);

    if (!exists) {
      await fs.writeFile(SEEN_PAIRS_FILE, JSON.stringify({ pairs: [] }, null, 2));
      seenPairs = new Set();
      return;
    }

    const raw = await fs.readFile(SEEN_PAIRS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    seenPairs = new Set(parsed.pairs || []);

    log.info({ count: seenPairs.size }, 'Loaded seen pairs');
  } catch (err) {
    log.warn({ err: err?.message }, 'Failed to load seen pairs — starting empty');
    seenPairs = new Set();
  }
}

/** Persist new LP pair safely */
async function persistSeenPair(pairAddress) {
  try {
    const raw = await fs.readFile(SEEN_PAIRS_FILE, 'utf8').catch(() => null);
    const parsed = raw ? JSON.parse(raw) : { pairs: [] };

    if (!parsed.pairs.includes(pairAddress)) {
      parsed.pairs.push(pairAddress);
      await fs.writeFile(SEEN_PAIRS_FILE, JSON.stringify(parsed, null, 2));
    }

    seenPairs.add(pairAddress);
  } catch (err) {
    log.warn({ err: err?.message }, 'Failed to persist seen pair');
  }
}

/** Handle incoming PairCreated events */
async function handlePairCreated(token0, token1, pairAddress, event) {
  try {
    const WBNB = [
      '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', 
      '0x0000000000000000000000000000000000000000'
    ];

    const a0 = (token0 || '').toLowerCase();
    const a1 = (token1 || '').toLowerCase();
    const pairKey = pairAddress.toLowerCase();

    const tokenAddress =
      WBNB.includes(a0) && !WBNB.includes(a1) ? a1 :
      WBNB.includes(a1) && !WBNB.includes(a0) ? a0 :
      a0;

    if (seenPairs.has(pairKey)) {
      log.debug({ pair: pairKey }, 'Duplicate LP — skipped');
      return;
    }

    await persistSeenPair(pairKey);

    const payload = {
      id: uid('pair_'),
      tokenAddress,
      token0: a0,
      token1: a1,
      pairAddress: pairKey,
      blockNumber: event.blockNumber,
      txHash: event.transactionHash,
      timestamp: Date.now(),
    };

    log.info({ payload }, 'New LP detected');
    EMIT.emit('newPair', payload);

  } catch (err) {
    log.error({ err: err?.message }, 'handlePairCreated error');
  }
}

/** Start listener */
export async function startListening() {
  if (listening) return EMIT;
  listening = true;

  await loadSeenPairs();

  try {
    const provider = getProvider();
    factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    factoryContract.on('PairCreated', async (token0, token1, pairAddress, event) => {
      try {
        await handlePairCreated(token0, token1, pairAddress, event);
      } catch (err) {
        log.error({ err: err?.message }, 'PairCreated handler crashed');
      }
    });

    log.info({ factory: FACTORY_ADDRESS }, 'Listening for PancakeSwap pairs…');

  } catch (err) {
    log.error({ err: err?.message }, 'Listener attach failed — retrying');
    listening = false;
    setTimeout(() => startListening(), POLL_RECONNECT_MS);
  }

  return EMIT;
}

/** Stop listener */
export async function stopListening() {
  try {
    if (factoryContract?.removeAllListeners) {
      factoryContract.removeAllListeners('PairCreated');
    }
    listening = false;
    log.info('Stopped PairCreated listener');
  } catch (err) {
    log.warn({ err: err?.message }, 'Stop listener failed');
  }
}

export default {
  on: EMIT.on.bind(EMIT),
  once: EMIT.once.bind(EMIT),
  startListening,
  stopListening,
};
