import { createPrivateKey, createSign, randomUUID } from "crypto";
import { logger } from "./logger";

const TALKDESK_CLIENT_ID = process.env.TALKDESK_CLIENT_ID || "";
const TALKDESK_PRIVATE_KEY = process.env.TALKDESK_PRIVATE_KEY || "";
const TALKDESK_KEY_ID = process.env.TALKDESK_KEY_ID || "";

const REGION_TOKEN_URLS: Record<string, string> = {
  US: "https://{account}.talkdeskid.com/oauth/token",
  EU: "https://{account}.talkdeskid.eu/oauth/token",
  CA: "https://{account}.talkdeskidca.com/oauth/token",
  AU: "https://{account}.talkdeskid.au/oauth/token",
};

const REGION_API_URLS: Record<string, string> = {
  US: "https://api.talkdeskapp.com",
  EU: "https://api.talkdeskapp.eu",
  CA: "https://api.talkdeskappca.com",
  AU: "https://api.talkdeskapp.au",
};

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createJwtAssertion(accountName: string, region: string): string {
  const tokenUrl = REGION_TOKEN_URLS[region]?.replace("{account}", accountName);
  if (!tokenUrl) throw new Error(`Unknown region: ${region}`);

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "ES256",
    typ: "JWT",
    kid: TALKDESK_KEY_ID,
  };

  const payload = {
    jti: randomUUID(),
    iss: TALKDESK_CLIENT_ID,
    sub: TALKDESK_CLIENT_ID,
    aud: tokenUrl,
    iat: now,
    exp: now + 300,
  };

  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemKey = `-----BEGIN PRIVATE KEY-----\n${TALKDESK_PRIVATE_KEY}\n-----END PRIVATE KEY-----`;
  const privateKey = createPrivateKey(pemKey);

  const sign = createSign("SHA256");
  sign.update(signingInput);
  const derSignature = sign.sign(privateKey);

  const rLength = derSignature[3];
  let r = derSignature.subarray(4, 4 + rLength);
  let sOffset = 4 + rLength + 2;
  const sLength = derSignature[sOffset - 1];
  let s = derSignature.subarray(sOffset, sOffset + sLength);

  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);

  const rawSig = Buffer.alloc(64);
  r.copy(rawSig, 32 - r.length);
  s.copy(rawSig, 64 - s.length);

  const signatureB64 = base64UrlEncode(rawSig);
  return `${signingInput}.${signatureB64}`;
}

let cachedToken: { token: string; expiresAt: number; accountName: string; region: string } | null = null;

export async function getAccessToken(accountName: string, region: string): Promise<string> {
  if (
    cachedToken &&
    cachedToken.accountName === accountName &&
    cachedToken.region === region &&
    Date.now() < cachedToken.expiresAt - 60_000
  ) {
    return cachedToken.token;
  }

  const tokenUrl = REGION_TOKEN_URLS[region]?.replace("{account}", accountName);
  if (!tokenUrl) throw new Error(`Unknown region: ${region}`);

  const assertion = createJwtAssertion(accountName, region);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
  });

  logger.info({ tokenUrl }, "Requesting Talkdesk access token");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, tokenUrl }, "Talkdesk token error");
    throw new Error(`Talkdesk token error: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    accountName,
    region,
  };

  logger.info("Talkdesk access token obtained successfully");
  return data.access_token;
}

function getApiUrl(region: string): string {
  const url = REGION_API_URLS[region];
  if (!url) throw new Error(`Unknown region: ${region}`);
  return url;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok || (res.status < 500 && res.status !== 429)) return res;
    if (attempt < retries) {
      const delay = 1000 * Math.pow(2, attempt);
      logger.warn({ status: res.status, attempt, url }, `Retrying after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    } else {
      return res;
    }
  }
  throw new Error("Unreachable");
}

export async function createExternalSource(
  accountName: string,
  region: string,
  name: string,
  knowledgeSegments?: string,
): Promise<{ id: string }> {
  const token = await getAccessToken(accountName, region);
  const apiUrl = getApiUrl(region);
  const url = `${apiUrl}/knowledge-management/external-sources`;

  logger.info({ url, name }, "Creating Talkdesk external source");

  const truncatedName = name.slice(0, 64);
  const description = `Confluence sync: ${name}`.slice(0, 160);
  const details: Record<string, string> = {
    name: truncatedName,
    description,
    knowledge_type: "CUSTOM",
  };
  if (knowledgeSegments) {
    details.knowledge_segments = knowledgeSegments;
  }

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ enabled: true, details }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, url }, "Talkdesk create external source error");
    throw new Error(`Talkdesk create external source error: ${res.status} ${text}`);
  }

  const data = await res.json();
  logger.info({ sourceId: data.id }, "External source created successfully");
  return data;
}

export async function deleteExternalSource(
  accountName: string,
  region: string,
  sourceId: string,
): Promise<void> {
  const token = await getAccessToken(accountName, region);
  const apiUrl = getApiUrl(region);

  const res = await fetchWithRetry(`${apiUrl}/knowledge-management/external-sources/${sourceId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Talkdesk delete external source error");
    throw new Error(`Talkdesk delete external source error: ${res.status} ${text}`);
  }
}

export async function upsertDocument(
  accountName: string,
  region: string,
  sourceId: string,
  documentId: string,
  title: string,
  htmlContent: string,
  sourceUrl: string,
  isNew: boolean,
  createdAt?: string,
): Promise<void> {
  const token = await getAccessToken(accountName, region);
  const apiUrl = getApiUrl(region);
  const url = `${apiUrl}/knowledge-management/external-sources/${sourceId}/documents/${documentId}`;

  logger.info({ url, documentId, title }, "Upserting Talkdesk document");

  const now = new Date().toISOString();
  const payload: Record<string, string> = {
    url: sourceUrl,
    title,
    content: htmlContent,
    updated_at: now,
    created_at: createdAt || now,
  };

  const res = await fetchWithRetry(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, documentId }, "Talkdesk upsert document error");
    throw new Error(`Talkdesk upsert document error: ${res.status} ${text}`);
  }
}

export async function deleteDocument(
  accountName: string,
  region: string,
  sourceId: string,
  documentId: string,
): Promise<void> {
  const token = await getAccessToken(accountName, region);
  const apiUrl = getApiUrl(region);

  const res = await fetchWithRetry(
    `${apiUrl}/knowledge-management/external-sources/${sourceId}/documents/${documentId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, documentId }, "Talkdesk delete document error");
    throw new Error(`Talkdesk delete document error: ${res.status} ${text}`);
  }
}
