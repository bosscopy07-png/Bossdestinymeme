import "dotenv/config";
import { logInfo, logError, logWarn } from "./utils/logs.js";

import state from "./core/state.js";
import { startRpcHealth } from "./core/rpcHealth.js";

import { startDexScanner } from "./scanner/dexScanner.js";
import { startGeckoScanner } from "./scanner/geckoScanner.js";

import { initSignalProcessor } from "./signals/processor.js";

// ----------------------
// ENV VALIDATION
// ----------------------
function validateEnv() {
  const required = [
    "ADMIN_CHAT_ID",
    "RPC_URLS"
  ];

  const missing = required.filter(k => !process.env[k]);

  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

// ----------------------
// BOOT ENGINE
// ----------------------
async function bootEngine() {
  try {
    logInfo("🚀 Booting CORE ENGINE");

    // 1️⃣ Validate environment early
    validateEnv();
    logInfo("✅ Environment validated");

    // 2️⃣ Initialize core state (singleton already constructed)
    if (!state.initialized) {
      state.initialized = true;
      state.startedAt = Date.now();
    }
    logInfo("🧠 Core state ready");

    // 3️⃣ Signal pipeline (must exist before scanners)
    initSignalProcessor();
    logInfo("🔗 Signal processor initialized");

    // 4️⃣ RPC health (before any chain calls)
    startRpcHealth();
    logInfo("💓 RPC health monitor running");

    // 5️⃣ Scanners (last, depend on everything above)
    startDexScanner();
    logInfo("🔍 DEX scanner started");

    startGeckoScanner();
    logInfo("🦎 Gecko scanner started");

    logInfo("✅ CORE ENGINE FULLY OPERATIONAL");
  } catch (err) {
    logError("❌ CORE ENGINE BOOT FAILED", err);
    process.exit(1);
  }
}

// ----------------------
// GRACEFUL SHUTDOWN
// ----------------------
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logWarn(`🛑 Shutdown initiated (${signal})`);

  try {
    // Future-safe hooks
    // await flushQueues();
    // await closeDB();
    // await stopScanners();

    logInfo("✅ Shutdown clean");
  } catch (err) {
    logError("Shutdown error", err);
  } finally {
    process.exit(0);
  }
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
// START ENGINE
// ----------------------
bootEngine();

// ----------------------
// HEARTBEAT (LIVENESS)
// ----------------------
setInterval(() => {
  logInfo("🫀 Core engine alive");
}, 60_000);
