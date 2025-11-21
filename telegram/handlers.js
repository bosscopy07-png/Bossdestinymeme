// telegram/handlers.js
import ui from './ui.js';
import sender from './sender.js';
import config from '../config/index.js';
import { log } from '../utils/logs.js';
import presets from '../trader/presets.js';
import router from '../trader/router.js';

class TelegramHandlers {
  constructor(bot) {
    this.bot = bot;
  }

  init() {
    this.bot.onText(/\/start/, (msg) => this.start(msg));
    this.bot.on('callback_query', (query) => this.callback(query));
    this.bot.on('text', (msg) => this.textHandler(msg));
    log.info('Telegram Handlers: READY');
  }

  // ========== COMMAND: /start ==========
  async start(msg = {}) {
    const chatId = msg?.chat?.id;
    if (!chatId) return;

    try {
      await sender.send(chatId, {
        text: ui.startMessage(),
        options: ui.startKeyboard(),
      });
      log.info(`User Started Bot: ${chatId}`);
    } catch (e) {
      log.error(`Start Handler Error: ${e?.message}`, e);
    }
  }

  // ========== CALLBACK HANDLER ==========
  async callback(query = {}) {
    const chatId = query?.message?.chat?.id;
    const data = query?.data;

    if (!chatId || !data) return;

    try {
      if (data.startsWith('BUY_')) {
        await this.handleBuy(chatId, data.slice(4));

      } else if (data.startsWith('WATCH_')) {
        await this.handleWatch(chatId, data.slice(6));

      } else if (data.startsWith('DETAILS_')) {
        await this.handleDetails(chatId, data.slice(8));

      } else if (data === 'OPEN_SNIPER') {
        await this.openSniper(chatId);

      } else if (data.startsWith('SNIPER_PRESET_')) {
        await this.sniperPreset(chatId, data.replace('SNIPER_PRESET_', ''));

      } else {
        log.warn(`Unknown callback data: ${data}`);
      }

    } catch (e) {
      log.error('Callback Handler Error', e);
    } finally {
      try { this.bot.answerCallbackQuery(query.id); } catch {}
    }
  }

  // ========== TEXT MESSAGE HANDLER ==========
  async textHandler(msg = {}) {
    const chatId = msg?.chat?.id;
    const text = msg?.text?.trim();

    if (!chatId || !text) return;

    // Ignore commands
    if (text.startsWith('/')) return;

    // Watchlist shortcut: $TOKEN
    if (text.startsWith('$')) {
      const symbol = text.slice(1).trim();
      return this.handleWatch(chatId, symbol);
    }

    // Unknown fallback
    await sender.send(chatId, {
      text: `❓ *I don't understand this message.*\nSend *$TOKEN* to watch a coin.`,
    });
  }

  // ========== BUY HANDLER ==========
  async handleBuy(chatId, pair) {
    try {
      await sender.send(chatId, {
        text: `🔫 *Sniping:* ${pair}\n\n_Executing sniper order..._`,
      });

      const result = await router.executeSniper(pair);

      await sender.send(chatId, {
        text: result?.success
          ? `✅ *Buy executed for ${pair}*`
          : `❌ Failed to buy ${pair}\n${result?.error || 'Unknown error'}`,
      });

      log.info(
        `Sniper Buy: ${pair} => ${result?.success ? 'SUCCESS' : 'FAILED'}`,
        { chatId }
      );
    } catch (e) {
      log.error('Buy Handler Error', e);
    }
  }

  // ========== WATCHLIST HANDLER ==========
  async handleWatch(chatId, symbol) {
    try {
      await sender.send(chatId, {
        text: `👀 *Watching*: ${symbol}\nYou'll receive alerts for major movements.`,
      });
      log.info(`Watching Token: ${symbol} for chat ${chatId}`);
    } catch (e) {
      log.error('Watch Handler Error', e);
    }
  }

  // ========== DETAILS HANDLER ==========
  async handleDetails(chatId, pair) {
    try {
      await sender.send(chatId, { text: `🧾 *Fetching details for ${pair}...*` });

      // TODO: Replace with real DexScanner API here
      await sender.send(chatId, { text: `📊 *Token Details Coming Soon*\n(pair: ${pair})` });

    } catch (e) {
      log.error('Details Handler Error', e);
    }
  }

  // ========== OPEN SNIPER MENU ==========
  async openSniper(chatId) {
    try {
      await sender.send(chatId, {
        text: ui.sniperMenu(),
        options: ui.sniperKeyboard(),
      });
    } catch (e) {
      log.error('Open Sniper Error', e);
    }
  }

  // ========== LOAD SNIPER PRESET ==========
  async sniperPreset(chatId, presetId) {
    try {
      const preset = presets[presetId];

      if (!preset) {
        return sender.send(chatId, { text: `❌ Invalid preset selected.` });
      }

      await sender.send(chatId, {
        text: `🎯 *Preset Loaded*: ${presetId}\nSlippage: ${preset.slippage}\nGas: ${preset.gas}`,
      });

      log.info(`Preset Loaded: ${presetId} for chat ${chatId}`);
    } catch (e) {
      log.error('Sniper Preset Handler Error', e);
    }
  }
}

export default TelegramHandlers;
