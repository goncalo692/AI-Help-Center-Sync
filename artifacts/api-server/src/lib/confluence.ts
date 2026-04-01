import { logger } from "./logger";

const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL || "";
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL || "";
const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN || "";

function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString("base64");
}

async function confluenceRequest(path: string, params?: Record<string, string>): Promise<any> {
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
    logger.error({ status: res.status, body: text, path }, "Confluence API error");
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

export async function getTopLevelPages(spaceKey: string): Promise<ConfluencePage[]> {
  const allFolders: ConfluencePage[] = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const data = await confluenceRequest("/content", {
      spaceKey,
      type: "page",
      limit: String(limit),
      start: String(start),
      expand: "children.page",
    });

    const results: ConfluencePage[] = data.results || [];
    for (const page of results) {
      if ((page.children?.page?.size || 0) > 0) {
        allFolders.push(page);
      }
    }

    if (results.length < limit) break;
    start += limit;
  }

  return allFolders;
}

export async function getChildPages(parentId: string): Promise<ConfluencePage[]> {
  const allPages: ConfluencePage[] = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const data = await confluenceRequest(`/content/${parentId}/child/page`, {
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
  return confluenceRequest(`/content/${pageId}`, {
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
