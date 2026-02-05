import "dotenv/config";
import { logInfo, logError } from "./utils/logs.js";

import { initState } from "./core/state.js";
import { startRpcHealth } from "./core/rpcHealth.js";

import { startDexScanner } from "./scanner/dexScanner.js";
import { startGeckoScanner } from "./scanner/geckoScanner.js";

import { initSignalProcessor } from "./signals/processor.js";

// ----------------------
// ENV VALIDATION
// ----------------------
function validateEnv() {
  const required = ["BSC_RPC", "ADMIN_CHAT_ID"];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

// ----------------------
// BOOT ENGINE
// ----------------------
async function bootEngine() {
  try {
    logInfo("🚀 Booting CORE ENGINE...");

    validateEnv();

    // 1️⃣ Global state
    initState();
    logInfo("🧠 State initialized");

    // 2️⃣ Signal pipeline
    initSignalProcessor();
    logInfo("🔗 Signal processor ready");

    // 3️⃣ RPC health (must be early)
    startRpcHealth();
    logInfo("💓 RPC health monitor started");

    // 4️⃣ Scanners (last)
    startDexScanner();
    logInfo("🔍 DEX scanner running");

    startGeckoScanner();
    logInfo("🦎 Gecko scanner running");

    logInfo("✅ CORE ENGINE RUNNING");
  } catch (err) {
    logError("❌ Engine boot failed", err);
    process.exit(1);
  }
}

// ----------------------
// GRACEFUL SHUTDOWN
// ----------------------
function shutdown(signal) {
  logInfo(`🛑 Shutdown signal received: ${signal}`);
  // optional: persist state, flush queues, close RPCs
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ----------------------
// CRASH GUARDS
// ----------------------
process.on("unhandledRejection", (err) => {
  logError("🔥 Unhandled Promise Rejection", err);
});

process.on("uncaughtException", (err) => {
  logError("💥 Uncaught Exception", err);
  process.exit(1);
});

// ----------------------
bootEngine();
