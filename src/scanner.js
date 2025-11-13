// src/scanner.js
// Hybrid On-chain + GeckoTerminal Scanner + Telegram integration

const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const axios = require('axios');
const dotenv = require('dotenv');
const { Telegraf } = require('telegraf');
const { getTokenMeta } = require('./utils');
dotenv.config();

/* ----------- Config ----------- */
const FACTORY = process.env.PANCAKE_FACTORY || '';
const BSC_WS = process.env.BSC_WS || '';
const ROUTER = process.env.PANCAKE_ROUTER || '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const BUSD_ADDRESS = process.env.BUSD_ADDRESS || '';
const MIN_LIQ_BUSD = parseFloat(process.env.MIN_LIQ_BUSD || '20');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '70000', 10);
const TRENDING_BATCH = parseInt(process.env.TRENDING_BATCH || '3', 10);
const NEWPAIR_BATCH = parseInt(process.env.NEWPAIR_BATCH || '2', 10);
const SEND_COOLDOWN_MS = parseInt(process.env.SEND_COOLDOWN_MS || '1500', 10);
const SEEN_PERSIST_PATH = process.env.SEEN_PERSIST_PATH || path.join(__dirname, '..', 'seen_pairs.json');
const GECKO_TIMEOUT = parseInt(process.env.GECKO_TIMEOUT || '10000', 10);

/* ----------- State ----------- */
let seenPairs = new Set();
let tgBot = null;
let signalStore = new Map();

/* ----------- Persistence ----------- */
function loadSeen() {
  try {
    if (fs.existsSync(SEEN_PERSIST_PATH)) {
      const arr = JSON.parse(fs.readFileSync(SEEN_PERSIST_PATH, 'utf8'));
      if (Array.isArray(arr)) seenPairs = new Set(arr);
      console.info(`♻️ Loaded ${arr.length} seen pair(s)`);
    }
  } catch { console.warn('⚠️ Could not load seen pairs'); }
}

function saveSeen() {
  try { fs.writeFileSync(SEEN_PERSIST_PATH, JSON.stringify([...seenPairs])); }
  catch { console.warn('⚠️ Could not save seen pairs'); }
}

/* ----------- Utils ----------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeFloat = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const SAFE_DECIMALS = 1e18;

/* ----------- GeckoTerminal Fetch ----------- */
async function fetchGeckoTrending() {
  try {
    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/bsc/trending_pools', { timeout: GECKO_TIMEOUT });
    if (!res.data?.data) return [];
    return res.data.data.map(pool => {
      const attrs = pool.attributes || {};
      const base = attrs.base_token || {};
      const quote = attrs.quote_token || {};
      return {
        type: 'trending',
        pairAddress: attrs.address,
        token0: base.symbol || 'TOKEN',
        token1: quote.symbol || 'BUSD',
        token0Addr: base.address || null,
        token1Addr: quote.address || null,
        liquidity: safeFloat(attrs.reserve_in_usd, 0),
        price: safeFloat(attrs.base_token_price_usd, 0),
        momentum: safeFloat(attrs.price_change_percentage?.h24, 0)/100
      };
    });
  } catch (err) { console.warn('⚠️ fetchGeckoTrending failed:', err.message); return []; }
}

/* ----------- Web3 Setup ----------- */
function createWeb3() { if (!BSC_WS) throw new Error('BSC_WS not configured'); return new Web3(new Web3.providers.WebsocketProvider(BSC_WS, { clientConfig: { keepalive: true } })); }

const erc20Abi = [
  { constant: true, inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
];
const pairAbi = [
  { constant: true, inputs: [], name: 'getReserves', outputs: [{ internalType: 'uint112', name: '_reserve0', type: 'uint112' }, { internalType: 'uint112', name: '_reserve1', type: 'uint112' }, { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' }], type: 'function' },
  { constant: true, inputs: [], name: 'token0', outputs: [{ internalType: 'address', name: '', type: 'address' }], type: 'function' },
  { constant: true, inputs: [], name: 'token1', outputs: [{ internalType: 'address', name: '', type: 'address' }], type: 'function' },
];

async function getLiquidityBUSD(web3, pairAddress) {
  try {
    if (!BUSD_ADDRESS) return 0;
    const pair = new web3.eth.Contract(pairAbi, pairAddress);
    const token0Addr = (await pair.methods.token0().call()).toLowerCase();
    const token1Addr = (await pair.methods.token1().call()).toLowerCase();
    const reserves = await pair.methods.getReserves().call();
    let busdReserve = 0;
    if (token0Addr === BUSD_ADDRESS.toLowerCase()) busdReserve = safeFloat(reserves._reserve0)/SAFE_DECIMALS;
    else if (token1Addr === BUSD_ADDRESS.toLowerCase()) busdReserve = safeFloat(reserves._reserve1)/SAFE_DECIMALS;
    return busdReserve;
  } catch { return 0; }
}

async function checkHoneypot(web3, tokenAddress) {
  try {
    if (!BUSD_ADDRESS) return false;
    const router = new web3.eth.Contract([{ constant: false, inputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }, { internalType: 'address[]', name: 'path', type: 'address[]' }], name: 'getAmountsOut', outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }], payable: false, stateMutability: 'view', type: 'function' }], ROUTER);
    const amounts = await router.methods.getAmountsOut(Web3.utils.toWei('0.1','ether'), [BUSD_ADDRESS, tokenAddress]).call();
    return safeFloat(amounts[1],0) > 0;
  } catch { return false; }
}

async function getDevShare(web3, tokenAddress, pairAddress) {
  try {
    if (!tokenAddress || !pairAddress) return 1;
    const token = new web3.eth.Contract(erc20Abi, tokenAddress);
    const totalSupply = safeFloat(await token.methods.totalSupply().call(),0);
    if (!totalSupply) return 1;
    const pairBalance = safeFloat(await token.methods.balanceOf(pairAddress).call(),0);
    return pairBalance / totalSupply;
  } catch { return 1; }
}

function computeScore({ momentum=0, liquidity=0, devHold=0 }) {
  const raw = Math.round((momentum*100) + (liquidity/10) - (devHold*10));
  return Math.max(0, Math.min(100, raw));
}

/* ----------- Telegram Setup ----------- */
async function initTelegram() {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) throw new Error('❌ TELEGRAM_BOT_TOKEN not set');
  tgBot = new Telegraf(BOT_TOKEN);
  tgBot.start(ctx => ctx.reply('🤖 Memecoin Scanner PRO connected ✅'));
  await tgBot.launch();
  console.log('✅ Telegram bot launched');
}

/* ----------- Signal Sender ----------- */
async function sendSignal({ token0, token1, pair, liquidity, honeypot, scoreLabel, scoreValue, raw }) {
  if (!tgBot || !process.env.TELEGRAM_CHAT_ID) return;

  const meta = await getTokenMeta(token0, process.env.RPC_HTTP);
  const tokenName = meta?.name || token0;
  const tokenSymbol = meta?.symbol || token0;
  const devHold = meta?.ownerBalance && meta?.totalSupply
    ? ((Number(meta.ownerBalance)/Number(meta.totalSupply))*100).toFixed(2)
    : 'N/A';
  const liq = liquidity?.totalBUSD || raw?.liquidity || 0;
  const price = liquidity?.price || raw?.price || 0;
  const momentum = raw?.momentum ? (raw.momentum*100).toFixed(2) : 0;

  const alertEmoji = honeypot ? '🔴' : '🟢';
  const alertTitle = honeypot ? '⚠️ Possible Honeypot' : raw.type==='trending' ? '🚀 Trending Token' : '🌱 New Token';

  const msg = `<b>${alertEmoji} ${alertTitle}</b>
💠 <b>Token:</b> ${tokenName} (${tokenSymbol})
🔸 <b>Base:</b> ${token1 || 'Unknown'}
🔗 <b>Pair:</b> <code>${pair}</code>
💧 <b>Liquidity:</b> $${liq.toLocaleString(undefined,{maximumFractionDigits:2})}
💵 <b>Price:</b> $${price.toFixed(8)}
📈 <b>Momentum:</b> ${momentum}%
👤 <b>Dev Holding:</b> ${devHold}%
🧠 <b>Score:</b> ${scoreLabel} (${scoreValue})
🧨 <b>Honeypot:</b> ${honeypot ? '⚠️ YES' : '✅ NO'}
#memecoin #scanner`;

  const id = Math.random().toString(36).substring(2,12);
  signalStore.set(id, raw);

  await tgBot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, { parse_mode:'HTML' });
  await sleep(SEND_COOLDOWN_MS);
}

/* ----------- Hybrid Scanner ----------- */
async function startScanner() {
  loadSeen();
  await initTelegram();

  let web3 = null;
  if (BSC_WS && FACTORY) {
    try { web3 = createWeb3(); } catch { console.warn('⚠️ Web3 init failed'); }
  }

  // --- Send last N existing pairs on startup ---
  if (web3 && FACTORY) {
    try {
      const factory = new web3.eth.Contract([ { constant:true, inputs:[], name:'allPairsLength', outputs:[{type:'uint256', name:''}], type:'function' },
                                            { constant:true, inputs:[{type:'uint256', name:''}], name:'allPairs', outputs:[{type:'address', name:''}], type:'function' }], FACTORY);

      const length = parseInt(await factory.methods.allPairsLength().call(),10);
      const start = Math.max(0,length-NEWPAIR_BATCH);

      for(let i=start;i<length;i++){
        const pairAddr = await factory.methods.allPairs(i).call();
        if(seenPairs.has(pairAddr)) continue;

        const pairContract = new web3.eth.Contract(pairAbi, pairAddr);
        const token0 = await pairContract.methods.token0().call();
        const token1 = await pairContract.methods.token1().call();
        const liq = await getLiquidityBUSD(web3,pairAddr);
        if(liq<MIN_LIQ_BUSD) continue;

        const honeypot = !(await checkHoneypot(web3,token0));
        const devHold = Number((await getDevShare(web3,token0,pairAddr)*100).toFixed(2));
        const score = computeScore({ liquidity:liq, devHold, momentum:0 });

        await sendSignal({ token0, token1, pair:pairAddr, liquidity:{totalBUSD:liq, price:0}, honeypot, scoreLabel:'New Launch', scoreValue:score, type:'new' });
        seenPairs.add(pairAddr);
      }
      saveSeen();
    } catch(err){ console.error('⚠️ Initial new pair fetch failed:',err.message); }
  }

  // --- Start polling loop ---
  while(true){
    try{
      // Trending
      const trending = await fetchGeckoTrending();
      for(const t of trending.slice(0,TRENDING_BATCH)){
        if(!t.pairAddress || seenPairs.has(t.pairAddress) || t.liquidity<MIN_LIQ_BUSD) continue;
        let devHold=0, honeypot=false;
        if(web3){ devHold=Number((await getDevShare(web3,t.token0Addr,t.pairAddress)*100).toFixed(2)); honeypot=!(await checkHoneypot(web3,t.token0Addr)); }
        const score = computeScore({ momentum:t.momentum, liquidity:t.liquidity, devHold });
        await sendSignal({ ...t, honeypot, scoreLabel:'Trending', scoreValue:score });
        seenPairs.add(t.pairAddress);
      }

      // Listen for future pairs
      if(web3 && FACTORY){
        const factory = new web3.eth.Contract([{
          anonymous:false,
          inputs:[
            { indexed:true, internalType:'address', name:'token0', type:'address' },
            { indexed:true, internalType:'address', name:'token1', type:'address' },
            { indexed:true, internalType:'address', name:'pair', type:'address' }
          ],
          name:'PairCreated',
          type:'event'
        }], FACTORY);

        factory.events.PairCreated({ fromBlock:'latest' })
          .on('data', async e=>{
            const { token0, token1, pair } = e.returnValues;
            if(!pair || seenPairs.has(pair)) return;
            const liq = await getLiquidityBUSD(web3,pair);
            if(liq<MIN_LIQ_BUSD) return;
            const honeypot = !(await checkHoneypot(web3,token0));
            const devHold = Number((await getDevShare(web3,token0,pair)*100).toFixed(2));
            const score = computeScore({ liquidity:liq, devHold, momentum:0 });
            await sendSignal({ token0, token1, pair, liquidity:{totalBUSD:liq, price:0}, honeypot, scoreLabel:'New Launch', scoreValue:score, type:'new' });
            seenPairs.add(pair);
            saveSeen();
          })
          .on('error', err=>console.error('PairCreated listener error:', err.message));
      }

      await sleep(POLL_INTERVAL);
    }catch(err){ console.error('🔴 Scanner loop error:',err.message); await sleep(5000);}
  }
}

/* ----------- Exports ----------- */
module.exports = { startScanner, fetchGeckoTrending };
