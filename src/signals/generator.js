function generatePayload(signal){
  return {
    id: Math.random().toString(36).slice(2,12),
    tokenName: signal.name || signal.token0 || signal.token0Addr,
    tokenSymbol: signal.symbol || signal.token0 || 'TKN',
    pair: signal.pair,
    liquidity: signal.liquidity || 0,
    price: signal.price || 0,
    momentum: signal.momentum || 0,
    honeypot: !!signal.honeypot,
    scoreLabel: signal.scoreLabel,
    scoreValue: signal.scoreValue,
    raw: signal
  };
}
module.exports = { generatePayload };
