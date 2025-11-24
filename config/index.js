// FILE: config/index.js
import dotenv from 'dotenv';
import fs from 'fs';
import config from '../config/index.js';
dotenv.config();

// ─────────────────────────────────────────────
// SANITY CHECKS
// ─────────────────────────────────────────────
const requiredEnvs = [
  'TELEGRAM_BOT_TOKEN',
  'BSC_RPC',
  'BSC_RPC_2',
  'BSC_RPC_3'
];

if (process.env.LIVE_MODE === 'true') {
  requiredEnvs.push('PRIVATE_KEY');
}

requiredEnvs.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️  Warning: ENV variable ${key} is missing!`);
  }
});

// ─────────────────────────────────────────────
// CONFIG EXPORT
// ─────────────────────────────────────────────
const config = {
  NODE_ENV: process.env.NODE_ENV || 'production',

  // ─────────────────────────────────────────────
  // TELEGRAM BOT
  // ─────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
  ALLOWED_USERS: process.env.ALLOWED_USERS?.split(',') || [],

  // ─────────────────────────────────────────────
  // API SERVER
  // ─────────────────────────────────────────────
  API: {
    port: parseInt(process.env.API_PORT || '5000', 10),
    rateLimit: parseInt(process.env.API_RATE_LIMIT || '100', 10),
  },

  // ─────────────────────────────────────────────
  // BLOCKCHAIN RPC PROVIDERS
  // ─────────────────────────────────────────────
  RPC: {
    primary: process.env.BSC_RPC,
    secondary: process.env.BSC_RPC_2,
    fallback: process.env.BSC_RPC_3,
  },

  CHAIN_ID: parseInt(process.env.CHAIN_ID || '56', 10),

  // ─────────────────────────────────────────────
  // WALLET SETTINGS
  // ─────────────────────────────────────────────
  PRIVATE_KEY: process.env.PRIVATE_KEY || null,
  LIVE_MODE: process.env.LIVE_MODE === 'true',
  PAPER_MODE: process.env.PAPER_MODE === 'true',

  // ─────────────────────────────────────────────
  // TRADING CONFIG
  // ─────────────────────────────────────────────
  TRADING: {
    maxGasGwei: parseFloat(process.env.MAX_GAS_GWEI || '8'),
    slippageBuy: parseFloat(process.env.SLIPPAGE_BUY || '10'),
    slippageSell: parseFloat(process.env.SLIPPAGE_SELL || '15'),
  },

  ROUTERS: {
    pancakeswap_v2: process.env.PCS_V2_ROUTER || 'https://bsc-dex.pancakeswap-v2.router',
    pancakeswap_v3: process.env.PCS_V3_ROUTER || 'https://bsc-dex.pancakeswap-v3.router',
    apeswap: process.env.APESWAP_ROUTER || 'https://bsc-dex.apeswap.router',
  },

  // ─────────────────────────────────────────────
  // AI ANTI-RUG SETTINGS
  // ─────────────────────────────────────────────
  AI: {
    enabled: process.env.ANTI_RUG_AI_ENABLED === 'true',
    minLiquidityUSD: parseFloat(process.env.MIN_LIQUIDITY || '5000'),
    maxBuyTax: parseFloat(process.env.MAX_TAX_BUY || '15'),
    maxSellTax: parseFloat(process.env.MAX_TAX_SELL || '15'),
    minHolders: parseFloat(process.env.MIN_HOLDERS || '50'),
  },

  // ─────────────────────────────────────────────
  // SCANNER TOGGLES
  // ─────────────────────────────────────────────
  SCANNERS: {
    newPairs: process.env.SCAN_NEW_PAIRS === 'true',
    geckoTrending: process.env.SCAN_GECKO_TRENDING === 'true',
    mempool: process.env.SCAN_MEMPOOL === 'true',
  },

  // ─────────────────────────────────────────────
  // EXTERNAL API ENDPOINTS
  // ─────────────────────────────────────────────
  EXTERNAL: {
    dexscreener: process.env.DEXSCREENER_URL || 'https://api.dexscreener.com',
    geckoTerminal: process.env.GECKO_TERMINAL_URL || 'https://www.geckoterminal.com/api',
  },

  // ─────────────────────────────────────────────
  // SCAN INTERVALS
  // ─────────────────────────────────────────────
  INTERVALS: {
    pairScan: parseInt(process.env.PAIR_SCAN_INTERVAL || '4000', 10),
    geckoScan: parseInt(process.env.GECKO_SCAN_INTERVAL || '8000', 10),
    mempoolScan: parseInt(process.env.MEMPOOL_SCAN_INTERVAL || '1500', 10),
  },

  // ─────────────────────────────────────────────
  // FILES & CACHE
  // ─────────────────────────────────────────────
  persistence: {
    seenPairsFile: process.env.SEEN_PAIRS_FILE || '/tmp/seen_pairs.json',
    signalCacheLimit: parseInt(process.env.SIGNAL_CACHE_LIMIT || '300', 10),
    apiSignalBuffer: parseInt(process.env.API_SIGNAL_BUFFER_SIZE || '250', 10),
  },

  // ─────────────────────────────────────────────
  // LOGGING
  // ─────────────────────────────────────────────
  LOG: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIRECTORY || '/tmp/logs',
    maxFileSizeMB: parseInt(process.env.LOG_MAX_SIZE || '10', 10),
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
  }
};

// ─────────────────────────────────────────────
// EXPORT CONFIG
// ─────────────────────────────────────────────
export default config;
