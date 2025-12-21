const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

// Настройки из переменных окружения Render
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const UPDATE_INTERVAL = 60000; // 1 минута

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Веб-сервер для Render (чтобы не засыпал)
app.get('/', (req, res) => res.send('Crypto Bot is Alive!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server started'));

let messageId = null; // Храним ID текущего сообщения с курсом

// 1. Получение данных
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

// 2. Форматирование текста
function formatMessage(data) {
    const { crypto, fiat } = data;

    const btc = crypto.find(c => c.id === 'bitcoin');
    const eth = crypto.find(c => c.id === 'ethereum');
    const usdt = crypto.find(c => c.id === 'tether');

    const usdUah = fiat.UAH.toFixed(2);
    const usdRub = fiat.RUB.toFixed(2);
    const usdKzt = fiat.KZT.toFixed(2);
    const usdEur = fiat.EUR.toFixed(3);

    const getEmoji = (change) => (change >= 0 ? '📈' : '📉');

    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { timeZone: 'Europe/Kyiv' });
    const timeStr = now.toLocaleTimeString('ru-RU', { 
        timeZone: 'Europe/Kyiv', 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    let text = `<b>📊 КУРС. BTC: $${btc.current_price.toLocaleString('en-US')}</b> ${getEmoji(btc.price_change_percentage_24h)}\n\n`;

    text += `🔹 <b>ETH:</b> <code>$${eth.current_price.toLocaleString('en-US')}</code> ${getEmoji(eth.price_change_percentage_24h)}\n`;
    text += `🔹 <b>USDT:</b> <code>$${usdt.current_price.toFixed(2)}</code> ${getEmoji(usdt.price_change_percentage_24h)}\n\n`;

    text += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n`;

    text += `💵 <b>Грн до $:</b> <code>${usdUah}</code> 📉\n`; 
    text += `💵 <b>Руб до $:</b> <code>${usdRub}</code> 📈\n`; 
    text += `🇰🇿 <b>Тнг до $:</b> <code>${usdKzt}</code> 📈\n`; 
    text += `💶 <b>$ до €:</b>  <code>${usdEur}</code> 📉\n\n`; 

    text += `🗓 <b>Дата:</b> <code>${dateStr}</code>\n`;
    text += `🔄 <b>Обновлено:</b> <code>${timeStr}</code>\n`;

    return text;
}

// 3. Основная функция обновления
async function updatePost(forceResend = false) {
    const data = await getData();
    if (!data) return;

    const text = formatMessage(data);

    try {
        // Если нужно переотправить (например, админ что-то написал выше)
        if (forceResend && messageId) {
            try { await bot.telegram.deleteMessage(CHANNEL_ID, messageId); } catch(e) {}
            messageId = null;
        }

        if (messageId) {
            // Если пост уже есть и он последний - просто редактируем
            await bot.telegram.editMessageText(CHANNEL_ID, messageId, null, text, { parse_mode: 'HTML' });
            console.log('Пост отредактирован');
        } else {
            // Если поста нет - отправляем новый
            const msg = await bot.telegram.sendMessage(CHANNEL_ID, text, { 
                parse_mode: 'HTML',
                disable_notification: true 
            });
            messageId = msg.message_id;
            console.log('Отправлен новый пост');
        }
    } catch (e) {
        console.log('Ошибка обновления, пробуем переотправить...');
        messageId = null;
        // Если это была ошибка редактирования, в следующий раз отправит новый
    }
}

// 4. Слежка за новыми постами админа
bot.on('channel_post', async (ctx) => {
    const chatId = String(ctx.channelPost.chat.id);
    const configId = String(CHANNEL_ID);

    // Если пост в нашем канале и это НЕ наш бот обновился
    if (chatId === configId) {
        const text = ctx.channelPost.text || "";
        if (!text.includes('📊 КУРС.')) {
            console.log('Админ опубликовал пост. Переносим курс вниз...');
            await updatePost(true); // Вызываем принудительную переотправку
        }
    }
});

// Запуск цикла
setInterval(() => updatePost(false), UPDATE_INTERVAL);

// Первый запуск при старте скрипта
bot.launch().then(() => {
    console.log('Бот запущен!');
    updatePost(false);
});

// Вежливое выключение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));