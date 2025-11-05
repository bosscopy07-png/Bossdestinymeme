Auto-trader scaffold — disabled for safety.
// If you enable, implement secure key storage and safety checks.

module.exports = {
  buy: async () => { throw new Error('Auto-trader not enabled'); },
  sell: async () => { throw new Error('Auto-trader not enabled'); }
};
