// ─────────────────────────────────────────────────────────────
//  Muebles de interior generados con IA (Gemini).
//
//  Los SUELOS y PAREDES siguen siendo código, porque se repiten en rejilla y
//  sus bordes tienen que encajar con los vecinos: un error de un pixel se
//  multiplica por toda la sala. Un mueble, en cambio, se coloca una vez y no
//  tiene vecinos con los que casar, así que puede dibujarse de una pieza —
//  una cama de 2x2 como una sola imagen y no como cuatro trozos que encajen.
//
//  Uso:
//    node tools/generate-props-ai.mjs cama              → uno (prueba)
//    node tools/generate-props-ai.mjs --todos           → todos
//    node tools/generate-props-ai.mjs cama --rehacer    → reprocesa sin pagar
//
//  Requiere GOOGLE_API_KEY en agents/.env
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, 'agents', '.env') });

const KEY = process.env.GOOGLE_API_KEY;
if (!KEY) { console.error('❌ Falta GOOGLE_API_KEY en agents/.env'); process.exit(1); }

const MODELO = process.env.GOOGLE_IMAGE_MODEL || 'gemini-3-pro-image';
const TILE = 32;
const OUT = path.join(ROOT, 'public', 'assets', 'pokemon', 'props');
const CRUDO = path.join(ROOT, '.preview', 'props-crudo');
const MAGENTA = { r: 255, g: 0, b: 255 };

// ancho/alto en casillas. Un mueble puede ocupar varias.
const MUEBLES = {
  cama:       { w: 2, h: 2, d: 'a cosy single bed seen from a high angle: wooden frame, white sheets, a blue quilt folded over, one plump pillow at the head' },
  mostrador:  { w: 4, h: 2, d: 'a long reception counter seen from a high angle: red front panel, pale cream worktop, a small computer monitor and a stack of papers on top' },
  estanteria: { w: 1, h: 2, d: 'a tall wooden bookshelf seen from a high angle, four shelves packed with colourful book spines, a small potted plant on the top shelf' },
  sofa:       { w: 2, h: 2, d: 'a comfortable two-seater sofa seen from a high angle: teal upholstery, two cushions, short wooden legs' },
  mesaCafe:   { w: 2, h: 1, d: 'a low wooden coffee table seen from a high angle, with a mug and an open book on top' },
  alfombra:   { w: 3, h: 2, d: 'a rectangular woven rug lying flat on the floor, seen from above: deep red wool with a cream geometric border pattern and short fringes on the short sides' },
  felpudo:    { w: 1, h: 1, d: 'a small rectangular doormat lying flat on the floor, seen from above: coarse brown coir fibre with a darker border' },
  maquina:    { w: 2, h: 2, d: 'a futuristic white medical healing machine seen from a high angle: rounded casing, a row of glowing green lights, six round slots on the top surface' },
};

function prompt(m) {
  return `Pixel art video game furniture on a solid flat pure magenta background (RGB 255,0,255), ` +
    `completely uniform with no gradient. A single object: ${m.d}. ` +
    `Drawn from a top-down three-quarter angle, the same view used for furniture in 16-bit JRPG interiors, ` +
    `so both the top surface and the front face are visible. ` +
    `Chunky pixels with a bold dark outline, flat cel shading, warm saturated colours. ` +
    `The object fills the image and is roughly ${m.w} units wide by ${m.h} units tall. ` +
    `No floor, no wall, no shadow on the ground, no text, no frame, one object only.`;
}

async function generar(m) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(m) }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!r.ok) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const img = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!img) throw new Error(`sin imagen: ${JSON.stringify(j).slice(0, 200)}`);
  return Buffer.from(img.inlineData.data, 'base64');
}

// Quita el magenta y también el fleco antialiasado, donde rojo y azul dominan
// sobre el verde sin llegar a ser magenta puro. Después devuelve el contorno
// teñido de morado a negro.
async function limpiarFondo(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const TOL = 130 * 130;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dr = r - MAGENTA.r, dg = g - MAGENTA.g, db = b - MAGENTA.b;
    const cerca = (dr * dr + dg * dg + db * db) < TOL;
    const fleco = r > 110 && b > 110 && g < Math.min(r, b) * 0.85;
    data[i + 3] = (cerca || fleco) ? 0 : 255;
    if (data[i + 3] && Math.max(r, g, b) < 130 && b > g + 14 && r > g + 14) {
      data[i] = 26; data[i + 1] = 24; data[i + 2] = 28;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function mueble(clave) {
  const m = MUEBLES[clave];
  if (!m) throw new Error(`Mueble desconocido: ${clave}`);
  fs.mkdirSync(CRUDO, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const guardada = path.join(CRUDO, `${clave}.png`);
  const reusar = process.argv.includes('--rehacer') && fs.existsSync(guardada);
  process.stdout.write(`   ${clave} · ${reusar ? 'reprocesando…' : 'generando…'} `);
  const crudo = reusar ? fs.readFileSync(guardada) : await generar(m);
  if (!reusar) fs.writeFileSync(guardada, crudo);

  const limpio = await limpiarFondo(crudo);
  const recortado = await sharp(limpio).trim({ threshold: 1 }).toBuffer();

  // Se limitan las DOS dimensiones: un mueble más ancho que alto se saldría
  // de su hueco si solo se escalara por altura.
  const ancho = m.w * TILE, alto = m.h * TILE;
  const escalado = await sharp(recortado)
    .resize({ width: ancho, height: alto, fit: 'inside', kernel: 'nearest' })
    .png().toBuffer();
  const meta = await sharp(escalado).metadata();

  // Se ancla abajo y centrado: los muebles se apoyan en el suelo, igual que
  // los personajes, así que su base debe caer en el borde inferior del hueco.
  const png = await sharp({ create: { width: ancho, height: alto, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: escalado,
                  left: Math.round((ancho - (meta.width || ancho)) / 2),
                  top: alto - (meta.height || alto) }])
    .png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${clave}.png`), png);
  console.log(`✔ ${clave}.png (${ancho}x${alto}, ${m.w}x${m.h} casillas)`);
}

const args = process.argv.slice(2);
const objetivos = args.includes('--todos') ? Object.keys(MUEBLES) : args.filter((a) => !a.startsWith('--'));
if (!objetivos.length) {
  console.error(`Indica un mueble o --todos.  Disponibles: ${Object.keys(MUEBLES).join(', ')}`);
  process.exit(1);
}
console.log(`Generando ${objetivos.length} mueble(s) con ${MODELO}…`);
const fallos = [];
for (const c of objetivos) {
  try { await mueble(c); }
  catch (e) { fallos.push([c, String(e.message || e).split('\n')[0]]); console.log(`   ✖ ${c}: ${e.message}`); }
}
if (fallos.length) {
  console.log(`\n${fallos.length} sin generar:`);
  for (const [c, m] of fallos) console.log(`   ✖ ${c} — ${m}`);
  process.exitCode = 1;
}
