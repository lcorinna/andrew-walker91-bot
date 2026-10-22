const MESSAGE_LIMIT = 4000;

async function requestWithTimeout(request, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Telegram request timed out")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function chatName(value) {
  return String(value || "Без названия").replace(/\s+/g, " ").slice(0, 128);
}

function formatGroup({ id, name, chat, memberCount }) {
  const lines = [
    `📌 ${chatName(chat?.title || name)}`,
    `ID: ${id}`,
    `👥 Участников: ${memberCount ?? "недоступно"}`,
  ];

  if (chat) {
    const username = chat.username || chat.active_usernames?.[0];
    lines.push(username ? `🔗 https://t.me/${username}` : "🔗 Публичной ссылки нет");
    lines.push(chat.description ? `📝 ${chat.description.slice(0, 1024)}` : "📝 Описание не задано");
  } else {
    lines.push("⚠️ Telegram не предоставил сведения о группе: возможно, у бота нет доступа.");
  }

  return lines.join("\n");
}

function paginate(blocks) {
  const pages = [];
  let page = "";
  for (const block of blocks) {
    if (page && page.length + 2 + block.length > MESSAGE_LIMIT) {
      pages.push(page);
      page = "";
    }
    page += (page ? "\n\n" : "") + block;
  }
  if (page) pages.push(page);
  return pages;
}

async function buildStatsReport(bot, stats, { requestTimeoutMs = 10000 } = {}) {
  // Include old chats where the bot received messages but never triggered on "да".
  const ids = [...new Set([
    ...Object.keys(stats.chats || {}),
    ...Object.keys(stats.reactionCounters || {}),
  ])];
  const groupIds = ids.filter((id) => Number(id) < 0);
  const privateIds = ids.filter((id) => Number(id) > 0);
  const groups = new Array(groupIds.length);
  let nextIndex = 0;

  // Bound the number of simultaneous Telegram requests for large reports.
  await Promise.all(Array.from({ length: Math.min(3, groupIds.length) }, async () => {
    while (nextIndex < groupIds.length) {
      const index = nextIndex++;
      const id = groupIds[index];
      const [chat, count] = await Promise.allSettled([
        requestWithTimeout(() => bot.getChat(id), requestTimeoutMs),
        requestWithTimeout(() => bot.getChatMemberCount(id), requestTimeoutMs),
      ]);
      groups[index] = {
        id,
        name: stats.chats?.[id],
        chat: chat.status === "fulfilled" ? chat.value : undefined,
        memberCount: count.status === "fulfilled" ? count.value : undefined,
      };
    }
  }));

  groups.sort((a, b) => chatName(a.chat?.title || a.name).localeCompare(
    chatName(b.chat?.title || b.name), "ru",
  ));

  const blocks = [
    `📊 Статистика\nСрабатываний: ${stats.triggerCount || 0}\n` +
    `Известных чатов за всё время: ${ids.length}\n` +
    `Групп и каналов: ${groupIds.length}\nЛичных чатов: ${privateIds.length}\n\n` +
    "Сведения о группах запрошены сейчас. Наличие чата в истории не означает, что бот ещё состоит в нём.",
    ...(groups.length ? ["📋 Группы и каналы", ...groups.map(formatGroup)] : []),
  ];

  const namedPrivateIds = privateIds.filter((id) => stats.chats?.[id]);
  if (namedPrivateIds.length) {
    blocks.push("👤 Личные чаты с зафиксированными срабатываниями");
    for (const id of namedPrivateIds) {
      blocks.push(`• ${chatName(stats.chats[id])} (${id})`);
    }
  }

  return paginate(blocks);
}

function createStatsHandler({ bot, statsCache, adminId }) {
  let running = false;
  return async (msg) => {
    if (msg.from?.id !== adminId || msg.chat.type !== "private" || running) return;
    running = true;
    try {
      await bot.sendMessage(msg.chat.id, "⏳ Собираю актуальные сведения о группах…");
      const pages = await buildStatsReport(bot, statsCache);
      for (const text of pages) {
        await bot.sendMessage(msg.chat.id, text, { disable_web_page_preview: true });
      }
    } catch (error) {
      console.error("Failed to send stats report:", error.code || error.name);
      try {
        await bot.sendMessage(msg.chat.id, "Не удалось отправить статистику. Попробуй /stats ещё раз позже.");
      } catch (sendError) {
        console.error("Failed to send stats error:", sendError.code || sendError.name);
      }
    } finally {
      running = false;
    }
  };
}

module.exports = { buildStatsReport, createStatsHandler };
