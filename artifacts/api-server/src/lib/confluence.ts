import { logger } from "./logger";

const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL || "";
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL || "";
const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN || "";

function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64");
}

async function confluenceV1Request(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${CONFLUENCE_BASE_URL}/wiki/rest/api${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
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

  const res = await fetch(url.toString(), {
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

export interface ConfluencePage {
  id: string;
  title: string;
  type: string;
  status: string;
  _links: Record<string, string>;
  children?: { page?: { size: number } };
  version?: { when: string; number: number };
  body?: { storage: { value: string } };
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

export async function getSmartLinkDetails(embedId: string): Promise<ConfluenceSmartLink> {
  return confluenceV2Request(`/embeds/${embedId}`);
}

export async function getChildPages(parentId: string): Promise<ConfluencePage[]> {
  const allPages: ConfluencePage[] = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const data = await confluenceV1Request(`/content/${parentId}/child/page`, {
      start: String(start),
      limit: String(limit),
      expand: "version",
    });

    const results = data.results || [];
    allPages.push(...results);

    if (results.length < limit) break;
    start += limit;
  }

  return allPages;
}

export async function getPageContent(pageId: string): Promise<ConfluencePage> {
  return confluenceV1Request(`/content/${pageId}`, {
    expand: "body.storage,version",
  });
}

export function stripImages(html: string): string {
  return html.replace(/<img[^>]*>/gi, "");
}

export function getContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
