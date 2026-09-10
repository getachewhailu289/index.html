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
app.use(cors()); // ሚኒ አፑ ከሌላ ዶሜን (GitHub Pages) ሆኖ ከሰርቨር ጋር መነጋገር እንዲችል
app.use(express.static('public')); // የፊት ለፊት ፋይሎችዎ የሚገኙበት ፎልደር (ካለ)

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
// 1. የባላንስ መረጃን ከሰርቨር ለማንበብ (Get Balance API - Query & Param Supported)
// ---------------------------------------------------------
app.get('/api/balance', (req, res) => {
    const telegramId = req.query.telegram_id || req.query.user_id || req.query.id;
    
    if (!telegramId) {
        return res.status(400).json({ success: false, error: 'Telegram ID is required' });
    }
    
    const users = loadUsers();
    let targetUser = null;

    if (Array.isArray(users)) {
        targetUser = users.find(u => String(u.telegram_id) === String(telegramId) || String(u.id) === String(telegramId));
    } else {
        targetUser = users[telegramId];
    }

    if (targetUser) {
        return res.json({ success: true, balance: targetUser.balance || 0 });
    }
    
    return res.json({ success: true, balance: 0 });
});

app.get('/api/balance/:userId', (req, res) => {
    const userId = req.params.userId;
    const users = loadUsers();
    let targetUser = null;
    
    if (Array.isArray(users)) {
        targetUser = users.find(u => String(u.telegram_id) === String(userId) || String(u.id) === String(userId));
    } else {
        targetUser = users[userId];
    }

    if (targetUser) {
        return res.json({ success: true, balance: targetUser.balance || 0 });
    }
    
    return res.json({ success: true, balance: 0 });
});

// ---------------------------------------------------------
// 2. ካርቴላ ሲመርጥ ከባላንስ ላይ ዋጋ ለመቀነስ (Deduct Balance API)
// ---------------------------------------------------------
app.post('/api/deduct-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id || req.body.id;
    const amount = req.body.amount;
    const users = loadUsers();

    let targetUser = null;
    if (Array.isArray(users)) {
        targetUser = users.find(u => String(u.telegram_id) === String(userId) || String(u.id) === String(userId));
    } else {
        targetUser = users[userId];
    }

    if (!targetUser) {
        return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });
    }

    const currentBalance = targetUser.balance || 0;
    if (currentBalance < amount) {
        return res.json({ success: false, message: 'ሂሳብዎ በቂ አይደለም' });
    }

    targetUser.balance = currentBalance - amount;
    saveUsers(users);

    return res.json({ success: true, balance: targetUser.balance });
});

// ---------------------------------------------------------
// 3. ጨዋታ ላይ ሲያሸንፍ ባላንስ ለመጨመር (Add/Update Balance API)
// ---------------------------------------------------------
app.post('/api/update-balance', (req, res) => {
    const userId = req.body.userId || req.body.telegram_id || req.body.id;
    const amount = req.body.amount;
    const users = loadUsers();

    let targetUser = null;
    if (Array.isArray(users)) {
        targetUser = users.find(u => String(u.telegram_id) === String(userId) || String(u.id) === String(userId));
    } else {
        targetUser = users[userId];
    }

    if (!targetUser) {
        return res.json({ success: false, message: 'ተጠቃሚው አልተገኘም' });
    }

    targetUser.balance = (targetUser.balance || 0) + parseFloat(amount);
    saveUsers(users);

    return res.json({ success: true, balance: targetUser.balance });
});

// 1. /start ወይም /register ሲጀመር ስልክ ቁጥር መጠየቂያ
const handleStartAndRegister = (ctx) => {
    const userId = ctx.from.id.toString();
    const users = loadUsers();
    const firstName = ctx.from.first_name || 'ተጠቃሚ';

    if (Array.isArray(users)) {
        let user = users.find(u => String(u.telegram_id) === userId);
        if (!user) {
            users.push({ telegram_id: userId, firstName: firstName, phone: '', balance: 0 });
            saveUsers(users);
        }
    } else {
        if (!users[userId]) {
            users[userId] = { firstName: firstName, phone: '', balance: 0 };
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
        "🎮 <b>YejuBingo</b> ጨዋታውን ለመጀመር ከታች ያለውን ቁልፍ ይጫኑ፡",
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
bot.hears('register', handleStartAndRegister);

// 2. ተጠቃሚው Contact ሲያጋራ የሚቀበለው ክፍል
bot.on('contact', (ctx) => {
    const userId = ctx.from.id.toString();
    const contact = ctx.message.contact;
    const users = loadUsers();

    let phoneNum = contact.phone_number;
    if (!phoneNum.startsWith('+')) {
        phoneNum = '+' + phoneNum;
    }

    if (Array.isArray(users)) {
        let user = users.find(u => String(u.telegram_id) === userId);
        if (user) {
            user.phone = phoneNum;
        } else {
            users.push({ telegram_id: userId, firstName: ctx.from.first_name || 'ተጠቃሚ', phone: phoneNum, balance: 0 });
        }
    } else {
        if (!users[userId]) {
            users[userId] = { firstName: ctx.from.first_name || 'ተጠቃሚ', balance: 0 };
        }
        users[userId].phone = phoneNum;
    }
    saveUsers(users);

    bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
        `🔔 <b>አዲስ የተጠቃሚ ምዝገባ (በ Contact Share)!</b>\n\n` +
        `👤 ስም: ${ctx.from.first_name || 'ተጠቃሚ'}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📱 ስልክ: <code>${phoneNum}</code>`,
        { parse_mode: 'HTML' }
    ).catch(err => console.log('አድሚን ጋር መላክ አልተቻለም'));

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

// 3. 💰 Balance
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

// 4. 💳 Deposit
const handleDeposit = (ctx) => {
    return ctx.reply(
        "💳 <b>የገንዘብ ተቀማጭ (Deposit) መመሪያ</b>\n\nበቴሌብር (Telebirb) በኩል ገንዘብ ይላኩ፡\n\n📞 <b>ስልክ ቁጥር:</b> 0985141415\n👤 <b>ስም:</b> ጌታቸዉ ሀይሉ\n\nብሩን ከላኩ በኋላ የትራንዛክሽን SMS እዚሁ ይላኩ።",
        { parse_mode: 'HTML' }
    );
};

bot.hears('💳 Deposit', handleDeposit);
bot.command('deposit', handleDeposit);

// 5. 💸 Withdrawal
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

bot.hears('withdrawal 💸 የገንዘብ ማውጣት', handleWithdraw);
bot.hears('💸 Withdraw', handleWithdraw);
bot.command('withdraw', handleWithdraw);

// 6. 📋 History
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

    if (userHistory.length === 0) {
        return ctx.editMessageText("📥 እስካሁን የተመዘገበ የገቢ ታሪክ የለዎትምም።", { parse_mode: 'HTML' });
    }

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

    if (userHistory.length === 0) {
        return ctx.editMessageText("📤 እስካሁን የተመዘገበ የወጪ ታሪክ የለዎትምም።", { parse_mode: 'HTML' });
    }

    let message = `📤 <b>የወጪ (Withdrawal) ታሪክዎ:</b>\n\n`;
    let total = 0;
    userHistory.forEach((item, index) => {
        total += item.amount;
        message += `${index + 1}. <b>${item.amount} ETB</b> - 📅 ${item.date}\n`;
    });
    message += `\n💸 <b>ጠቅላላ ወጪ: ${total}.00 ETB</b>`;
    return ctx.editMessageText(message, { parse_mode: 'HTML' });
});

// 7. Message Handler
bot.on('message', async (ctx, next) => {
    if (!ctx.message.text) return next();
    const text = ctx.message.text;

    if (text.startsWith('/') || text.includes('Balance') || text.includes('Deposit') || text.includes('History') || text.includes('Withdraw')) {
        return next();
    }

    const userId = ctx.from.id.toString();
    const firstName = ctx.from.first_name || 'ተጠቃሚ';
    
    if (userId === ADMIN_TELEGRAM_ID.toString()) {
        return next();
    }

    const users = loadUsers();

    if (pendingWithdrawals[userId]) {
        const state = pendingWithdrawals[userId];

        if (state.step === 'waiting_for_withdraw_phone') {
            state.phone = text;
            state.step = 'waiting_for_withdraw_name';
            return ctx.reply("👤 እባክዎ ሙሉ ስምዎን ያስገቡ:");
        } 
        else if (state.step === 'waiting_for_withdraw_name') {
            state.name = text;
            state.step = 'waiting_for_withdraw_amount';
            return ctx.reply("💸 እባክዎ ማውጣት የሚፈልጉትን የብር መጠን በቁጥር ብቻ ያስገቡ:");
        } 
        else if (state.step === 'waiting_for_withdraw_amount') {
            const amount = parseFloat(text);

            if (isNaN(amount) || amount <= 0) {
                return ctx.reply("❌ እባክዎ ትክክለኛ የብር መጠን (ቁጥር) ብቻ ያስገቡ!");
            }

            let currentUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];
            const userBalance = currentUser?.balance || 0;

            if (amount > userBalance) {
                delete pendingWithdrawals[userId];
                return ctx.reply(
                    `❌ የጠየቁት ብር ከቀሪ ሂሳብዎ በላይ ነው!\n\n💰 የአሁኑ ቀሪ ሂሳብዎ: <b>${userBalance}.00 ETB</b>`,
                    { parse_mode: 'HTML' }
                );
            }

            const withdrawPhone = state.phone;
            const withdrawName = state.name;

            currentUser.balance -= amount;
            saveUsers(users);

            addTransaction(userId, 'withdrawal', amount, `ስልክ: ${withdrawPhone}, ስም: ${withdrawName}`);
            delete pendingWithdrawals[userId];

            await bot.telegram.sendMessage(
                ADMIN_TELEGRAM_ID,
                `🚨 <b>አዲስ የገንዘብ ማውጣት (Withdrawal) ጥያቄ!</b>\n\n` +
                `👤 ስም: ${firstName}\n` +
                `🆔 ID: <code>${userId}</code>\n` +
                `📱 ስልክ: ${withdrawPhone}\n` +
                `👤 የሰጡት ስም: ${withdrawName}\n` +
                `💸 መጠን: <b>${amount} ETB</b>`,
                { parse_mode: 'HTML' }
            );

            return ctx.reply(
                "✅ ትእዛዝዎ በተሳካ ሁኔታ ተልኳል! በትዕግስት ይጠባበቁ።",
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)]
                    ])
                }
            );
        }
    }

    if (Array.isArray(users)) {
        let user = users.find(u => String(u.telegram_id) === userId);
        if (!user) {
            users.push({ telegram_id: userId, firstName: firstName, phone: 'ስልክ አልገባም', balance: 0 });
            saveUsers(users);
        }
    } else {
        if (!users[userId]) {
            users[userId] = { firstName: firstName, phone: 'ስልክ አልገባም', balance: 0 };
            saveUsers(users);
        }
    }

    let currentUser = Array.isArray(users) ? users.find(u => String(u.telegram_id) === userId) : users[userId];
    const userPhone = currentUser?.phone || 'ስልክ አልገባም';

    await bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
        `📥 <b>አዲስ የዲፖዚት / የክፍያ ማረጋገጫ ጥያቄ!</b>\n\n` +
        `👤 ስም: ${firstName}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `📱 ስልክ: ${userPhone}\n` +
        `💬 መልዕክት:\n<code>${text}</code>\n\n` +
        `ገንዘብ ለመጨመር:\n/addbalance ${userId} [የብር_መጠን]`,
        { parse_mode: 'HTML' }
    ).catch(err => console.log('አድሚን ጋር መላክ አልተቻለም'));

    return ctx.reply(
        "✅ የክፍያ ማረጋገጫዎ ደርሷል! አድሚኑ በማጣራት አካውንትዎ ላይ የብር መጠን ይጨምራል።",
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 PLAY BINGO NOW', WEB_APP_URL)]
            ])
        }
    );
});

// 8. Admin: /users
bot.command('users', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID.toString()) {
        return ctx.reply("ይህንን ትዕዛዝ መጠቀም የሚችሉት አድሚኑ ብቻ ናቸው!");
    }

    const users = loadUsers();
    let message = `👥 <b>አጠቃላይ ተጠቃሚዎች:</b> `;
    
    if (Array.isArray(users)) {
        message += `${users.length}\n\n`;
        for (let u of users) {
            message += `👤 ${u.firstName || 'ተጠቃሚ'} - ID: <code>${u.telegram_id || u.id}</code> - 📱 ${u.phone || 'ስልክ የለም'} - 💰 ${u.balance || 0} ETB\n`;
        }
    } else {
        const userIds = Object.keys(users);
        message += `${userIds.length}\n\n`;
        for (let id of userIds) {
            let u = users[id];
            message += `👤 ${u.firstName} - ID: <code>${id}</code> - 📱 ${u.phone || 'ስልክ የለም'} - 💰 ${u.balance || 0} ETB\n`;
        }
    }

    return ctx.reply(message, { parse_mode: 'HTML' });
});

// 9. Admin: /addbalance
const handleAddBalance = (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_TELEGRAM_ID.toString()) {
        return ctx.reply("❌ አልተሳካም! አድሚን ብቻ ናቸው!");
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply("❌ አልተሳካም! አጠቃቀም: /addbalance <የተጠቃሚ_ID_ወይም_ስልክ> <መጠን>");
    }

    const targetIdentifier = args[1];
    const amount = parseFloat(args[2]);

    if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❌ አልተሳካም! ትክክለኛ የብር መጠን ያስገቡ!");
    }

    const users = loadUsers();
    let targetUserId = null;

    if (Array.isArray(users)) {
        let targetUser = users.find(u => String(u.telegram_id) === String(targetIdentifier) || String(u.id) === String(targetIdentifier) || String(u.phone) === String(targetIdentifier));
        if (targetUser) {
            targetUserId = targetUser.telegram_id || targetUser.id;
            targetUser.balance = (targetUser.balance || 0) + amount;
        }
    } else {
        for (let id of Object.keys(users)) {
            if (id === targetIdentifier || users[id].phone === targetIdentifier) {
                targetUserId = id;
                users[targetUserId].balance = (users[targetUserId].balance || 0) + amount;
                break;
            }
        }
    }

    if (!targetUserId) {
        return ctx.reply("❌ አልተሳካም! ተጠቃሚው በሲስተሙ አልተገኘም!");
    }

    try {
        saveUsers(users);

        let finalUsers = loadUsers();
        let updatedBalance = 0;
        if (Array.isArray(finalUsers)) {
            let u = finalUsers.find(user => String(user.telegram_id) === String(targetUserId));
            updatedBalance = u ? u.balance : 0;
        } else {
            updatedBalance = finalUsers[targetUserId]?.balance || 0;
        }

        addTransaction(targetUserId, 'deposit', amount, 'በአድሚን የተጫነ (/addbalance)');

        ctx.reply(
            `✅ <b>ገቢ ተደርጓል!</b>\n\n` +
            `👤 ID: <code>${targetUserId}</code>\n` +
            `💰 የተጨመረው: <b>${amount} ETB</b>\n` +
            `💳 ቀሪ ሂሳብ: <b>${updatedBalance} ETB</b>`,
            { parse_mode: 'HTML' }
        );

        bot.telegram.sendMessage(
            targetUserId,
            `💳 <b>የብር ተቀማጭ ተሳክቷል!</b>\n\n<b>${amount} ETB</b> ተጨምሯል።\nቀሪ ሂሳብዎ: <b>${updatedBalance} ETB</b> ነው።`,
            { parse_mode: 'HTML' }
        ).catch(err => console.log('ተጠቃሚው ቦቱን አገድዶታል'));

    } catch (error) {
        return ctx.reply("❌ አልተሳካም! ስህተት አጋጥሟል።");
    }
};

bot.command('addbalance', handleAddBalance);
bot.command('add', handleAddBalance);

bot.launch();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});