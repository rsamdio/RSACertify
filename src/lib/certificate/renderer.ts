import type { Participant, ParticipantField } from "@/types/domain";
import { canvasFontString } from "@/lib/field-placement";

const BASE_WIDTH = 794;

function calculateDynamicPosition(value: string | number, canvasDimension: number): number {
  if (typeof value === "number") {
    return value * (canvasDimension / BASE_WIDTH);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    // Percent strings ("45%") and bare numeric strings ("45") both mean percent of canvas.
    if (trimmed.includes("%") || /^-?\d+(\.\d+)?$/.test(trimmed)) {
      const n = parseFloat(trimmed);
      if (Number.isFinite(n)) return canvasDimension * (n / 100);
    }
  }
  return 0;
}

function calculateDynamicWidth(value: string | number, canvasWidth: number): number {
  return calculateDynamicPosition(value, canvasWidth);
}

function resolveFieldValue(participant: Participant, field: ParticipantField): string {
  if (field.key === "name") return participant.name ?? "";
  if (field.key === "lookup") return participant.lookup ?? "";
  return participant.additionalFields?.[field.key] ?? "";
}

function calculateOptimalFontSize(
  baseFontSize: number,
  canvasWidth: number,
  text: string,
  maxWidth: number,
  fontFamily: string,
  bold?: boolean,
  italic?: boolean
): number {
  const scaled = (baseFontSize || 24) * (canvasWidth / BASE_WIDTH);
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) {
    return Math.max(8, Math.round(scaled));
  }
  tempCtx.font = canvasFontString(scaled, fontFamily, bold, italic);
  if (tempCtx.measureText(text).width <= maxWidth) {
    return Math.max(8, Math.round(scaled));
  }
  let min = 8;
  let max = scaled;
  let best = min;
  while (min <= max) {
    const mid = (min + max) / 2;
    tempCtx.font = canvasFontString(mid, fontFamily, bold, italic);
    if (tempCtx.measureText(text).width <= maxWidth) {
      best = mid;
      min = mid + 0.5;
    } else {
      max = mid - 0.5;
    }
  }
  return Math.max(8, Math.round(best));
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  align: "left" | "center" | "right"
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const lineHeight = fontSize + 5;
  let adjustedX = x;
  if (align === "center") adjustedX = x + maxWidth / 2;
  if (align === "right") adjustedX = x + maxWidth;
  ctx.textAlign = align;
  lines.forEach((line, i) => {
    ctx.fillText(line, adjustedX, y + i * lineHeight);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load template: ${src}`));
    img.src = src;
  });
}

export async function loadFontIfNeeded(
  fontFamily: string,
  bold?: boolean,
  italic?: boolean
): Promise<void> {
  if (!("fonts" in document)) return;
  try {
    await (document as Document & { fonts: FontFaceSet }).fonts.load(
      canvasFontString(16, fontFamily, bold, italic)
    );
  } catch {
    // no-op fallback
  }
}

export async function renderCertificateCanvas(input: {
  templateUrl: string;
  participant: Participant;
  fields: ParticipantField[];
}): Promise<HTMLCanvasElement> {
  const image = await loadImage(input.templateUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || BASE_WIDTH;
  canvas.height = image.naturalHeight || 1123;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const field of input.fields) {
    if (field.onCertificate === false) continue;
    const value = resolveFieldValue(input.participant, field);
    if (!value && field.required !== false) continue;
    const family = field.font_family || "Arial";
    const bold = Boolean(field.bold);
    const italic = Boolean(field.italic);
    await loadFontIfNeeded(family, bold, italic);
    const x = calculateDynamicPosition(field.x ?? "50%", canvas.width);
    const y = calculateDynamicPosition(field.y ?? "50%", canvas.height);
    const maxWidth = calculateDynamicWidth(field.width ?? "70%", canvas.width);
    const fontSize = calculateOptimalFontSize(
      field.font_size ?? 24,
      canvas.width,
      value,
      maxWidth,
      family,
      bold,
      italic
    );
    ctx.font = canvasFontString(fontSize, family, bold, italic);
    ctx.fillStyle = field.color || "#000000";
    // Alphabetic baseline: stored y is the text baseline (glyphs sit mostly above it).
    ctx.textBaseline = "alphabetic";
    drawWrappedText(ctx, value, x, y, maxWidth, fontSize, field.text_align || "left");
  }

  return canvas;
}

export async function generatePdfFromCanvas(canvas: HTMLCanvasElement) {
  const { jsPDF } = await import("jspdf");
  const pxToMm = 25.4 / 96;
  const pdfWidth = canvas.width * pxToMm;
  const pdfHeight = canvas.height * pxToMm;
  const orientation = pdfWidth > pdfHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [pdfWidth, pdfHeight]
  });
  const imageData = canvas.toDataURL("image/png");
  // Prefer quality over aggressive compression so PNG templates stay crisp in PDF.
  pdf.addImage(imageData, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "NONE");
  return pdf;
}
