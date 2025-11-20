// FILE: utils/logs.js
import Pino from "pino";
import fs from "fs";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";

// Logs directory
const LOG_DIR = process.env.LOG_DIRECTORY || path.join(process.cwd(), "logs");

// Ensure directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file path
const logPath = path.join(LOG_DIR, "app.log");

// Create Pino logger
const logger = Pino(
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
            : undefined,
    },
    Pino.destination(logPath)
);

// ----- Exported helper wrappers -----
export const logInfo = (msg, meta = {}) => logger.info(meta, msg);
export const logError = (msg, meta = {}) => logger.error(meta, msg);
export const logWarn = (msg, meta = {}) => logger.warn(meta, msg);
export const logDebug = (msg, meta = {}) => logger.debug(meta, msg);

// Provide named export `log` + default export
export const log = logger;

// Default export for convenience
export default logger;
