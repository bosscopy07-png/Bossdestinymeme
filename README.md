# Quantum‑Sniper — BSC Memecoin Detection + Sniper Bot 🚀

**⚠️ WARNING:**
This software automates cryptocurrency trading. It can lose money. Always test in **PAPER_MODE** and on testnet before enabling **LIVE_MODE**.

---

## 📌 Overview

**Quantum‑Sniper** is a production‑ready **BSC memecoin detection + automated sniper bot** featuring:

* Real‑time blockchain listeners
* Dexscreener intelligence
* GeckoTerminal trending scans
* Rug‑score heuristics + anti‑honeypot checks
* Telegram sniper bot with interactive buttons
* Paper mode & Live mode
* PM2, Docker, and Render deployment support

Built with:

* Node.js (ESM)
* ethers v6
* Telegraf
* Dexscreener / GeckoTerminal APIs
* PM2

---

## 🔎 Features

### Scanner

* Live `PairCreated` event listener
* Dexscreener token metrics
* GeckoTerminal trending search
* Mempool pre‑trade monitoring
* AI‑like rug detection heuristics
* Multi‑router support (PCS v2, PCS v3, ApeSwap)

### Sniper Engine

* Slippage control
* Take‑profit / Stop‑loss hooks
* Pre‑signed tx support
* Paper trading enabled by default
* Admin‑locked Live mode

### Telegram Bot

* Snipe button
* Watch button
* Details button
* Admin-only commands
* Realtime alerts

### REST API

* `/api/signals` — latest scanner signals
* `/api/pairs` — seen on-chain pairs
* `/api/sniper/status` — engine diagnostics
* `/api/logs` — recent system logs

---

## ⚡ Quickstart

### Prerequisites

* Node.js 20+
* Telegram Bot Token
* BSC RPC URL
* (Optional) PM2, Docker

### 1. Install

```bash
git clone <repo>
cd quantum-sniper
npm ci
```

### 2. Configure

```bash
cp .env.example .env
```

Set required fields:

```
BSC_RPC=
PRIVATE_KEY=
BOT_TOKEN=
ADMIN_CHAT_ID=
PAPER_MODE=true
LIVE_MODE=false
```

### 3. Run

Development mode:

```bash
node api/server.js
node scanner/index.js
node telegram/bot.js
```

PM2 mode:

```bash
pm2 start ecosystem.config.js
```

---

## 🐳 Docker

Build:

```bash
docker build -t quantum-sniper .
```

Run:

```bash
docker run -p 5000:5000 --env-file .env quantum-sniper
```

---

## ☁️ Render Deployment

`render.yaml` includes:

* API Web service
* Scanner worker
* Telegram Bot worker

Push to GitHub and link on Render.

---

## 📁 Structure

```
quantum-sniper/
├── api/
├── scanner/
├── telegram/
├── utils/
├── config/
├── logs/
├── ecosystem.config.js
├── Dockerfile
├── render.yaml
└── README.md
```

---

## 🧪 Testing

```bash
node scanner/index.js
node telegram/bot.js
pm2 logs
```

---

## ⚠️ Disclaimer

Educational use only. Crypto trading is risky.
