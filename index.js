const cron = require('node-cron');
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const ADMIN_ID = 271223425; // ← твой Telegram user ID

// Пути
const imageDir = path.join(__dirname, 'images');
const statsPath = path.join(__dirname, 'stats.json');

// Загрузка изображений
const imageFiles = fs.readdirSync(imageDir).filter(file => /\.(jpg|png|jpeg|gif)$/i.test(file));

// Работа со статистикой
function loadStats() {
  if (!fs.existsSync(statsPath)) {
    return { triggerCount: 0, chats: {} };
  }
  return JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
}

function saveStats(stats) {
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}

// /start — только в личке
bot.onText(/^\/start$/, (msg) => {
  if (msg.chat.type === 'private') {
    const chatId = msg.chat.id;
    const intro = "👋 Привет! Я бот в стиле @andrew_walker91. Добавь меня в группу, и я буду реагировать на слово 'да' 👀\n\nℹ️ Напиши /about, чтобы узнать об авторе.";
    bot.sendMessage(chatId, intro);
  }
});

// /about — инфо об авторе
bot.onText(/^\/about$/, (msg) => {
  if (msg.chat.type === 'private') {
    const chatId = msg.chat.id;
    const message = `👤 Автор: @gaydaychuk\n💬 Нашли баг? Есть идеи? Пишите в личку!`;
    bot.sendMessage(chatId, message);
  }
});

// /stats — только для админа и только в личке
bot.onText(/^\/stats$/, (msg) => {
  if (msg.from.id !== ADMIN_ID || msg.chat.type !== 'private') return;

  const stats = loadStats();
  const lines = Object.entries(stats.chats).map(([id, name]) => `• ${name} (${id})`);

  const text = `📊 Статистика:
Сработал: ${stats.triggerCount} раз
Чатов: ${lines.length}

📋 Список чатов:
${lines.join('\n')}`;

  bot.sendMessage(msg.chat.id, text);
});

// Основная логика ответа на "да" или "da"
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();

  if (/^(да|da)$/i.test(text)) {
    const replyOptions = {
      reply_to_message_id: msg.message_id
    };

    // Отправка ответа
    const random = Math.random();
    if (random < 0.5 || imageFiles.length === 0) {
      bot.sendMessage(chatId, 'пизда', replyOptions);
    } else {
      const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
      const imagePath = path.join(imageDir, randomImage);
      bot.sendPhoto(chatId, fs.createReadStream(imagePath), replyOptions);
    }

    // Обновление статистики
    const stats = loadStats();
    stats.triggerCount += 1;

    if (!stats.chats[chatId]) {
      const chatName =
        msg.chat.title || // группы
        msg.chat.username || // юзернейм в личке
        `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`.trim() || // имя
        'Без названия';

      stats.chats[chatId] = chatName;
    }

    saveStats(stats);
  }
});

// 🗓️ Отправка stats.json каждое воскресенье в 11:00 (UTC)
cron.schedule('0 11 * * 0', () => {
  const filePath = path.join(__dirname, 'stats.json');
  if (fs.existsSync(filePath)) {
    bot.sendDocument(ADMIN_ID, filePath, {
      caption: '📦 Еженедельная статистика'
    });
  }
});
