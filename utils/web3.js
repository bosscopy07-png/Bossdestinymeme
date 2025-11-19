/**
 * utils/web3.js
 *
 * Handles BSC Web3/Ethers connections, multi-provider fallback, wallet helpers, and UID generation.
 */

import { ethers } from "ethers";
import crypto from "crypto";
import config from "../config/index.js";
import { logInfo, logError } from "./logs.js";

// Load RPC providers from environment OR fallback defaults
const PROVIDERS = [
  process.env.BSC_RPC,
  process.env.BSC_RPC_2,
  process.env.BSC_RPC_3,
].filter(Boolean);

if (PROVIDERS.length === 0) {
  throw new Error("❌ No RPC providers found. Add BSC_RPC, BSC_RPC_2, BSC_RPC_3 to your .env file.");
}

let providerIndex = 0;
let provider = new ethers.JsonRpcProvider(PROVIDERS[providerIndex]);

/**
 * Get the current provider
 */
export function getProvider() {
  return provider;
}

/**
 * Switch to the next provider in the list (round-robin)
 */
export async function switchProvider() {
  providerIndex = (providerIndex + 1) % PROVIDERS.length;
  provider = new ethers.JsonRpcProvider(PROVIDERS[providerIndex]);
  logInfo(`🔁 Switched provider → ${PROVIDERS[providerIndex]}`);
  return provider;
}

/**
 * Get a wallet signer from configured private key
 */
export function getWalletSigner() {
  if (!config.trader?.privateKey) throw new Error("❌ Private key not set in config");
  return new ethers.Wallet(config.trader.privateKey, provider);
}

/**
 * Parse BNB amount to wei
 */
export function parseBNB(amount) {
  return ethers.parseUnits(amount.toString(), 18);
}

/**
 * Format wei to BNB
 */
export function formatBNB(wei) {
  return ethers.formatUnits(wei, 18);
}

/**
 * Retry helper for async calls
 * @param {Function} fn - async function
 * @param {number} retries - retry attempts
 * @param {number} delayMs - delay between retries
 */
export async function withRetries(fn, retries = 3, delayMs = 500) {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      logError(`⚠️ Attempt ${i + 1} failed: ${err.message}`);
      await new Promise((res) => setTimeout(res, delayMs));
      await switchProvider();
    }
  }

  throw lastError;
}

/**
 * Generate a unique ID (UID)
 * Used by scanners, caches, and tracking systems
 */
export function uid() {
  return crypto.randomUUID();
}
