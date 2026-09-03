// ─────────────────────────────────────────────────────────────
//  Generador de sprites originales estilo Pokémon para AI Town
//  Sin dependencias externas: codifica PNG con el módulo `zlib`.
//
//  Produce, por personaje, una hoja 144x192 (frames de 48x48):
//    fila 0 = abajo, fila 1 = izquierda, fila 2 = derecha, fila 3 = arriba
//    columnas 0/1/2 = ciclo de pasos (caminar)
//
//  Uso:  node tools/generate-sprites.mjs
//  Salida: public/assets/pokemon/<nombre>.png  +  contact sheet de preview
// ─────────────────────────────────────────────────────────────
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'pokemon');
const PREVIEW = process.env.PREVIEW_DIR || path.join(__dirname, '..', '.preview');

// ── Codificador PNG mínimo (RGBA, 8 bits) ─────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = 0 (compression, filter, interlace)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Lienzo RGBA ───────────────────────────────────────────────
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4); // transparente por defecto
  }
  set(x, y, [r, g, b, a = 255]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a === 255) {
      this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b; this.buf[i + 3] = 255;
    } else if (a > 0) {
      // alpha blend sobre lo existente
      const da = this.buf[i + 3] / 255, sa = a / 255;
      const oa = sa + da * (1 - sa);
      this.buf[i] = Math.round((r * sa + this.buf[i] * da * (1 - sa)) / (oa || 1));
      this.buf[i + 1] = Math.round((g * sa + this.buf[i + 1] * da * (1 - sa)) / (oa || 1));
      this.buf[i + 2] = Math.round((b * sa + this.buf[i + 2] * da * (1 - sa)) / (oa || 1));
      this.buf[i + 3] = Math.round(oa * 255);
    }
  }
  png() { return encodePNG(this.w, this.h, this.buf); }
}

// ── Pincel local por celda (32x32), con espejo horizontal ─────
function brush(canvas, cellX, cellY, mirror = false) {
  return {
    px(lx, ly, color) {
      const x = mirror ? SIZE - 1 - lx : lx;
      canvas.set(cellX + x, cellY + ly, color);
    },
    rect(x0, y0, x1, y1, color) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, color);
    },
  };
}

// ── Colores base ──────────────────────────────────────────────
const SIZE = 48;                       // lado del fotograma (antes 32)
const SKIN = [246, 208, 158];
const SKIN_TAN = [198, 140, 96];
const OUT = [26, 22, 30];
const WHITE = [248, 248, 242];
const shade = ([r, g, b], f = 0.75) => [(r * f) | 0, (g * f) | 0, (b * f) | 0];
const light = ([r, g, b], f = 1.15) => [Math.min(255, r * f) | 0, Math.min(255, g * f) | 0, Math.min(255, b * f) | 0];

// ── ENTRENADOR (chibi de ~2,5 cabezas, pies abajo) ────────────
function drawTrainer(b, dir, frame, P) {
  const skin = P.skin || SKIN, skinSh = shade(skin, 0.85);
  const shirt = P.shirt, shirtSh = shade(shirt, 0.78), shirtLt = light(shirt);
  const pants = P.pants, pantsSh = shade(pants, 0.72);
  const shoes = P.shoes || [58, 52, 60];
  const paso = frame === 0 ? 1 : frame === 2 ? -1 : 0;

  // ── piernas y zapatos ──
  if (dir === 'down' || dir === 'up') {
    const li = paso > 0 ? 1 : 0, re = paso < 0 ? 1 : 0;
    b.rect(18, 37, 22, 44 + li, pants);  b.rect(25, 37, 29, 44 + re, pants);
    b.rect(21, 37, 22, 44 + li, pantsSh); b.rect(28, 37, 29, 44 + re, pantsSh);
    b.rect(17, 45 + li, 22, 46 + li, shoes);
    b.rect(25, 45 + re, 30, 46 + re, shoes);
  } else {
    const z = frame === 0 ? 3 : frame === 2 ? -3 : 0;
    b.rect(20, 37, 25, 44, pantsSh);
    b.rect(21 + z, 37, 26 + z, 44, pants);
    b.rect(19, 45, 25, 46, shade(shoes, 0.8));
    b.rect(20 + z, 45, 27 + z, 46, shoes);
  }

  // ── torso ──
  b.rect(15, 25, 32, 38, shirt);
  b.rect(30, 25, 32, 38, shirtSh);          // sombra lateral
  b.rect(15, 25, 32, 26, shirtLt);          // hombros iluminados
  if (P.belt) b.rect(15, 36, 32, 37, P.belt);
  if (P.emblem && dir !== 'up') {           // emblema (Team Rocket)
    b.rect(21, 28, 26, 34, P.emblem);
    b.rect(22, 29, 23, 33, shirt); b.px(24, 31, shirt); b.px(25, 32, shirt);
  }

  // ── brazos ──
  const sw = frame === 0 ? 1 : frame === 2 ? -1 : 0;
  const sleeve = P.sleeve || shirt;
  b.rect(11, 26 + sw, 14, 35 + sw, sleeve);
  b.rect(33, 26 - sw, 36, 35 - sw, sleeve);
  b.rect(11, 34 + sw, 14, 36 + sw, skin);   // manos
  b.rect(33, 34 - sw, 36, 36 - sw, skin);

  // ── cabeza ──
  if (dir === 'up') {
    b.rect(13, 8, 34, 25, P.hair);
    b.rect(31, 9, 34, 24, shade(P.hair, 0.8));
  } else {
    b.rect(13, 8, 34, 25, skin);
    b.rect(31, 10, 34, 24, skinSh);         // sombra de la mejilla
    b.rect(13, 24, 34, 25, skinSh);         // barbilla
  }

  drawHair(b, dir, P);

  // ── cara ──
  if (dir !== 'up') {
    const ojo = (x) => {
      b.rect(x, 16, x + 3, 20, WHITE);      // esclerótica
      b.rect(x + 1, 17, x + 2, 20, OUT);    // pupila
      b.px(x + 1, 17, [120, 150, 200]);     // brillo
    };
    if (P.squint) { b.rect(17, 18, 21, 19, OUT); b.rect(27, 18, 31, 19, OUT); }
    else if (dir === 'down') { ojo(17); ojo(27); }
    else { ojo(26); b.px(34, 20, skinSh); } // de perfil: un ojo y la nariz
    b.rect(22, 22, 25, 22, shade(skin, 0.7));  // boca
    if (P.blush) { b.rect(15, 20, 17, 21, [235, 140, 140]); b.rect(31, 20, 33, 21, [235, 140, 140]); }
  }
}

function drawHair(b, dir, P) {
  const hair = P.hair, hs = shade(hair, 0.72), hl = light(hair, 1.2);
  const estilo = P.hairStyle || 'short';

  if (estilo === 'cap') {                    // gorra tipo Ash
    b.rect(12, 5, 35, 13, P.hat);
    b.rect(12, 5, 35, 6, light(P.hat, 1.15));
    b.rect(12, 12, 35, 13, shade(P.hat, 0.7));
    if (dir === 'down') { b.rect(18, 8, 29, 12, WHITE); b.rect(12, 14, 24, 15, shade(P.hat, 0.6)); }
    else if (dir !== 'up') b.rect(12, 14, 21, 15, shade(P.hat, 0.6));
    b.rect(13, 13, 15, 17, hair); b.rect(32, 13, 34, 17, hair);   // patillas
    return;
  }

  b.rect(12, 4, 35, 12, hair);
  b.rect(12, 4, 35, 5, hl);
  b.rect(12, 11, 35, 12, hs);
  b.rect(12, 10, 14, 20, hair); b.rect(33, 10, 35, 20, hair);     // laterales

  if (estilo === 'spiky') for (const x of [15, 20, 25, 30]) { b.rect(x, 2, x + 2, 4, hair); b.px(x + 1, 1, hs); }
  if (estilo === 'ponytail') {
    if (dir === 'up' || dir === 'down') { b.rect(34, 6, 38, 22, hair); b.rect(37, 8, 38, 20, hs); }
    else b.rect(6, 8, 11, 24, hair);
  }
  if (estilo === 'long') {
    const largo = P.hairLen || 30;
    b.rect(10, 8, 13, largo, hair); b.rect(34, 8, 37, largo, hair);
    b.rect(11, 8, 11, largo, hs);
    if (dir === 'up') b.rect(13, 8, 34, largo, hair);
    if (P.hairUp) { b.rect(18, 0, 29, 5, hair); b.rect(18, 0, 29, 1, hl); }
  }
  if (estilo === 'lab') { b.rect(12, 4, 35, 8, hair); b.rect(12, 4, 35, 5, WHITE); }
}

// ── PIKACHU ───────────────────────────────────────────────────
function drawPikachu(b, dir, frame) {
  const Y = [252, 218, 60], YS = [212, 172, 30], YL = [255, 240, 140];
  const RED = [226, 74, 62], BR = [150, 100, 36];
  const salto = frame === 1 ? 0 : 1;

  if (dir !== 'up') { b.rect(33, 24, 37, 30, BR); b.rect(36, 20, 40, 24, Y); b.rect(38, 14, 42, 20, Y); b.rect(35, 12, 40, 16, Y); }
  else { b.rect(30, 8, 35, 28, Y); }

  b.rect(13, 2, 18, 14, Y); b.rect(13, 2, 18, 5, OUT);          // orejas
  b.rect(29, 2, 34, 14, Y); b.rect(29, 2, 34, 5, OUT);

  b.rect(12, 13, 35, 41 - salto, Y);                             // cuerpo
  b.rect(10, 18, 12, 36, Y); b.rect(35, 18, 37, 36, Y);
  b.rect(31, 15, 35, 40 - salto, YS);                            // sombreado
  b.rect(13, 14, 30, 15, YL);                                    // brillo

  if (dir === 'up') { b.rect(12, 19, 35, 21, BR); b.rect(12, 25, 35, 27, BR); }

  b.rect(14, 41 - salto, 20, 44, YS); b.rect(27, 41 - salto, 33, 44, YS);  // pies

  if (dir !== 'up') {
    b.rect(11, 26, 16, 31, RED); b.rect(31, 26, 36, 31, RED);     // mejillas
    if (dir === 'down') {
      b.rect(17, 19, 20, 24, OUT); b.px(18, 20, WHITE);
      b.rect(27, 19, 30, 24, OUT); b.px(28, 20, WHITE);
      b.rect(22, 26, 25, 27, OUT);
    } else {
      b.rect(27, 19, 30, 24, OUT); b.px(28, 20, WHITE);
      b.rect(32, 25, 34, 26, OUT);
    }
  }
}

// ── MEOWTH ────────────────────────────────────────────────────
function drawMeowth(b, dir, frame) {
  const CR = [242, 232, 200], CS = [206, 192, 152], BR = [124, 88, 50], GOLD = [244, 200, 66], GL = [255, 236, 150];
  const salto = frame === 1 ? 0 : 1;

  if (dir !== 'up') { b.rect(33, 30, 39, 33, CR); b.rect(37, 26, 40, 31, CR); b.px(39, 25, BR); }

  b.rect(12, 4, 17, 11, CR); b.rect(13, 3, 15, 5, BR);           // orejas
  b.rect(30, 4, 35, 11, CR); b.rect(32, 3, 34, 5, BR);

  b.rect(15, 22, 32, 41 - salto, CR);                            // cuerpo
  b.rect(29, 23, 32, 40 - salto, CS);
  b.rect(12, 8, 35, 24, CR);                                     // cabeza
  b.rect(32, 10, 35, 23, CS);

  b.rect(15, 41 - salto, 21, 44, CR); b.rect(15, 43, 21, 44, BR);  // patas
  b.rect(26, 41 - salto, 32, 44, CR); b.rect(26, 43, 32, 44, BR);

  b.rect(19, 7, 28, 12, GOLD); b.rect(20, 8, 27, 10, GL);        // moneda koban
  if (dir === 'up') return;

  if (dir === 'down') {
    b.rect(16, 15, 19, 19, OUT); b.px(17, 16, WHITE);
    b.rect(28, 15, 31, 19, OUT); b.px(29, 16, WHITE);
    b.rect(22, 20, 25, 21, [214, 130, 120]);
    b.rect(8, 17, 11, 17, BR); b.rect(8, 20, 11, 20, BR);        // bigotes
    b.rect(36, 17, 39, 17, BR); b.rect(36, 20, 39, 20, BR);
  } else {
    b.rect(28, 15, 31, 19, OUT); b.px(29, 16, WHITE);
    b.rect(33, 19, 35, 20, [214, 130, 120]);
    b.rect(36, 16, 40, 16, BR); b.rect(36, 19, 40, 19, BR);
  }
}

// ── Paletas de los personajes ─────────────────────────────────
const CHARS = {
  ash: { kind: 'trainer', skin: SKIN, hair: [40, 30, 26], hairStyle: 'cap', hat: [222, 60, 52], shirt: [40, 96, 214], sleeve: WHITE, pants: [40, 58, 120], shoes: WHITE },
  misty: { kind: 'trainer', skin: SKIN, hair: [242, 140, 24], hairStyle: 'ponytail', shirt: [250, 210, 60], sleeve: [250, 210, 60], pants: [42, 110, 200], belt: [230, 90, 40] },
  brock: { kind: 'trainer', skin: SKIN_TAN, hair: [70, 44, 22], hairStyle: 'spiky', squint: true, shirt: [70, 158, 92], sleeve: [232, 132, 44], pants: [90, 60, 34] },
  oak: { kind: 'trainer', skin: SKIN, hair: [200, 200, 200], hairStyle: 'lab', shirt: WHITE, sleeve: WHITE, pants: [120, 92, 56], belt: [178, 60, 60] },
  jessie: { kind: 'trainer', skin: SKIN, hair: [232, 60, 128], hairStyle: 'long', hairUp: true, hairLen: 20, shirt: WHITE, sleeve: WHITE, pants: [30, 30, 36], emblem: [222, 60, 60] },
  james: { kind: 'trainer', skin: SKIN, hair: [130, 186, 224], hairStyle: 'long', hairLen: 13, shirt: WHITE, sleeve: WHITE, pants: [30, 30, 36], emblem: [222, 60, 60] },
  pikachu: { kind: 'pikachu' },
  meowth: { kind: 'meowth' },
  // bonus listo para tu personaje personalizado:
  'tu-entrenador': { kind: 'trainer', skin: SKIN, hair: [60, 40, 30], hairStyle: 'cap', hat: [40, 170, 90], shirt: [60, 60, 70], sleeve: WHITE, pants: [50, 50, 60], shoes: WHITE },
};

// Contorno: pinta un borde oscuro alrededor de la silueta de cada frame.
// Es LA técnica que hace legible un sprite sobre cualquier fondo.
// Se aplica por celda para que el borde no invada el frame vecino.
function outlineCell(canvas, cx, cy, color = [24, 20, 28, 255]) {
  const alphaAt = (x, y) => canvas.buf[((cy + y) * canvas.w + (cx + x)) * 4 + 3];
  const pintar = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (alphaAt(x, y) > 0) continue;                    // ya tiene color
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        if (alphaAt(nx, ny) > 0) { pintar.push([x, y]); break; }
      }
    }
  }
  for (const [x, y] of pintar) canvas.set(cx + x, cy + y, color);
}

const DIRS = ['down', 'left', 'right', 'up'];

function buildSheet(name, P) {
  const c = new Canvas(SIZE * 3, SIZE * 4);
  DIRS.forEach((dir, row) => {
    for (let frame = 0; frame < 3; frame++) {
      const mirror = dir === 'left'; // dibujamos "derecha" y espejamos para izquierda
      const b = brush(c, frame * SIZE, row * SIZE, mirror);
      const drawDir = dir === 'left' ? 'right' : dir;
      if (P.kind === 'pikachu') drawPikachu(b, drawDir, frame);
      else if (P.kind === 'meowth') drawMeowth(b, drawDir, frame);
      else drawTrainer(b, drawDir, frame, P);
    }
  });
  // contorno en los 12 frames
  DIRS.forEach((_, row) => { for (let f = 0; f < 3; f++) outlineCell(c, f * SIZE, row * SIZE); });
  return c;
}

// ── Generar y guardar ─────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PREVIEW, { recursive: true });

const names = Object.keys(CHARS);
const sheets = {};
for (const name of names) {
  const c = buildSheet(name, CHARS[name]);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), c.png());
  sheets[name] = c;
  console.log(`✔ ${name}.png`);
}

// Contact sheet ampliado (x3) para inspección visual
const SCALE = 3, cols = 3;
const rows = Math.ceil(names.length / cols);
const cw = 96 * SCALE, ch = 128 * SCALE;
const contact = new Canvas(cw * cols, ch * rows);
names.forEach((name, i) => {
  const src = sheets[name].buf;
  const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 96; x++) {
    const si = (y * 96 + x) * 4;
    const col = [src[si], src[si + 1], src[si + 2], src[si + 3]];
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
      contact.set(ox + x * SCALE + dx, oy + y * SCALE + dy, col);
    }
  }
});
fs.writeFileSync(path.join(PREVIEW, 'contact-sheet.png'), contact.png());
console.log(`\n✔ preview: ${path.join(PREVIEW, 'contact-sheet.png')}`);
console.log(`✔ ${names.length} personajes en ${OUT_DIR}`);
