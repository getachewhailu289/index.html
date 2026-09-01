const { Telegraf, Markup } = require('telegraf');

// እዚህ ጋር የቦትዎን ቶከን (Token) ያስገቡ
const bot = new Telegraf('YOUR_BOT_TOKEN_HERE');

// ሚኒ አፑን ያስቀመጡበትን ሊንክ (URL) እዚህ ያስገቡ (ለምሳሌ በ Vercel ወይም GitHub Pages የጫኑት ሊንክ)
const WEB_APP_URL = 'https://your-mini-app-domain.com/index.html';

// ሜኑ ትዕዛዞችን በቦቱ ላይ መመዝገብ
bot.telegram.setMyCommands([
  { command: 'play', description: 'Play 🎮' },
  { command: 'balance', description: 'My balance' },
  { command: 'deposit', description: 'Deposit' },
  { command: 'withdraw', description: 'Withdraw' },
  { command: 'history', description: 'Transaction history' }
]);

// /start ትዕዛዝ
bot.start((ctx) => {
  ctx.reply('🎉 ወደ  ጥሩው የቢንጎ ጨዋታ እንኳን መጡ!\n\nጨዋታውን ለመጀመር ከታች ያለውን ሜኑ ይጠቀሙ ወይም /play ይጫኑ።');
});

// 1. Play 🎮 (/play) - በቀጥታ ሚኒ አፑን የሚከፍት ቁልፍ
bot.command('play', (ctx) => {
  ctx.reply('🎮 ጌሙን ለመጫወት ከታች ያለውን ሰማያዊ ቁልፍ ይጫኑ:', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎮 GoodBingo ጨዋታውን ጀምር', web_app: { url: WEB_APP_URL } }
        ]
      ]
    }
  });
});

// 2. My balance (/balance)
bot.command('balance', (ctx) => {
  ctx.reply('💰 የእርስዎ የአሁኑ ቀሪ ሂሳብ: 0.00 ETB');
});

// 3. Deposit (/deposit)
bot.command('deposit', (ctx) => {
  ctx.reply('💳 ገንዘብ ለማስገባት (Deposit) የቴሌብር ቁጥራችን: 0912345678\nከጨረሱ በኋላ ደረሰኙን ይላኩ።');
});

// 4. Withdraw (/withdraw)
bot.command('withdraw', (ctx) => {
  ctx.reply('📤 ገንዘብ ለማውጣት (Withdraw) የሚፈልጉትን መጠን ይጻፉ (ለምሳሌ: /withdraw 100)');
});

// 5. Transaction history (/history)
bot.command('history', (ctx) => {
  logHistory = "📜 እስካሁን የተደረጉ የንግድ ልውውጦች የሉም።";
  ctx.reply(logHistory);
});

bot.launch();
console.log('ቦቱ በትክክል እየሰራ ነው...');