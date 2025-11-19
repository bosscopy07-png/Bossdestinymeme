// FILE: api/routes.js
import express from "express";
import {
  getSignals,
  getPairs,
  getSniperStatus,
  getLogs
} from "./controllers.js";

const router = express.Router();

/**
 * Helper: safely parse any integer query parameter
 */
function parseIntQuery(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Wrapper for clean async routes
 */
function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/* ===============================
   GET /api/signals
   Returns the latest generated trading signals
================================ */
router.get(
  "/signals",
  asyncRoute(async (req, res) => {
    const limit = parseIntQuery(req.query.limit, 100);

    const signals = await getSignals(limit);

    res.json({
      ok: true,
      count: signals.length,
      limit,
      data: signals,
    });
  })
);

/* ===============================
   GET /api/pairs
   Returns pairs already detected & processed
================================ */
router.get(
  "/pairs",
  asyncRoute(async (req, res) => {
    const data = await getPairs();
    res.json({
      ok: true,
      count: data.length,
      data,
    });
  })
);

/* ===============================
   GET /api/sniper/status
   Returns bot/trader engine current state
================================ */
router.get(
  "/sniper/status",
  asyncRoute(async (req, res) => {
    const status = await getSniperStatus();

    res.json({
      ok: true,
      status,
    });
  })
);

/* ===============================
   GET /api/logs
   Returns last N lines of system logs
================================ */
router.get(
  "/logs",
  asyncRoute(async (req, res) => {
    const lines = parseIntQuery(req.query.lines, 200);

    const data = await getLogs(lines);

    res.setHeader("Content-Type", "text/plain");
    res.send(data.join("\n"));
  })
);

export default router;
