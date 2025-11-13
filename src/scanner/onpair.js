const { createWeb3 } = require('../utils/web3');
const { FACTORY, MIN_LIQ_BUSD, ROUTER, BUSD_ADDRESS } = require('../config');

const pairAbi = [
  { constant:true, name:'getReserves', type:'function', outputs:[] },
  { constant:true, name:'token0', type:'function', outputs:[] },
  { constant:true, name:'token1', type:'function', outputs:[] }
];

async function listenForPairs(onDetected, logger){
  if(!FACTORY) return logger.warn('FACTORY not set — onpair disabled');
  const web3 = createWeb3();
  const factory = new web3.eth.Contract([{ anonymous:false, inputs:[{indexed:true,name:'token0'},{indexed:true,name:'token1'},{indexed:true,name:'pair'}], name:'PairCreated', type:'event' }], FACTORY);
  factory.events.PairCreated()
    .on('data', async e => {
      try{
        const { token0, token1, pair } = e.returnValues;
        if(!pair) return;
        // quick liquidity check
        const pairC = new web3.eth.Contract(pairAbi, pair);
        const reserves = await pairC.methods.getReserves().call();
        let liq = 0; // best-effort - we don't convert to USD here
        // call handler
        await onDetected({ token0, token1, pair, liquidity: liq });
      }catch(err){ logger.warn('onpair handler error', err.message); }
    })
    .on('error', err => logger.error('PairCreated error', err.message));
}

module.exports = { listenForPairs };
