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
const KEY_GOOGLE = process.env.GOOGLE_API_KEY;

// Motor de imagen: OpenAI por defecto, Google con --motor=google
const MOTOR = (process.argv.find((a) => a.startsWith('--motor='))?.split('=')[1] || 'openai').toLowerCase();
if (MOTOR === 'openai' && !KEY) { console.error('❌ Falta OPENAI_API_KEY en agents/.env'); process.exit(1); }
if (MOTOR === 'google' && !KEY_GOOGLE) { console.error('❌ Falta GOOGLE_API_KEY en agents/.env'); process.exit(1); }

const OUT = path.join(ROOT, 'public', 'assets', 'pokemon');
const CRUDO = path.join(ROOT, '.preview', 'ia-crudo');       // imágenes tal cual llegan
const SIZE = 48;                                              // lado del fotograma

// Altura relativa de cada personaje. Sin esto todos acaban midiendo lo mismo y
// las criaturas quedan tan altas como el Profesor Oak.
const ALTURA = { pikachu: 0.62, meowth: 0.68 };

// Descripciones ORIGINALES (no se nombran personajes con copyright)
const PERSONAJES = {
  ash:     'a cheerful 10-year-old boy trainer with a red and white baseball cap, blue and white jacket, dark blue jeans',
  misty:   'a spirited girl with short orange hair in a side ponytail, yellow crop top, blue denim shorts, red suspenders',
  brock:   'a calm tan-skinned teenage boy with spiky dark brown hair, narrow squinting eyes, orange shirt under a green vest',
  oak:     'a kindly elderly scientist with grey hair, a long white lab coat, red shirt underneath, brown trousers',
  jessie:  'a theatrical adult character with very long bright magenta hair, a white and gold long coat, white trousers, tall black boots',
  james:   'a young man with short pale blue hair, white uniform shirt with a red letter R, white trousers, black boots',
  pikachu: 'a small energetic cartoon mouse creature with bright yellow fur, large pointed ears, round rosy cheeks, big expressive dark eyes, a cheerful smile, slim limbs, a long thin tail, bare paws, no clothing and no shoes',
  meowth:  'a small cream-coloured cat creature with a shiny gold oval coin on its forehead, pointed ears, brown whiskers, curled tail, bare paws, no clothing and no shoes',
  'tu-entrenador': 'a friendly rookie trainer with a green cap, grey hoodie, dark trousers',
};

// El modelo dibuja 3 vistas; la cuarta (perfil derecho) se espeja de la izquierda,
// que es justo lo que hacían los juegos de 16 bits.
// Gemini no sabe devolver fondo transparente, así que se le pide magenta puro y
// luego se recorta por color (la técnica de croma de toda la vida).
const MAGENTA = { r: 255, g: 0, b: 255 };

function prompt(desc) {
  const fondo = MOTOR === 'google'
    ? 'on a solid flat pure magenta background (RGB 255,0,255), completely uniform with no gradient or shading'
    : 'on a fully transparent background';
  return `Pixel art character reference sheet ${fondo}. ` +
    `The SAME character drawn exactly 3 times in one horizontal row, clearly separated, all the same height: ` +
    `(1) front view facing the viewer, (2) side view facing left, (3) back view seen from behind. ` +
    `Character: ${desc}. Retro 16-bit JRPG overworld sprite style, full body from head to feet, standing upright, ` +
    `arms at the sides, bold dark outline, flat cel shading, bright saturated colours. ` +
    `No text, no labels, no numbers, no shadows, no frames, no ground.`;
}

const MODELO_GOOGLE = process.env.GOOGLE_IMAGE_MODEL || 'gemini-3-pro-image';

// Imagen de referencia opcional (--ref=ruta.png). El modelo la usa como guía de
// estilo, que es mucho más fiable que describir el estilo con palabras.
const REF = process.argv.find((a) => a.startsWith('--ref='))?.split('=')[1];

async function generarGoogle(desc) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GOOGLE}:generateContent?key=${KEY_GOOGLE}`;
  const entrada = [];
  if (REF) {
    entrada.push({ inline_data: { mime_type: 'image/png', data: fs.readFileSync(REF).toString('base64') } });
    entrada.push({ text:
      'The image above is the reference: keep exactly its art style, colours, outline weight and pixel size. ' +
      prompt(desc) });
  } else {
    entrada.push({ text: prompt(desc) });
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: entrada }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!r.ok) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const partes = j.candidates?.[0]?.content?.parts || [];
  const img = partes.find((p) => p.inlineData?.data);
  if (!img) throw new Error(`Google no devolvió imagen: ${JSON.stringify(j).slice(0, 300)}`);
  return Buffer.from(img.inlineData.data, 'base64');
}

async function generar(desc) {
  if (MOTOR === 'google') return generarGoogle(desc);
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

// Deja el fondo realmente transparente. Detecta solo con qué caso trata:
//  · si la imagen trae transparencia (OpenAI la devuelve como gris semitransparente),
//    umbraliza el alfa — el pixel-art no admite medias tintas;
//  · si viene opaca (Google), borra por color el magenta del fondo.
async function limpiarFondo(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let translucidos = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 200) translucidos++;
  const hayAlfa = translucidos > data.length / 4 * 0.02;   // ¿algo más que ruido?

  if (hayAlfa) {
    for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 200 ? 0 : 255;
  } else {
    const TOL = 130 * 130;   // distancia al cuadrado
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dr = r - MAGENTA.r, dg = g - MAGENTA.g, db = b - MAGENTA.b;
      const cerca = (dr * dr + dg * dg + db * db) < TOL;
      // El borde antialiasado tira a magenta sin llegar a serlo: rojo y azul
      // dominan sobre el verde. Sin esta regla queda un fleco rosa alrededor.
      // Basta con que rojo y azul superen claramente al verde: en esta paleta
      // (amarillos, rojo, marrón, negro) ningún color propio cumple eso.
      const fleco = r > 110 && b > 110 && g < Math.min(r, b) * 0.85;
      data[i + 3] = (cerca || fleco) ? 0 : 255;
      // El contorno negro se tiñe de magenta y queda morado oscuro. No lo caza
      // la regla anterior (es oscuro y legítimo), así que se devuelve a negro.
      if (data[i + 3] && Math.max(r, g, b) < 130 && b > g + 14 && r > g + 14) {
        data[i] = 26; data[i + 1] = 24; data[i + 2] = 28;
      }
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Localiza cada vista buscando los huecos vacíos que las separan. Se hace en
// DOS pasadas —primero bandas por filas, luego columnas dentro de cada banda—
// porque el modelo reparte las vistas como quiere: en línea, en dos filas o en
// rejilla. Proyectando solo columnas, dos filas se solapan y salen como una.
function tramos(ocupada, hueco) {
  const out = [];
  let ini = -1, vacias = 0;
  for (let i = 0; i < ocupada.length; i++) {
    if (ocupada[i] > 0) { if (ini < 0) ini = i; vacias = 0; }
    else if (ini >= 0 && ++vacias >= hueco) { out.push([ini, i - vacias]); ini = -1; vacias = 0; }
  }
  if (ini >= 0) out.push([ini, ocupada.length - 1]);
  return out;
}

async function detectarVistas(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const opaco = (x, y) => data[(y * width + x) * 4 + 3] > 0;

  const porFila = new Array(height).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (opaco(x, y)) porFila[y]++;

  const cajas = [];
  for (const [y0, y1] of tramos(porFila, Math.max(6, Math.round(height * 0.012)))) {
    const porCol = new Array(width).fill(0);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < width; x++) if (opaco(x, y)) porCol[x]++;
    for (const [x0, x1] of tramos(porCol, Math.max(4, Math.round(width * 0.008))))
      cajas.push({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  }
  if (!cajas.length) return [];

  // Descarta manchas sueltas: solo cuentan las de tamaño comparable a la mayor.
  const mayor = Math.max(...cajas.map((c) => c.width * c.height));
  return cajas.filter((c) => c.width * c.height > mayor * 0.12);
}

// Encaja una vista en el fotograma: la recorta, la escala al alto del sprite y
// la centra dejando los pies abajo (que es como el pueblo ancla a los personajes).
async function encajar(bufer, bajar = 0, escala = 1) {
  const recortado = await sharp(bufer).trim({ threshold: 1 }).toBuffer();
  const alto = Math.round((SIZE - 2) * escala) - bajar;
  // Se limitan las DOS dimensiones: escalando solo por altura, una vista más
  // ancha que alta (el perfil con la cola) se sale del fotograma.
  const personaje = await sharp(recortado)
    .resize({ width: SIZE, height: alto, fit: 'inside', kernel: 'nearest' })
    .toBuffer();
  const m = await sharp(personaje).metadata();
  // Se ancla por los PIES: así un personaje más bajo se apoya en el suelo en vez
  // de quedar flotando, y el rebote del paso sigue cuadrando.
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{
      input: personaje,
      left: Math.max(0, Math.round((SIZE - (m.width || SIZE)) / 2)),
      top: Math.max(0, SIZE - 1 - (m.height || alto)),
    }])
    .png().toBuffer();
}

async function hoja(clave) {
  const desc = PERSONAJES[clave];
  if (!desc) throw new Error(`Personaje desconocido: ${clave}`);
  fs.mkdirSync(CRUDO, { recursive: true });

  // Con --rehacer se reaprovecha la hoja ya descargada: así se puede afinar el
  // recorte todas las veces que haga falta sin volver a pagar la generación.
  const guardada = path.join(CRUDO, `${clave}-hoja${MOTOR === 'google' ? '-google' : ''}${REF ? '-ref' : ''}.png`);
  const reusar = process.argv.includes('--rehacer') && fs.existsSync(guardada);
  process.stdout.write(`   ${clave} · ${reusar ? 'reprocesando…' : 'generando…'} `);
  const crudo = reusar ? fs.readFileSync(guardada) : await generar(desc);
  if (!reusar) fs.writeFileSync(guardada, crudo);
  const limpio = await limpiarFondo(crudo);
  fs.writeFileSync(path.join(CRUDO, `${clave}-limpio${MOTOR === 'google' ? '-google' : ''}.png`), limpio);

  const vistas = await detectarVistas(limpio);
  if (!vistas.length) throw new Error('la imagen salió vacía');
  console.log(`${vistas.length} vista(s)`);

  // Recorta cada vista en dos versiones: en reposo y un pixel más abajo (el rebote
  // del paso). El pueblo usa la columna 1 quieto y cicla 0-1-2 al caminar.
  const trozos = [];
  for (const v of vistas) {
    const t = await sharp(limpio).extract({ left: v.left, top: v.top, width: v.width, height: v.height }).toBuffer();
    const esc = ALTURA[clave] ?? 1;
    trozos.push({ quieto: await encajar(t, 0, esc), paso: await encajar(t, 1, esc) });
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
console.log(`Generando ${objetivos.length} personaje(s) con ${MOTOR === 'google' ? `Google (${MODELO_GOOGLE})` : 'OpenAI'}…`);

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
