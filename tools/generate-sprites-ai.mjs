// ─────────────────────────────────────────────────────────────
//  Generador de sprites con IA (OpenAI) — alternativa al pixel-art por código.
//
//  Genera UNA imagen por personaje y dirección, la recorta y la encaja en la
//  rejilla de fotogramas que usa el pueblo (48x48, 3 columnas x 4 filas).
//
//  Uso:
//    node tools/generate-sprites-ai.mjs ash            → solo un personaje (prueba)
//    node tools/generate-sprites-ai.mjs --todos        → los nueve
//
//  Requiere OPENAI_API_KEY en agents/.env
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, 'agents', '.env') });

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('❌ Falta OPENAI_API_KEY en agents/.env'); process.exit(1); }

const OUT = path.join(ROOT, 'public', 'assets', 'pokemon');
const CRUDO = path.join(ROOT, '.preview', 'ia-crudo');       // imágenes tal cual llegan
const SIZE = 48;                                              // lado del fotograma

// Descripciones ORIGINALES (no se nombran personajes con copyright)
const PERSONAJES = {
  ash:     'a cheerful 10-year-old boy trainer with a red and white baseball cap, blue and white jacket, dark blue jeans',
  misty:   'a spirited girl with short orange hair in a side ponytail, yellow crop top, blue denim shorts, red suspenders',
  brock:   'a calm tan-skinned teenage boy with spiky dark brown hair, narrow squinting eyes, orange shirt under a green vest',
  oak:     'a kindly elderly scientist with grey hair, a long white lab coat, red shirt underneath, brown trousers',
  jessie:  'a theatrical adult character with very long bright magenta hair, a white and gold long coat, white trousers, tall black boots',
  james:   'a young man with short pale blue hair, white uniform shirt with a red letter R, white trousers, black boots',
  pikachu: 'a small chubby cartoon mouse mascot with golden yellow fur, large round ears, rosy round cheeks, big friendly dark eyes, short arms and legs, a small pointed tail',
  meowth:  'a small cream-coloured cat creature with a shiny gold oval coin on its forehead, pointed ears, brown whiskers, curled tail',
  'tu-entrenador': 'a friendly rookie trainer with a green cap, grey hoodie, dark trousers',
};

// El modelo dibuja 3 vistas; la cuarta (perfil derecho) se espeja de la izquierda,
// que es justo lo que hacían los juegos de 16 bits.
function prompt(desc) {
  return `Pixel art character reference sheet on a fully transparent background. ` +
    `The SAME character drawn exactly 3 times in one horizontal row, clearly separated, all the same height: ` +
    `(1) front view facing the viewer, (2) side view facing left, (3) back view seen from behind. ` +
    `Character: ${desc}. Retro 16-bit JRPG overworld sprite style, full body from head to feet, standing upright, ` +
    `arms at the sides, bold dark outline, flat cel shading, bright saturated colours. ` +
    `No text, no labels, no numbers, no background, no shadows, no frames, no ground.`;
}

async function generar(desc) {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: 'gpt-image-1', prompt: prompt(desc),
      size: '1536x1024', background: 'transparent', output_format: 'png', n: 1,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// El modelo devuelve el fondo como gris semitransparente, no transparente puro.
// Se fuerza cada pixel a opaco o invisible: el pixel-art no admite medias tintas.
async function limpiarFondo(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 200 ? 0 : 255;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Localiza cada vista contando pixeles opacos por columna y buscando los huecos
// vacíos que las separan. Así da igual cuántas dibuje el modelo ni cómo las reparta.
async function detectarVistas(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const ocupada = new Array(width).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) ocupada[x]++;

  const HUECO = Math.max(8, Math.round(width * 0.02));   // separación mínima entre vistas
  const bloques = [];
  let ini = -1, vacias = 0;
  for (let x = 0; x < width; x++) {
    if (ocupada[x] > 0) { if (ini < 0) ini = x; vacias = 0; }
    else if (ini >= 0 && ++vacias >= HUECO) { bloques.push([ini, x - vacias]); ini = -1; vacias = 0; }
  }
  if (ini >= 0) bloques.push([ini, width - 1]);
  if (!bloques.length) return [];

  // Descarta manchas sueltas: solo cuentan los bloques de anchura comparable al mayor.
  const mayor = Math.max(...bloques.map(([a, b]) => b - a));
  return bloques.filter(([a, b]) => b - a > mayor * 0.35)
                .map(([a, b]) => ({ left: a, width: b - a + 1, height }));
}

// Encaja una vista en el fotograma: la recorta, la escala al alto del sprite y
// la centra dejando los pies abajo (que es como el pueblo ancla a los personajes).
async function encajar(bufer, bajar = 0) {
  const recortado = await sharp(bufer).trim({ threshold: 1 }).toBuffer();
  const personaje = await sharp(recortado)
    .resize({ height: SIZE - 2 - bajar, fit: 'inside', kernel: 'nearest' })
    .toBuffer();
  const { width } = await sharp(personaje).metadata();
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: personaje, left: Math.max(0, Math.round((SIZE - (width || SIZE)) / 2)), top: 1 + bajar }])
    .png().toBuffer();
}

async function hoja(clave) {
  const desc = PERSONAJES[clave];
  if (!desc) throw new Error(`Personaje desconocido: ${clave}`);
  fs.mkdirSync(CRUDO, { recursive: true });

  // Con --rehacer se reaprovecha la hoja ya descargada: así se puede afinar el
  // recorte todas las veces que haga falta sin volver a pagar la generación.
  const guardada = path.join(CRUDO, `${clave}-hoja.png`);
  const reusar = process.argv.includes('--rehacer') && fs.existsSync(guardada);
  process.stdout.write(`   ${clave} · ${reusar ? 'reprocesando…' : 'generando…'} `);
  const crudo = reusar ? fs.readFileSync(guardada) : await generar(desc);
  if (!reusar) fs.writeFileSync(guardada, crudo);
  const limpio = await limpiarFondo(crudo);
  fs.writeFileSync(path.join(CRUDO, `${clave}-limpio.png`), limpio);

  const vistas = await detectarVistas(limpio);
  if (!vistas.length) throw new Error('la imagen salió vacía');
  console.log(`${vistas.length} vista(s)`);

  // Recorta cada vista en dos versiones: en reposo y un pixel más abajo (el rebote
  // del paso). El pueblo usa la columna 1 quieto y cicla 0-1-2 al caminar.
  const trozos = [];
  for (const v of vistas) {
    const t = await sharp(limpio).extract({ left: v.left, top: 0, width: v.width, height: v.height }).toBuffer();
    trozos.push({ quieto: await encajar(t, 0), paso: await encajar(t, 1) });
  }

  const [frente, izq, espalda] = trozos;
  const der = izq && {
    quieto: await sharp(izq.quieto).flop().png().toBuffer(),
    paso: await sharp(izq.paso).flop().png().toBuffer(),
  };
  // Orden de filas de la rejilla: abajo, izquierda, derecha, arriba.
  const filas = [frente, izq || frente, der || frente, espalda || frente];

  const capas = [];
  filas.forEach((f, fila) => {
    [f.paso, f.quieto, f.paso].forEach((img, col) =>
      capas.push({ input: img, left: col * SIZE, top: fila * SIZE }));
  });

  const png = await sharp({ create: { width: SIZE * 3, height: SIZE * 4, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(capas).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${clave}.png`), png);
  console.log(`   ✔ ${clave}.png (${SIZE * 3}x${SIZE * 4})`);
}

const args = process.argv.slice(2);
const objetivos = args.includes('--todos') ? Object.keys(PERSONAJES) : args.filter((a) => !a.startsWith('--'));
if (!objetivos.length) { console.error('Indica un personaje (ej: ash) o --todos'); process.exit(1); }
console.log(`Generando ${objetivos.length} personaje(s) con OpenAI…`);

// Cada personaje cuesta dinero y ~1 minuto: si uno falla (por ejemplo, el filtro
// de contenido rechaza una descripción) se anota y se sigue con los demás.
const fallos = [];
for (const c of objetivos) {
  try { await hoja(c); }
  catch (e) { fallos.push([c, String(e.message || e).split('\n')[0]]); console.log(`   ✖ ${c}: ${e.message}`); }
}

console.log(`\nImágenes originales sin recortar en: ${CRUDO}`);
if (fallos.length) {
  console.log(`\n${fallos.length} personaje(s) sin generar:`);
  for (const [c, m] of fallos) console.log(`   ✖ ${c} — ${m}`);
  process.exitCode = 1;
}
