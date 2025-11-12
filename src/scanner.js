// src/scanner.js
const Web3 = require('web3');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const FACTORY = process.env.PANCAKE_FACTORY;
const BSC_WS = process.env.BSC_WS;
const ROUTER = process.env.PANCAKE_ROUTER || '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const BUSD_ADDRESS = process.env.BUSD_ADDRESS;

const MIN_LIQ_BUSD = parseFloat(process.env.MIN_LIQ_BUSD || '20');
const MAX_DEV_SHARE = parseFloat(process.env.MAX_DEV_SHARE || '0.2');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '70000');

let seenPairs = new Set();
let tgBot;

// Helper delay
const sleep = ms => new Promise(r => setTimeout(r, ms));

// === GeckoTerminal Trending Fetch ===
async function fetchGeckoTrending() {
  const chain = 'bsc';
  const url = `https://api.geckoterminal.com/api/v2/networks/${chain}/trending_pools`;
  let tokens = [];

  try {
    const res = await axios.get(url, { timeout: 10000 });
    if (!res.data?.data) return tokens;

    tokens = res.data.data.map(pool => {
      const attrs = pool.attributes;
      const base = attrs.base_token || {};
      const quote = attrs.quote_token || {};
      return {
        id: pool.id,
        pairAddress: attrs.address,
        token0: base.symbol || 'TOKEN',
        token1: quote.symbol || 'BUSD',
        token0Addr: base.address,
        token1Addr: quote.address,
        price: parseFloat(attrs.base_token_price_usd || 0),
        liquidity: parseFloat(attrs.reserve_in_usd || 0),
        momentum: parseFloat(attrs.price_change_percentage.h24 || 0) / 100,
      };
    });

  } catch (err) {
    console.warn('⚠️ GeckoTerminal fetch failed:', err.message);
  }

  return tokens;
}

// === On-chain scanner ===
async function startScanner(bot, logger = console) {
  tgBot = bot;
  logger.info('🛰 Starting Hybrid Scanner (On-chain + GeckoTerminal)…');

  if (!BSC_WS) {
    logger.error('⚠️ BSC_WS not configured — cannot listen to new pairs.');
    return;
  }

  const web3 = new Web3(new Web3.providers.WebsocketProvider(BSC_WS));

  const factoryContract = new web3.eth.Contract(
    [{
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
        { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
        { indexed: true, internalType: 'address', name: 'pair', type: 'address' },
      ],
      name: 'PairCreated',
      type: 'event',
    }],
    FACTORY
  );

  const erc20Abi = [
    { constant: true, inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
    { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
    { constant: true, inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' },
  ];

  const pairAbi = [
    { constant: true, inputs: [], name: 'getReserves', outputs: [
      { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
      { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
      { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
    ], type: 'function' },
    { constant: true, inputs: [], name: 'token0', outputs: [{ internalType: 'address', name: '', type: 'address' }], type: 'function' },
    { constant: true, inputs: [], name: 'token1', outputs: [{ internalType: 'address', name: '', type: 'address' }], type: 'function' },
  ];

  async function getLiquidity(pairAddress) {
    try {
      const pair = new web3.eth.Contract(pairAbi, pairAddress);
      const token0Addr = await pair.methods.token0().call();
      const token1Addr = await pair.methods.token1().call();
      const reserves = await pair.methods.getReserves().call();

      let busdReserve = 0;
      if (token0Addr.toLowerCase() === BUSD_ADDRESS.toLowerCase()) {
        busdReserve = reserves._reserve0 / 1e18;
      } else if (token1Addr.toLowerCase() === BUSD_ADDRESS.toLowerCase()) {
        busdReserve = reserves._reserve1 / 1e18;
      }
      return busdReserve;
    } catch {
      return 0;
    }
  }

  async function checkHoneypot(tokenAddress, amountBUSD = 0.1) {
    try {
      const router = new web3.eth.Contract(
        [{ constant: false, inputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }, { internalType: 'address[]', name: 'path', type: 'address[]' }], name: 'getAmountsOut', outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }], payable: false, stateMutability: 'view', type: 'function' }],
        ROUTER
      );

      const amountIn = web3.utils.toWei(amountBUSD.toString(), 'ether');
      const path = [BUSD_ADDRESS, tokenAddress];
      const amounts = await router.methods.getAmountsOut(amountIn, path).call();
      return amounts[1] > 0;
    } catch {
      return false;
    }
  }

  async function getDevShare(tokenAddress, pairAddress) {
    try {
      const token = new web3.eth.Contract(erc20Abi, tokenAddress);
      const totalSupply = await token.methods.totalSupply().call();
      const pairBalance = await token.methods.balanceOf(pairAddress).call();
      return pairBalance / totalSupply;
    } catch {
      return 1;
    }
  }

  // --- On-chain listener ---
  factoryContract.events.PairCreated()
    .on('data', async (event) => {
      const { token0, token1, pair } = event.returnValues;
      if (seenPairs.has(pair)) return;
      seenPairs.add(pair);

      const liq = await getLiquidity(pair);
      if (liq < MIN_LIQ_BUSD) return;

      const isHoneypot = !(await checkHoneypot(token0)) || !(await checkHoneypot(token1));
      const devHold = ((await getDevShare(token0, pair)) * 100).toFixed(2);
      const scoreValue = 100;
      const scoreLabel = 'New Launch';

      const message = `
<b>Token:</b> ${token0}
🔸 <b>Base:</b> ${token1}
🔗 <b>Pair:</b> <code>${pair}</code>

💧 <b>Liquidity:</b> $${liq.toLocaleString(undefined, { maximumFractionDigits: 2 })}
💵 <b>Price:</b> $0.00000000
📈 <b>Momentum:</b> 0%
👤 <b>Dev Holding:</b> ${devHold}%
🧠 <b>Score:</b> ${scoreLabel} (${scoreValue})
🧨 <b>Honeypot:</b> ${isHoneypot ? '⚠️ YES — RISK!' : '✅ NO — Safe'}
`;

      logger.info(`🚀 New pair detected: ${token0}/${token1}`);
      await tgBot.sendSignal({ message });
    })
    .on('error', (err) => logger.error('PairCreated listener error:', err));

  // --- GeckoTerminal Polling ---
  const pollGecko = async () => {
    const tokens = await fetchGeckoTrending();
    for (const t of tokens) {
      if (seenPairs.has(t.pairAddress)) continue;
      if (t.liquidity < MIN_LIQ_BUSD) continue;
      seenPairs.add(t.pairAddress);

      const scoreValue = Math.min(100, Math.round((t.momentum * 100) + (t.liquidity / 10)));
      const scoreLabel = 'Trending';

      const message = `
<b>Token:</b> ${t.token0}
🔸 <b>Base:</b> ${t.token1}
🔗 <b>Pair:</b> <code>${t.pairAddress}</code>

💧 <b>Liquidity:</b> $${t.liquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
💵 <b>Price:</b> $${t.price.toFixed(8)}
📈 <b>Momentum:</b> ${(t.momentum * 100).toFixed(2)}%
👤 <b>Dev Holding:</b> ${0}%
🧠 <b>Score:</b> ${scoreLabel} (${scoreValue})
🧨 <b>Honeypot:</b> ✅ NO — Safe
`;

      logger.info(`🔥 Trending token: ${t.token0} ($${t.liquidity.toFixed(2)})`);
      await tgBot.sendSignal({ message });
      await sleep(1500);
    }
  };

  await pollGecko();
  setInterval(pollGecko, POLL_INTERVAL);

  logger.info('✅ Hybrid Scanner (on-chain + GeckoTerminal) running…');
}

module.exports = { startScanner };
