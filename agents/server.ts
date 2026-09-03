// Servidor local: API REST + stream SSE (tiempo real) + sirve el tablero (public/).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cx, bus } from './store';
import { getRoster } from './roster';
import { listVillages, getVillage, myVillage } from './network';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4321);

export function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ── API ──
  app.get('/api/missions', (_req, res) => res.json(cx.listMissions()));
  app.get('/api/missions/:id', (req, res) => res.json(cx.getMission(req.params.id)));
  app.get('/api/approvals', (_req, res) => res.json(cx.listPendingApprovals()));

  app.post('/api/tasks', (req, res) => {
    const { title, description, assignee } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title requerido' });
    const id = cx.createTask({ title: String(title), description: String(description || ''), assignee });
    res.json({ id });
  });

  app.post('/api/approvals/:id', (req, res) => {
    const { decision } = req.body || {};
    if (decision !== 'approved' && decision !== 'rejected')
      return res.status(400).json({ error: 'decision debe ser approved|rejected' });
    cx.resolveApproval(req.params.id, decision);
    res.json({ ok: true });
  });

  // ── Rutinas (tareas programadas) ──
  app.get('/api/routines', (_req, res) => res.json(cx.listRoutines()));
  app.post('/api/routines', (req, res) => {
    const { title, description, scheduleType, everyMinutes, at } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title requerido' });
    const schedule =
      scheduleType === 'daily'
        ? { type: 'daily' as const, at: at || '09:00' }
        : { type: 'interval' as const, everyMinutes: Number(everyMinutes) || 60 };
    res.json(cx.createRoutine({ title: String(title), description: String(description || ''), schedule }));
  });
  app.post('/api/routines/:id/toggle', (req, res) => { cx.toggleRoutine(req.params.id); res.json({ ok: true }); });
  app.delete('/api/routines/:id', (req, res) => { cx.deleteRoutine(req.params.id); res.json({ ok: true }); });

  // ── Stream de cambios en tiempo real (SSE) ──
  app.get('/api/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');
    const onChange = (payload: any) => res.write(`data: ${JSON.stringify({ type: 'change', ...payload })}\n\n`);
    bus.on('change', onChange);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('change', onChange);
    });
  });

  // Estado de cada agente (para la vista animada del pueblo/oficina).
  app.get('/api/agents', (_req, res) => {
    const rst = getRoster();
    const states = cx.agentStates(Object.keys(rst));
    res.json(states.map((s) => {
      const r = rst[s.key];
      return { ...s, name: r?.name ?? s.key, role: r?.role ?? '', sprite: r?.sprite ?? s.key,
               isLeader: s.key === 'oak', custom: !!r?.custom };
    }));
  });

  // ── Agentes personalizados: crear los tuyos y sumarlos al equipo ──
  app.get('/api/roster', (_req, res) => res.json(cx.listCustomAgents()));
  app.post('/api/roster', (req, res) => {
    const { name, role, personality, sprite, brain } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name requerido' });
    res.json(cx.createAgent({
      name: String(name).trim(),
      role: String(role || 'Ayudante general').trim(),
      personality: String(personality || 'Eres servicial y directo.').trim(),
      sprite: String(sprite || 'tu-entrenador'),
      brain: brain || undefined,
    }));
  });
  app.delete('/api/roster/:key', (req, res) => { cx.deleteAgent(req.params.key); res.json({ ok: true }); });

  // Sprites disponibles para elegir el aspecto de un agente nuevo.
  app.get('/api/sprites', (_req, res) => {
    const dir = path.join(__dirname, '..', 'public', 'assets', 'pokemon');
    try {
      res.json(fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.includes('tileset'))
        .map((f) => f.replace('.png', '')).sort());
    } catch { res.json([]); }
  });

  // ── Red de aldeas: quién está en línea y cómo visitarlas ──
  app.get('/api/network/me', (_req, res) => res.json(myVillage()));
  app.get('/api/network/villages', async (_req, res) => res.json(await listVillages()));
  app.get('/api/network/villages/:id', async (req, res) => {
    const v = await getVillage(req.params.id);
    if (!v) return res.status(404).json({ error: 'aldea no encontrada o fuera de línea' });
    res.json(v);
  });

  // ── Tablero estático + sprites/tilesets del pueblo ──
  app.use('/sprites', express.static(path.join(__dirname, '..', 'public', 'assets', 'pokemon')));
  app.use('/fonts', express.static(path.join(__dirname, '..', 'public', 'assets', 'fonts')));
  app.use(express.static(path.join(__dirname, 'public')));

  // Programador: revisa las rutinas cada 30s y crea tareas cuando toca.
  setInterval(() => {
    const n = cx.tickRoutines();
    if (n) console.log(`⏰ ${n} rutina(s) dispararon tareas`);
  }, 30000);

  app.listen(PORT, () => console.log(`🖥️  Tablero del Pueblo Pokémon: http://localhost:${PORT}`));
}
