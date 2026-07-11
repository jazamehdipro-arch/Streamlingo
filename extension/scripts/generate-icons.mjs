// Generates simple placeholder PNG icons (black bg, white play-triangle) for
// the manifest — no design tooling available in this environment, so this
// draws raw pixels and hand-rolls a minimal PNG encoder (IHDR/IDAT/IEND +
// CRC32) instead of depending on a native image library.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "icons");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [17, 17, 17, 255]; // near-black
  const fg = [255, 255, 255, 255];
  const cx = size / 2;
  const cy = size / 2;
  // Play-triangle pointing right, inscribed in a circle of radius ~0.32*size.
  const r = size * 0.32;
  const triLeft = cx - r * 0.55;
  const triRight = cx + r * 0.75;
  const triTop = cy - r * 0.85;
  const triBottom = cy + r * 0.85;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let color = bg;

      const dx = x - cx;
      const dy = y - cy;
      const insideCircle = dx * dx + dy * dy <= r * r * 2.1;

      if (insideCircle) {
        // Point-in-triangle via the standard barycentric sign test.
        const pt = [x + 0.5, y + 0.5];
        const v1 = [triLeft, triTop];
        const v2 = [triLeft, triBottom];
        const v3 = [triRight, cy];
        const sign = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
        const d1 = sign(pt, v1, v2);
        const d2 = sign(pt, v2, v3);
        const d3 = sign(pt, v3, v1);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) color = fg;
      }

      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = color[3];
    }
  }
  return rgba;
}

for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, size, drawIcon(size));
  writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icons/icon-${size}.png`);
}
