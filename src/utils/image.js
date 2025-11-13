// simple placeholder PnL image generator — uses node-canvas if installed
const { createCanvas } = require('canvas');
const fs = require('fs');
async function pnlImage(pnlData, outPath){
  const w = 800, h = 240; const c = createCanvas(w,h); const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.fillText('PnL Snapshot',20,30);
  ctx.fillText(`Balance: ${pnlData.balance || 0}`,20,70);
  const buf = c.toBuffer('image/png'); fs.writeFileSync(outPath, buf);
  return outPath;
}
module.exports = { pnlImage };
