const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const BOT_TOKEN = '8903239538:AAGxzaU5YYhsSX9iT0ovsIkWzkGjAtG3QpY';
const ADMIN_TELEGRAM_ID = 2119423483;
const WEB_APP_URL = 'https://getachewhailu289.github.io/index.html';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
    history[userId][type === 'deposit' ? 'deposits' : 'withdrawals'].push({
        amount: parseFloat(amount),
        date: dateStr,
        details: details
    });
    saveHistory(history);
}

const pendingWithdrawals = {};
const adminBalanceStates = {}; 

let serverRoundStartTime = Date.now();
let serverCalledBalls = [];
let soldCardsCount = 0; 

function broadcastGameStatus() {
    const room = loadRoom();
    const payload = JSON.stringify({
        type: 'GAME_STATUS',
        success: true,
        roundStartTime: serverRoundStartTime,
        calledBalls: serverCalledBalls,
        soldCount: room.soldCount || soldCardsCount,
        takenCards: room.takenCards || []
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

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

    broadcastGameStatus();
}, 1000);

wss.on('connection', (ws) => {
    console.log('🔗 አዲስ ዲቫይስ ከሰርቨር ጋር ተገናኝቷል!');
    const room = loadRoom();
    ws.send(JSON.stringify({
        type: 'GAME_STATUS',
        success: true,
        roundStartTime: serverRoundStartTime,
        calledBalls: serverCalledBalls,
        soldCount: room.soldCount || soldCardsCount,
        takenCards: room.takenCards || []
    }));

    ws.on('close', () => {
        console.log('❌ አንድ ዲቫይስ ከሰርቨር ተቋርጧል።');
    });
});

// ---------------- REST API ----------------
app.get('/api/balance', (req, res) => {
    const telegramId = req.query.telegram_id || req.query.user_id || req.query.id;
    if (!telegramId) return res.status(400).json({ success: false, error: 'Telegram ID is required' });
    
    const users = loadUsers();
    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(telegramId)) : users[telegramId];

    if (!targetUser) {
        // ቴስት ወይም አዲስ ዩዘር ሲሆን 100 ብር ቦነስ በራስ ሰር በመፍጠር ዜሮ እንዳይሆን ማድረግ ይቻላል
        users[telegramId] = { firstName: "Guest/Test", balance: 100.00, phone: "" };
        saveUsers(users);
        return res.json({ success: true, balance: 100.00 });
    }

    return res.json({ success: true, balance: targetUser.balance || 0 });
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

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];
    if (!targetUser) {
        users[userId] = { firstName: "User", balance: 100.00 };
        targetUser = users[userId];
    }

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

    broadcastGameStatus();
    return res.json({ success: true, balance: targetUser.balance, soldCount: room.soldCount });
});

app.post('/api/refund-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id || req.body.id;
    const amount = req.body.amount;
    const cardNumber = req.body.cardNumber; 
    const users = loadUsers();
    let room = loadRoom();

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];
    if (!targetUser) return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });

    targetUser.balance = (targetUser.balance || 0) + parseFloat(amount);
    saveUsers(users);

    if (cardNumber && room.takenCards) {
        room.takenCards = room.takenCards.filter(c => String(c) !== String(cardNumber));
    }

    room.soldCount = Math.max(0, (room.soldCount || 0) - 1);
    soldCardsCount = room.soldCount;
    saveRoom(room);

    broadcastGameStatus();
    return res.json({ success: true, balance: targetUser.balance, soldCount: room.soldCount });
});

app.post('/api/update-balance', async (req, res) => {
    const userId = req.body.userId || req.body.telegram_id || req.body.id;
    const amount = req.body.amount;
    const cardNumber = req.body.cardNumber;
    const users = loadUsers();

    let targetUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(userId)) : users[userId];
    if (!targetUser) return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });

    targetUser.balance = (targetUser.balance || 0) + parseFloat(amount);
    saveUsers(users);

    bot.telegram.sendMessage(
        userId, 
        `🎉 <b>እንኳን ደስ አለዎት!</b> በቢንጎ ጨዋታው ካርድ #${cardNumber || ''} አሸናፊ በመሆን <b>${amount} ETB</b> ተሸልመዋል! 🏆`, 
        { parse_mode: 'HTML' }
    ).catch(()=>{});

    bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID, 
        `🏆 <b>ቢንጎ አሸናፊ ተገኘ!</b>\n\n👤 ስም: ${targetUser.firstName || 'ተጠቃሚ'}\n🆔 ID: <code>${userId}</code>\n🃏 ካርድ #: ${cardNumber || 'አልታወቀም'}\n💰 ሽልማት: <b>${amount} ETB</b>`, 
        { parse_mode: 'HTML' }
    ).catch(()=>{});

    return res.json({ success: true, balance: targetUser.balance });
});

// ---------------- Telegram Bot Start ----------------
const handleStartAndRegister = (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    const firstName = ctx.from.first_name || 'ተጠቃሚ';

    if (!users[userId]) {
        users[userId] = { firstName: firstName, phone: '', balance: 100.00 }; // 100 ብር ቦነስ ዌልക്കം
        saveUsers(users);
    }

    let currentUser = users[userId];

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
        `🎮 <b>YejuBingo</b> ጨዋታውን ለመጀመር ከታች ያለውን ቁልፍ ይጫኑ፡`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 PLAY BINGO NOW', `${WEB_APP_URL}?telegram_id=${userId}`)]
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

    if (!users[userId]) users[userId] = { firstName: ctx.from.first_name || 'ተጠቃሚ', balance: 100.00 };
    users[userId].phone = phoneNum;
    saveUsers(users);

    return ctx.reply(
        "✅ ምዝገባዎ በትክክል ተጠናቋል! (100.00 ETB የቦነስ ባላንስ ተሰጥቷል)",
        {
            parse_mode: 'HTML',
            ...Markup.removeKeyboard(),
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 PLAY BINGO NOW', `${WEB_APP_URL}?telegram_id=${userId}`)]
            ])
        }
    );
});

bot.launch();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running with WebSocket on port ${PORT}`);
});
