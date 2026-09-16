const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const BOT_TOKEN = '8903239538:AAGxzaU5YYhsSX9iT0ovsIkWzkGjAtG3QpY'; // የቦት ቶከንዎ
const ADMIN_TELEGRAM_ID = 2119423483; // የአድሚን ID
const WEB_APP_URL = 'https://getachewhailu289.github.io/index.html/'; // የ GitHub Pages ሊንክዎ

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(express.json());
app.use(cors()); // ሚኒ አፑ ከሌላ ዶሜን ሆኖ ከሰርቨር ጋር መነጋገር እንዲችል
app.use(express.static('public'));

const USERS_FILE = path.join(__dirname, 'users.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const ROOM_FILE = path.join(__dirname, 'room.json'); 

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({}));
    }
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (e) {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify({}));
    }
    try {
        const data = fs.readFileSync(HISTORY_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (e) {
        return {};
    }
}

function saveHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// የክፍሉን (Room) የተሸጠ ካርድ ብዛት እና የተያዙ ካርዶች መቆጣጠሪያ
function loadRoom() {
    if (!fs.existsSync(ROOM_FILE)) {
        fs.writeFileSync(ROOM_FILE, JSON.stringify({ soldCount: 0, takenCards: [] }));
    }
    try {
        const data = fs.readFileSync(ROOM_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : { soldCount: 0, takenCards: [] };
    } catch (e) {
        return { soldCount: 0, takenCards: [] };
    }
}

function saveRoom(roomData) {
    fs.writeFileSync(ROOM_FILE, JSON.stringify(roomData, null, 2));
}

function addTransaction(userId, type, amount, details = '') {
    const history = loadHistory();
    if (!history[userId]) {
        history[userId] = { deposits: [], withdrawals: [] };
    }

    const dateStr = new Date().toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' });
    const transaction = {
        amount: parseFloat(amount),
        date: dateStr,
        details: details
    };

    if (type === 'deposit') {
        history[userId].deposits.push(transaction);
    } else if (type === 'withdrawal') {
        history[userId].withdrawals.push(transaction);
    }

    saveHistory(history);
}

const pendingWithdrawals = {};

// ---------------------------------------------------------
// የጨዋታው መረጃዎች በሰርቨር ሜሞሪ ውስጥ
// ---------------------------------------------------------
let serverRoundStartTime = Date.now();
let serverCalledBalls = [];
let soldCardsCount = 0; 

// በየ 1 ሰኮንድ ሰርቨሩ የጊዜ ገደቡንና ቦሎቹን በትክክል ይቆጣጠራል (ችግር 1 እና 2 መፍትሄ)
setInterval(() => {
    let elapsed = Math.floor((Date.now() - serverRoundStartTime) / 1000);
    
    // ከ 40 ሰኮንድ የ ግዢ ሰዓት በኋላ ጨዋታው ይጀምራል (በየ 5 ሰኮንድ 1 ቦል)
    if (elapsed >= 40) {
        let gameElapsed = elapsed - 40;
        let targetBallsCount = Math.min(75, Math.floor(gameElapsed / 5) + 1);
        
        if (serverCalledBalls.length < targetBallsCount && serverCalledBalls.length < 75) {
            let available = Array.from({length: 75}, (_, i) => i + 1).filter(n => !serverCalledBalls.includes(n));
            if (available.length > 0) {
                let randIndex = Math.floor(Math.random() * available.length);
                serverCalledBalls.push(available[randIndex]);
            }
        }
        
        // 75ቱም ቦሎች አልቀው ከተጠናቀቁ ወይም ራውንዱ ከቀጠለ ከ 415 ሰኮንድ በኋላ ራሱን በራሱ በንጹህ ሁኔታ ያድሳል
        if (serverCalledBalls.length >= 75 || elapsed >= 415) {
            serverRoundStartTime = Date.now();
            serverCalledBalls = [];
            soldCardsCount = 0;
            saveRoom({ soldCount: 0, takenCards: [] });
        }
    }
}, 1000);

// ተጫዋቾች የጨዋታውን ሁኔታ (ሰዓት፣ የወጡ ቦሎች፣ Sold ብዛት፣ Taken Cards) የሚጠይቁበት የተስተካከለ API
app.get('/api/game-status', (req, res) => {
    const room = loadRoom();
    res.json({
        success: true,
        roundStartTime: serverRoundStartTime,
        calledBalls: serverCalledBalls,
        soldCount: room.soldCount || soldCardsCount,
        takenCards: room.takenCards || []
    });
});

app.get('/api/room-stats', (req, res) => {
    const room = loadRoom();
    res.json({ success: true, soldCount: room.soldCount, takenCards: room.takenCards || [] });
});

app.post('/api/reset-room', (req, res) => {
    serverRoundStartTime = Date.now();
    serverCalledBalls = [];
    soldCardsCount = 0;
    saveRoom({ soldCount: 0, takenCards: [] });
    res.json({ success: true });
});

// ---------------------------------------------------------
// የባላንስ መቆጣጠሪያ API ዎች
// ---------------------------------------------------------
app.get('/api/balance', (req, res) => {
    const telegramId = req.query.telegram_id || req.query.user_id || req.query.id;
    if (!telegramId) return res.status(400).json({ success: false, error: 'Telegram ID is required' });
    
    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(telegramId) || String(u.id) === String(telegramId)) : users[telegramId];

    return res.json({ success: true, balance: targetUser ? (targetUser.balance || 0) : 0 });
});

app.get('/api/balance/:userId', (req, res) => {
    const userId = req.params.userId;
    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId) || String(u.id) === String(userId)) : users[userId];

    return res.json({ success: true, balance: targetUser ? (targetUser.balance || 0) : 0 });
});

app.post('/api/deduct-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id || req.body.id;
    const amount = req.body.amount;
    const cardNumber = req.body.cardNumber; 
    const users = loadUsers();
    let room = loadRoom();

    if (cardNumber && room.takenCards && room.takenCards.includes(cardNumber)) {
        return res.json({ success: false, message: 'ይህ ካርቴላ አስቀድሞ ተመርጧል/ተሸጧል!' });
    }

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId) || String(u.id) === String(userId)) : users[userId];
    if (!targetUser) return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });

    const currentBalance = targetUser.balance || 0;
    if (currentBalance < amount) return res.json({ success: false, message: 'ሂሳብዎ በቂ አይደለም' });

    targetUser.balance = currentBalance - amount;
    saveUsers(users);

    if (cardNumber) {
        if (!room.takenCards) room.takenCards = [];
        room.takenCards.push(cardNumber);
    }

    room.soldCount = (room.soldCount || 0) + 1;
    soldCardsCount = room.soldCount;
    saveRoom(room);

    return res.json({ success: true, balance: targetUser.balance, soldCount: room.soldCount });
});

app.post('/api/refund-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id || req.body.id;
    const amount = req.body.amount;
    const cardNumber = req.body.cardNumber; 
    const users = loadUsers();
    let room = loadRoom();

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId) || String(u.id) === String(userId)) : users[userId];
    if (!targetUser) return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });

    targetUser.balance = (targetUser.balance || 0) + parseFloat(amount);
    saveUsers(users);

    if (cardNumber && room.takenCards) {
        room.takenCards = room.takenCards.filter(c => String(c) !== String(cardNumber));
    }

    room.soldCount = Math.max(0, (room.soldCount || 0) - 1);
    soldCardsCount = room.soldCount;
    saveRoom(room);

    return res.json({ success: true, balance: targetUser.balance, soldCount: room.soldCount });
});

app.post('/api/update-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id || req.body.id;
    const amount = req.body.amount;
    const users = loadUsers();

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId) || String(u.id) === String(userId)) : users[userId];
    if (!targetUser) return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });

    targetUser.balance = (targetUser.balance || 0) + parseFloat(amount);
    saveUsers(users);

    return res.json({ success: true, balance: targetUser.balance });
});

// ---------------------------------------------------------
// አዲስ የተጨመረ ፊቸር፡ ሪፈራል ሲስተም (Referral Leaderboard & Bonus API)
// ---------------------------------------------------------
app.get('/api/leaderboard', (req, res) => {
    const users = loadUsers();
    let userList = Array.isArray(users) ? users : Object.keys(users).map(id => ({ telegram_id: id, ...users[id] }));
    
    // በባላንስ ብዛት ደርድር (Top Winners)
    userList.sort((a, b) => (b.balance || 0) - (a.balance || 0));
    res.json({ success: true, topUsers: userList.slice(0, 10) });
});

// Bot Commands & Handlers
const handleStartAndRegister = (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    const firstName = ctx.from.first_name || 'ተጠቃሚ';
    const startPayload = ctx.payload; // የሪፈራል ኮድ ካለ ለመያዝ

    let userExists = false;
    if (Array.isArray(users)) {
        let user = users.find(u => String(u.telegram_id) === userId);
        if (!user) {
            users.push({ telegram_id: userId, firstName: firstName, phone: '', balance: 0, referredBy: startPayload || null });
            saveUsers(users);
        } else {
            userExists = true;
        }
    } else {
        if (!users[userId]) {
            users[userId] = { firstName: firstName, phone: '', balance: 0, referredBy: startPayload || null };
            saveUsers(users);
        } else {
            userExists = true;
        }
    }

    let currentUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];

    if (!currentUser.phone || currentUser.phone === 'ስልክ አልገባም') {
        return ctx.reply(
            `👋 ሰላም <b>${firstName}</b> ወደ <b>YejuBingo</b> እንኳን ደህና መጡ!\n\nለመመዝገብ እባክዎ ከታች ያለውን <b>"📱 ስልክ ቁጥር ማጋራት"</b> የሚለውን ቁልፍ ይጫኑ።`,
            {
                parse_mode: 'HTML',
                ...Markup.keyboard([
                    [Markup.button.contactRequest('📱 ስልክ ቁጥር ማጋራት (Share Contact)')]
                ]).resize().oneTime()
            }
        );
    }

    return ctx.reply(
        `🎮 <b>YejuBingo</b> ጨዋታውን ለመጀመር እና እድልዎን ለመሞከር ከታች ያለውን ቁልፍ ይጫኑ፡\n\n🔗 <b>የእርስዎ የግብዣ ሊንክ:</b>\n<code>https://t.me/${ctx.botInfo.username}?start=${userId}</code>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)],
                [Markup.button.callback('🏆 Top Winners', 'show_leaderboard')]
            ])
        }
    );
};

bot.start(handleStartAndRegister);
bot.command('register', handleStartAndRegister);

// የሊደርቦርድ ኮልባክ ሃንድለር
bot.action('show_leaderboard', async (ctx) => {
    const users = loadUsers();
    let userList = Array.isArray(users) ? users : Object.keys(users).map(id => ({ telegram_id: id, ...users[id] }));
    userList.sort((a, b) => (b.balance || 0) - (a.balance || 0));

    let msg = `🏆 <b>የዕለቱ ከፍተኛ አሸናፊዎች (Leaderboard)</b>\n\n`;
    userList.slice(0, 5).forEach((u, index) => {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        msg += `${medals[index]} <b>${u.firstName || 'ተጠቃሚ'}</b> - 💰 ${u.balance || 0} ETB\n`;
    });

    await ctx.answerCbQuery();
    return ctx.editMessageText(msg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 ወደ ዋናው', 'back_to_main')]
        ])
    });
});

bot.action('back_to_main', (ctx) => {
    return ctx.editMessageText("🎮 <b>YejuBingo</b> ጨዋታውን ለመቀጠል ከታች ያለውን ቁልፍ ይጫኑ፡", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)]
        ])
    });
});

bot.on('contact', (ctx) => {
    const userId = ctx.from.id.toString();
    const contact = ctx.message.contact;
    const users = loadUsers();

    let phoneNum = contact.phone_number;
    if (!phoneNum.startsWith('+')) phoneNum = '+' + phoneNum;

    if (Array.isArray(users)) {
        let user = users.find(u => String(u.telegram_id) === userId);
        if (user) {
            user.phone = phoneNum;
        } else {
            users.push({ telegram_id: userId, firstName: ctx.from.first_name || 'ተጠቃሚ', phone: phoneNum, balance: 0 });
        }
    } else {
        if (!users[userId]) users[userId] = { firstName: ctx.from.first_name || 'ተጠቃሚ', balance: 0 };
        users[userId].phone = phoneNum;
    }
    saveUsers(users);

    return ctx.reply(
        "✅ ምዝገባዎ በትክክል ተጠናቋል!\n\nአሁን ጨዋታውን መጫወት ይችላሉ።",
        {
            parse_mode: 'HTML',
            ...Markup.removeKeyboard(),
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)]
            ])
        }
    );
});

const handleBalance = (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    
    let userBalance = 0;
    if (Array.isArray(users)) {
        const user = users.find(u => String(u.telegram_id) === userId);
        userBalance = user ? (user.balance || 0) : 0;
    } else {
        userBalance = users[userId]?.balance || 0;
    }

    return ctx.reply(`💰 የአሁኑ ቀሪ ሂሳብዎ: <b>${userBalance}.00 ETB</b>`, { parse_mode: 'HTML' });
};

bot.hears('💰 Balance', handleBalance);
bot.command('balance', handleBalance);

const handleDeposit = (ctx) => {
    return ctx.reply(
        "💳 <b>የገንዘብ ተቀማጭ (Deposit) መመሪያ</b>\n\nበቴሌብር (Telebirb) በኩል ገንዘብ ይላኩ፡\n\n📞 <b>ስልክ ቁጥር:</b> 0985141415\n👤 <b>ስም:</b> ጌታቸዉ ሀይሉ\n\nብሩን ከላኩ በኋላ የትራንዛክሽን SMS ወይም ማረጋገጫ እዚሁ ይላኩ።",
        { parse_mode: 'HTML' }
    );
};

bot.hears('💳 Deposit', handleDeposit);
bot.command('deposit', handleDeposit);

const handleWithdraw = (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    let currentUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];

    if (!currentUser || !currentUser.phone) {
        return ctx.reply("❌ እባክዎ መጀመሪያ /start በመጫን ይመዝገቡ።");
    }

    pendingWithdrawals[userId] = { step: 'waiting_for_withdraw_phone' };
    return ctx.reply("💸 <b>የገንዘብ ማውጣት ጥያቄ</b>\n\nገንዘብ መቀበያ **ስልክ ቁጥርዎን** ያስገቡ:", { parse_mode: 'HTML' });
};

bot.hears('💸 Withdraw', handleWithdraw);
bot.command('withdraw', handleWithdraw);

const handleHistoryMenu = (ctx) => {
    return ctx.reply(
        "📋 <b>የግብይት ታሪክ</b>\n\nማየት የሚፈልጉትን ይምረጡ፡",
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📥 ገቢ (Deposit)', 'history_deposit'),
                 Markup.button.callback('📤 ወጪ (Withdrawal)', 'history_withdrawal')]
            ])
        }
    );
};

bot.hears('📋 History', handleHistoryMenu);
bot.command('history', handleHistoryMenu);

bot.action('history_deposit', (ctx) => {
    const userId = ctx.from.id.toString();
    const history = loadHistory();
    const userHistory = history[userId]?.deposits || [];

    if (userHistory.length === 0) return ctx.editMessageText("📥 እስካሁን የተመዘገበ የገቢ ታሪክ የለዎትምም።", { parse_mode: 'HTML' });

    let message = `📥 <b>የገቢ (Deposit) ታሪክዎ:</b>\n\n`;
    let total = 0;
    userHistory.forEach((item, index) => {
        total += item.amount;
        message += `${index + 1}. <b>${item.amount} ETB</b> - 📅 ${item.date}\n`;
    });
    message += `\n💰 <b>ጠቅላላ ገቢ: ${total}.00 ETB</b>`;
    return ctx.editMessageText(message, { parse_mode: 'HTML' });
});

bot.action('history_withdrawal', (ctx) => {
    const userId = ctx.from.id.toString();
    const history = loadHistory();
    const userHistory = history[userId]?.withdrawals || [];

    if (userHistory.length === 0) return ctx.editMessageText("📤 እስካሁን የተመዘገበ የወጪ ታሪክ የለዎትምም።", { parse_mode: 'HTML' });

    let message = `📤 <b>የወጪ (Withdrawal) ታሪክዎ:</b>\n\n`;
    let total = 0;
    userHistory.forEach((item, index) => {
        total += item.amount;
        message += `${index + 1}. <b>${item.amount} ETB</b> - 📅 ${item.date}\n`;
    });
    message += `\n💸 <b>ጠቅላላ ወጪ: ${total}.00 ETB</b>`;
    return ctx.editMessageText(message, { parse_mode: 'HTML' });
});

bot.on('message', async (ctx, next) => {
    if (!ctx.message.text) return next();
    const text = ctx.message.text;

    if (text.startsWith('/') || text.includes('Balance') || text.includes('Deposit') || text.includes('History') || text.includes('Withdraw')) {
        return next();
    }

    const userId = ctx.from.id.toString();
    const firstName = ctx.from.first_name || 'ተጠቃሚ';
    if (userId === ADMIN_TELEGRAM_ID.toString()) return next();

    const users = loadUsers();

    if (pendingWithdrawals[userId]) {
        const state = pendingWithdrawals[userId];
        if (state.step === 'waiting_for_withdraw_phone') {
            state.phone = text;
            state.step = 'waiting_for_withdraw_name';
            return ctx.reply("👤 እባክዎ ሙሉ ስምዎን ያስገቡ:");
        } else if (state.step === 'waiting_for_withdraw_name') {
            state.name = text;
            state.step = 'waiting_for_withdraw_amount';
            return ctx.reply("💸 እባክዎ ማውጣት የሚፈልጉትን የብር መጠን በቁጥር ብቻ ያስገቡ:");
        } else if (state.step === 'waiting_for_withdraw_amount') {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) return ctx.reply("❌ እባክዎ ትክክለኛ የብር መጠን (ቁጥር) ብቻ ያስገቡ!");

            let currentUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];
            const userBalance = currentUser?.balance || 0;

            if (amount > userBalance) {
                delete pendingWithdrawals[userId];
                return ctx.reply(`❌ የጠየቁት ብር ከቀሪ ሂሳብዎ በላይ ነው!\n\n💰 የአሁኑ ቀሪ ሂሳብዎ: <b>${userBalance}.00 ETB</b>`, { parse_mode: 'HTML' });
            }

            currentUser.balance -= amount;
            saveUsers(users);
            addTransaction(userId, 'withdrawal', amount, `ስልክ: ${state.phone}, ስም: ${state.name}`);
            delete pendingWithdrawals[userId];

            await bot.telegram.sendMessage(
                ADMIN_TELEGRAM_ID,
                `🚨 <b>አዲስ የገንዘብ ማውጣት (Withdrawal) ጥያቄ!</b>\n\n👤 ስም: ${firstName}\n🆔 ID: <code>${userId}</code>\n📱 ስልክ: ${state.phone}\n👤 ስም: ${state.name}\n💸 መጠን: <b>${amount} ETB</b>`,
                { parse_mode: 'HTML' }
            );

            return ctx.reply("✅ ትእዛዝዎ በተሳካ ሁኔታ ተልኳል! በትዕግስት ይጠባበቁ።", {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)]
                ])
            });
        }
    }

    await bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
        `📥 <b>አዲስ የክፍያ ማረጋገጫ ጥያቄ!</b>\n\n👤 ስም: ${firstName}\n🆔 ID: <code>${userId}</code>\n💬 መልዕክት:\n<code>${text}</code>\n\nገንዘብ ለመጨመር:\n/addbalance ${userId} [መጠን]`,
        { parse_mode: 'HTML' }
    ).catch(() => {});

    return ctx.reply("✅ የክፍያ ማረጋገጫዎ ደርሷል! አድሚኑ በማጣራት አካውንትዎ ላይ የብር መጠን ይጨምራል።", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)]
        ])
    });
});

bot.command('users', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID.toString()) return ctx.reply("አድሚን ብቻ!");
    const users = loadUsers();
    let message = `👥 <b>አጠቃላይ ተጠቃሚዎች:</b>\n\n`;
    
    if (Array.isArray(users)) {
        for (let u of users) {
            message += `👤 ${u.firstName || 'ተጠቃሚ'} - ID: <code>${u.telegram_id || u.id}</code> - 💰 ${u.balance || 0} ETB\n`;
        }
    } else {
        for (let id of Object.keys(users)) {
            let u = users[id];
            message += `👤 ${u.firstName} - ID: <code>${id}</code> - 💰 ${u.balance || 0} ETB\n`;
        }
    }
    return ctx.reply(message, { parse_mode: 'HTML' });
});

const handleAddBalance = (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID.toString()) return ctx.reply("❌ አድሚን ብቻ!");

    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("❌ አጠቃቀም: /addbalance <ID> <መጠን>");

    const targetIdentifier = args[1];
    const amount = parseFloat(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ ትክክለኛ መጠን ያስገቡ!");

    const users = loadUsers();
    let targetUserId = null;

    if (Array.isArray(users)) {
        let targetUser = users.find(u => String(u.telegram_id) === String(targetIdentifier) || String(u.id) === String(targetIdentifier));
        if (targetUser) {
            targetUserId = targetUser.telegram_id || targetUser.id;
            targetUser.balance = (targetUser.balance || 0) + amount;
        }
    } else {
        for (let id of Object.keys(users)) {
            if (id === targetIdentifier) {
                targetUserId = id;
                users[targetUserId].balance = (users[targetUserId].balance || 0) + amount;
                break;
            }
        }
    }

    if (!targetUserId) return ctx.reply("❌ ተጠቃሚው አልተገኘም!");

    saveUsers(users);
    addTransaction(targetUserId, 'deposit', amount, 'በአድሚን የተጫነ');

    ctx.reply(`✅ <b>ገቢ ተደርጓል!</b> ID: <code>${targetUserId}</code> - መጠን: <b>${amount} ETB</b>`, { parse_mode: 'HTML' });
    bot.telegram.sendMessage(targetUserId, `💳 <b>የብር ተቀማጭ ተሳክቷል!</b> <b>${amount} ETB</b> ተጨምሯል።`, { parse_mode: 'HTML' }).catch(() => {});
};

bot.command('addbalance', handleAddBalance);
bot.command('add', handleAddBalance);

bot.launch();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
