import { prisma } from "./prisma";

export const SENSITIVE_SETTING_KEYS = new Set([
  "telegram_bot_token",
  "telegram_webhook_secret",
  "telegram_allowed_chat_ids",
  "telegram_chat_ownership_map",
  "telegram_actor_email",
]);

export function isSensitiveSettingKey(key: string) {
  return SENSITIVE_SETTING_KEYS.has(key) || key.startsWith("telegram_");
}

export async function getHouseholdSettingsMap(householdId: string) {
  const settings = await prisma.setting.findMany({ where: { householdId } });
  return new Map(settings.map((setting) => [setting.key, setting.value]));
}

export async function getHouseholdSettingValue(householdId: string, key: string) {
  const setting = await prisma.setting.findUnique({
    where: { householdId_key: { householdId, key } },
    select: { value: true },
  });

  return setting?.value ?? null;
}

export async function upsertHouseholdSettingValue(
  householdId: string,
  key: string,
  value: string
) {
  return prisma.setting.upsert({
    where: { householdId_key: { householdId, key } },
    create: { householdId, key, value },
    update: { value },
  });
}

export async function deleteHouseholdSettingValue(householdId: string, key: string) {
  return prisma.setting.deleteMany({
    where: { householdId, key },
  });
}
