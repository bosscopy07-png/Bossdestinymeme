# Telegram Memecoin Scanner & Paper Auto-Trader (Full)

Overview
- Real-time memecoin scanner using Dexscreener + optional on-chain PairCreated listening
- Honeypot checks, token metadata, dev-share checks, scoring & momentum
- Telegram alerts with inline buttons (Paper Buy, Ignore, Watchlist)
- Paper-trader (simulate trades, track balance)
- Dashboard and health endpoints for Render

Quickstart
1. Copy `.env.example` → `.env` and fill TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
2. `npm install`
3. `npm start`
4. Deploy: push repo to GitHub and connect to Render:
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: 18

Safety
- AUTO_TRADE is disabled by default. Do not enable without secure key management and tests.

Files
- src/*.js (scanner, dexscreener, telegram, utils, papertrader, autotrader scaffold)
- data/trades.json (runtime file)
- tmp/ (runtime images)
