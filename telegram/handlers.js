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
    this.bot.on('text', (msg) => this.text(msg));
    log.info('Telegram Handlers: READY');
  }

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

  async callback(query = {}) {
    const chatId = query?.message?.chat?.id;
    const data = query?.data;
    if (!chatId || !data) return;

    try {
      if (data.startsWith('BUY_')) {
        const pair = data.replace('BUY_', '');
        await this.handleBuy(chatId, pair);
      } else if (data.startsWith('WATCH_')) {
        const pair = data.replace('WATCH_', '');
        await this.handleWatch(chatId, pair);
      } else if (data.startsWith('DETAILS_')) {
        const pair = data.replace('DETAILS_', '');
        await this.handleDetails(chatId, pair);
      } else if (data === 'OPEN_SNIPER') {
        await this.openSniper(chatId);
      } else if (data.startsWith('SNIPER_PRESET_')) {
        const preset = data.replace('SNIPER_PRESET_', '');
        await this.sniperPreset(chatId, preset);
      } else {
        log.warn(`Unknown callback data: ${data}`);
      }
    } catch (e) {
      log.error('Callback Handler Error', e);
    } finally {
      try {
        this.bot.answerCallbackQuery(query.id);
      } catch {}
    }
  }

  async text(msg = {}) {
    const chatId = msg?.chat?.id;
    const text = msg?.text;
    if (!chatId || !text) return;

    // Ignore commands
    if (text.startsWith('/')) return;

    // Watchlist entry
    if (text.startsWith('$')) {
      const symbol = text.replace('$', '').trim();
      return this.handleWatch(chatId, symbol);
    }

    // Fallback response
    await sender.send(chatId, {
      text: `❓ *I don't understand this message.*\nSend *$TOKEN* to watch a coin.`,
    });
  }

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

      log.info(`Sniper Buy Attempt: ${pair} => ${result?.success ? 'SUCCESS' : 'FAILED'}`, { chatId });
    } catch (e) {
      log.error('Buy Handler Error', e);
    }
  }

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

  async handleDetails(chatId, pair) {
    try {
      await sender.send(chatId, { text: `🧾 *Fetching details for ${pair}...*` });
      // TODO: Replace placeholder with real DexScanner details
      await sender.send(chatId, { text: `📊 *Token Details Coming Soon*\n(pair: ${pair})` });
    } catch (e) {
      log.error('Details Handler Error', e);
    }
  }

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

  async sniperPreset(chatId, presetId) {
    try {
      const preset = presets[presetId];
      if (!preset) {
        return sender.send(chatId, { text: `❌ Invalid preset selected.` });
      }

      await sender.send(chatId, {
        text: `🎯 *Preset Loaded*: ${presetId}\nSlippage: ${preset.slippage}\nGas: ${preset.gas}`,
      });
    } catch (e) {
      log.error('Sniper Preset Handler Error', e);
    }
  }
}

export default TelegramHandlers;
