const fs = require('fs');
const DB = { balance:1000, trades:[] };
async function paperBuy(payload, usdAmount){
  const size = Number(usdAmount || 1);
  if(size>DB.balance) return { ok:false, reason:'insufficient' };
  DB.balance -= size; DB.trades.push({ side:'buy', token:payload.tokenName, usd:size, ts:Date.now() });
  return { ok:true };
}
async function paperSell(id){ DB.balance += 1; DB.trades.push({ side:'sell', token:'TKN', usd:1, ts:Date.now() }); return { ok:true }; }
function load(){ return DB; }
module.exports = { paperBuy, paperSell, load };
