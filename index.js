const cron = require('node-cron');
const express = require('express');
const app = express();
const axios = require('axios');

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
// TODO: .env мб?
const ADMIN_ID = 271223425;

// Express-сервер для Render
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Пути
const imageDir = path.join(__dirname, 'images');
const statsPath = path.join(__dirname, 'stats.json');

// Загрузка изображений
const imageFiles = fs.existsSync(imageDir)
  ? fs.readdirSync(imageDir).filter(file => /\.(jpg|jpeg|png|gif|mp4)$/i.test(file))
  : [];

// Работа со статистикой
function loadStats() {
  if (!fs.existsSync(statsPath)) return { triggerCount: 0, chats: {}, reactionCounters: {} };
  const data = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
  if (!data.reactionCounters) data.reactionCounters = {};
  return data;
}

function saveStats(stats) {
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}

// /start — только в личке
bot.onText(/^\/start$/, (msg) => {
  if (msg.chat.type === 'private') {
    const intro = `👋 Привет! Я бот в стиле @andrew_walker91.
    📢 Добавь меня в группу — и я буду отвечать на каждое сообщение с "да" 👀
    💘 А ещё я умею ставить реакции:
    Каждое случайное *N*-ое сообщение (от 100 до 500) получает реакцию 💘.
    ⚠️ Чтобы реакции работали, сделай меня админом в группе (иначе Telegram не разрешит их ставить).`;
    bot.sendMessage(msg.chat.id, intro);
  }
});

// /about — инфо об авторе
bot.onText(/^\/about$/, (msg) => {
  if (msg.chat.type === 'private') {
    const message = `👤 Автор: @gaydaychuk\n💬 Нашли баг? Есть идеи? Пишите в личку!`;
    bot.sendMessage(msg.chat.id, message);
  }
});

// /stats — только для админа в личке
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

// Основная логика (вынесена в отдельную функцию)
async function handleMessage(msg, isEdit = false) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const rawText = msg.text || '';
  const cleanedText = rawText.trim();

  const validYesForms = new Set([
    'да', 'Да', 'ДА', 'дА',
    'da', 'Da', 'DA', 'dA',
    'дa', 'Дa', 'ДA', 'дA',
    'dа', 'Dа', 'DА', 'dА'
  ]);

  const stats = loadStats();

  // Реакция: инициализация счётчика
  if (!stats.reactionCounters) stats.reactionCounters = {};
  if (!stats.reactionCounters[chatId]) {
    stats.reactionCounters[chatId] = {
      current: 0,
      target: Math.floor(Math.random() * 201) + 100
    };
  }

  // Увеличиваем счётчик
  const counter = stats.reactionCounters[chatId];
  counter.current++;

  // Если пора ставить реакцию
  if (counter.current >= counter.target) {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/setMessageReaction`, {
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: "emoji", emoji: "💘" }]
      });
      console.log(`💘 Реакция поставлена в чате ${chatId} (сообщение ${messageId})`);
    } catch (err) {
      console.error(`❌ Ошибка при установке реакции: ${err.message}`);
    }
    counter.current = 0;
    counter.target = Math.floor(Math.random() * 201) + 100;
  }

  // Реакция на "да"
  if (!validYesForms.has(cleanedText)) {
    saveStats(stats);
    return;
  }

  const replyOptions = messageId ? { reply_to_message_id: messageId } : {};

  stats.triggerCount += 1;

  if (!stats.chats[chatId]) {
    const chatName =
      msg.chat.title ||
      msg.chat.username ||
      `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`.trim() ||
      'Без названия';

    stats.chats[chatId] = chatName;
  }

  saveStats(stats);

  // Отправка ответа: пизда / pizda / картинка
  try {
    const options = ['пизда', 'pizda', ...imageFiles];
    const randomChoice = options[Math.floor(Math.random() * options.length)];

    if (typeof randomChoice === 'string' && imageFiles.includes(randomChoice)) {
      const mediaPath = path.join(imageDir, randomChoice);

      if (/\.mp4$/i.test(randomChoice)) {
        await bot.sendAnimation(chatId, fs.createReadStream(mediaPath), replyOptions);
      } else {
        await bot.sendPhoto(chatId, fs.createReadStream(mediaPath), replyOptions);
      }
    } else {
      await bot.sendMessage(chatId, randomChoice, replyOptions);
    }

    if (isEdit) {
      console.log(`🔄 Сработал на редактированное сообщение в чате ${chatId}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при ответе:', error.message);
  }
}

// Новые сообщения
bot.on('message', (msg) => {
  handleMessage(msg, false);
});

// Редактированные сообщения
bot.on('edited_message', (msg) => {
  handleMessage(msg, true);
});

// 🗓️ Отправка stats.json каждое воскресенье в 4:00 UTC
cron.schedule('0 4 * * 0', () => {
  const filePath = path.join(__dirname, 'stats.json');
  if (fs.existsSync(filePath)) {
    bot.sendDocument(ADMIN_ID, filePath, {
      caption: '📦 Еженедельная статистика'
    });
  }
});
