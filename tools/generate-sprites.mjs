// ─────────────────────────────────────────────────────────────
//  Generador de sprites originales estilo Pokémon para AI Town
//  Sin dependencias externas: codifica PNG con el módulo `zlib`.
//
//  Produce, por personaje, una hoja 96x128 (frames de 32x32):
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
      const x = mirror ? 31 - lx : lx;
      canvas.set(cellX + x, cellY + ly, color);
    },
    rect(x0, y0, x1, y1, color) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, color);
    },
  };
}

// ── Colores base ──────────────────────────────────────────────
const SKIN = [244, 205, 150];
const SKIN_TAN = [196, 138, 92];
const SHADOW = [0, 0, 0, 70];
const BLACK = [40, 34, 38];
const WHITE = [246, 246, 240];
const shade = ([r, g, b], f = 0.78) => [Math.round(r * f), Math.round(g * f), Math.round(b * f)];

// ── Dibujo de un ENTRENADOR (humanoide chibi) ─────────────────
function drawTrainer(b, dir, frame, P) {
  const skin = P.skin || SKIN;
  const legY = [0, -1, 0, 1][frame + 1] ?? 0; // bob de piernas
  // sombra
  b.rect(11, 29, 20, 30, SHADOW);

  // piernas (pantalón) con paso alterno
  const pants = P.pants, sh = shade(pants, 0.7);
  if (dir === 'down' || dir === 'up') {
    const lLow = frame === 0 ? 1 : 0, rLow = frame === 2 ? 1 : 0;
    b.rect(12, 24, 15, 28 + lLow, pants);
    b.rect(16, 24, 19, 28 + rLow, pants);
    b.rect(12, 28 + lLow, 15, 28 + lLow, sh); // zapatos
    b.rect(16, 28 + rLow, 19, 28 + rLow, sh);
  } else {
    // perfil: pierna delantera y trasera con zancada
    const stride = frame === 0 ? 2 : frame === 2 ? -2 : 0;
    b.rect(13, 24, 16, 28, shade(pants, 0.65)); // trasera
    b.rect(15 + stride, 24, 18 + stride, 28, pants); // delantera
    b.rect(15 + stride, 28, 18 + stride, 28, sh);
  }

  // torso (camisa)
  const shirt = P.shirt, shShade = shade(shirt);
  b.rect(11, 16 + legY, 20, 24 + legY, shirt);
  b.rect(19, 16 + legY, 20, 24 + legY, shShade); // sombreado lado derecho
  if (P.belt) b.rect(11, 24 + legY, 20, 24 + legY, P.belt);

  // brazos (mangas) balanceo opuesto a piernas
  const armSwing = frame === 0 ? 1 : frame === 2 ? -1 : 0;
  const sleeve = P.sleeve || shirt;
  b.rect(9, 17 + legY + armSwing, 10, 22 + legY + armSwing, sleeve);
  b.rect(21, 17 + legY - armSwing, 22, 22 + legY - armSwing, sleeve);
  b.px(9, 22 + legY + armSwing, skin); b.px(10, 22 + legY + armSwing, skin); // manos
  b.px(21, 22 + legY - armSwing, skin); b.px(22, 22 + legY - armSwing, skin);

  // emblema (Team Rocket "R")
  if (P.emblem && dir !== 'up') {
    b.rect(14, 18 + legY, 17, 21 + legY, P.emblem);
    b.px(15, 19 + legY, shirt); b.px(16, 20 + legY, shirt);
  }

  // cabeza (chibi grande)
  if (dir === 'up') {
    // nuca: pelo cubre casi todo
    b.rect(10, 6, 21, 16, P.hair);
  } else {
    b.rect(10, 6, 21, 16, skin);
    b.rect(20, 7, 21, 15, shade(skin, 0.88)); // sombra mejilla
  }

  // ── pelo / gorra por estilo ──
  drawHair(b, dir, P);

  // ── ojos / cara ──
  if (dir !== 'up') {
    if (P.squint) {
      b.rect(12, 12, 14, 12, BLACK);
      b.rect(17, 12, 19, 12, BLACK);
    } else if (dir === 'down') {
      b.rect(13, 11, 13, 12, BLACK);
      b.rect(18, 11, 18, 12, BLACK);
    } else {
      // perfil: un ojo hacia el frente (derecha por defecto; el espejo lo pasa a izquierda)
      b.rect(18, 11, 19, 12, BLACK);
      b.px(21, 13, shade(skin, 0.85)); // nariz
    }
    if (P.blush) { b.px(11, 13, [230, 120, 120]); b.px(20, 13, [230, 120, 120]); }
  }
}

function drawHair(b, dir, P) {
  const hair = P.hair, hs = shade(hair, 0.7);
  const style = P.hairStyle || 'short';

  if (style === 'cap') {
    // gorra tipo Ash
    b.rect(9, 4, 22, 8, P.hat);
    b.rect(9, 8, 22, 8, shade(P.hat, 0.7)); // borde
    if (dir === 'down') {
      b.rect(12, 6, 19, 8, WHITE); // parche frontal blanco
      b.rect(9, 9, 15, 9, shade(P.hat, 0.6)); // visera
    } else if (dir !== 'up') {
      b.rect(9, 9, 13, 9, shade(P.hat, 0.6)); // visera de perfil
    }
    // patillas
    b.px(10, 9, hair); b.px(21, 9, hair);
    return;
  }

  // pelo base sobre la cabeza
  b.rect(9, 3, 22, 7, hair);
  b.rect(9, 7, 10, 11, hair); // lado izq
  b.rect(21, 7, 22, 11, hair); // lado der
  b.rect(9, 3, 22, 3, hs);

  if (style === 'spiky') {
    b.px(11, 2, hair); b.px(14, 2, hair); b.px(17, 2, hair); b.px(20, 2, hair);
  }
  if (style === 'ponytail') {
    // coleta lateral (Misty)
    if (dir === 'up' || dir === 'down') { b.rect(21, 4, 23, 12, hair); b.px(23, 8, hs); }
    else { b.rect(6, 5, 8, 13, hair); }
  }
  if (style === 'long') {
    // melena larga que cae (Jessie / James)
    const len = P.hairLen || 16;
    b.rect(8, 6, 9, len, hair);
    b.rect(22, 6, 23, len, hair);
    if (dir === 'up') b.rect(10, 6, 21, len, hair);
    if (style === 'long' && P.hairUp) { // copete alto de Jessie
      b.rect(13, 0, 18, 3, hair);
    }
  }
  if (style === 'lab' && dir !== 'up') {
    // canas + entradas del Prof. Oak
    b.rect(9, 3, 22, 5, hair);
  }
}

// ── Dibujo de PIKACHU ─────────────────────────────────────────
function drawPikachu(b, dir, frame) {
  const Y = [250, 214, 40], YS = [214, 170, 20], RED = [222, 70, 60], BR = [140, 90, 30];
  const legY = frame === 1 ? 0 : 1;
  b.rect(11, 29, 20, 30, SHADOW);

  // cola de rayo (detrás, a un lado)
  if (dir !== 'up') { b.rect(22, 16, 24, 20, BR); b.px(24, 15, Y); b.px(25, 13, Y); b.px(23, 11, Y); b.px(24, 10, Y); }
  else { b.rect(20, 6, 22, 18, Y); }

  // orejas largas con punta negra
  b.rect(10, 2, 12, 9, Y); b.px(10, 2, BLACK); b.px(11, 2, BLACK); b.rect(10, 2, 12, 3, BLACK);
  b.rect(19, 2, 21, 9, Y); b.rect(19, 2, 21, 3, BLACK);

  // cuerpo/cabeza amarilla (redondeada)
  b.rect(10, 9, 21, 27 - legY, Y);
  b.rect(9, 12, 9, 24, Y); b.rect(22, 12, 22, 24, Y);
  b.rect(20, 10, 21, 26 - legY, YS); // sombreado
  // corner rounding
  b.px(10, 9, [0, 0, 0, 0]); b.px(21, 9, [0, 0, 0, 0]);

  // rayas marrones de la espalda (vista de arriba)
  if (dir === 'up') { b.rect(10, 12, 21, 13, BR); b.rect(10, 16, 21, 17, BR); }

  // pies
  b.rect(11, 27 - legY, 14, 28, YS);
  b.rect(17, 27 - legY, 20, 28, YS);

  if (dir !== 'up') {
    // mejillas rojas
    b.rect(10, 17, 12, 19, RED);
    b.rect(19, 17, 21, 19, RED);
    // ojos
    if (dir === 'down') {
      b.rect(13, 13, 14, 15, BLACK); b.px(13, 13, WHITE);
      b.rect(17, 13, 18, 15, BLACK); b.px(17, 13, WHITE);
      b.px(15, 16, BLACK); b.px(16, 16, BLACK); // nariz/boca
    } else {
      b.rect(17, 13, 18, 15, BLACK); b.px(17, 13, WHITE);
      b.px(20, 16, BLACK);
    }
  }
}

// ── Dibujo de MEOWTH ──────────────────────────────────────────
function drawMeowth(b, dir, frame) {
  const CREAM = [238, 226, 190], CS = [206, 190, 150], BR = [120, 84, 48], GOLD = [240, 196, 60];
  const legY = frame === 1 ? 0 : 1;
  b.rect(11, 29, 20, 30, SHADOW);

  // cola enroscada con punta marrón
  if (dir !== 'up') { b.rect(21, 20, 24, 22, CREAM); b.px(24, 19, BR); b.px(24, 23, BR); }

  // orejas puntiagudas
  b.px(9, 4, BR); b.rect(9, 5, 11, 8, CREAM); b.px(10, 4, CREAM);
  b.px(22, 4, BR); b.rect(20, 5, 22, 8, CREAM); b.px(21, 4, CREAM);

  // cuerpo
  b.rect(11, 15, 20, 27 - legY, CREAM);
  b.rect(19, 16, 20, 26 - legY, CS);
  // cabeza
  b.rect(9, 6, 22, 16, CREAM);
  b.rect(21, 7, 22, 15, CS);

  // pies con puntas marrones
  b.rect(11, 27 - legY, 14, 28, CREAM); b.rect(11, 28, 14, 28, BR);
  b.rect(17, 27 - legY, 20, 28, CREAM); b.rect(17, 28, 20, 28, BR);

  if (dir === 'up') {
    // moneda dorada visible en la nuca también (koban)
    b.rect(13, 6, 18, 8, GOLD); b.rect(14, 7, 17, 7, [255, 230, 120]);
    return;
  }

  // moneda koban dorada en la frente
  b.rect(13, 6, 18, 9, GOLD); b.rect(14, 7, 17, 8, [255, 230, 120]);

  // ojos
  if (dir === 'down') {
    b.rect(12, 11, 13, 12, BLACK); b.rect(18, 11, 19, 12, BLACK);
    b.px(15, 14, [210, 120, 110]); b.px(16, 14, [210, 120, 110]); // nariz
    // bigotes
    b.px(8, 12, BR); b.px(7, 13, BR); b.px(23, 12, BR); b.px(24, 13, BR);
  } else {
    b.rect(18, 11, 19, 12, BLACK);
    b.px(22, 13, [210, 120, 110]);
    b.px(24, 12, BR); b.px(25, 13, BR);
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

const DIRS = ['down', 'left', 'right', 'up'];

function buildSheet(name, P) {
  const c = new Canvas(96, 128);
  DIRS.forEach((dir, row) => {
    for (let frame = 0; frame < 3; frame++) {
      const mirror = dir === 'left'; // dibujamos "derecha" y espejamos para izquierda
      const b = brush(c, frame * 32, row * 32, mirror);
      const drawDir = dir === 'left' ? 'right' : dir;
      if (P.kind === 'pikachu') drawPikachu(b, drawDir, frame);
      else if (P.kind === 'meowth') drawMeowth(b, drawDir, frame);
      else drawTrainer(b, drawDir, frame, P);
    }
  });
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
