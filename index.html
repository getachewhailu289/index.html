import random
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

# ተሳታፊዎችን ለመመዝገብ የሚያገለግል ሊስት
participants = set()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("እንኳን ወደ ሎተሪ ቦት በሰላም መጡ! ለመመዝገብ /join ይጫኑ።")

async def join(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    participants.add(user.first_name)
    await update.message.reply_text(f"{user.first_name} በተሳካ ሁኔታ ተመዝግበዋል!")

async def draw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # ዕጣ ለማውጣት (ይህንን ማዘዝ ያለበት አድሚኑ ብቻ መሆን አለበት)
    if not participants:
        await update.message.reply_text("ምንም ተሳታፊ የለም!")
        return
    winner = random.choice(list(participants))
    await update.message.reply_text(f"🎉 እንኳን ደስ አለዎት! የዕጣው አሸናፊ፡ {winner} ነው! 🎉")

def main():
    # በ BotFather ያገኙትን Token እዚህ ያስገቡ
    app = Application.builder().token("YOUR_BOT_TOKEN_HERE").build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("join", join))
    app.add_handler(CommandHandler("draw", draw))
    
    app.run_polling()

if __name__ == '__main__':
    main()