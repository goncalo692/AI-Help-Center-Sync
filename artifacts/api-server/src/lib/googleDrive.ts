import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const connectors = new ReplitConnectors();

export interface GoogleDriveFileContent {
  title: string;
  html: string;
  mimeType: string;
  lastModified: string;
}

const GOOGLE_DRIVE_URL_PATTERNS = [
  /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
];

const GOOGLE_NATIVE_EXPORT_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/html",
  "application/vnd.google-apps.spreadsheet": "text/html",
  "application/vnd.google-apps.presentation": "text/html",
};

const BINARY_CONVERT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function extractGoogleDriveFileId(url: string): string | null {
  for (const pattern of GOOGLE_DRIVE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function getFileMetadata(fileId: string): Promise<{ name: string; mimeType: string; modifiedTime: string }> {
  const response = await connectors.proxy("google-drive", `/drive/v3/files/${fileId}?fields=name,mimeType,modifiedTime`, {
    method: "GET",
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text, fileId }, "Google Drive metadata error");
    throw new Error(`Failed to get Google Drive file metadata: ${response.status}`);
  }

  return response.json();
}

async function exportGoogleDoc(fileId: string, exportMimeType: string): Promise<string> {
  const response = await connectors.proxy("google-drive", `/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`, {
    method: "GET",
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text, fileId }, "Google Drive export error");
    throw new Error(`Failed to export Google Drive file: ${response.status}`);
  }

  return response.text();
}

async function downloadFile(fileId: string): Promise<Buffer> {
  const response = await connectors.proxy("google-drive", `/drive/v3/files/${fileId}?alt=media`, {
    method: "GET",
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text, fileId }, "Google Drive download error");
    throw new Error(`Failed to download Google Drive file: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function getGoogleDriveFileContent(fileId: string): Promise<GoogleDriveFileContent> {
  const metadata = await getFileMetadata(fileId);
  logger.info({ fileId, name: metadata.name, mimeType: metadata.mimeType }, "Fetching Google Drive file content");

  const exportType = GOOGLE_NATIVE_EXPORT_TYPES[metadata.mimeType];
  if (exportType) {
    const html = await exportGoogleDoc(fileId, exportType);
    return {
      title: metadata.name,
      html,
      mimeType: metadata.mimeType,
      lastModified: metadata.modifiedTime || "",
    };
  }

  if (metadata.mimeType === "text/plain") {
    const buffer = await downloadFile(fileId);
    const text = buffer.toString("utf-8");
    const escaped = escapeHtml(text);
    const paragraphs = escaped.split(/\n{2,}/).filter(Boolean).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`);
    return {
      title: metadata.name,
      html: paragraphs.join("\n"),
      mimeType: metadata.mimeType,
      lastModified: metadata.modifiedTime || "",
    };
  }

  if (metadata.mimeType === "text/html") {
    const buffer = await downloadFile(fileId);
    return {
      title: metadata.name,
      html: buffer.toString("utf-8"),
      mimeType: metadata.mimeType,
      lastModified: metadata.modifiedTime || "",
    };
  }

  if (BINARY_CONVERT_TYPES[metadata.mimeType]) {
    const { convertToHtml } = await import("./documentConverter");
    const buffer = await downloadFile(fileId);
    const html = await convertToHtml(buffer, metadata.mimeType, metadata.name);
    return {
      title: metadata.name,
      html,
      mimeType: metadata.mimeType,
      lastModified: metadata.modifiedTime || "",
    };
  }

  logger.warn({ fileId, mimeType: metadata.mimeType }, "Unsupported Google Drive file type, storing as link");
  return {
    title: metadata.name,
    html: `<h2>${escapeHtml(metadata.name)}</h2><p>File type: ${escapeHtml(metadata.mimeType)}</p><p><a href="https://drive.google.com/file/d/${fileId}">${escapeHtml(metadata.name)}</a></p>`,
    mimeType: metadata.mimeType,
    lastModified: metadata.modifiedTime || "",
  };
}
