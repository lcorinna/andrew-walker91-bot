const axios = require("axios");
const fs = require("fs");
const path = require("path");

const validYesForms = new Set([
  "да", "Да", "ДА", "дА", "da", "Da", "DA", "dA",
  "дa", "Дa", "ДA", "дA", "dа", "Dа", "DА", "dА",
]);

async function handleMessage(msg, isEdit = false, dependencies) {
  const { bot, token, statsCache, imageFiles, imageDir } = dependencies;

  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const rawText = msg.text || msg.caption || "";
  const cleanedText = rawText.trim();

  // Реакция: инициализация счётчика
  if (!statsCache.reactionCounters[chatId]) {
    statsCache.reactionCounters[chatId] = {
      current: 0,
      target: Math.floor(Math.random() * 201) + 100,
    };
  }

  // Увеличиваем счётчик
  const counter = statsCache.reactionCounters[chatId];
  counter.current++;

  // Если пора ставить реакцию
  if (counter.current >= counter.target) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${token}/setMessageReaction`,
        {
          chat_id: chatId,
          message_id: messageId,
          reaction: [{ type: "emoji", emoji: "💘" }],
        },
      );
      console.log(
        `💘 Реакция поставлена в чате ${chatId} (сообщение ${messageId})`,
      );
    } catch (err) {
      console.error(`❌ Ошибка при установке реакции: ${err.message}`);
    }
    counter.current = 0;
    counter.target = Math.floor(Math.random() * 201) + 100;
  }

  // Реакция на "да". Если нет совпадения — просто выходим
  if (!validYesForms.has(cleanedText)) {
    return;
  }

  const replyOptions = { reply_to_message_id: messageId };

  // Обновляем кэш статистики (он сохранится сам)
  statsCache.triggerCount += 1;

  if (!statsCache.chats[chatId]) {
    const chatName =
      msg.chat.title ||
      msg.chat.username ||
      `${msg.chat.first_name || ""} ${msg.chat.last_name || ""}`.trim() ||
      "Без названия";

    statsCache.chats[chatId] = chatName;
  }

  // Отправка ответа: пизда / pizda / картинка / аудио
  try {
    const options = ["пизда", "pizda", ...imageFiles];
    const randomChoice = options[Math.floor(Math.random() * options.length)];

    if (typeof randomChoice === "string" && imageFiles.includes(randomChoice)) {
      const mediaPath = path.join(imageDir, randomChoice);

      if (/\.mp4$/i.test(randomChoice)) {
        // Эксклюзивное правило для pizda41.mp4
        if (randomChoice === "pizda41.mp4") {
          const isWithSound = Math.random() > 0.5; // Шанс 50%

          if (isWithSound) {
            await bot.sendVideo(
              chatId,
              fs.createReadStream(mediaPath),
              replyOptions,
            );
          } else {
            await bot.sendAnimation(
              chatId,
              fs.createReadStream(mediaPath),
              replyOptions,
            );
          }
        } else {
          // Для всех остальных mp4
          await bot.sendAnimation(
            chatId,
            fs.createReadStream(mediaPath),
            replyOptions,
          );
        }
      } else if (/\.(mp3|ogg)$/i.test(randomChoice)) {
        // Голосовое сообщение
        await bot.sendVoice(
          chatId,
          fs.createReadStream(mediaPath),
          replyOptions,
        );
      } else {
        // Картинка
        await bot.sendPhoto(
          chatId,
          fs.createReadStream(mediaPath),
          replyOptions,
        );
      }
    } else {
      await bot.sendMessage(chatId, randomChoice, replyOptions);
    }

    if (isEdit) {
      console.log(`🔄 Сработал на редактированное сообщение в чате ${chatId}`);
    }
  } catch (error) {
    console.error("❌ Ошибка при ответе:", error.message);
  }
}

// Экспортируем функцию для использования в index.js
module.exports = handleMessage;
