/**
 * utils/format.js
 * Helper functions for formatting numbers, percentages, and strings for Telegram.
 */

/**
 * Format number as currency with optional symbol (default BNB)
 * @param {number|string} amount
 * @param {string} symbol
 */
export function formatCurrency(amount, symbol = "BNB") {
  const num = Number(amount) || 0;
  return `${num.toFixed(4)} ${symbol}`;
}

/**
 * Format number as percentage with 2 decimals
 * @param {number|string} value
 */
export function formatPercent(value) {
  const num = Number(value) || 0;
  return `${num.toFixed(2)}%`;
}

/**
 * Escape text for Telegram MarkdownV2
 * @param {string} text
 */
export function escapeMarkdownV2(text = "") {
  return String(text)
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

// Alias `escape` for backward compatibility
export const escape = escapeMarkdownV2;

/**
 * Simple number formatting helper with commas
 * @param {number|string} value
 */
export function formatNumber(value) {
  const num = Number(value) || 0;
  return num.toLocaleString("en-US");
}

/**
 * Format USD amount neatly
 * @param {number|string} amount
 */
export function formatUsd(amount) {
  const num = Number(amount) || 0;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}
