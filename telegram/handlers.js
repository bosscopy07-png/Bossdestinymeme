// FILE: telegram/handlers.js
import ui from './ui.js';
import sender from './sender.js';
import config from '../config/index.js';
import log, { logInfo, logError, logWarn } from '../utils/logs.js';
import presets from '../trader/presets.js';
import router from '../trader/router.js';
import { Markup } from 'telegraf';

class TelegramHandlers {
  constructor(bot) {
    this.bot = bot;
  }

  init() {
    this.bot.onText(/\/start/, (msg) => this.start(msg));
    this.bot.on('callback_query', (query) => this.callback(query));
    this.bot.on('text', (msg) => this.textHandler(msg));

    // Load admin commands inside the same file
    this.handleAdminCommand(this.bot);

    logInfo('Telegram Handlers: READY');
  }

  // ================================
  //        /START COMMAND
  // ================================
  async start(msg = {}) {
    const chatId = msg?.chat?.id;
    if (!chatId) return;

    try {
      await sender.send(chatId, {
        text: ui.startMessage(),
        options: ui.startKeyboard(),
      });
      logInfo(`User Started Bot: ${chatId}`);
    } catch (e) {
      logError(`Start Handler Error: ${e?.message}`, e);
    }
  }

  // ================================
  //      CALLBACK HANDLER
  // ================================
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
        logWarn(`Unknown callback data: ${data}`);
      }
    } catch (e) {
      logError('Callback Handler Error', e);
    } finally {
      try { this.bot.answerCallbackQuery(query.id); } catch {}
    }
  }

  // ================================
  //       TEXT HANDLER
  // ================================
  async textHandler(msg = {}) {
    const chatId = msg?.chat?.id;
    const text = msg?.text?.trim();
    if (!chatId || !text) return;

    // Ignore slash commands
    if (text.startsWith('/')) return;

    // Watchlist fast shortcut
    if (text.startsWith('$')) {
      const symbol = text.slice(1).trim();
      return this.handleWatch(chatId, symbol);
    }

    await sender.send(chatId, {
      text: `❓ *I don't understand this message.*\nSend *$TOKEN* to watch a coin.`,
    });
  }

  // ================================
  //        BUY HANDLER
  // ================================
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

      logInfo(`Sniper Buy: ${pair} => ${result?.success ? 'SUCCESS' : 'FAILED'}`, {
        chatId,
      });
    } catch (e) {
      logError('Buy Handler Error', e);
    }
  }

  // ================================
  //       WATCH HANDLER
  // ================================
  async handleWatch(chatId, symbol) {
    try {
      await sender.send(chatId, {
        text: `👀 *Watching*: ${symbol}\nYou'll receive alerts for major movements.`,
      });

      logInfo(`Watching Token: ${symbol} for chat ${chatId}`);
    } catch (e) {
      logError('Watch Handler Error', e);
    }
  }

  // ================================
  //       DETAILS HANDLER
  // ================================
  async handleDetails(chatId, pair) {
    try {
      await sender.send(chatId, {
        text: `🧾 *Fetching details for ${pair}...*`,
      });

      await sender.send(chatId, {
        text: `📊 *Token Details Coming Soon*\n(pair: ${pair})`,
      });

    } catch (e) {
      logError('Details Handler Error', e);
    }
  }

  // ================================
  //      OPEN SNIPER MENU
  // ================================
  async openSniper(chatId) {
    try {
      await sender.send(chatId, {
        text: ui.sniperMenu(),
        options: ui.sniperKeyboard(),
      });
    } catch (e) {
      logError('Open Sniper Error', e);
    }
  }

  // ================================
  //     PRESET LOADER HANDLER
  // ================================
  async sniperPreset(chatId, presetId) {
    try {
      const preset = presets[presetId];

      if (!preset) {
        return sender.send(chatId, { text: `❌ Invalid preset selected.` });
      }

      await sender.send(chatId, {
        text: `🎯 *Preset Loaded*: ${presetId}\nSlippage: ${preset.slippage}\nGas: ${preset.gas}`,
      });

      logInfo(`Preset Loaded: ${presetId} for chat ${chatId}`);
    } catch (e) {
      logError('Sniper Preset Handler Error', e);
    }
  }

  // ================================
  //      ADMIN COMMANDS
  // ================================
  handleAdminCommand(bot) {
    bot.command('admin', async (ctx) => {
      try {
        const userId = String(ctx.from.id);

        if (!config.ADMIN_CHAT_ID || userId !== String(config.ADMIN_CHAT_ID)) {
          return ctx.reply('⛔ You are not authorized to access admin controls.');
        }

        logInfo(`Admin menu opened by ${userId}`);

        const keyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback('📢 Broadcast', 'ADMIN_BROADCAST'),
            Markup.button.callback('📊 Stats', 'ADMIN_STATS'),
          ],
          [
            Markup.button.callback('🔄 Restart Bot', 'ADMIN_RESTART'),
            Markup.button.callback('👥 User List', 'ADMIN_USERS'),
          ],
        ]);

        await ctx.reply(
          '🛠 **Admin Panel**\nSelect an option:',
          { parse_mode: 'Markdown', ...keyboard }
        );
      } catch (err) {
        logError('Admin Panel Error', err);
        return ctx.reply('❌ Error opening admin panel.');
      }
    });

    bot.action('ADMIN_BROADCAST', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📢 *Broadcast Mode Activated*\nSend the message you want to broadcast to all users.',
        { parse_mode: 'Markdown' }
      );
    });

    bot.action('ADMIN_STATS', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('📊 Gathering stats...');
    });

    bot.action('ADMIN_RESTART', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🔄 Restarting bot (simulation)...');
    });

    bot.action('ADMIN_USERS', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('👥 Fetching users...');
    });
  }
}

export default TelegramHandlers;
