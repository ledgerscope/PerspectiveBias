import * as THREE from "three";
import type { Invoice } from "../xero/types";

// A4 aspect ratio at a resolution sharp enough to read text when held close.
const CANVAS_WIDTH = 794; // px, ~96dpi A4 width
const CANVAS_HEIGHT = 1123; // px, ~96dpi A4 height

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

/**
 * Renders an invoice onto an offscreen canvas that looks like a printed A4
 * invoice, and returns it as a Three.js texture to be mapped onto a paper
 * mesh.
 */
export function createInvoiceTexture(invoice: Invoice): THREE.CanvasTexture {
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
  ctx.fillStyle = "#111111";
  ctx.font = "bold 40px Arial";
  ctx.fillText("INVOICE", margin, margin + 36);

  ctx.font = "20px Arial";
  ctx.fillStyle = "#444444";
  ctx.fillText(invoice.invoiceNumber, margin, margin + 68);

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

/**
 * Generates a procedural "random photo" placeholder texture for the cubicle
 * wall (abstract gradient + shapes) so the wall doesn't need real image
 * assets for the prototype. Swap `public/wall-images` with real photos and
 * point CubicleWall at them for the final version.
 */
export function createPlaceholderPhotoTexture(seed: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  // Deterministic pseudo-random generator so wall layout is stable per seed.
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const hue = Math.floor(rand() * 360);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, `hsl(${hue}, 55%, 65%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360}, 55%, 40%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // A few random shapes to suggest "photo content" without real images.
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `hsla(${(hue + i * 40) % 360}, 70%, 80%, 0.5)`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 20 + rand() * 60, 0, Math.PI * 2);
    ctx.fill();
  }

  // White polaroid-style border.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, size - 14, size - 14);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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

// Standard-ish rotary-dial finger-hole numbering, clockwise from just past
// the finger stop at the bottom: 1 through 9, then 0 back near the top.
const DIAL_NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/**
 * Renders the "dial face" texture for the desk's rotary phone prop as a
 * classic rotary dial: a brass finger-hole ring numbered 1-0 around a
 * cream faceplate, with a small centre "number card" window carrying a
 * plain text "XERO" wordmark (deliberately not a reproduction of Xero's
 * actual logo artwork/mark, just the brand name in their brand blue, the
 * same way a real "Connect to Xero" button would reference it) plus a
 * status dot and caption reflecting the current connection state - mimicking
 * where a real rotary phone prints its own number.
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

  // Cream dial face, inset within the brass ring.
  ctx.fillStyle = "#f4f1e8";
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#cfc9b8";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Ten finger holes in a ring, each showing a dark "cutout" over the rotor
  // beneath and its dialled digit, leaving a gap at the bottom for the
  // finger stop the same way a real dial does.
  const holeOrbit = size * 0.335;
  const holeRadius = size * 0.062;
  const startAngle = Math.PI / 2 + (Math.PI * 2) / 10 * 0.65; // just past 6 o'clock
  const sweep = Math.PI * 2 * 0.92; // leaves a finger-stop gap at the bottom
  for (let i = 0; i < DIAL_NUMBERS.length; i++) {
    const angle = startAngle + (sweep / (DIAL_NUMBERS.length - 1)) * i;
    const hx = cx + Math.cos(angle) * holeOrbit;
    const hy = cy + Math.sin(angle) * holeOrbit;

    ctx.beginPath();
    ctx.fillStyle = "#1c1c1c";
    ctx.arc(hx, hy, holeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9c9284";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#f4f1e8";
    ctx.font = `bold ${Math.round(size * 0.045)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(DIAL_NUMBERS[i], hx, hy);
  }

  // Small brass finger-stop wedge at the bottom of the dial.
  ctx.fillStyle = "#8a6320";
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy + holeOrbit + holeRadius + 6);
  ctx.lineTo(cx + 14, cy + holeOrbit + holeRadius + 6);
  ctx.lineTo(cx, cy + holeOrbit - holeRadius - 2);
  ctx.closePath();
  ctx.fill();

  // Centre "number card" window - the same spot a real rotary phone prints
  // its own number, repurposed for the Xero wordmark + connection status.
  const cardRadius = size * 0.225;
  ctx.beginPath();
  ctx.fillStyle = "#fffdf6";
  ctx.arc(cx, cy, cardRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a6320";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = "#13b5ea"; // Xero's brand blue - text only, not the logo mark.
  ctx.font = "bold 58px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("XERO", cx, cy - 24);

  ctx.beginPath();
  ctx.fillStyle = DIAL_DOT_COLOR[state];
  ctx.arc(cx - 58, cy + 34, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3a3a3a";
  ctx.font = "20px Arial";
  ctx.textAlign = "left";
  ctx.fillText(DIAL_CAPTION[state], cx - 40, cy + 34);

  // Brass centre pivot pin, the little screw every rotary dial has.
  ctx.beginPath();
  ctx.fillStyle = "#d4af37";
  ctx.arc(cx, cy + cardRadius - 8, 6, 0, Math.PI * 2);
  ctx.fill();

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
];

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

  // A single small silhouette figure slumped at a desk, for the "bleak" look.
  ctx.fillStyle = "#20242a";
  ctx.fillRect(width / 2 - 30, imageBottom - 70, 60, 40);
  ctx.beginPath();
  ctx.arc(width / 2, imageBottom - 80, 16, 0, Math.PI * 2);
  ctx.fill();

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
