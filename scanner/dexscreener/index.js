import { searchDexscreener } from "./client.js";
import { processSignalCandidate } from "../../signals/generator.js";
import { logInfo, logError } from "../../utils/logs.js";

let scanning = false;

// You can tune these
const SEARCH_QUERIES = ["bsc", "bnb", "usd"];
const SCAN_INTERVAL = 15_000;

export function startDexScanner() {
  logInfo("🛰️ Dexscreener scanner started");

  setInterval(async () => {
    if (scanning) return;
    scanning = true;

    try {
      for (const query of SEARCH_QUERIES) {
        const tokens = await searchDexscreener(query);

        for (const token of tokens) {
          processSignalCandidate(token);
        }
      }
    } catch (err) {
      logError("Dexscreener scan failed", err);
    } finally {
      scanning = false;
    }
  }, SCAN_INTERVAL);
}
