const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const UPDATE_INTERVAL = 60000; // 1 минута

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(process.env.PORT || 3000);

let messageId = null;

async function getData() {
    try {
        // 1. Получаем крипту (BTC, ETH, USDT)
        const cryptoRes = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
            params: { vs_currency: 'usd', ids: 'bitcoin,ethereum,tether', price_change_percentage: '24h' }
        });

        // 2. Получаем валюты (USD, EUR, UAH)
        // Используем открытый API (без ключа)
        const fiatRes = await axios.get('https://open.er-api.com/v6/latest/USD');
        
        return {
            crypto: cryptoRes.data,
            fiat: fiatRes.data.rates
        };
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

    // Данные фиата (курсы)
    const usdUah = fiat.UAH.toFixed(2);
    const eurUsd = (1 / fiat.EUR).toFixed(2);
    const eurUah = (fiat.UAH / fiat.EUR).toFixed(2);

    // Функция для выбора эмодзи (📈/📉)
    const getEmoji = (change) => (change >= 0 ? '📈' : '📉');

    // Время и дата
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { timeZone: 'Europe/Kyiv' });
    const timeStr = now.toLocaleTimeString('ru-RU', { 
        timeZone: 'Europe/Kyiv', 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    // --- ФОРМИРОВАНИЕ ТЕКСТА ---
    // Используем HTML разметку <b> - жирный, <code> - моноширинный (для ровных колонок)
    
    let text = `<b>📊 КУРС. BTC: $${btc.current_price.toLocaleString('en-US')}</b>\n\n`;

    // Секция Крипто
    text += `🔹 <b>ETH:</b> <code>$${eth.current_price.toLocaleString('en-US')}</code> ${getEmoji(eth.price_change_percentage_24h)}\n`;
    text += `🔹 <b>USDT:</b> <code>$${usdt.current_price.toFixed(2)}</code> ${getEmoji(usdt.price_change_percentage_24h)}\n\n`;

    text += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n`;

    // Секция Фиат (Валюты)
    text += `💵 <b>Грн до $:</b> <code>${usdUah}</code> 📉\n`;
    text += `💵 <b>$ до €:</b>  <code>${eurUsd}</code> 📈\n`;
    text += `🇪🇺 <b>Грн до €:</b> <code>${eurUah}</code> 📈\n\n`;

    // Подвал
    text += `🗓 <b>Дата:</b> <code>${dateStr}</code>\n`;
    text += `🔄 <b>Обновлено:</b> <code>${timeStr}</code>\n\n`;
    // text += `<i>♻️ курс обновляется каждую минуту</i>`;

    return text;
}

// ВАЖНО: В методах sendMessage и editMessageText замените parse_mode на 'HTML'
async function updatePost() {
    const data = await getData();
    if (!data) return;

    const text = formatMessage(data);

    try {
        if (!messageId) {
            const msg = await bot.telegram.sendMessage(CHANNEL_ID, text, { parse_mode: 'HTML' }); // ТУТ 'HTML'
            messageId = msg.message_id;
        } else {
            await bot.telegram.editMessageText(CHANNEL_ID, messageId, null, text, { parse_mode: 'HTML' }); // И ТУТ 'HTML'
        }
    } catch (e) {
        if (e.description?.includes("message to edit not found")) messageId = null;
    }
}

setInterval(updatePost, UPDATE_INTERVAL);
bot.launch();