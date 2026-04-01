import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { UpdateSettingsBody, GetSettingsResponse, UpdateSettingsResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { restartSyncScheduler } from "../lib/syncJob";
import { setTalkdeskCredentials } from "../lib/talkdesk";

const router: IRouter = Router();

router.get("/settings", async (_req, res) => {
  try {
    const settings = await db.select().from(settingsTable).limit(1);

    if (settings.length === 0) {
      const response = GetSettingsResponse.parse({
        id: 0,
        talkdeskAccountName: "",
        talkdeskRegion: "US",
        confluenceSpaceKey: "",
        syncIntervalMinutes: 5,
        hasCredentials: false,
        updatedAt: null,
      });
      res.json(response);
      return;
    }

    const s = settings[0];
    const response = GetSettingsResponse.parse({
      id: s.id,
      talkdeskAccountName: s.talkdeskAccountName,
      talkdeskRegion: s.talkdeskRegion,
      confluenceSpaceKey: s.confluenceSpaceKey,
      syncIntervalMinutes: s.syncIntervalMinutes,
      hasCredentials: !!s.talkdeskCredentials,
      updatedAt: s.updatedAt?.toISOString(),
    });
    res.json(response);
  } catch (err) {
    _req.log.error({ err }, "Error getting settings");
    res.status(500).json({ message: "Failed to get settings" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const body = UpdateSettingsBody.parse(req.body);

    let settings = await db.select().from(settingsTable).limit(1);

    const intervalMinutes = Math.max(1, Math.min(60, body.syncIntervalMinutes));

    const updateValues: Record<string, unknown> = {
      talkdeskAccountName: body.talkdeskAccountName,
      talkdeskRegion: body.talkdeskRegion,
      confluenceSpaceKey: body.confluenceSpaceKey,
      syncIntervalMinutes: intervalMinutes,
      updatedAt: new Date(),
    };

    if (body.talkdeskCredentialsJson !== undefined) {
      if (body.talkdeskCredentialsJson === null || body.talkdeskCredentialsJson === "") {
        updateValues.talkdeskCredentials = null;
        setTalkdeskCredentials(null);
      } else {
        const parsed = JSON.parse(body.talkdeskCredentialsJson);
        if (!parsed.id || !parsed.private_key || !parsed.key_id) {
          res.status(400).json({ message: "Credentials JSON must contain id, private_key, and key_id fields" });
          return;
        }
        updateValues.talkdeskCredentials = body.talkdeskCredentialsJson;
        setTalkdeskCredentials({
          id: parsed.id,
          private_key: parsed.private_key,
          key_id: parsed.key_id,
        });
      }
    }

    if (settings.length === 0) {
      const [created] = await db
        .insert(settingsTable)
        .values(updateValues as any)
        .returning();
      settings = [created];
    } else {
      const [updated] = await db
        .update(settingsTable)
        .set(updateValues as any)
        .where(eq(settingsTable.id, settings[0].id))
        .returning();
      settings = [updated];
    }

    restartSyncScheduler(intervalMinutes);

    const s = settings[0];
    const response = UpdateSettingsResponse.parse({
      id: s.id,
      talkdeskAccountName: s.talkdeskAccountName,
      talkdeskRegion: s.talkdeskRegion,
      confluenceSpaceKey: s.confluenceSpaceKey,
      syncIntervalMinutes: s.syncIntervalMinutes,
      hasCredentials: !!s.talkdeskCredentials,
      updatedAt: s.updatedAt?.toISOString(),
    });
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Error updating settings");
    res.status(500).json({ message: "Failed to update settings" });
  }
});

export default router;
