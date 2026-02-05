import "dotenv/config";
import { createServer } from "./api/server.js";
import { logInfo, logError } from "./utils/logs.js";
import process from "process";

async function bootApiServer() {
  try {
    logInfo("🛰️ Starting API Server...");

    const port = process.env.API_PORT || 3000;

    const server = await createServer();
    server.listen(port, () => {
      logInfo(`✅ API Server running on port ${port}`);
    });

    // Global error handling
    process.on("unhandledRejection", (reason, p) => {
      logError("Unhandled Rejection at:", reason);
    });
    process.on("uncaughtException", (err) => {
      logError("Uncaught Exception:", err);
    });

  } catch (err) {
    logError("❌ API Server failed to start", err);
    process.exit(1); // exit so a process manager can restart
  }
}

// Launch
bootApiServer();
