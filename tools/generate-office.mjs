// Genera el tileset de OFICINA (32x32) para la vista animada del equipo.
// Mismo estilo pixel-art que el pueblo. Uso: node tools/generate-office.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'assets', 'pokemon');

// ── PNG encoder mínimo ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const t = Buffer.from(type, 'ascii'); const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([l, t, data, cr]); }
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4; const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.buf = Buffer.alloc(w * h * 4); }
  set(x, y, [r, g, b, a = 255]) { if (x < 0 || y < 0 || x >= this.w || y >= this.h || a === 0) return; const i = (y * this.w + x) * 4; this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b; this.buf[i + 3] = a; }
  png() { return encodePNG(this.w, this.h, this.buf); }
}

const C = {
  floor: [226, 210, 184], floorLine: [208, 190, 160],
  wall: [128, 140, 160], wallTop: [96, 108, 130], wallHi: [156, 168, 186],
  desk: [154, 108, 66], deskDark: [122, 84, 50], deskHi: [178, 132, 88],
  screen: [58, 62, 76], screenOn: [96, 178, 226], keys: [226, 226, 232],
  chair: [62, 66, 82], chairDark: [44, 48, 60],
  pot: [166, 100, 62], leaf: [72, 152, 84], leafHi: [104, 186, 112],
  rug: [186, 84, 94], rugEdge: [146, 62, 74],
  cab: [186, 190, 200], cabLine: [150, 155, 168],
  T: [0, 0, 0, 0],
};

const tiles = {
  floor(p) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, C.floor);
    for (let x = 0; x < 32; x++) { p(x, 0, C.floorLine); p(x, 16, C.floorLine); }
    for (let y = 0; y < 32; y++) { p(0, y, C.floorLine); p(16, y, C.floorLine); }
  },
  wall(p) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, C.wall);
    for (let x = 0; x < 32; x++) { p(x, 0, C.wallTop); p(x, 1, C.wallTop); p(x, 31, C.wallTop); }
    for (let x = 2; x < 30; x += 8) for (let y = 4; y < 28; y++) p(x, y, C.wallHi);
  },
  desk(p) {
    tiles.floor(p);
    // superficie del escritorio
    for (let y = 8; y <= 28; y++) for (let x = 2; x <= 29; x++) p(x, y, C.desk);
    for (let x = 2; x <= 29; x++) { p(x, 8, C.deskHi); p(x, 28, C.deskDark); }
    for (let y = 8; y <= 28; y++) { p(2, y, C.deskDark); p(29, y, C.deskDark); }
    // monitor
    for (let y = 10; y <= 18; y++) for (let x = 9; x <= 22; x++) p(x, y, C.screen);
    for (let y = 11; y <= 16; y++) for (let x = 10; x <= 21; x++) p(x, y, C.screenOn);
    // teclado
    for (let y = 21; y <= 24; y++) for (let x = 10; x <= 21; x++) p(x, y, C.keys);
    for (let x = 11; x <= 20; x += 2) p(x, 22, C.chairDark);
  },
  chair(p) {
    tiles.floor(p);
    for (let y = 12; y <= 26; y++) for (let x = 9; x <= 22; x++) p(x, y, C.chair);
    for (let x = 9; x <= 22; x++) { p(x, 12, C.chairDark); p(x, 26, C.chairDark); }
    for (let y = 6; y <= 12; y++) for (let x = 11; x <= 20; x++) p(x, y, C.chairDark);
  },
  plant(p) {
    tiles.floor(p);
    for (let y = 20; y <= 29; y++) for (let x = 11; x <= 20; x++) p(x, y, C.pot);
    for (let x = 11; x <= 20; x++) p(x, 20, [196, 128, 84]);
    for (let y = 4; y < 20; y++) {
      const w = Math.round(9 - Math.abs(12 - y) * 0.35);
      for (let x = 16 - w; x <= 16 + w; x++) p(x, y, (x + y) % 3 === 0 ? C.leafHi : C.leaf);
    }
  },
  rug(p) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, C.rug);
    for (let x = 0; x < 32; x++) { p(x, 0, C.rugEdge); p(x, 31, C.rugEdge); }
    for (let y = 0; y < 32; y++) { p(0, y, C.rugEdge); p(31, y, C.rugEdge); }
    for (let y = 6; y < 26; y += 6) for (let x = 5; x < 27; x++) p(x, y, C.rugEdge);
  },
  door(p) {
    tiles.floor(p);
    for (let y = 0; y < 32; y++) { for (let x = 0; x <= 3; x++) p(x, y, C.wall); for (let x = 28; x < 32; x++) p(x, y, C.wall); }
    for (let y = 0; y < 32; y++) { p(3, y, C.wallTop); p(28, y, C.wallTop); }
  },
  cabinet(p) {
    tiles.floor(p);
    for (let y = 5; y <= 28; y++) for (let x = 4; x <= 27; x++) p(x, y, C.cab);
    for (let x = 4; x <= 27; x++) { p(x, 5, [214, 218, 226]); p(x, 28, C.cabLine); }
    for (const yy of [12, 19, 26]) for (let x = 4; x <= 27; x++) p(x, yy, C.cabLine);
    for (const yy of [9, 16, 23]) for (let x = 13; x <= 18; x++) p(x, yy, C.cabLine);
  },
};

const ORDER = ['floor', 'wall', 'desk', 'chair', 'plant', 'rug', 'door', 'cabinet'];
const COLS = 8;
const c = new Canvas(COLS * 32, 32);
ORDER.forEach((name, i) => {
  const ox = (i % COLS) * 32, oy = 0;
  tiles[name]((lx, ly, col) => c.set(ox + lx, oy + ly, col));
});
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'office-tileset.png'), c.png());
console.log(`✔ office-tileset.png (${COLS * 32}x32) — tiles: ${ORDER.join(', ')}`);

// preview ampliado x4 para inspección
const S = 4;
const prev = new Canvas(COLS * 32 * S, 32 * S);
for (let y = 0; y < 32; y++) for (let x = 0; x < COLS * 32; x++) {
  const si = (y * COLS * 32 + x) * 4;
  const col = [c.buf[si], c.buf[si + 1], c.buf[si + 2], c.buf[si + 3]];
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) prev.set(x * S + dx, y * S + dy, col);
}
const pdir = process.env.PREVIEW_DIR || path.join(__dirname, '..', '.preview');
fs.mkdirSync(pdir, { recursive: true });
fs.writeFileSync(path.join(pdir, 'office-preview.png'), prev.png());
console.log(`✔ preview: ${path.join(pdir, 'office-preview.png')}`);
