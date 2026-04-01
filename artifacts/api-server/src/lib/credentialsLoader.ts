import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { setTalkdeskCredentials } from "./talkdesk";
import { logger } from "./logger";

export async function loadCredentialsFromDb(): Promise<void> {
  try {
    const settings = await db.select().from(settingsTable).limit(1);
    if (settings.length > 0 && settings[0].talkdeskCredentials) {
      const parsed = JSON.parse(settings[0].talkdeskCredentials);
      setTalkdeskCredentials({
        id: parsed.id,
        private_key: parsed.private_key,
        key_id: parsed.key_id,
      });
      logger.info("Talkdesk credentials loaded from database");
    } else {
      logger.warn("No Talkdesk credentials found in database");
    }
  } catch (err) {
    logger.error({ err }, "Failed to load Talkdesk credentials from database");
  }
}
