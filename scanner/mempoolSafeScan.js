import { getWeb3, rotateRPC } from "../core/rpcManager.js";

let lastScan = 0;
let scanning = false;

export async function safeMempoolScan(interval) {
  const now = Date.now();

  // Prevent spam + overlapping scans
  if (scanning || now - lastScan < interval) return;

  scanning = true;
  lastScan = now;

  try {
    const web3 = await getWeb3();

    // Pending block can be null or incomplete
    const pendingBlock = await web3.eth.getBlock("pending", true);
    if (!pendingBlock?.transactions?.length) return;

    for (const tx of pendingBlock.transactions) {
      if (!tx || !tx.hash) continue;

      try {
        // 🔒 process tx safely here
        // example:
        // await handlePendingTx(tx);
      } catch (txErr) {
        console.warn(
          `⚠️ Failed processing tx ${tx.hash}:`,
          txErr.message
        );
      }
    }
  } catch (err) {
    console.error("❌ Mempool scan failed:", err.message);

    // Rotate only on network / provider errors
    if (
      err.message.includes("timeout") ||
      err.message.includes("Invalid JSON RPC response") ||
      err.message.includes("connection") ||
      err.message.includes("ECONN")
    ) {
      await rotateRPC();
    }
  } finally {
    scanning = false;
  }
      }
