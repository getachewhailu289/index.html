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
app.use(cors());
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
const adminBalanceStates = {}; 

let serverRoundStartTime = Date.now();
let serverCalledBalls = [];
let soldCardsCount = 0; 

setInterval(() => {
    let elapsed = Math.floor((Date.now() - serverRoundStartTime) / 1000);
    
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
        
        if (serverCalledBalls.length >= 75 || elapsed >= 415) {
            serverRoundStartTime = Date.now();
            serverCalledBalls = [];
            soldCardsCount = 0;
            saveRoom({ soldCount: 0, takenCards: [] });
        }
    }
}, 1000);

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

app.get('/api/balance', (req, res) => {
    const telegramId = req.query.telegram_id || req.query.user_id || req.query.id;
    if (!telegramId) return res.status(400).json({ success: false, error: 'Telegram ID is required' });
    
    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(telegramId) || String(u.id) === String(telegramId)) : users[telegramId];

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
// አዲስ የተጨመረው: አውቶማቲክ የ SMS / Notification Webhook Endpoint
// ---------------------------------------------------------
app.post('/api/webhook/sms', (req, res) => {
    // ከስልኩ አፕሊኬሽን የሚላክ መረጃ (ስልክ ቁጥር እና የብር መጠን)
    const { phone, amount, message } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ success: false, message: 'ስልክ ቁጥር እና የብር መጠን ያስፈልጋል' });
    }

    const users = loadUsers();
    let targetUser = null;
    let targetKey = null;
    const cleanPhone = phone.trim();

    // ተጠቃሚውን በስልክ ቁጥሩ መፈለግ
    if (Array.isArray(users)) {
        targetUser = users.find(u => u.phone && (u.phone === cleanPhone || u.phone.includes(cleanPhone) || cleanPhone.includes(u.phone)));
        if (targetUser) targetKey = targetUser.telegram_id || targetUser.id;
    } else {
        for (let id of Object.keys(users)) {
            if (users[id].phone && (users[id].phone === cleanPhone || users[id].phone.includes(cleanPhone) || cleanPhone.includes(users[id].phone))) {
                targetUser = users[id];
                targetKey = id;
                break;
            }
        }
    }

    if (!targetUser) {
        return res.json({ success: false, message: 'በዚህ ስልክ ቁጥር የተመዘገበ ተጠቃሚ አልተገኘም' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.json({ success: false, message: 'ልክ ያልሆነ የብር መጠን' });
    }

    // የባላንስ ማስተካከያ ማድረግ
    targetUser.balance = (targetUser.balance || 0) + numericAmount;
    saveUsers(users);

    // ታሪክ ውስጥ መመዝገብ
    addTransaction(targetKey, 'deposit', numericAmount, message || 'በአውቶማቲክ SMS የተሞላ');

    // ለተጠቃሚው በቴሌግራም ማሳወቂያ መላክ
    bot.telegram.sendMessage(
        targetKey,
        `💳 <b>አውቶማቲክ የባንክ ክፍያ ተረጋገጠ!</b>\n\n💰 ገቢ የተደረገ: <b>${numericAmount} ETB</b>\n💵 አዲስ ቀሪ ሂሳብዎ: <b>${targetUser.balance} ETB</b>\n\nእናመሰግናለን! 🎮`,
        { parse_mode: 'HTML' }
    ).catch(() => {});

    return res.json({ success: true, message: 'ბალანსი በተሳካ ሁኔታ ተሞልቷል', newBalance: targetUser.balance });
});

// Bot Start & Commands
const handleStartAndRegister = (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    const firstName = ctx.from.first_name || 'ተጠቃሚ';
    const startPayload = ctx.payload;

    if (Array.isArray(users)) {
        let user = users.find(u => String(u.telegram_id) === userId);
        if (!user) {
            users.push({ telegram_id: userId, firstName: firstName, phone: '', balance: 0, referredBy: startPayload || null });
            if (startPayload && startPayload !== userId) {
                let referrer = users.find(u => String(u.telegram_id) === String(startPayload));
                if (referrer) {
                    referrer.balance = (referrer.balance || 0) + 5;
                    bot.telegram.sendMessage(startPayload, `🎁 <b>እንኳን ደስ አለዎት!</b> አዲስ ጓደኛ በመጋበዝዎ <b>5.00 ETB</b> ቦነስ ተሸልመዋል።`, { parse_mode: 'HTML' }).catch(()=>{});
                }
            }
            saveUsers(users);
        }
    } else {
        if (!users[userId]) {
            users[userId] = { firstName: firstName, phone: '', balance: 0, referredBy: startPayload || null };
            if (startPayload && startPayload !== userId && users[startPayload]) {
                users[startPayload].balance = (users[startPayload].balance || 0) + 5;
                bot.telegram.sendMessage(startPayload, `🎁 <b>እንኳን ደስ አለዎት!</b> አዲስ ጓደኛ በመጋበዝዎ <b>5.00 ETB</b> ቦነስ ተሸልመዋል።`, { parse_mode: 'HTML' }).catch(()=>{});
            }
            saveUsers(users);
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
                [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)]
            ])
        }
    );
};

bot.start(handleStartAndRegister);
bot.command('register', handleStartAndRegister);

bot.on('contact', (ctx) => {
    const userId = ctx.from.id.toString();
    const contact = ctx.message.contact;
    const users = loadUsers();

    let phoneNum = contact.phone_number;
    if (!phoneNum.startsWith('+')) phoneNum = '+' + phoneNum;

    if (Array.isArray(users)) {
        let user = users.find(u => String(u.telegram_id) === userId);
        if (user) { user.phone = phoneNum; }
        else { users.push({ telegram_id: userId, firstName: ctx.from.first_name || 'ተጠቃሚ', phone: phoneNum, balance: 0 }); }
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

// አድሚን የባላንስ ማስተካከያ ትዕዛዝ
bot.command('addbalance', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID.toString()) return ctx.reply("❌ አድሚን ብቻ!");

    adminBalanceStates[ctx.from.id] = { step: 'waiting_for_phone' };
    return ctx.reply("🛠 <b>የባላንስ ማስተካከያ</b>\n\nእባክዎ የደንበኛውን <b>ስልክ ቁጥር</b> ያስገቡ (ለምሳሌ: +2519...):", { parse_mode: 'HTML' });
});

bot.on('message', async (ctx, next) => {
    if (!ctx.message.text) return next();
    const text = ctx.message.text;
    const adminId = ctx.from.id;

    if (adminId.toString() === ADMIN_TELEGRAM_ID.toString() && adminBalanceStates[adminId]) {
        let state = adminBalanceStates[adminId];
        
        if (state.step === 'waiting_for_phone') {
            state.phone = text.trim();
            state.step = 'waiting_for_amount';
            return ctx.reply(`📱 ስልክ ቁጥር: <b>${state.phone}</b> ተይዟል።\n\n💰 አሁን መጨመር ወይም መቀነስ የሚፈልጉትን <b>የብር መጠን</b> ያስገቡ (ለምሳሌ: 50 ወይም -20):`, { parse_mode: 'HTML' });
        } 
        else if (state.step === 'waiting_for_amount') {
            const amount = parseFloat(text.trim());
            if (isNaN(amount)) {
                return ctx.reply("❌ እባክዎ ትክክለኛ የብር መጠን (ቁጥር ብቻ) ያስገቡ!");
            }

            const users = loadUsers();
            let targetUser = null;
            let targetKey = null;

            if (Array.isArray(users)) {
                targetUser = users.find(u => String(u.phone) === String(state.phone) || String(u.phone).includes(state.phone));
                if (targetUser) targetKey = targetUser.telegram_id || targetUser.id;
            } else {
                for (let id of Object.keys(users)) {
                    if (users[id].phone && String(users[id].phone).includes(state.phone)) {
                        targetUser = users[id];
                        targetKey = id;
                        break;
                    }
                }
            }

            if (!targetUser) {
                delete adminBalanceStates[adminId];
                return ctx.reply(`❌ በዚህ ስልክ ቁጥር (${state.phone}) የተመዘገበ ተጠቃሚ አልተገኘም!`);
            }

            targetUser.balance = (targetUser.balance || 0) + amount;
            saveUsers(users);
            addTransaction(targetKey, amount > 0 ? 'deposit' : 'withdrawal', Math.abs(amount), 'በአድሚን የተስተካከለ');

            delete adminBalanceStates[adminId];

            ctx.reply(`✅ <b>በተሳካ ሁኔታ ተፈጽሟል!</b>\n\n👤 ስም: ${targetUser.firstName}\n📱 ስልክ: ${targetUser.phone}\n💰 የተደረገ ለውጥ: <b>${amount} ETB</b>\n💵 አዲስ ቀሪ ሂሳብ: <b>${targetUser.balance} ETB</b>`, { parse_mode: 'HTML' });
            
            bot.telegram.sendMessage(targetKey, `💳 <b>አካውንትዎ ተስተካክሏል!</b>\nበሂሳብዎ ላይ <b>${amount} ETB</b> ተስተካክሎ ተጨምሯል። አጠቃላይ ቀሪ ሂሳብዎ: <b>${targetUser.balance} ETB</b> ነው።`, { parse_mode: 'HTML' }).catch(() => {});
            return;
        }
    }

    if (text.startsWith('/')) return next();
    return next();
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
