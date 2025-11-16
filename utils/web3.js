/**
 * utils/web3.js
 *
 * Handles BSC Web3/Ethers connections, multi-provider fallback, and helpers.
 */

import { ethers } from "ethers";
import config from "../config/index.js";
import { logInfo, logError } from "./logs.js";

const PROVIDERS = [
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.binance.org/",
  "https://bsc-dataseed3.binance.org/",
];

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
  logInfo(`Switched provider to ${PROVIDERS[providerIndex]}`);
  return provider;
}

/**
 * Get a wallet signer from configured private key
 */
export function getWalletSigner() {
  if (!config.trader?.privateKey) throw new Error("Private key not set");
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
 * @param {function} fn - async function to execute
 * @param {number} retries - number of retries
 * @param {number} delayMs - delay between retries in ms
 */
export async function withRetries(fn, retries = 3, delayMs = 500) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      logError(`Attempt ${i + 1} failed: ${err.message}`);
      await new Promise((res) => setTimeout(res, delayMs));
      await switchProvider(); // optional: switch provider on failure
    }
  }
  throw lastError;
}
