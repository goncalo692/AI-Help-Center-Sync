import mammoth from "mammoth";
import { logger } from "./logger";

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function isSupportedAttachment(mediaType: string): boolean {
  return mediaType in SUPPORTED_MIME_TYPES;
}

export async function convertToHtml(buffer: Buffer, mediaType: string, filename: string): Promise<string> {
  const type = SUPPORTED_MIME_TYPES[mediaType];

  if (!type) {
    throw new Error(`Unsupported media type: ${mediaType}`);
  }

  if (type === "pdf") {
    return convertPdfToHtml(buffer, filename);
  }

  if (type === "docx") {
    return convertDocxToHtml(buffer, filename);
  }

  throw new Error(`No converter for type: ${type}`);
}

async function convertPdfToHtml(buffer: Buffer, filename: string): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    const text = data.text || "";

    const paragraphs = text
      .split(/\n{2,}/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
      .map((p: string) => {
        const escaped = p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>");
        return `<p>${escaped}</p>`;
      });

    return paragraphs.join("\n");
  } catch (err) {
    logger.error({ err, filename }, "Failed to parse PDF");
    throw new Error(`PDF conversion failed for ${filename}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function convertDocxToHtml(buffer: Buffer, filename: string): Promise<string> {
  try {
    const result = await mammoth.convertToHtml({ buffer });

    if (result.messages.length > 0) {
      logger.debug({ filename, messages: result.messages }, "DOCX conversion warnings");
    }

    return result.value;
  } catch (err) {
    logger.error({ err, filename }, "Failed to parse DOCX");
    throw new Error(`DOCX conversion failed for ${filename}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
