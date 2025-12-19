const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express'); // Добавляем express

// Настройки из переменных окружения (Environment Variables)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const UPDATE_INTERVAL = 60000; 

const bot = new Telegraf(BOT_TOKEN);
const app = express(); // Создаем mini-сайт

// Чтобы Render не выдавал ошибку, бот должен отвечать на порту
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Crypto Bot is live!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

let messageId = null;

async function getCryptoData() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
            params: {
                vs_currency: 'usd',
                order: 'market_cap_desc',
                per_page: 10,
                page: 1,
                sparkline: false,
                price_change_percentage: '24h'
            }
        });
        return response.data;
    } catch (error) {
        console.error('API Error:', error.message);
        return null;
    }
}

function formatMessage(data) {
    let text = `📊 **ТОП-10 Криптовалют (USD)**\n\n`;
    data.forEach((coin, index) => {
        const price = coin.current_price.toLocaleString('en-US', { minimumFractionDigits: 2 });
        const change = coin.price_change_percentage_24h?.toFixed(2) || '0.00';
        const emoji = change >= 0 ? '📈' : '📉';
        text += `${index + 1}. **${coin.symbol.toUpperCase()}**: $${price} (${emoji} ${change}%)\n`;
    });
    
    // Теперь время отображается по Киеву
    text += `\n🔄 _Обновлено: ${new Date().toLocaleTimeString('ru-RU', {timeZone: 'Europe/Kyiv'})}_`;
    return text;
}

async function updatePost() {
    const data = await getCryptoData();
    if (!data) return;
    const messageText = formatMessage(data);

    try {
        if (!messageId) {
            const sentMsg = await bot.telegram.sendMessage(CHANNEL_ID, messageText, { parse_mode: 'Markdown' });
            messageId = sentMsg.message_id;
        } else {
            await bot.telegram.editMessageText(CHANNEL_ID, messageId, null, messageText, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        if (e.description && e.description.includes("message to edit not found")) messageId = null;
        console.log('Update status: handled');
    }
}

setInterval(updatePost, UPDATE_INTERVAL);
bot.launch();

// Вежливая остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));