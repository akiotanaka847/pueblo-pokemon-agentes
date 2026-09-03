// ─────────────────────────────────────────────────────────────
//  HUB de aldeas: directorio central donde las aldeas se registran
//  y desde donde se pueden visitar.
//
//  Las aldeas NO reciben conexiones entrantes: ellas PUBLICAN su estado
//  aquí cada pocos segundos (latido). Así funciona detrás de cualquier
//  router, sin abrir puertos.
//
//  Arranque:  npm run hub     (por defecto en el puerto 4400)
//  Desplegable tal cual en Fly.io / Render / Railway.
// ─────────────────────────────────────────────────────────────
import express from 'express';

const PORT = Number(process.env.PORT || 4400);
const TTL = Number(process.env.VILLAGE_TTL_MS || 90_000); // en línea si latió hace menos de esto

interface AgentInfo { key: string; name: string; role: string; sprite: string; state: string }
interface Village {
  id: string;
  name: string;
  owner: string;
  agents: AgentInfo[];
  updatedAt: number;
}

const villages = new Map<string, Village>();

// Sanea lo que llega: solo campos esperados y con longitud limitada.
const txt = (v: unknown, max: number) => String(v ?? '').slice(0, max);
function cleanAgents(raw: unknown): AgentInfo[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((a: any) => ({
    key: txt(a?.key, 40),
    name: txt(a?.name, 40),
    role: txt(a?.role, 120),
    sprite: txt(a?.sprite, 40),
    state: ['idle', 'working', 'approval'].includes(a?.state) ? a.state : 'idle',
  }));
}
const isOnline = (v: Village) => Date.now() - v.updatedAt < TTL;
const publicView = (v: Village) => ({
  id: v.id, name: v.name, owner: v.owner,
  agentCount: v.agents.length,
  busy: v.agents.filter((a) => a.state !== 'idle').length,
  online: isOnline(v), updatedAt: v.updatedAt,
});

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use((_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });

// Una aldea publica su estado (latido).
app.post('/api/villages/:id/heartbeat', (req, res) => {
  const id = txt(req.params.id, 60);
  if (!id) return res.status(400).json({ error: 'id requerido' });
  const b = req.body || {};
  villages.set(id, {
    id,
    name: txt(b.name, 40) || 'Aldea sin nombre',
    owner: txt(b.owner, 30) || 'anónimo',
    agents: cleanAgents(b.agents),
    updatedAt: Date.now(),
  });
  res.json({ ok: true });
});

// Directorio de aldeas en línea.
app.get('/api/villages', (_req, res) => {
  const list = [...villages.values()].filter(isOnline)
    .sort((a, b) => b.updatedAt - a.updatedAt).map(publicView);
  res.json(list);
});

// Ver una aldea concreta (su elenco).
app.get('/api/villages/:id', (req, res) => {
  const v = villages.get(txt(req.params.id, 60));
  if (!v || !isOnline(v)) return res.status(404).json({ error: 'aldea no encontrada o fuera de línea' });
  res.json({ ...publicView(v), agents: v.agents });
});

// Página de estado.
app.get('/', (_req, res) => {
  const online = [...villages.values()].filter(isOnline).length;
  res.type('text/plain').send(`Hub de aldeas del Pueblo Pokémon\naldeas en línea: ${online}\n`);
});

// Limpieza periódica de aldeas caducadas.
setInterval(() => {
  for (const [id, v] of villages) if (Date.now() - v.updatedAt > TTL * 10) villages.delete(id);
}, 60_000);

app.listen(PORT, () => console.log(`🌍 Hub de aldeas escuchando en el puerto ${PORT}`));
