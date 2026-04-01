import { createHash } from "crypto";
import { logger } from "./logger";

const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL || "";
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL || "";
const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN || "";

function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64");
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (attempt < retries && (res.status === 429 || res.status >= 500)) {
      const retryAfter = res.status === 429 ? parseInt(res.headers.get("retry-after") || "", 10) : 0;
      const delay = (retryAfter > 0 ? retryAfter : Math.pow(2, attempt)) * 1000;
      logger.warn({ status: res.status, attempt, url }, `Retrying after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}

async function confluenceV1Request(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${CONFLUENCE_BASE_URL}/wiki/rest/api${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, path }, "Confluence API v1 error");
    throw new Error(`Confluence API error: ${res.status} ${text}`);
  }

  return res.json();
}

async function confluenceV2Request(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${CONFLUENCE_BASE_URL}/wiki/api/v2${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, path }, "Confluence API v2 error");
    throw new Error(`Confluence API error: ${res.status} ${text}`);
  }

  return res.json();
}

/** v2 page response shape */
export interface ConfluencePageV2 {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  parentId?: string;
  parentType?: string;
  createdAt: string;
  authorId?: string;
  version?: { createdAt: string; number: number; message?: string };
  body?: { storage?: { value: string } };
  _links?: { webui?: string; base?: string };
}

export interface ConfluenceFolder {
  id: string;
  title: string;
  spaceId: string;
  parentId?: string;
  parentType?: string;
  status: string;
}

export interface ConfluenceSmartLink {
  id: string;
  title: string;
  type: string;
  status: string;
  embedUrl: string;
  parentId?: string;
  parentType?: string;
  spaceId?: string;
  version?: { createdAt: string; number: number };
}

export interface FolderChild {
  id: string;
  title: string;
  type: string;
  status: string;
  spaceId?: string;
  childPosition?: number;
}

export async function getSpaceId(spaceKey: string): Promise<string> {
  const data = await confluenceV2Request("/spaces", { keys: spaceKey, limit: "1" });
  const results = data.results || [];
  if (results.length === 0) {
    throw new Error(`Space with key "${spaceKey}" not found`);
  }
  return results[0].id;
}

export async function getFoldersInSpace(spaceKey: string): Promise<ConfluenceFolder[]> {
  const cql = `type=folder AND space.key="${spaceKey}"`;
  const allFolders: ConfluenceFolder[] = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const data = await confluenceV1Request("/search", {
      cql,
      limit: String(limit),
      start: String(start),
    });

    const results = data.results || [];
    for (const item of results) {
      const content = item.content || item;
      allFolders.push({
        id: content.id,
        title: content.title,
        spaceId: content.space?.id || "",
        parentId: content.parentId,
        parentType: content.parentType,
        status: content.status || "current",
      });
    }

    if (results.length < limit) break;
    start += limit;
  }

  return allFolders;
}

export async function getFolderDirectChildren(folderId: string): Promise<FolderChild[]> {
  const allChildren: FolderChild[] = [];
  let cursor: string | undefined;

  while (true) {
    const params: Record<string, string> = { limit: "50" };
    if (cursor) params.cursor = cursor;

    const data = await confluenceV2Request(`/folders/${folderId}/direct-children`, params);
    const results: FolderChild[] = data.results || [];
    allChildren.push(...results);

    const nextLink = data._links?.next;
    if (!nextLink) break;

    const nextUrl = new URL(nextLink, CONFLUENCE_BASE_URL);
    cursor = nextUrl.searchParams.get("cursor") || undefined;
    if (!cursor) break;
  }

  return allChildren;
}

/**
 * Recursively get all children from a folder and its subfolders.
 * Returns pages and embeds from the entire folder tree.
 */
export async function getFolderChildrenRecursive(folderId: string): Promise<FolderChild[]> {
  const directChildren = await getFolderDirectChildren(folderId);
  const subfolders = directChildren.filter((c) => c.type === "folder");
  const nonFolders = directChildren.filter((c) => c.type !== "folder");

  const nestedResults = await Promise.all(
    subfolders.map((sf) => getFolderChildrenRecursive(sf.id)),
  );

  return [...nonFolders, ...nestedResults.flat()];
}

export async function getSmartLinkDetails(embedId: string): Promise<ConfluenceSmartLink> {
  return confluenceV2Request(`/embeds/${embedId}`);
}

/**
 * Lightweight version check via v2 API — returns version metadata without body content.
 * v2 GET /pages/{id} without body-format returns empty body but includes version by default.
 */
export async function getPageVersion(pageId: string): Promise<ConfluencePageV2> {
  return confluenceV2Request(`/pages/${pageId}`);
}

/**
 * Full page content via v2 API — returns body in storage format + version + createdAt + _links.
 */
export async function getPageContent(pageId: string): Promise<ConfluencePageV2> {
  return confluenceV2Request(`/pages/${pageId}`, { "body-format": "storage" });
}

/**
 * Build the full browser-navigable URL for a Confluence page from its _links.webui path.
 */
export function buildPageUrl(page: ConfluencePageV2): string {
  if (page._links?.webui) {
    return `${CONFLUENCE_BASE_URL}/wiki${page._links.webui}`;
  }
  // Fallback: construct a best-effort URL
  return `${CONFLUENCE_BASE_URL}/wiki/pages/${page.id}`;
}

export function extractConfluencePageId(url: string): string | null {
  const patterns = [
    /\/wiki\/spaces\/[^/]+\/pages\/(\d+)/,
    /\/wiki\/pages\/(\d+)/,
    /pageId=(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  mediaType: string;
  fileSize: number;
  downloadUrl: string;
}

export async function getPageAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
  const data = await confluenceV1Request(`/content/${pageId}/child/attachment`, { limit: "100" });
  const results = data.results || [];
  return results.map((att: any) => ({
    id: att.id,
    title: att.title,
    mediaType: att.metadata?.mediaType || att.extensions?.mediaType || "application/octet-stream",
    fileSize: att.extensions?.fileSize || 0,
    downloadUrl: att._links?.download || "",
  }));
}

export async function downloadAttachment(downloadPath: string): Promise<Buffer> {
  const url = `${CONFLUENCE_BASE_URL}/wiki${downloadPath}`;
  const res = await fetchWithRetry(url, {
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download attachment: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function stripConfluenceMacros(html: string): string {
  return html.replace(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/gi, "");
}

export function stripImages(html: string): string {
  return html
    .replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, "")
    .replace(/<img[^>]*\/?>/gi, "");
}

export function getContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
