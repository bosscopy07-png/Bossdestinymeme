import Web3 from "web3";

const RPCS = [
  { name: "primary", url: process.env.BSC_RPC },
  { name: "secondary", url: process.env.BSC_RPC_2 },
  { name: "tertiary", url: process.env.BSC_RPC_3 }
].filter(r => r.url);

if (RPCS.length === 0) {
  throw new Error("❌ No RPC endpoints configured");
}

let currentIndex = 0;
let web3Instance = null;
let lastHealthyCheck = 0;
let lastHealthyRPC = null;

const HEALTH_TTL = 60_000; // 1 minute cache
const RPC_TIMEOUT = 5_000;

/**
 * Create Web3 with timeout
 */
function createWeb3(url) {
  return new Web3(
    new Web3.providers.HttpProvider(url, {
      timeout: RPC_TIMEOUT
    })
  );
}

/**
 * Test RPC health
 */
async function testRPC(url) {
  try {
    const web3 = createWeb3(url);
    await web3.eth.getBlockNumber();
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get healthy Web3 instance (cached)
 */
export async function getWeb3() {
  const now = Date.now();

  // Return cached healthy instance
  if (
    web3Instance &&
    lastHealthyRPC &&
    now - lastHealthyCheck < HEALTH_TTL
  ) {
    return web3Instance;
  }

  for (let i = 0; i < RPCS.length; i++) {
    const idx = (currentIndex + i) % RPCS.length;
    const rpc = RPCS[idx];

    const ok = await testRPC(rpc.url);
    if (ok) {
      currentIndex = idx;
      web3Instance = createWeb3(rpc.url);
      lastHealthyRPC = rpc;
      lastHealthyCheck = now;

      console.log(`✅ Connected to RPC: ${rpc.name}`);
      return web3Instance;
    }

    console.warn(`⚠️ RPC failed: ${rpc.name}`);
  }

  throw new Error("❌ All RPC endpoints are down");
}

/**
 * Force rotate to next RPC
 */
export async function rotateRPC() {
  console.warn("🔄 Forcing RPC rotation...");
  web3Instance = null;
  lastHealthyRPC = null;
  lastHealthyCheck = 0;

  currentIndex = (currentIndex + 1) % RPCS.length;
  return getWeb3();
   }
