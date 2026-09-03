// Cliente de red: publica tu aldea en el hub y consulta las demás.
//
// Config en agents/.env:
//   HUB_URL=https://mi-hub.fly.dev     (si se omite, la red queda desactivada)
//   VILLAGE_NAME=Pueblo Paleta
//   VILLAGE_OWNER=Akio
import { randomUUID } from 'node:crypto';
import { cx } from './store';
import { getRoster } from './roster';

const HUB = (process.env.HUB_URL || '').replace(/\/+$/, '');
const NAME = process.env.VILLAGE_NAME || 'Mi aldea';
const OWNER = process.env.VILLAGE_OWNER || 'entrenador';

export const networkEnabled = () => !!HUB;

// Identidad estable de tu aldea (se genera una vez y se guarda).
export function villageId(): string {
  let id = cx.getSetting('villageId');
  if (!id) { id = randomUUID(); cx.setSetting('villageId', id); }
  return id;
}

export function myVillage() {
  return { id: villageId(), name: NAME, owner: OWNER, hub: HUB || null, enabled: networkEnabled() };
}

// Lo que se comparte: SOLO el elenco y si están ocupados.
// Nunca se envían tareas, resultados, datos ni claves.
function snapshot() {
  const rst = getRoster();
  const states = cx.agentStates(Object.keys(rst));
  return {
    name: NAME,
    owner: OWNER,
    agents: states.map((s: any) => ({
      key: s.key,
      name: rst[s.key]?.name ?? s.key,
      role: rst[s.key]?.role ?? '',
      sprite: rst[s.key]?.sprite ?? s.key,
      state: s.state,
    })),
  };
}

async function heartbeat() {
  if (!HUB) return;
  try {
    await fetch(`${HUB}/api/villages/${villageId()}/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot()),
    });
  } catch (e: any) {
    console.error('⚠️ No se pudo contactar con el hub:', e.message);
  }
}

export function startHeartbeat() {
  if (!HUB) { console.log('🌍 Red de aldeas desactivada (define HUB_URL en agents/.env para activarla)'); return; }
  console.log(`🌍 Aldea "${NAME}" publicándose en ${HUB}`);
  heartbeat();
  setInterval(heartbeat, 15_000);
}

export async function listVillages() {
  if (!HUB) return [];
  try {
    const r = await fetch(`${HUB}/api/villages`);
    const all: any[] = await r.json();
    const me = villageId();
    return all.map((v) => ({ ...v, isMine: v.id === me }));
  } catch { return []; }
}

export async function getVillage(id: string) {
  if (!HUB) return null;
  try {
    const r = await fetch(`${HUB}/api/villages/${encodeURIComponent(id)}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
