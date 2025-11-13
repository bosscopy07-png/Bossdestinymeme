// scoring, honeypot wrappers
const { fetchDexscreener } = require('../utils/dexscreener');

function score({ liquidity=0, momentum=0, devHold=0 }){
  let s = 0;
  if(liquidity>50000) s+=40; else if(liquidity>5000) s+=20; else if(liquidity>500) s+=10;
  if(momentum>0.05) s+=15;
  if(devHold>60) s-=50;
  if(s<0) s=0; if(s>100) s=100;
  const label = s>70? '🔥 HIGH': s>40? '⚠️ MEDIUM':'💤 LOW';
  return { label, score: s };
}

async function enrich(signal){
  // call dexscreener for full info if address is available
  if(signal.token0Addr){
    const info = await fetchDexscreener(signal.token0Addr);
    if(info) signal.dex = info;
  }
  // compute simple risk flags (honeypot/devHold) were already set upstream
  const { label, score } = score(signal);
  signal.scoreLabel = label; signal.scoreValue = score;
  return signal;
}

module.exports = { score, enrich };
