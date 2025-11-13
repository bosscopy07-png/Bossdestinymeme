require('dotenv').config();
const { run } = require('./scanner/index');
run(console).catch(e=>{ console.error('fatal', e); process.exit(1); });
