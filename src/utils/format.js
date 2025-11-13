function usd(n){
  const v = Number(n || 0);
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

module.exports = { usd };
