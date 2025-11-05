const fs = require('fs');
const path = require('path');
const DB = path.join(__dirname, '..', 'data', 'trades.json');
fs.mkdirSync(path.dirname(DB), { recursive: true });
if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({ balance: parseFloat(process.env.PAPER_START_BALANCE || '1000'), trades: [] }, null, 2));

function load(){ return JSON.parse(fs.readFileSync(DB)); }
function save(obj){ fs.writeFileSync(DB, JSON.stringify(obj, null, 2)); }

async function paperBuy(pairObj, usdAmount){
  const db = load();
  if (usdAmount > db.balance) return { ok: false, reason: 'insufficient balance' };
  const price = pairObj.price || 0.0001;
  const qty = usdAmount / (price || 1);
  const trade = { id: Date.now(), pair: pairObj.pair, token: pairObj.token, price, qty, usd: usdAmount, side: 'buy', ts: Date.now() };
  db.trades.push(trade);
  db.balance -= usdAmount;
  save(db);
  return { ok: true, trade };
}

async function paperSell(tradeId){
  const db = load();
  const t = db.trades.find(x=>x.id===tradeId && x.side==='buy');
  if (!t) return { ok: false, reason: 'trade not found' };
  const currentPrice = t.price * (1 + (Math.random()*0.4 - 0.2));
  const usd = t.qty * currentPrice;
  const sell = { id: Date.now(), pair: t.pair, token: t.token, price: currentPrice, qty: t.qty, usd, side: 'sell', ts: Date.now(), via: 'paper' };
  db.trades.push(sell);
  db.balance += usd;
  save(db);
  return { ok: true, sell };
}

module.exports = { paperBuy, paperSell, load };
