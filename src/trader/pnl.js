const path = require('path');
const fs = require('fs');
const { pnlImage } = require('../utils/image');
const DB_PATH = path.join(__dirname, '..', 'pnl_state.json');
function loadState(){ try{ return JSON.parse(fs.readFileSync(DB_PATH,'utf8')); }catch(e){ return { balance:0, history:[] }; } }
function saveState(s){ fs.writeFileSync(DB_PATH, JSON.stringify(s)); }
async function snapshot(){ const s = loadState(); const out = path.join(__dirname,'..','tmp','pnl.png'); await pnlImage(s,out); return out; }
module.exports = { loadState, saveState, snapshot };
