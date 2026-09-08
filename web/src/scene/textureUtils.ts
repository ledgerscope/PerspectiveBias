import * as THREE from "three";
import type { Cheque, Invoice } from "../xero/types";
import { rngFromString } from "./hash";
import { isOverdue } from "./dateUtils";

// A4 aspect ratio at a resolution sharp enough to read text when held close.
const CANVAS_WIDTH = 794; // px, ~96dpi A4 width
const CANVAS_HEIGHT = 1123; // px, ~96dpi A4 height

// The (invented) company on the receiving end of every invoice/cheque in
// this scene - keeps "pay to the order of" on cheques consistent.
const OUR_COMPANY_NAME = "Northwind Trading Co";

function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Curated primary/secondary colour pairs so procedural logos read as
// plausible (if invented) brand palettes rather than random noise.
const LOGO_PALETTES: [string, string][] = [
  ["#1d4ed8", "#93c5fd"],
  ["#b91c1c", "#fca5a5"],
  ["#047857", "#6ee7b7"],
  ["#7c2d12", "#fdba74"],
  ["#5b21b6", "#c4b5fd"],
  ["#0e7490", "#67e8f9"],
  ["#a16207", "#fde68a"],
  ["#be185d", "#f9a8d4"],
  ["#374151", "#9ca3af"],
  ["#166534", "#bef264"],
];

/**
 * Draws a small procedurally generated brand mark: shape + palette +
 * initials/wordmark are all derived from a hash of `name`, so the same
 * contact always renders the same faintly-recognisable logo everywhere it
 * appears on the desk. Purely invented artwork, no real brand assets.
 */
function drawLogo(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
) {
  const rand = rngFromString(`logo-${name}`);
  const shapeIdx = Math.floor(rand() * 5);
  const [primary, secondary] = LOGO_PALETTES[Math.floor(rand() * LOGO_PALETTES.length)];
  const r = size / 2;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = primary;
  ctx.beginPath();
  switch (shapeIdx) {
    case 0: // circle
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 1: // rounded square
      ctx.roundRect(-r, -r, size, size, size * 0.22);
      break;
    case 2: // triangle
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.8);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      break;
    case 3: // diamond
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      break;
    default: { // hexagon
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
  }
  ctx.fill();

  ctx.strokeStyle = secondary;
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(size * 0.4)}px Arial`;
  ctx.fillText(getInitials(name), 0, size * 0.04);
  ctx.restore();

  // Wordmark next to the mark.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = primary;
  ctx.font = `bold ${Math.round(size * 0.42)}px Arial`;
  ctx.fillText(name, x + r + size * 0.35, y);
}

/** Traces a hand-stamped-looking rough-edged circle path (deterministic noise). */
function roughCirclePath(
  ctx: CanvasRenderingContext2D,
  radius: number,
  rand: () => number,
  amplitude: number,
) {
  const phases = [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2];
  const steps = 56;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const noise =
      Math.sin(theta * 3 + phases[0]) * 0.5 +
      Math.sin(theta * 5 + phases[1]) * 0.3 +
      Math.sin(theta * 9 + phases[2]) * 0.2;
    const rr = radius + noise * amplitude;
    const px = Math.cos(theta) * rr;
    const py = Math.sin(theta) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export type StampKind = "paid" | "overdue" | "void" | "draft" | "manual-paid";

const STAMP_STYLE: Record<StampKind, { color: string; label: string; sublabel: string }> = {
  paid: { color: "#1e7e34", label: "PAID", sublabel: "SETTLED IN FULL" },
  overdue: { color: "#b3261e", label: "OVERDUE", sublabel: "PLEASE REMIT" },
  void: { color: "#595959", label: "VOID", sublabel: "CANCELLED" },
  draft: { color: "#3b5bdb", label: "DRAFT", sublabel: "NOT YET SENT" },
  "manual-paid": { color: "#1a8f3c", label: "PAID", sublabel: "RECONCILED" },
};

/**
 * Draws an angled rubber-stamp mark (rough ink edge, per-invoice rotation
 * jitter so it looks hand applied) at (x, y). `seedKey` drives the jitter so
 * the same invoice always gets the same stamp placement/angle.
 */
export function drawStamp(
  ctx: CanvasRenderingContext2D,
  kind: StampKind,
  x: number,
  y: number,
  seedKey: string,
  scale = 1,
) {
  const rand = rngFromString(`stamp-${seedKey}`);
  const style = STAMP_STYLE[kind];
  const baseAngle = -0.22 + (rand() - 0.5) * 0.5; // hand-applied off-kilter angle
  const outerR = 118 * scale;
  const innerR = 92 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(baseAngle);
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;

  ctx.lineWidth = 6 * scale;
  roughCirclePath(ctx, outerR, rand, 3.5 * scale);
  ctx.stroke();
  ctx.lineWidth = 3 * scale;
  roughCirclePath(ctx, innerR, rand, 2.5 * scale);
  ctx.stroke();

  // Ink speckles scattered near the ring for a worn, hand-stamped texture.
  for (let i = 0; i < 26; i++) {
    if (rand() < 0.45) continue;
    const theta = rand() * Math.PI * 2;
    const rr = outerR + (rand() - 0.5) * 16 * scale;
    ctx.beginPath();
    ctx.arc(Math.cos(theta) * rr, Math.sin(theta) * rr, rand() * 2.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(40 * scale)}px Arial`;
  ctx.fillText(style.label, 0, -6 * scale);
  ctx.font = `bold ${Math.round(15 * scale)}px Arial`;
  ctx.fillText(style.sublabel, 0, 26 * scale);
  ctx.restore();
}

/** Which stamp (if any) an invoice should carry, before any manual override. */
export function getInvoiceStampKind(invoice: Invoice, referenceDate: Date): StampKind | null {
  if (invoice.status === "PAID") return "paid";
  if (invoice.status === "VOIDED") return "void";
  if (invoice.status === "DRAFT") return "draft";
  if (isOverdue(invoice, referenceDate)) return "overdue";
  return null; // submitted/authorised and not yet due - no stamp yet
}

/**
 * Renders an invoice onto an offscreen canvas that looks like a printed A4
 * invoice - including a procedural per-customer logo and a status rubber
 * stamp - and returns it as a Three.js texture to be mapped onto a paper
 * mesh.
 */
export function createInvoiceTexture(
  invoice: Invoice,
  referenceDate: Date,
  manuallyPaid = false,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable");
  }

  // Paper background with a very subtle off-white tone + soft shadow edges.
  ctx.fillStyle = "#fdfdfa";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const margin = 56;

  // Fictitious brand mark, top-left of the header.
  drawLogo(ctx, invoice.contactName, margin + 32, margin + 34, 64);

  // "INVOICE" title + number, right-aligned so it never collides with the logo.
  ctx.textAlign = "right";
  ctx.fillStyle = "#111111";
  ctx.font = "bold 36px Arial";
  ctx.fillText("INVOICE", CANVAS_WIDTH - margin, margin + 24);
  ctx.font = "18px Arial";
  ctx.fillStyle = "#444444";
  ctx.fillText(invoice.invoiceNumber, CANVAS_WIDTH - margin, margin + 54);
  ctx.textAlign = "left";

  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, margin + 90);
  ctx.lineTo(CANVAS_WIDTH - margin, margin + 90);
  ctx.stroke();

  ctx.font = "22px Arial";
  ctx.fillStyle = "#222222";
  let y = margin + 140;
  ctx.fillText(`Bill to: ${invoice.contactName}`, margin, y);
  y += 34;
  ctx.font = "18px Arial";
  ctx.fillStyle = "#555555";
  ctx.fillText(`Invoice date: ${invoice.date}`, margin, y);
  y += 26;
  ctx.fillText(`Due date: ${invoice.dueDate}`, margin, y);
  y += 26;
  ctx.fillText(`Status: ${invoice.status}`, margin, y);

  y += 50;
  ctx.font = "bold 18px Arial";
  ctx.fillStyle = "#111111";
  ctx.fillText("Description", margin, y);
  ctx.fillText("Qty", CANVAS_WIDTH - margin - 220, y);
  ctx.fillText("Unit", CANVAS_WIDTH - margin - 150, y);
  ctx.fillText("Amount", CANVAS_WIDTH - margin - 70, y);
  y += 12;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(CANVAS_WIDTH - margin, y);
  ctx.stroke();
  y += 28;

  ctx.font = "16px Arial";
  ctx.fillStyle = "#333333";
  for (const item of invoice.lineItems) {
    const lineTotal = item.quantity * item.unitAmount;
    ctx.fillText(item.description.slice(0, 40), margin, y);
    ctx.fillText(String(item.quantity), CANVAS_WIDTH - margin - 220, y);
    ctx.fillText(item.unitAmount.toFixed(2), CANVAS_WIDTH - margin - 150, y);
    ctx.fillText(
      formatCurrency(lineTotal, invoice.currencyCode),
      CANVAS_WIDTH - margin - 90,
      y,
    );
    y += 30;
    if (y > CANVAS_HEIGHT - 260) break; // avoid overflow for long invoices
  }

  y += 20;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(CANVAS_WIDTH - margin, y);
  ctx.stroke();
  y += 36;

  ctx.font = "18px Arial";
  ctx.fillStyle = "#333333";
  ctx.fillText(
    `Subtotal: ${formatCurrency(invoice.subTotal, invoice.currencyCode)}`,
    CANVAS_WIDTH - margin - 260,
    y,
  );
  y += 26;
  ctx.fillText(
    `Tax: ${formatCurrency(invoice.totalTax, invoice.currencyCode)}`,
    CANVAS_WIDTH - margin - 260,
    y,
  );
  y += 34;
  ctx.font = "bold 24px Arial";
  ctx.fillStyle = "#111111";
  ctx.fillText(
    `Total: ${formatCurrency(invoice.total, invoice.currencyCode)}`,
    CANVAS_WIDTH - margin - 260,
    y,
  );

  // Status stamp - angled, roughened, per-invoice jitter so it looks hand
  // applied. Voided/draft invoices get their own variant; a manual PAID
  // reconciliation stamp (applied interactively) is drawn last, on top of
  // whatever printed stamp was already there.
  const printedStamp = getInvoiceStampKind(invoice, referenceDate);
  if (printedStamp) {
    drawStamp(ctx, printedStamp, CANVAS_WIDTH * 0.7, CANVAS_HEIGHT * 0.32, invoice.id);
  }
  if (manuallyPaid) {
    drawStamp(ctx, "manual-paid", CANVAS_WIDTH * 0.42, CANVAS_HEIGHT * 0.46, `${invoice.id}-manual`, 1.15);
  }

  // Subtle paper texture noise so it doesn't look perfectly flat/digital.
  // putImageData() writes pixels directly and ignores
  // globalCompositeOperation/alpha blending entirely, which previously wiped
  // out all the text drawn above. Draw the noise onto its own canvas first,
  // then composite that canvas in with drawImage(), which does respect
  // compositing and alpha.
  const noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = CANVAS_WIDTH;
  noiseCanvas.height = CANVAS_HEIGHT;
  const noiseCtx = noiseCanvas.getContext("2d");
  if (noiseCtx) {
    const noise = noiseCtx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
    for (let i = 0; i < noise.data.length; i += 4) {
      const shade = 250 + Math.floor(Math.random() * 5);
      noise.data[i] = shade;
      noise.data[i + 1] = shade;
      noise.data[i + 2] = shade;
      noise.data[i + 3] = 40;
    }
    noiseCtx.putImageData(noise, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(noiseCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = [
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function chunkToWords(n: number): string {
  if (n === 0) return "";
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? "-" + ONES[n % 10] : ""}`;
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + chunkToWords(n % 100) : ""}`;
}

/** Minimal integer-dollar amount-in-words, good enough for typical invoice totals. */
function amountToWords(amount: number): string {
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);
  if (dollars === 0) return `zero and ${cents}/100`;
  let n = dollars;
  const parts: string[] = [];
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  if (thousands > 0) parts.push(`${chunkToWords(thousands)} thousand`);
  if (n > 0) parts.push(chunkToWords(n));
  const words = parts.join(" ") || "zero";
  return `${words} and ${cents}/100`;
}

/**
 * Renders a cheque onto an offscreen canvas: a real-world landscape cheque
 * layout (bank mark, payee/amount, amount-in-words, signature, MICR line) -
 * deliberately nothing like the A4 invoices it pays.
 */
export function createChequeTexture(cheque: Cheque): THREE.CanvasTexture {
  const width = 700;
  const height = 320;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const rand = rngFromString(`cheque-${cheque.id}`);

  ctx.fillStyle = "#eef3e8";
  ctx.fillRect(0, 0, width, height);

  // Faint guilloche-style wavy security pattern.
  ctx.strokeStyle = "rgba(70, 100, 70, 0.15)";
  ctx.lineWidth = 1;
  for (let lineY = 20; lineY < height - 20; lineY += 10) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += 4) {
      const yy = lineY + Math.sin(x * 0.05 + lineY) * 4;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = "#7a8f74";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, width - 12, height - 12);

  // Bank mark, top-left.
  drawLogo(ctx, cheque.bankName, 64, 40, 46);

  // Cheque number + date, top-right.
  ctx.textAlign = "right";
  ctx.fillStyle = "#2f3b2f";
  ctx.font = "bold 20px Georgia";
  ctx.fillText(`No. ${cheque.chequeNumber}`, width - 24, 30);
  ctx.font = "16px Georgia";
  ctx.fillText(cheque.date, width - 24, 54);
  ctx.textAlign = "left";

  // Payer name/address block.
  ctx.fillStyle = "#2f3b2f";
  ctx.font = "15px Georgia";
  ctx.fillText(cheque.payerName, 24, 90);
  ctx.fillStyle = "#5a6a5a";
  ctx.font = "12px Georgia";
  ctx.fillText("123 Commerce Street", 24, 106);

  // Pay to the order of + amount.
  let y = 150;
  ctx.fillStyle = "#2f3b2f";
  ctx.font = "13px Georgia";
  ctx.fillText("PAY TO THE ORDER OF", 24, y);
  ctx.font = "20px 'Segoe Script', Georgia";
  ctx.fillText(OUR_COMPANY_NAME, 200, y + 2);
  ctx.beginPath();
  ctx.moveTo(200, y + 8);
  ctx.lineTo(width - 150, y + 8);
  ctx.stroke();

  ctx.strokeStyle = "#2f3b2f";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(width - 140, y - 22, 116, 28);
  ctx.font = "bold 20px Georgia";
  ctx.textAlign = "right";
  ctx.fillText(formatCurrency(cheque.amount, cheque.currencyCode), width - 34, y - 3);
  ctx.textAlign = "left";

  // Amount in words.
  y += 34;
  ctx.font = "italic 15px Georgia";
  ctx.fillStyle = "#2f3b2f";
  ctx.fillText(`${amountToWords(cheque.amount)} dollars`, 24, y);
  ctx.beginPath();
  ctx.moveTo(24, y + 6);
  ctx.lineTo(width - 24, y + 6);
  ctx.stroke();

  // Memo + signature.
  y = height - 46;
  ctx.font = "12px Georgia";
  ctx.fillStyle = "#5a6a5a";
  ctx.fillText(`Memo: ${cheque.memo}`, 24, y + 14);
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(220, y);
  ctx.stroke();

  // Deterministic squiggly signature.
  ctx.strokeStyle = "#1f2a4d";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const sigX = width - 220;
  const sigY = height - 50;
  ctx.moveTo(sigX, sigY);
  for (let i = 0; i < 8; i++) {
    const cx1 = sigX + (i + rand()) * 20;
    const cy1 = sigY - rand() * 18;
    const cx2 = sigX + (i + 0.5 + rand()) * 20;
    const cy2 = sigY + rand() * 14;
    ctx.quadraticCurveTo(cx1, cy1, cx2, cy2);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sigX, height - 34);
  ctx.lineTo(sigX + 176, height - 34);
  ctx.strokeStyle = "#2f3b2f";
  ctx.lineWidth = 1;
  ctx.stroke();

  // MICR-style routing/account line along the bottom, in a mono font to
  // suggest magnetic ink character recognition digits.
  const micrHash = rngFromString(`micr-${cheque.id}`);
  const routing = Array.from({ length: 9 }, () => Math.floor(micrHash() * 10)).join("");
  const account = Array.from({ length: 10 }, () => Math.floor(micrHash() * 10)).join("");
  ctx.font = "20px 'Courier New', monospace";
  ctx.fillStyle = "#1f2a4d";
  ctx.fillText(`⑆${routing}⑆ ${account}⑈ ${cheque.chequeNumber}`, 24, height - 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export type PhoneDialState = "loading" | "connected" | "disconnected" | "disabled";

const DIAL_CAPTION: Record<PhoneDialState, string> = {
  loading: "...",
  connected: "Connected",
  disconnected: "Tap to connect",
  disabled: "Demo mode",
};

const DIAL_DOT_COLOR: Record<PhoneDialState, string> = {
  loading: "#999999",
  connected: "#2ecc71",
  disconnected: "#13b5ea",
  disabled: "#f39c12",
};

/**
 * Renders the "dial face" texture for the desk's rotary phone prop as a
 * Xero-branded logo plate rather than a numbered rotary dial: a plain text
 * "XERO" wordmark (deliberately not a reproduction of Xero's actual logo
 * artwork/mark, just the brand name in their brand blue, the same way a
 * real "Connect to Xero" button would reference it) centred within the
 * brass bezel, plus a status dot and caption reflecting the current
 * connection state.
 */
export function createPhoneDialTexture(state: PhoneDialState): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  const cx = size / 2;
  const cy = size / 2;

  // Brass outer ring, classic rotary-phone dial bezel.
  const ringGradient = ctx.createLinearGradient(0, 0, size, size);
  ringGradient.addColorStop(0, "#f5d78e");
  ringGradient.addColorStop(0.5, "#b8862f");
  ringGradient.addColorStop(1, "#8a6320");
  ctx.fillStyle = ringGradient;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();

  // Cream logo plate, inset within the brass ring, in place of the usual
  // numbered finger-hole dial.
  ctx.fillStyle = "#f4f1e8";
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#cfc9b8";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#13b5ea"; // Xero's brand blue - text only, not the logo mark.
  ctx.font = "bold 100px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("XERO", cx, cy - 30);

  ctx.beginPath();
  ctx.fillStyle = DIAL_DOT_COLOR[state];
  ctx.arc(cx - 96, cy + 70, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3a3a3a";
  ctx.font = "30px Arial";
  ctx.textAlign = "left";
  ctx.fillText(DIAL_CAPTION[state], cx - 60, cy + 70);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Faux-inspirational office posters that are actually the opposite. */
export const DEMOTIVATIONAL_SAYINGS: string[] = [
  "It's not meant to be fun,\nyou're here to work",
  "Dream less.\nReconcile more.",
  "TEAMWORK\nmeans someone else\ngets the blame",
  "Every invoice matters.\n(to someone else)",
  "You miss 100% of the\nnaps you don't take\nUnfortunately, HR notices",
  "ALMOST FRIDAY\nsaid every day of the week",
  "AMBITION\nThe first step towards\ndisappointment",
  "MEETINGS\nNone of us is as dumb\nas all of us",
  "CHANGE\nIt's what's left of your\npay after the deductions",
  "SYNERGY\nA word used to justify\nyet another meeting",
  "DEADLINES\nWho says nothing\nfocuses the mind",
];

/**
 * Picks a deterministic "pose" index for the little cartoon management
 * drawing based on the poster's text, so the same saying always renders
 * with the same doodle and different posters get visual variety.
 */
function pickManagerPose(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return hash % 3;
}

/**
 * Draws a little cartoon-style "management" figure - bold black outlines,
 * flat suit colours, a stern or smug expression - standing with its feet
 * at (centerX, groundY). `pose` picks between a few sarcastic management
 * cliches: pointing at someone, smugly sipping coffee, or barking into a
 * phone (a nod to the office's rotary phone prop).
 */
function drawCartoonManager(ctx: CanvasRenderingContext2D, pose: number, centerX: number, groundY: number): void {
  ctx.save();
  ctx.translate(centerX, groundY);
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#111111";

  // Legs (dark suit trousers).
  ctx.fillStyle = "#2b2b38";
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-22, -55);
  ctx.lineTo(-6, -55);
  ctx.lineTo(-4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(22, -55);
  ctx.lineTo(6, -55);
  ctx.lineTo(4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Torso (suit jacket).
  ctx.fillStyle = "#38405a";
  ctx.beginPath();
  ctx.moveTo(-30, -55);
  ctx.quadraticCurveTo(-34, -110, -20, -120);
  ctx.lineTo(20, -120);
  ctx.quadraticCurveTo(34, -110, 30, -55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shirt + tie.
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.moveTo(-10, -120);
  ctx.lineTo(10, -120);
  ctx.lineTo(6, -60);
  ctx.lineTo(-6, -60);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#b23a2e";
  ctx.beginPath();
  ctx.moveTo(-5, -118);
  ctx.lineTo(5, -118);
  ctx.lineTo(8, -70);
  ctx.lineTo(0, -60);
  ctx.lineTo(-8, -70);
  ctx.closePath();
  ctx.fill();

  // Pose-specific arms + prop, drawn before the head so the head sits on top.
  ctx.fillStyle = "#38405a";
  if (pose === 0) {
    // Pointing sternly at the viewer.
    ctx.beginPath();
    ctx.moveTo(20, -115);
    ctx.lineTo(58, -128);
    ctx.lineTo(52, -138);
    ctx.lineTo(18, -100);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f0c9a0";
    ctx.beginPath();
    ctx.ellipse(58, -133, 8, 6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#38405a";
    ctx.beginPath();
    ctx.moveTo(-20, -115);
    ctx.lineTo(-30, -65);
    ctx.lineTo(-18, -62);
    ctx.lineTo(-14, -110);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (pose === 1) {
    // Smugly sipping from a giant coffee mug.
    ctx.beginPath();
    ctx.moveTo(18, -115);
    ctx.lineTo(38, -128);
    ctx.lineTo(30, -140);
    ctx.lineTo(12, -128);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Mug.
    ctx.fillStyle = "#d8d8d8";
    ctx.beginPath();
    ctx.rect(24, -150, 22, 22);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(48, -142, 6, 9, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.fillStyle = "#38405a";
    ctx.beginPath();
    ctx.moveTo(-20, -115);
    ctx.lineTo(-34, -95);
    ctx.lineTo(-22, -88);
    ctx.lineTo(-14, -108);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Barking into a phone handset (a nod to the desk's rotary phone).
    ctx.beginPath();
    ctx.moveTo(20, -115);
    ctx.lineTo(36, -136);
    ctx.lineTo(28, -146);
    ctx.lineTo(14, -125);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Dumbbell-shaped handset held to the ear, echoing the desk's rotary phone.
    ctx.fillStyle = "#20242b";
    ctx.beginPath();
    ctx.moveTo(24, -155);
    ctx.lineTo(40, -139);
    ctx.lineTo(34, -133);
    ctx.lineTo(18, -149);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(21, -152, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(37, -136, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#38405a";
    ctx.beginPath();
    ctx.moveTo(-20, -115);
    ctx.lineTo(-36, -80);
    ctx.lineTo(-24, -74);
    ctx.lineTo(-14, -108);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Head.
  ctx.fillStyle = "#f0c9a0";
  ctx.beginPath();
  ctx.arc(0, -140, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Face: stern eyebrows for the pointing/phone poses, a smug closed
  // smile for the coffee pose.
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (pose === 1) {
    ctx.moveTo(-10, -146);
    ctx.lineTo(-3, -144);
    ctx.moveTo(3, -144);
    ctx.lineTo(10, -146);
  } else {
    ctx.moveTo(-10, -145);
    ctx.lineTo(-3, -149);
    ctx.moveTo(3, -149);
    ctx.lineTo(10, -145);
  }
  ctx.stroke();

  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(-6, -140, 2, 0, Math.PI * 2);
  ctx.arc(6, -140, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  if (pose === 2) {
    // Open, shouting mouth.
    ctx.ellipse(0, -130, 5, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#7a2020";
    ctx.fill();
    ctx.stroke();
  } else if (pose === 1) {
    // Smug closed smile.
    ctx.moveTo(-6, -130);
    ctx.quadraticCurveTo(0, -125, 6, -130);
    ctx.stroke();
  } else {
    // Flat, unimpressed frown.
    ctx.moveTo(-6, -128);
    ctx.lineTo(6, -128);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders a black-frame "motivational" poster with a sarcastic office
 * saying - the visual gag for the cubicle wall.
 */
export function createPosterTexture(text: string): THREE.CanvasTexture {
  const width = 400;
  const height = 500;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  // Black poster frame/background, classic demotivator style.
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  const imageInset = 24;
  const imageBottom = height * 0.62;
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 2;
  ctx.strokeRect(imageInset, imageInset, width - imageInset * 2, imageBottom - imageInset);

  // Bleak little "photo" area: flat grey gradient horizon.
  const grad = ctx.createLinearGradient(0, imageInset, 0, imageBottom);
  grad.addColorStop(0, "#5a6570");
  grad.addColorStop(1, "#8a8478");
  ctx.fillStyle = grad;
  ctx.fillRect(imageInset + 2, imageInset + 2, width - imageInset * 2 - 4, imageBottom - imageInset - 4);

  // A little cartoon-style management figure, standing in for the old
  // bleak "photo" - same demotivator frame, same sarcastic wording, just
  // a doodle of the boss instead of a slumped silhouette.
  drawCartoonManager(ctx, pickManagerPose(text), width / 2, imageBottom - 12);

  // Title + caption below, in the demotivator poster tradition.
  const lines = text.split("\n");
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 30px Georgia";
  ctx.fillText(lines[0], width / 2, imageBottom + 55);

  ctx.font = "16px Georgia";
  ctx.fillStyle = "#cfcfcf";
  for (let i = 1; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, imageBottom + 85 + (i - 1) * 24);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
