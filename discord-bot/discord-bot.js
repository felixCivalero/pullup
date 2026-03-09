import { Client, GatewayIntentBits, Partials } from "discord.js";
import { spawn } from "child_process";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from backend directory
config({ path: resolve(__dirname, "../backend/.env") });

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PROJECT_DIR = resolve(__dirname, "..");

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  console.error(
    "Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID in backend/.env"
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// Track active claude processes so we can abort if needed
const activeProcesses = new Map();

client.once("ready", () => {
  console.log(`Bot online as ${client.user.tag}`);
  console.log(`Listening on channel: ${DISCORD_CHANNEL_ID}`);
  console.log(`Project directory: ${PROJECT_DIR}`);
});

client.on("messageCreate", async (message) => {
  // Ignore bot messages and messages from other channels
  if (message.author.bot) return;
  if (message.channel.id !== DISCORD_CHANNEL_ID) return;

  const prompt = message.content.trim();
  if (!prompt) return;

  // Handle special commands
  if (prompt === "!stop") {
    const proc = activeProcesses.get(message.channel.id);
    if (proc) {
      proc.kill("SIGTERM");
      activeProcesses.delete(message.channel.id);
      await message.reply("Stopped the current Claude process.");
    } else {
      await message.reply("No active process to stop.");
    }
    return;
  }

  if (prompt === "!ping") {
    await message.reply("Pong! Bot is running.");
    return;
  }

  // Show typing indicator
  const typingInterval = setInterval(() => {
    message.channel.sendTyping().catch(() => {});
  }, 5000);
  message.channel.sendTyping().catch(() => {});

  try {
    const response = await runClaude(prompt, message.channel.id);
    clearInterval(typingInterval);

    if (!response || response.trim().length === 0) {
      await message.reply("Claude returned an empty response.");
      return;
    }

    // Split response into chunks that fit Discord's 2000 char limit
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    clearInterval(typingInterval);
    const errorMsg =
      err.message === "aborted"
        ? "Process was stopped."
        : `Error: ${err.message}`;
    await message.reply(errorMsg).catch(() => {});
  }
});

function runClaude(prompt, channelId) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "text",
      "--verbose",
      prompt,
    ];

    const proc = spawn("claude", args, {
      cwd: PROJECT_DIR,
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeProcesses.set(channelId, proc);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      activeProcesses.delete(channelId);
      if (code === 0 || stdout.length > 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Claude exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      activeProcesses.delete(channelId);
      reject(err);
    });

    // Timeout after 10 minutes
    setTimeout(() => {
      if (activeProcesses.has(channelId)) {
        proc.kill("SIGTERM");
        activeProcesses.delete(channelId);
        reject(new Error("Claude process timed out after 10 minutes."));
      }
    }, 10 * 60 * 1000);
  });
}

function splitMessage(text, maxLength = 1900) {
  const chunks = [];

  // Try to split on code block boundaries first
  if (text.length <= maxLength) {
    chunks.push(text);
    return chunks;
  }

  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point: newline, then space
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < maxLength * 0.5) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt < maxLength * 0.3) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

client.login(DISCORD_BOT_TOKEN);
