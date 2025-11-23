import pino from 'pino';

const logger = pino({
  name: 'TokenAnalyzer',
  level: process.env.LOG_LEVEL || 'info',
});

export async function analyzeToken(pair) {
  try {
    if (!pair || !pair.baseToken) {
      logger.warn('Invalid pair object', { pair });
      return false;
    }

    const liq = pair.liquidity?.usd || 0;
    const vol = pair.volume?.h24 || 0;
    const createdAt = pair.pairCreatedAt || Date.now();
    const ageMins = (Date.now() - createdAt) / 60000;

    if (liq < 25000) return false;
    if (vol < 10000) return false;
    if (ageMins > 120) return false;

    return {
      token: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      address: pair.baseToken.address,
      price: pair.priceUsd || 0,
      liquidity: liq,
      volume: vol,
      age: `${Math.floor(ageMins)}m`,
      url: pair.url || ''
    };
  } catch (e) {
    logger.error({ e }, 'Error analyzing token pair');
    return false;
  }
}
