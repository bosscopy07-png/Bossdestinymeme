// FILE: core/rpcHealth.js

import { getState } from "./state.js";
import { logInfo, logError } from "../utils/logs.js";
import Web3 from "web3";

const RPC_LIST = process.env.RPC_URLS?.split(",").map(r => r.trim()).filter(Boolean) || [];

const HEALTH_INTERVAL = 15_000;
const MAX_FAILURES = 3;

let checking = false;
let failureCount = 0;

export function startRpcHealth() {
  const state = getState();

  if (!RPC_LIST.length) {
    throw new Error("RPC Health: No RPC_URLS provided");
  }

  // Initialize RPC state
  state.rpc.active = RPC_LIST[0];
  state.rpc.failed.clear();

  logInfo(`🌐 Active RPC initialized: ${state.rpc.active}`);

  setInterval(async () => {
    if (checking) return;
    checking = true;

    try {
      const web3 = new Web3(state.rpc.active);

      // Lightweight but real probe
      await web3.eth.getBlockNumber();

      // Healthy → reset failure counter
      failureCount = 0;
    } catch (err) {
      failureCount++;
      logError(
        `⚠️ RPC failure (${failureCount}/${MAX_FAILURES})`,
        err?.message || err
      );

      if (failureCount >= MAX_FAILURES) {
        // Mark RPC as failed
        state.rpc.failed.add(state.rpc.active);

        // Pick next healthy RPC
        const next = RPC_LIST.find(r => !state.rpc.failed.has(r));

        if (!next) {
          logError("🚨 ALL RPCs FAILED — resetting failure pool");
          state.rpc.failed.clear();
          state.rpc.active = RPC_LIST[0];
        } else {
          state.rpc.active = next;
        }

        logInfo(`🔁 Switched RPC to ${state.rpc.active}`);
        failureCount = 0;
      }
    } finally {
      checking = false;
    }
  }, HEALTH_INTERVAL);
}
