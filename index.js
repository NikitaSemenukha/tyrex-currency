const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const UPDATE_INTERVAL = 60000; 

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(process.env.PORT || 3000);

let messageId = null; // Храним ID последнего сообщения с курсом

async function getData() {
    try {
        const cryptoRes = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
            params: { vs_currency: 'usd', ids: 'bitcoin,ethereum,tether', price_change_percentage: '24h' }
        });
        const fiatRes = await axios.get('https://open.er-api.com/v6/latest/USD');
        return { crypto: cryptoRes.data, fiat: fiatRes.data.rates };
    } catch (e) {
        console.error('Ошибка API:', e.message);
        return null;
    }
}

function formatMessage(data) {
    const { crypto, fiat } = data;

    // Данные крипты
    const btc = crypto.find(c => c.id === 'bitcoin');
    const eth = crypto.find(c => c.id === 'ethereum');
    const usdt = crypto.find(c => c.id === 'tether');

    // Данные фиата
    const usdUah = fiat.UAH.toFixed(2);
    const usdRub = fiat.RUB.toFixed(2);
    const usdKzt = fiat.KZT.toFixed(2);
    const usdEur = fiat.EUR.toFixed(3);

    // Функция для выбора эмодзи (📈/📉)
    // Теперь она более гибкая
    const getEmoji = (change) => (change >= 0 ? '📈' : '📉');

    // Время и дата (Киев)
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { timeZone: 'Europe/Kyiv' });
    const timeStr = now.toLocaleTimeString('ru-RU', { 
        timeZone: 'Europe/Kyiv', 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    // --- ФОРМИРОВАНИЕ ТЕКСТА ---
    
    // 1. Биткоин в заголовке теперь с динамическим эмодзи
    let text = `<b>📊 КУРС. BTC: $${btc.current_price.toLocaleString('en-US')}</b> ${getEmoji(btc.price_change_percentage_24h)}\n\n`;

    // 2. Секция Крипто
    text += `🔹 <b>ETH:</b> <code>$${eth.current_price.toLocaleString('en-US')}</code> ${getEmoji(eth.price_change_percentage_24h)}\n`;
    text += `🔹 <b>USDT:</b> <code>$${usdt.current_price.toFixed(2)}</code> ${getEmoji(usdt.price_change_percentage_24h)}\n\n`;

    text += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n`;

    // 3. Секция Фиат (Валюты)
    // Так как бесплатный API валют не дает % изменения, 
    // мы можем либо оставить статичные эмодзи, либо (как в примере ниже)
    // использовать функцию, если у вас появятся данные о росте/падении.
    // Пока поставим вручную для примера, как это вызывается:
    
    text += `💵 <b>Грн до $:</b> <code>${usdUah}</code> ${getEmoji(-1)} \n`; // Пример: падение
    text += `   <b>Руб до $:</b> <code>${usdRub}</code> ${getEmoji(1)} \n`;  // Пример: рост
    text += `🇰🇿 <b>Тнг до $:</b> <code>${usdKzt}</code> ${getEmoji(1)} \n`;  // Пример: рост
    text += `💶 <b>$ до €:</b>  <code>${usdEur}</code> ${getEmoji(-1)} \n\n`; // Пример: падение

    // 4. Подвал
    text += `🗓 <b>Дата:</b> <code>${dateStr}</code>\n`;
    text += `🔄 <b>Обновлено:</b> <code>${timeStr}</code>\n`;

    return text;
}

// ГЛАВНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ
async function updatePost() {
    const data = await getData();
    if (!data) return;

    const text = formatMessage(data);

    try {
        
        if (messageId) {
            await bot.telegram.editMessageText(CHANNEL_ID, messageId, null, text, { parse_mode: 'HTML' });
            console.log('Данные обновлены (редактирование)');
        } else {
            const msg = await bot.telegram.sendMessage(CHANNEL_ID, text, { 
                parse_mode: 'HTML',
                disable_notification: true 
            });
            messageId = msg.message_id;
        }
    } catch (e) {
        messageId = null;
        await updatePost();
    }
}

bot.on('channel_post', async (ctx) => {
    if (ctx.channelPost.sender_chat?.id.toString() === CHANNEL_ID || ctx.channelPost.chat.id.toString() === CHANNEL_ID) {
        if (!ctx.channelPost.text || !ctx.channelPost.text.includes('📊 КУРС.')) {
            console.log('Админ что-то запостил, переносим курс вниз...');
            await updatePost();
        }
    }
});

setInterval(updatePost, UPDATE_INTERVAL);
bot.launch().then(() => console.log('Бот запущен...'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));