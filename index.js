require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Загружаем все изображения из папки /images
const imageDir = path.join(__dirname, 'images');
const imageFiles = fs.readdirSync(imageDir).filter(file => /\.(jpg|png|jpeg|gif)$/i.test(file));

// Обработка команды /start
bot.onText(/^\/start$/, (msg) => {
  if (msg.chat.type === 'private') {
    const chatId = msg.chat.id;
    const intro = "👋 Привет! Я бот в стиле @andrew_walker91. Добавь меня в группу, и я буду реагировать на слово 'да' 👀";
    bot.sendMessage(chatId, intro);
  }
});

// Основная логика ответа на "да" или "da"
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();

  // Проверка: "да" или "da" — только как отдельное слово
  if (/^(да|da)$/i.test(text)) {
    const replyOptions = {
      reply_to_message_id: msg.message_id
    };

    // Выбираем случайный ответ: либо текст, либо изображение
    const random = Math.random();

    if (random < 0.5 || imageFiles.length === 0) {
      bot.sendMessage(chatId, 'пизда', replyOptions);
    } else {
      const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
      const imagePath = path.join(imageDir, randomImage);
      bot.sendPhoto(chatId, fs.createReadStream(imagePath), replyOptions);
    }
  }
});
