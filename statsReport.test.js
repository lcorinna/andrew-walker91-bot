const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildStatsReport, createStatsHandler } = require("./statsReport");

test("refreshes old groups and includes chats known only to reaction counters", async () => {
  const stats = {
    triggerCount: 561,
    chats: { "-1001976907668": "reWorked: Москва", "42": "Личный чат" },
    reactionCounters: { "-1001976907668": {}, "-20": {}, "42": {}, "43": {} },
  };
  const original = JSON.stringify(stats);
  const requested = [];
  const bot = {
    async getChat(id) {
      requested.push(id);
      return id === "-1001976907668"
        ? { title: "Реворк: Москва", username: "moscow_meetup", description: "Встречи разработчиков" }
        : { title: "Другая группа" };
    },
    async getChatMemberCount() { return 867; },
  };
  const report = (await buildStatsReport(bot, stats)).join("\n");
  assert.deepEqual(requested.sort(), ["-1001976907668", "-20"]);
  assert.match(report, /Известных чатов за всё время: 4/);
  assert.match(report, /Групп и каналов: 2/);
  assert.match(report, /Личных чатов: 2/);
  assert.match(report, /Реворк: Москва/);
  assert.match(report, /https:\/\/t.me\/moscow_meetup/);
  assert.match(report, /Участников: 867/);
  assert.match(report, /Встречи разработчиков/);
  assert.equal(JSON.stringify(stats), original, "report must not change the saved snapshot");
});

test("keeps partial results and continues when individual chats are inaccessible", async () => {
  const bot = {
    async getChat(id) {
      if (id === "-1") throw new Error("chat not found");
      if (id === "-2") return { title: "Публичная", active_usernames: ["public_group"] };
      return { title: "Закрытая", invite_link: "https://t.me/+private-invite" };
    },
    async getChatMemberCount(id) {
      if (id === "-2") throw new Error("count unavailable");
      return id === "-1" ? 12 : 0;
    },
  };
  const report = (await buildStatsReport(bot, {
    chats: { "-1": "Старое название", "-2": "Старое публичное", "-3": "Закрытая" },
  })).join("\n");
  assert.match(report, /Старое название\nID: -1\n👥 Участников: 12\n⚠️/);
  assert.match(report, /Публичная\nID: -2\n👥 Участников: недоступно/);
  assert.match(report, /https:\/\/t.me\/public_group/);
  assert.match(report, /Закрытая\nID: -3\n👥 Участников: 0\n🔗 Публичной ссылки нет/);
  assert.doesNotMatch(report, /private-invite/);
});

test("splits large reports within Telegram limits without breaking group cards", async () => {
  const chats = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`-${i + 1}`, `Группа ${i}`]));
  const bot = {
    async getChat(id) { return { title: `Группа ${id}`, description: "🦥".repeat(512) }; },
    async getChatMemberCount() { return 100; },
  };
  const pages = await buildStatsReport(bot, { chats });
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length <= 4000));
  for (const id of Object.keys(chats)) {
    assert.equal(pages.filter((page) => page.includes(`ID: ${id}\n👥 Участников: 100`)).length, 1);
  }
});

test("finishes the report even when Telegram requests never settle", async () => {
  const bot = {
    getChat() { return new Promise(() => {}); },
    getChatMemberCount() { return new Promise(() => {}); },
  };
  const report = (await buildStatsReport(bot, { chats: { "-1": "Сохранённая группа" } }, {
    requestTimeoutMs: 10,
  })).join("\n");
  assert.match(report, /Сохранённая группа/);
  assert.match(report, /Участников: недоступно/);
  assert.match(report, /Telegram не предоставил сведения/);
});

test("only the admin in a private chat can request group information", async () => {
  const sent = [];
  let requests = 0;
  const bot = {
    async sendMessage(...args) { sent.push(args); },
    async getChat() { requests++; return { title: "Группа" }; },
    async getChatMemberCount() { return 10; },
  };
  const handler = createStatsHandler({ bot, statsCache: { chats: { "-1": "Группа" } }, adminId: 42 });
  await handler({ from: { id: 41 }, chat: { id: 41, type: "private" } });
  await handler({ from: { id: 42 }, chat: { id: -1, type: "supergroup" } });
  assert.equal(sent.length, 0);
  assert.equal(requests, 0);
  await handler({ from: { id: 42 }, chat: { id: 42, type: "private" } });
  assert.equal(requests, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1][0], 42);
  assert.match(sent[1][1], /Участников: 10/);
  assert.deepEqual(sent[1][2], { disable_web_page_preview: true });
});

test("an empty snapshot returns a useful summary without querying Telegram", async () => {
  const pages = await buildStatsReport({}, { triggerCount: 0, chats: {}, reactionCounters: {} });
  assert.equal(pages.length, 1);
  assert.match(pages[0], /Срабатываний: 0/);
  assert.match(pages[0], /Известных чатов за всё время: 0/);
});
