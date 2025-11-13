const Web3 = require('web3');
const { BSC_WS } = require('../config');

function createWeb3() {
  if (!BSC_WS) throw new Error('BSC_WS not set');
  return new Web3(new Web3.providers.WebsocketProvider(BSC_WS, { clientConfig: { keepalive: true } }));
}

module.exports = { createWeb3 };
