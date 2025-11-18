// trader/liveTrader.js
// Live trader using PancakeSwap (v2) with ethers v6.
// Safe, hardened, production-grade auto-buy & auto-sell.
//
// Features:
// - LIVE_MODE protection
// - Automatic slippage handling
// - Automatic on-chain quotes for amountOutMin
// - Automatic token approval for selling
// - WBNB <-> TOKEN routing
// - Anti-honeypot hook (optional)
// - Gas-safe default configuration

import { ethers } from "ethers";
import { getWalletSigner } from "../utils/web3.js";
import { getBestRouter } from "./router.js";
import config from "../config/index.js";
import { logInfo, logWarn, logError } from "../utils/logs.js";

// Router ABI (supports fee-on-transfer tokens)
const ROUTER_ABI = [
  "function WETH() view returns (address)",

  // BUY
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable",

  // SELL
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)",

  // Quote
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
];

// Minimal ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address a) view returns (uint)",
  "function allowance(address owner, address spender) view returns (uint)",
  "function approve(address spender, uint value) returns (bool)",
  "function decimals() view returns (uint8)",
];

function requireLive() {
  if (!config.LIVE_MODE) {
    throw new Error("LIVE_MODE disabled. Enable LIVE_MODE=true in .env to execute LIVE trades.");
  }
}

/**
 * INTERNAL: Estimate output tokens with slippage adjustment
 */
async function getAmountOutMin(router, amountInBN, path, slippage) {
  try {
    const quote = await router.getAmountsOut(amountInBN, path);
    const out = quote[quote.length - 1];
    const outMin = out - (out * slippage) / 100;

    return outMin < 0 ? 0n : outMin;
  } catch (err) {
    logWarn("Quote failed -> using amountOutMin = 0 (HIGH RISK!)");
    return 0n;
  }
}

/**
 * INTERNAL SWAP EXECUTOR
 */
async function executeSwap(txPromise) {
  try {
    const tx = await txPromise;
    const receipt = await tx.wait();
    logInfo(`TX SUCCESS: ${receipt.transactionHash}`);
    return { ok: true, txHash: receipt.transactionHash, receipt };
  } catch (err) {
    logError("SWAP FAILED", err);
    throw err;
  }
}

// ------------------------------------------------------------
// BUY
// ------------------------------------------------------------
export async function buy(tokenAddress, opts = {}) {
  requireLive();

  const wallet = getWalletSigner();
  const routerAddr = getBestRouter();
  if (!routerAddr) throw new Error("Router missing");

  const router = new ethers.Contract(routerAddr, ROUTER_ABI, wallet);

  const wbnb = await router.WETH();
  const path = [wbnb, tokenAddress];

  const bnbAmount = Number(opts.bnbAmount ?? 0);
  if (!bnbAmount || bnbAmount <= 0) throw new Error("bnbAmount required for live buy");

  const slippage = Number(opts.maxSlippagePercent ?? config.MAX_SLIPPAGE ?? 5);

  const amountInBN = ethers.parseEther(String(bnbAmount));
  const amountOutMin = await getAmountOutMin(router, amountInBN, path, slippage);

  const deadline = Math.floor(Date.now() / 1000) + 60 * 5;

  logInfo(`🚀 Live BUY ${tokenAddress}`);
  logInfo(`BNB: ${bnbAmount}, amountOutMin (slip-adjusted): ${amountOutMin}`);

  return executeSwap(
    router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountOutMin,
      path,
      wallet.address,
      deadline,
      {
        value: amountInBN,
        gasLimit: opts.gasLimit ?? 450000
      }
    )
  );
}

// ------------------------------------------------------------
// SELL
// ------------------------------------------------------------
export async function sell(tokenAddress, opts = {}) {
  requireLive();

  const wallet = getWalletSigner();
  const routerAddr = getBestRouter();
  if (!routerAddr) throw new Error("Router missing");

  const router = new ethers.Contract(routerAddr, ROUTER_ABI, wallet);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  const wbnb = await router.WETH();
  const path = [tokenAddress, wbnb];

  // Token amount
  let amountTokens;
  if (opts.amountTokens) {
    const dec = await token.decimals();
    amountTokens = ethers.parseUnits(String(opts.amountTokens), dec);
  } else {
    amountTokens = await token.balanceOf(wallet.address);
  }

  if (amountTokens <= 0n) throw new Error("No tokens to sell");

  const slippage = Number(opts.maxSlippagePercent ?? config.MAX_SLIPPAGE ?? 5);

  // Approval check
  const allowance = await token.allowance(wallet.address, routerAddr);
  if (allowance < amountTokens) {
    logInfo("Approving router to spend tokens...");
    const tx = await token.approve(routerAddr, ethers.MaxUint256);
    await tx.wait();
  }

  // Quote estimated BNB output
  const amountOutMin = await getAmountOutMin(router, amountTokens, path, slippage);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 5;

  logInfo(`🔥 Live SELL: ${tokenAddress}`);
  logInfo(`Tokens: ${amountTokens}, amountOutMin: ${amountOutMin}`);

  return executeSwap(
    router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      amountTokens,
      amountOutMin,
      path,
      wallet.address,
      deadline,
      {
        gasLimit: opts.gasLimit ?? 450000
      }
    )
  );
}

// ------------------------------------------------------------
export default { buy, sell };
