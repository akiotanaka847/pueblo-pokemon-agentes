// ─────────────────────────────────────────────────────────────
//  Generador de MAPA estilo Pallet Town para el pueblo Pokémon IA
//  Sin dependencias: crea un tileset PNG original + las matrices de
//  índices (bgtiles / objmap) en el formato que espera el motor.
//
//  Uso:  node tools/generate-map.mjs
//  Salida:
//    - public/assets/pokemon/town-tileset.png
//    - preview del mapa completo para inspección visual
// ─────────────────────────────────────────────────────────────
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PREVIEW = process.env.PREVIEW_DIR || path.join(ROOT, '.preview');

// ── PNG encoder (RGBA 8-bit) ──────────────────────────────────
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

// ── Paleta Pokémon ────────────────────────────────────────────
const C = {
  grass: [112, 198, 108], grassD: [86, 172, 92], grassL: [150, 224, 128],
  sand: [232, 214, 156], sandD: [206, 186, 128],
  water: [92, 154, 226], waterD: [66, 122, 202], foam: [200, 226, 255],
  leaf: [58, 156, 82], leafD: [40, 120, 62], leafL: [96, 196, 112], trunk: [122, 82, 46],
  roofR: [214, 78, 64], roofRD: [172, 54, 46],
  roofB: [86, 120, 210], roofBD: [58, 90, 178],
  roofG: [150, 158, 172], roofGD: [110, 120, 138],
  wall: [238, 226, 198], wallD: [206, 190, 156], wallS: [250, 242, 220],
  door: [126, 84, 48], doorD: [96, 62, 34], knob: [240, 210, 90],
  win: [140, 206, 234], winF: [246, 244, 230],
  fred: [232, 82, 92], fyel: [246, 222, 96], fcen: [250, 240, 150],
  wood: [176, 132, 78], woodD: [140, 100, 56],
  T: [0, 0, 0, 0], // transparente
};

// ── Pintores de tiles (32x32 cada uno) ────────────────────────
// Cada función recibe put(lx,ly,color) local a su tile.
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

const tiles = {
  grass(p) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, C.grass);
    const specks = [[5, 7], [12, 20], [24, 10], [18, 27], [9, 15], [28, 24]];
    for (const [x, y] of specks) p(x, y, C.grassD);
    for (const [x, y] of [[7, 6], [21, 9], [27, 22], [14, 17]]) { p(x, y, C.grassL); p(x, y - 1, C.grassL); }
  },
  grass2(p) { tiles.grass(p); for (let y = 12; y <= 18; y++) for (let x = 14; x <= 18; x++) if ((x + y) % 2) p(x, y, y > 15 ? C.grassD : C.grassL); },
  tallgrass(p) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, C.grassD);
    for (let x = 2; x < 32; x += 4) { const h = 8 + (hash(x, 3) % 8); for (let y = 31; y > 31 - h; y--) p(x, y, C.grass); p(x, 31 - h, C.grassL); p(x + 1, 31 - h + 2, C.grass); }
  },
  path(p) { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, C.sand); for (const [x, y] of [[6, 8], [20, 14], [12, 24], [26, 6], [16, 30]]) p(x, y, C.sandD); },
  water(p) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, ((x + y) % 8 < 4) ? C.water : C.waterD);
    for (const row of [6, 15, 24]) for (let x = (row % 6); x < 32; x += 7) { p(x, row, C.foam); p(x + 1, row, C.foam); }
  },
  flowerR(p) { tiles.grass(p); tiles._flower(p, 9, 10, C.fred); tiles._flower(p, 22, 20, C.fred); },
  flowerY(p) { tiles.grass(p); tiles._flower(p, 11, 21, C.fyel); tiles._flower(p, 21, 9, C.fyel); },
  _flower(p, cx, cy, col) { p(cx, cy - 1, col); p(cx - 1, cy, col); p(cx + 1, cy, col); p(cx, cy + 1, col); p(cx, cy, C.fcen); },
  tree(p) {
    // copa redondeada
    for (let y = 0; y < 25; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 16, dy = (y - 12) * 1.25;
      if (dx * dx + dy * dy <= 15 * 15) p(x, y, (x < 14 && y < 12) ? C.leafL : (y > 18 || x > 24) ? C.leafD : C.leaf);
    }
    for (const [x, y] of [[10, 6], [18, 9], [22, 14], [8, 16]]) p(x, y, C.leafL);
    // tronco
    for (let y = 23; y < 32; y++) for (let x = 13; x <= 18; x++) p(x, y, x > 16 ? C.trunk : C.trunk);
    for (let y = 23; y < 32; y++) { p(13, y, C.doorD); p(18, y, C.doorD); }
  },
  fence(p) {
    for (const px of [4, 15, 26]) for (let y = 8; y < 24; y++) p(px, y, C.wood);
    for (let x = 2; x < 30; x++) { p(x, 12, C.wood); p(x, 18, C.woodD); }
  },
  sign(p) {
    for (let y = 16; y < 30; y++) { p(15, y, C.woodD); p(16, y, C.wood); }
    for (let y = 4; y <= 15; y++) for (let x = 6; x <= 25; x++) p(x, y, (y === 4 || y === 15 || x === 6 || x === 25) ? C.woodD : C.wood);
    for (const yy of [8, 11]) for (let x = 9; x <= 22; x++) p(x, yy, C.doorD);
  },
  // techos (variantes L/M/R por color)
  _roof(p, col, colD, side) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, col);
    for (let x = 0; x < 32; x++) { p(x, 0, colD); p(x, 1, colD); } // cumbrera
    for (let y = 4; y < 32; y += 5) for (let x = 0; x < 32; x++) if ((x + y) % 3 === 0) p(x, y, colD); // tejas
    if (side === 'L') for (let y = 0; y < 32; y++) { p(0, y, colD); p(1, y, colD); }
    if (side === 'R') for (let y = 0; y < 32; y++) { p(31, y, colD); p(30, y, colD); }
    for (let x = 0; x < 32; x++) { p(x, 31, colD); } // alero inferior
  },
  wall(p) { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, y > 27 ? C.wallD : (x < 2 || x > 29) ? C.wallD : C.wall); for (let x = 3; x < 29; x++) p(x, 2, C.wallS); },
  door(p) { tiles.wall(p); for (let y = 6; y < 32; y++) for (let x = 10; x <= 21; x++) p(x, y, (x === 10 || x === 21 || y === 6) ? C.doorD : C.door); p(19, 19, C.knob); },
  window(p) { tiles.wall(p); for (let y = 7; y <= 20; y++) for (let x = 8; x <= 23; x++) p(x, y, (x === 8 || x === 23 || y === 7 || y === 20) ? C.winF : C.win); for (let y = 7; y <= 20; y++) p(15, y, C.winF); for (let x = 8; x <= 23; x++) p(x, 13, C.winF); },
  // Centro Pokémon: techo rojo con banda blanca y cruz (side L/M/C/R)
  _pcroof(p, side) {
    const edge = side === 'L' ? 'L' : side === 'R' ? 'R' : 'M';
    tiles._roof(p, C.roofR, C.roofRD, edge);
    for (let y = 11; y <= 20; y++) for (let x = 0; x < 32; x++) p(x, y, C.wallS);
    if (side === 'C') {
      for (let y = 12; y <= 19; y++) { p(15, y, C.roofR); p(16, y, C.roofR); }
      for (let x = 12; x <= 19; x++) { p(x, 15, C.roofR); p(x, 16, C.roofR); }
    }
  },
  // Puerta de cristal doble (entrada del Centro / Poké Mart)
  glassdoor(p) {
    tiles.wall(p);
    for (let y = 6; y < 31; y++) for (let x = 7; x <= 24; x++) p(x, y, (x === 7 || x === 24 || y === 6) ? C.wallD : C.win);
    for (let y = 6; y < 31; y++) { p(15, y, C.wallD); p(16, y, C.wallD); }
    for (let y = 9; y < 22; y++) { p(10, y, C.winF); p(20, y, C.winF); }
  },
};

// Orden = índice del tile (grid de 8 de ancho)
const TILE_ORDER = [
  'grass', 'grass2', 'tallgrass', 'path', 'water', 'flowerR', 'flowerY', 'tree',      // 0-7
  'fence', 'sign', 'roofRL', 'roofRM', 'roofRR', 'roofBL', 'roofBM', 'roofBR',        // 8-15
  'roofGL', 'roofGM', 'roofGR', 'wall', 'door', 'window',                            // 16-21
  'roofPCL', 'roofPCM', 'roofPCC', 'roofPCR', 'glassdoor',                           // 22-26
];
const IDX = Object.fromEntries(TILE_ORDER.map((n, i) => [n, i]));
const painterFor = (name) => {
  if (name.startsWith('roofPC')) return (p) => tiles._pcroof(p, name.slice(-1));
  if (name.startsWith('roofR')) return (p) => tiles._roof(p, C.roofR, C.roofRD, name.slice(-1));
  if (name.startsWith('roofB')) return (p) => tiles._roof(p, C.roofB, C.roofBD, name.slice(-1));
  if (name.startsWith('roofG')) return (p) => tiles._roof(p, C.roofG, C.roofGD, name.slice(-1));
  return tiles[name];
};

// ── Construir el tileset PNG ──────────────────────────────────
const COLS = 8;
const ROWS = Math.ceil(TILE_ORDER.length / COLS);
const TILESET_W = COLS * 32, TILESET_H = ROWS * 32;
const tileset = new Canvas(TILESET_W, TILESET_H);
TILE_ORDER.forEach((name, i) => {
  const ox = (i % COLS) * 32, oy = Math.floor(i / COLS) * 32;
  painterFor(name)((lx, ly, color) => tileset.set(ox + lx, oy + ly, color));
});
fs.mkdirSync(path.join(ROOT, 'public', 'assets', 'pokemon'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public', 'assets', 'pokemon', 'town-tileset.png'), tileset.png());

// ── Construir el mapa (capas [x][y]) ──────────────────────────
const W = 40, H = 30;
const EMPTY = -1;
const bg = Array.from({ length: W }, () => new Array(H).fill(IDX.grass));
const obj = Array.from({ length: W }, () => new Array(H).fill(EMPTY));
const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const setBg = (x, y, t) => { if (inB(x, y)) bg[x][y] = t; };
const setObj = (x, y, t) => { if (inB(x, y)) obj[x][y] = t; };

// césped decorado (deterministico)
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  const h = hash(x, y) % 100;
  if (h < 6) bg[x][y] = IDX.grass2;
  else if (h === 7) bg[x][y] = IDX.flowerY;
}

// parche de hierba alta (zona de "encuentros")
for (let x = 32; x <= 37; x++) for (let y = 3; y <= 7; y++) setBg(x, y, IDX.tallgrass);

// jardines de flores (frente al Centro y a la casa central)
for (const [x, y] of [[6, 8], [7, 8], [6, 9], [24, 12], [25, 12]]) setBg(x, y, IDX.flowerR);
for (const [x, y] of [[7, 9], [25, 11]]) setBg(x, y, IDX.flowerY);

// caminos de tierra (transitables): cruz principal + ramales a las puertas
for (let y = 1; y <= 28; y++) { setBg(19, y, IDX.path); setBg(20, y, IDX.path); } // vertical
for (let x = 1; x <= 38; x++) { setBg(x, 14, IDX.path); setBg(x, 15, IDX.path); } // horizontal
const spur = (x, y0, y1) => { for (let y = y0; y <= y1; y++) setBg(x, y, IDX.path); };
spur(8, 7, 13);    // -> Centro Pokémon
spur(27, 7, 13);   // -> Poké Mart
spur(24, 10, 13);  // -> casa central
spur(6, 16, 21);   // -> laboratorio de Oak
spur(29, 16, 20);  // -> casa roja

// borde de árboles (bloquea salir del pueblo)
for (let x = 0; x < W; x++) { setObj(x, 0, IDX.tree); setObj(x, H - 1, IDX.tree); }
for (let y = 0; y < H; y++) { setObj(0, y, IDX.tree); setObj(W - 1, y, IDX.tree); }

// estanque de agua (bloquea) + baranda de madera
for (let x = 11; x <= 16; x++) for (let y = 22; y <= 26; y++) setObj(x, y, IDX.water);
for (let x = 11; x <= 16; x++) setObj(x, 21, IDX.fence);

// ── edificios (fila de techo + fila de cuerpo) ──
function building(x, y, roof, body) {
  roof.forEach((t, i) => setObj(x + i, y, IDX[t]));
  body.forEach((t, i) => setObj(x + i, y + 1, IDX[t]));
}
// Centro Pokémon (rojo, 5 de ancho: cruz + puerta de cristal)
building(6, 5, ['roofPCL', 'roofPCM', 'roofPCC', 'roofPCM', 'roofPCR'],
               ['wall', 'window', 'glassdoor', 'window', 'wall']);
// Poké Mart (azul, 4 de ancho)
building(26, 5, ['roofBL', 'roofBM', 'roofBM', 'roofBR'],
                ['wall', 'glassdoor', 'window', 'wall']);
// Laboratorio del Prof. Oak (gris, 4 de ancho)
building(5, 22, ['roofGL', 'roofGM', 'roofGM', 'roofGR'],
                ['wall', 'door', 'window', 'wall']);
// Casa de techo rojo
building(28, 21, ['roofRL', 'roofRM', 'roofRR'], ['window', 'door', 'wall']);
// Casa de techo azul (central)
building(23, 8, ['roofBL', 'roofBM', 'roofBR'], ['window', 'door', 'wall']);

// clústeres de árboles internos (decoración, sin cerrar zonas)
for (const [cx, cy] of [[3, 4], [3, 26], [36, 26], [36, 11]]) { setObj(cx, cy, IDX.tree); setObj(cx + 1, cy, IDX.tree); }

// letreros frente a los edificios
setObj(11, 6, IDX.sign); // Centro Pokémon
setObj(30, 6, IDX.sign); // Poké Mart
setObj(9, 22, IDX.sign); // laboratorio


// ── Preview del mapa completo (tamaño nativo) ─────────────────
const prev = new Canvas(W * 32, H * 32);
const blit = (idx, dx, dy, skipTransparent) => {
  const col = idx % COLS, row = Math.floor(idx / COLS);
  const sx = col * 32, sy = row * 32;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const si = ((sy + y) * TILESET_W + (sx + x)) * 4;
    const a = tileset.buf[si + 3];
    if (skipTransparent && a === 0) continue;
    prev.set(dx + x, dy + y, [tileset.buf[si], tileset.buf[si + 1], tileset.buf[si + 2], a]);
  }
};
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) blit(bg[x][y], x * 32, y * 32, false);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (obj[x][y] !== EMPTY) blit(obj[x][y], x * 32, y * 32, true);
fs.mkdirSync(PREVIEW, { recursive: true });
fs.writeFileSync(path.join(PREVIEW, 'map-preview.png'), prev.png());

console.log(`✔ tileset: public/assets/pokemon/town-tileset.png (${TILESET_W}x${TILESET_H}, ${TILE_ORDER.length} tiles)`);
console.log(`✔ preview: ${path.join(PREVIEW, 'map-preview.png')}`);
