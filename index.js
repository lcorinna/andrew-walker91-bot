const cron = require("node-cron");
const express = require("express");
const app = express();
require("dotenv").config();

const requiredEnv = ["BOT_TOKEN", "ADMIN_ID"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing required env variables: ${missingEnv.join(", ")}`);
}

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

// Подключаем вынесенную логику сообщений
const handleMessage = require("./messageHandler");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const ADMIN_ID = Number(process.env.ADMIN_ID);

// Express-сервер для Render
const PORT = process.env.PORT || 3000;
app.get("/", (_req, res) => res.send("Bot is alive!"));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Пути
const imageDir = path.join(__dirname, "images");
const statsPath = path.join(__dirname, "stats.json");

// Загрузка файлов
const imageFiles = fs.existsSync(imageDir)
  ? fs
      .readdirSync(imageDir)
      .filter((file) => /\.(jpg|jpeg|png|gif|mp4|mp3|ogg)$/i.test(file))
  : [];

// Работа со статистикой
function loadStats() {
  if (!fs.existsSync(statsPath))
    return { triggerCount: 0, chats: {}, reactionCounters: {} };
  const data = JSON.parse(fs.readFileSync(statsPath, "utf-8"));
  if (!data.reactionCounters) data.reactionCounters = {};
  return data;
}

function saveStats(stats) {
  try {
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error("❌ Ошибка при сохранении статистики:", err.message);
  }
}

// Загружаем в оперативную память один раз
let statsCache = loadStats();

// Автосохранение раз в 5 минут (не дергает диск на каждое сообщение)
setInterval(
  () => {
    saveStats(statsCache);
  },
  5 * 60 * 1000,
);

// Сохранение при выключении скрипта
process.on("SIGINT", () => {
  saveStats(statsCache);
  process.exit();
});
process.on("SIGTERM", () => {
  saveStats(statsCache);
  process.exit();
});

// --- КОМАНДЫ БОТА ---

// /start — только в личке
bot.onText(/^\/start$/, (msg) => {
  if (msg.chat.type === "private") {
    const intro = `👋 Привет! Я бот в стиле @andrew_walker91.
    📢 Добавь меня в группу — и я буду отвечать на каждое сообщение с "да" 👀
    💘 А ещё я умею ставить реакции:
    Каждое случайное *N*-ое сообщение (от 100 до 300) получает реакцию 💘.
    ⚠️ Чтобы реакции работали, сделай меня админом в группе (иначе Telegram не разрешит их ставить).`;
    bot.sendMessage(msg.chat.id, intro);
  }
});

// /about — инфо об авторе
bot.onText(/^\/about$/, (msg) => {
  if (msg.chat.type === "private") {
    const message = `👤 Автор: @gaydaychuk\n💬 Нашли баг? Есть идеи? Пишите в личку!`;
    bot.sendMessage(msg.chat.id, message);
  }
});

// /stats — только для админа в личке
bot.onText(/^\/stats$/, (msg) => {
  if (msg.from.id !== ADMIN_ID || msg.chat.type !== "private") return;

  const lines = Object.entries(statsCache.chats).map(
    ([id, name]) => `• ${name} (${id})`,
  );

  const text = `📊 Статистика:
Сработал: ${statsCache.triggerCount} раз
Чатов: ${lines.length}

📋 Список чатов:
${lines.join("\n")}`;

  bot.sendMessage(msg.chat.id, text);
});

// --- СЛУШАТЕЛИ СООБЩЕНИЙ ---

// Собираем зависимости, чтобы передать их во второй файл
const botDependencies = { bot, token, statsCache, imageFiles, imageDir };

bot.on("message", (msg) => {
  handleMessage(msg, false, botDependencies);
});

bot.on("edited_message", (msg) => {
  handleMessage(msg, true, botDependencies);
});

// --- CRON ЗАДАЧА ---

// 🗓️ Отправка stats.json в последнее воскресенье месяца в 4:00 UTC
cron.schedule("0 4 * * 0", async () => {
  const today = new Date();

  // Прибавляем неделю: если месяц изменился, значит сегодня последнее воскресенье
  const nextSunday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 7,
  );

  if (today.getMonth() !== nextSunday.getMonth()) {
    if (fs.existsSync(statsPath)) {
      await bot.sendDocument(ADMIN_ID, statsPath, {
        caption: "📦 Статистика за месяц",
      });
    }
  }
});
