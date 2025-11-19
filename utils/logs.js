// FILE: utils/logs.js
import Pino from "pino";
import fs from "fs";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";

// Determine logs directory
const LOG_DIR = process.env.LOG_DIRECTORY || path.join(process.cwd(), "logs");

// Ensure logs folder exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file path
const logPath = path.join(LOG_DIR, "app.log");

// Pino logger
const log = Pino(
    {
        level: process.env.LOG_LEVEL || "info",
        timestamp: () => `,"time":"${new Date().toISOString()}"`,
        transport: isDev
            ? {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: true,
                  },
              }
            : undefined, // Production uses plain JSON logs
    },
    Pino.destination(logPath)
);

// --- Exported Helpers ---
export const logInfo = (msg, meta = {}) => log.info(meta, msg);
export const logError = (msg, meta = {}) => log.error(meta, msg);
export const logWarn = (msg, meta = {}) => log.warn(meta, msg);
export const logDebug = (msg, meta = {}) => log.debug(meta, msg);

export default log;
