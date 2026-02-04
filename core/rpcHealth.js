import { getWeb3, rotateRPC } from "./rpcManager.js";

let checking = false;
let failureCount = 0;

const MAX_FAILURES = 3;     // rotate only after 3 consecutive failures
const HEALTH_INTERVAL = 15_000;

export function startRPCHealthCheck() {
  setInterval(async () => {
    if (checking) return;
    checking = true;

    try {
      const web3 = await getWeb3();

      // Lightweight health probe
      await web3.eth.getBlockNumber();

      // Reset failures on success
      failureCount = 0;
    } catch (err) {
      failureCount++;
      console.warn(
        `⚠️ RPC health check failed (${failureCount}/${MAX_FAILURES}):`,
        err.message
      );

      if (failureCount >= MAX_FAILURES) {
        console.warn("🔄 RPC marked unhealthy, rotating...");
        failureCount = 0;
        await rotateRPC();
      }
    } finally {
      checking = false;
    }
  }, HEALTH_INTERVAL);
}
