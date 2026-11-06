import { Bot } from "grammy";
import { config } from "./config.js";
import { respond } from "./agent/orchestrator.js";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

bot.command("start", async (ctx) => {
  await ctx.reply("Hello! I'm NallyHermes. What can I help you with?");
});

bot.on("message:text", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  try {
    const answer = await respond([], ctx.message.text);
    await ctx.reply(answer);
  } catch (error) {
    console.error("Agent request failed:", error);
    await ctx.reply("I ran into a problem processing that. Please try again shortly.");
  }
});

bot.catch((error) => {
  console.error("Telegram bot error:", error);
});

console.info("Starting NallyHermes...");
await bot.start();
