// src/scanner.js
const Web3 = require('web3');
const dotenv = require('dotenv');
dotenv.config();

const FACTORY = process.env.PANCAKE_FACTORY;
const BSC_WS = process.env.BSC_WS;
const MIN_LIQ_BUSD = parseFloat(process.env.MIN_LIQ_BUSD || '20'); 
const MAX_DEV_SHARE = parseFloat(process.env.MAX_DEV_SHARE || '0.2'); // max 20% developer share
const ROUTER = process.env.PANCAKE_ROUTER || '0x10ED43C718714eb63d5aA57B78B54704E256024E'; 
const BUSD_ADDRESS = process.env.BUSD_ADDRESS;

let seenPairs = new Set();
let tgBot;

async function startScanner(bot, logger = console) {
  tgBot = bot;
  logger.info('🛰 Starting On-Chain Token Scanner (Honeypot + Dev Share)...');

  if (!BSC_WS) {
    logger.error('⚠️ BSC_WS not configured — cannot listen to new pairs.');
    return;
  }

  const web3 = new Web3(new Web3.providers.WebsocketProvider(BSC_WS));

  const factoryContract = new web3.eth.Contract(
    [
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
          { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
          { indexed: true, internalType: 'address', name: 'pair', type: 'address' },
        ],
        name: 'PairCreated',
        type: 'event',
      },
    ],
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
        const busd = new web3.eth.Contract(erc20Abi, token0Addr);
        const decimals = await busd.methods.decimals().call();
        busdReserve = reserves._reserve0 / 10 ** decimals;
      } else if (token1Addr.toLowerCase() === BUSD_ADDRESS.toLowerCase()) {
        const busd = new web3.eth.Contract(erc20Abi, token1Addr);
        const decimals = await busd.methods.decimals().call();
        busdReserve = reserves._reserve1 / 10 ** decimals;
      }

      return busdReserve;
    } catch (err) {
      return 0;
    }
  }

  async function checkHoneypot(tokenAddress, amountBUSD = 0.1) {
    try {
      const router = new web3.eth.Contract(
        [
          {
            constant: false,
            inputs: [
              { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
              { internalType: 'address[]', name: 'path', type: 'address[]' }
            ],
            name: 'getAmountsOut',
            outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
            payable: false,
            stateMutability: 'view',
            type: 'function',
          },
        ],
        ROUTER
      );

      const amountIn = web3.utils.toWei(amountBUSD.toString(), 'ether');
      const path = [BUSD_ADDRESS, tokenAddress];
      const amounts = await router.methods.getAmountsOut(amountIn, path).call();
      return amounts[1] > 0; // If output > 0, likely not honeypot
    } catch {
      return false; // Honeypot or failed
    }
  }

  async function getDevShare(tokenAddress, pairAddress) {
    try {
      const token = new web3.eth.Contract(erc20Abi, tokenAddress);
      const totalSupply = await token.methods.totalSupply().call();
      const pairBalance = await token.methods.balanceOf(pairAddress).call();
      const devShare = (pairBalance / totalSupply);
      return devShare;
    } catch {
      return 1; // assume unsafe
    }
  }

  factoryContract.events.PairCreated()
    .on('data', async (event) => {
      const { token0, token1, pair } = event.returnValues;
      if (seenPairs.has(pair)) return;
      seenPairs.add(pair);

      const liquidity = await getLiquidity(pair);
      if (liquidity < MIN_LIQ_BUSD) return logger.warn(`⚠️ ${token0}/${token1} skipped: Liquidity too low ($${liquidity.toFixed(2)})`);

      const honeypot0 = await checkHoneypot(token0);
      const honeypot1 = await checkHoneypot(token1);
      if (!honeypot0 || !honeypot1) return logger.warn(`🚫 ${token0}/${token1} skipped: Honeypot detected`);

      const devShare0 = await getDevShare(token0, pair);
      const devShare1 = await getDevShare(token1, pair);
      if (devShare0 > MAX_DEV_SHARE || devShare1 > MAX_DEV_SHARE) 
        return logger.warn(`🚫 ${token0}/${token1} skipped: Dev owns too much (${(devShare0*100).toFixed(1)}% / ${(devShare1*100).toFixed(1)}%)`);

      logger.info(`🚀 New safe pair: ${token0}/${token1} | Liquidity: $${liquidity.toFixed(2)}`);

      await tgBot.sendSignal({
        token0,
        token1,
        pair,
        liquidity: { totalBUSD: liquidity, price: 0 },
        honeypot: false,
        scoreLabel: 'New Launch',
        scoreValue: 100,
        raw: {},
      });
    })
    .on('error', (err) => logger.error('PairCreated listener error:', err));

  logger.info('✅ Scanner with Honeypot + Dev Share filter initialized.');
}

module.exports = { startScanner };
