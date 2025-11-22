import dotenv from 'dotenv';
dotenv.config(); // Load environment variables for PM2

export default {
  apps: [
    {
      name: "quantum-scanner",
      script: "./index.js",          // <-- change to your real entry file
      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "production",

        ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
        ALLOWED_USERS: process.env.ALLOWED_USERS,
        ANTI_RUG_AI_ENABLED: process.env.ANTI_RUG_AI_ENABLED,

        APESWAP_ROUTER: process.env.APESWAP_ROUTER,

        API_PORT: process.env.API_PORT,
        API_RATE_LIMIT: process.env.API_RATE_LIMIT,
        API_SIGNAL_BUFFER_SIZE: process.env.API_SIGNAL_BUFFER_SIZE,

        BSC_RPC: process.env.BSC_RPC,
        BSC_RPC_2: process.env.BSC_RPC_2,
        BSC_RPC_3: process.env.BSC_RPC_3,

        CHAIN_ID: process.env.CHAIN_ID,

        DEXSCREENER_URL: process.env.DEXSCREENER_URL,
        GECKO_SCAN_INTERVAL: process.env.GECKO_SCAN_INTERVAL,
        GECKO_TERMINAL_URL: process.env.GECKO_TERMINAL_URL,

        LIVE_MODE: process.env.LIVE_MODE,
        LOG_DIRECTORY: process.env.LOG_DIRECTORY,
        LOG_LEVEL: process.env.LOG_LEVEL,

        MAX_GAS_GWEI: process.env.MAX_GAS_GWEI,
        MAX_TAX_BUY: process.env.MAX_TAX_BUY,
        MAX_TAX_SELL: process.env.MAX_TAX_SELL,

        MEMPOOL_SCAN_INTERVAL: process.env.MEMPOOL_SCAN_INTERVAL,

        MIN_HOLDERS: process.env.MIN_HOLDERS,
        MIN_LIQUIDITY: process.env.MIN_LIQUIDITY,

        PAIR_SCAN_INTERVAL: process.env.PAIR_SCAN_INTERVAL,
        PAPER_MODE: process.env.PAPER_MODE,

        PCS_V2_ROUTER: process.env.PCS_V2_ROUTER,
        PCS_V3_ROUTER: process.env.PCS_V3_ROUTER,

        PRIVATE_KEY: process.env.PRIVATE_KEY,

        SCAN_GECKO_TRENDING: process.env.SCAN_GECKO_TRENDING,
        SCAN_MEMPOOL: process.env.SCAN_MEMPOOL,
        SCAN_NEW_PAIRS: process.env.SCAN_NEW_PAIRS,

        SEEN_PAIRS_FILE: process.env.SEEN_PAIRS_FILE,
        SIGNAL_CACHE_LIMIT: process.env.SIGNAL_CACHE_LIMIT,

        SLIPPAGE_BUY: process.env.SLIPPAGE_BUY,
        SLIPPAGE_SELL: process.env.SLIPPAGE_SELL,

        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      }
    }
  ]
};
