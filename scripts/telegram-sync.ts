const token = process.env.TELEGRAM_BOT_TOKEN;
const baseUrl = process.env.TELEGRAM_BASE_URL ?? process.env.NEXTAUTH_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

if (!baseUrl) {
  throw new Error("TELEGRAM_BASE_URL or NEXTAUTH_URL is required");
}

if (!secret) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET is required");
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;

async function callTelegramApi(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`${method} failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  await callTelegramApi("setMyCommands", {
    commands: [
      { command: "ajuda", description: "Ver instruções do bot" },
      { command: "gasto", description: "Criar um lançamento de despesa" },
      { command: "receita", description: "Criar um lançamento de receita" },
      { command: "recorrente", description: "Criar uma recorrência" },
      { command: "cartoes", description: "Listar cartões disponíveis" },
      { command: "whoami", description: "Ver chat_id para autorização" },
    ],
  });

  await callTelegramApi("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });

  console.log(`Telegram webhook configured at ${webhookUrl}`);
}

void main();
