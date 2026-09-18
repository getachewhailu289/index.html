const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// ለሎካል አገልግሎት ብቻ የተዘጋጀ የቦት ማዋቀሪያ
const BOT_TOKEN = '8903239538:AAGxzaU5YYhsSX9iT0ovsIkWzkGjAtG3QpY'; 
const ADMIN_TELEGRAM_ID = 2119423483; 

// የዌብ አፕ አድራሻ ወደ ሎካልሆስት ተቀይሯል (ከRender ጋር ምንም ግንኙነት የለውም)
const WEB_APP_URL = 'http://localhost:3000/index.html'; 

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // ሎካል ላይ ያሉ ፋይሎችን በቀጥታ ለማንበብ

const USERS_FILE = path.join(__dirname, 'users.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

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
// 1. የባላንስ መረጃ ማግኛ ሎካል API
// ---------------------------------------------------------
app.get('/api/balance', (req, res) => {
    const telegramId = req.query.telegram_id || req.query.user_id || req.query.id;
    if (!telegramId) {
        return res.status(400).json({ success: false, error: 'Telegram ID is required' });
    }
    
    const users = loadUsers();
    let targetUser = users[telegramId] || (Array.isArray(users) ? users.find(u => String(u.telegram_id) === String(telegramId)) : null);

    if (targetUser) {
        return res.json({ success: true, balance: targetUser.balance || 0 });
    }
    return res.json({ success: true, balance: 100 }); // ነባሪ ሎካል ባላንስ
});

// ---------------------------------------------------------
// 2. ጨዋታ ሁኔታ (Game Status API - የተስተካከለ)
// ---------------------------------------------------------
// ---------------------------------------------------------
// 2. ጨዋታ ሁኔታ (Game Status API - በየ 4 ሰከንድ ቁጥር የሚጠራ)
// ---------------------------------------------------------
app.get('/api/game-status', (req, res) => {
    const roundDuration = 40; // 40 ሰከንድ የግዢ ሰዓት
    const now = Math.floor(Date.now() / 1000);
    const roundStartTime = (Math.floor(now / roundDuration) * roundDuration) * 1000;
    
    let elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
    let calledBalls = [];

    // ጨዋታው ከተጀመረ (ከ 40 ሰከንድ በኋላ) ቁጥሮች በየ 4 ሰከንድ በዘፈቀደ (Random) እንዲወጡ ይደረጋል
    if (elapsed > 40) {
        let gameSeconds = elapsed - 40;
        // በየ 4 ሰከንድ አንድ ቁጥር እንዲጨምር በ 4 ተካፍሏል
        let ballsCount = Math.min(75, Math.max(1, Math.floor(gameSeconds / 4)));

        let pool = Array.from({length: 75}, (_, i) => i + 1);
        let currentSeed = roundStartTime;
        
        let seededRandom = (seed) => {
            let x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        for (let i = pool.length - 1; i > 0; i--) {
            let j = Math.floor(seededRandom(currentSeed++) * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        calledBalls = pool.slice(0, ballsCount);
    }

    return res.json({
        success: true,
        roundStartTime: roundStartTime,
        calledBalls: calledBalls,
        soldCount: 1,
        takenCards: []
    });
});

app.post('/api/deduct-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id;
    const amount = req.body.amount || 10;
    const users = loadUsers();
    
    if (!users[userId]) {
        users[userId] = { balance: 100, phone: '' };
    }
    
    if (users[userId].balance < amount) {
        return res.json({ success: false, message: 'ሂሳብዎ በቂ አይደለም' });
    }
    
    users[userId].balance -= amount;
    saveUsers(users);
    return res.json({ success: true, balance: users[userId].balance });
});

app.post('/api/refund-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id;
    const amount = req.body.amount || 10;
    const users = loadUsers();
    
    if (!users[userId]) {
        users[userId] = { balance: 100, phone: '' };
    }
    
    users[userId].balance += amount;
    saveUsers(users);
    return res.json({ success: true, balance: users[userId].balance });
});

// ---------------------------------------------------------
// የቴሌግራም ቦት ትዕዛዞች (Bot Commands)
// ---------------------------------------------------------
const handleStartAndRegister = (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    const firstName = ctx.from.first_name || 'ተጠቃሚ';

    if (!users[userId]) {
        users[userId] = { firstName: firstName, phone: '', balance: 100 };
        saveUsers(users);
    }

    return ctx.reply(
        `👋 ሰላም <b>${firstName}</b> ወደ <b>YejuBingo (Local)</b> እንኳን ደህና መጡ!\n\nጨዋታውን ለመጀመር ከታች ያለውን ቁልፍ ይጫኑ፡`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 PLAY BINGO (LOCAL)', WEB_APP_URL)]
            ])
        }
    );
};

bot.start(handleStartAndRegister);
bot.command('register', handleStartAndRegister);

bot.launch();

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`ሎካል ሰርቨር በፖርት ${PORT} እየሰራ ይገኛል። (ከRender ነፃ ነው)`);
});
