// trader/liveTrader.js
// PancakeSwap v2 – hardened production version (ethers v6)

import { ethers } from "ethers";
import { getWalletSigner } from "../utils/web3.js";
import { getBestRouter } from "./router.js";
import config from "../config/index.js";
import { logInfo, logWarn, logError } from "../utils/logs.js";

const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint,uint,address[],address,uint) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint,uint,address[],address,uint)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint)",
  "function allowance(address,address) view returns (uint)",
  "function approve(address,uint) returns (bool)",
  "function decimals() view returns (uint8)"
];

let approvalLock = new Set();

function requireLive() {
  if (!config.LIVE_MODE) {
    throw new Error("LIVE_MODE=true. Refusing live trade.");
  }
}

/* ---------------- SLIPPAGE SAFE ---------------- */
function applySlippage(amountBN, slippagePercent) {
  const slip = BigInt(Math.floor(slippagePercent * 100));
  return (amountBN * (10_000n - slip)) / 10_000n;
}

/* ---------------- QUOTE ---------------- */
async function quote(router, amountIn, path, slippage) {
  try {
    const amounts = await router.getAmountsOut(amountIn, path);
    return applySlippage(amounts.at(-1), slippage);
  } catch {
    logWarn("Quote failed → amountOutMin=0 (DANGEROUS)");
    return 0n;
  }
}

/* ---------------- EXEC ---------------- */
async function exec(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  logInfo(`✅ TX: ${receipt.transactionHash}`);
  return receipt;
}

/* ======================================================
   BUY
====================================================== */
export async function buy(tokenAddress, opts = {}) {
  requireLive();

  const wallet = getWalletSigner();
  const routerAddr = getBestRouter();
  if (!routerAddr) throw new Error("Router missing");

  const router = new ethers.Contract(routerAddr, ROUTER_ABI, wallet);
  const wbnb = await router.WETH();

  const bnb = Number(opts.bnbAmount);
  if (!bnb || bnb <= 0) throw new Error("bnbAmount required");

  if (bnb > (config.MAX_BNB_PER_TRADE ?? 0.5)) {
    throw new Error("Trade size exceeds MAX_BNB_PER_TRADE");
  }

  const amountIn = ethers.parseEther(String(bnb));
  const slippage = Number(opts.maxSlippagePercent ?? config.MAX_SLIPPAGE ?? 5);

  const path = [wbnb, tokenAddress];
  const amountOutMin = await quote(router, amountIn, path, slippage);

  logInfo(`🚀 BUY ${tokenAddress} | BNB=${bnb}`);

  return exec(
    router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountOutMin,
      path,
      wallet.address,
      Math.floor(Date.now() / 1000) + 300,
      { value: amountIn, gasLimit: opts.gasLimit ?? 450_000 }
    )
  );
}

/* ======================================================
   SELL
====================================================== */
export async function sell(tokenAddress, opts = {}) {
  requireLive();

  const wallet = getWalletSigner();
  const routerAddr = getBestRouter();
  if (!routerAddr) throw new Error("Router missing");

  const router = new ethers.Contract(routerAddr, ROUTER_ABI, wallet);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const wbnb = await router.WETH();

  let amount;
  if (opts.amountTokens) {
    const dec = await token.decimals();
    amount = ethers.parseUnits(String(opts.amountTokens), dec);
  } else {
    amount = await token.balanceOf(wallet.address);
  }

  if (amount <= 0n) throw new Error("No tokens to sell");

  /* -------- APPROVAL LOCK -------- */
  if (!approvalLock.has(tokenAddress)) {
    const allowance = await token.allowance(wallet.address, routerAddr);
    if (allowance < amount) {
      approvalLock.add(tokenAddress);
      logInfo("Approving token...");
      const tx = await token.approve(routerAddr, ethers.MaxUint256);
      await tx.wait();
      approvalLock.delete(tokenAddress);
    }
  }

  const slippage = Number(opts.maxSlippagePercent ?? config.MAX_SLIPPAGE ?? 5);
  const path = [tokenAddress, wbnb];
  const amountOutMin = await quote(router, amount, path, slippage);

  logInfo(`🔥 SELL ${tokenAddress}`);

  return exec(
    router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      amount,
      amountOutMin,
      path,
      wallet.address,
      Math.floor(Date.now() / 1000) + 300,
      { gasLimit: opts.gasLimit ?? 450_000 }
    )
  );
}

export default { buy, sell };
