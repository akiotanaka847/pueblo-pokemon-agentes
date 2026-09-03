// Store LOCAL (reemplaza a Convex). Guarda tareas/eventos/aprobaciones en un JSON
// y emite 'change' para que el servidor empuje actualizaciones a la UI por SSE.
// Expone el mismo objeto `cx` que usaba el orquestador → cero cambios en su lógica.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'db.json');

export type TaskId = string;
export type ApprovalId = string;

export interface Task {
  _id: TaskId;
  title: string;
  description: string;
  assignee: string;
  status: string;
  requestedBy: string;
  parentTaskId?: TaskId;
  rootTaskId: TaskId;
  delegatedBy?: string;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
export interface TaskEvent {
  _id: string;
  taskId: TaskId;
  rootTaskId: TaskId;
  actor: string;
  type: string;
  target?: string;
  content: string;
  createdAt: number;
}
export interface Approval {
  _id: ApprovalId;
  taskId: TaskId;
  rootTaskId: TaskId;
  actor: string;
  tool: string;
  input: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  resolvedBy?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface CustomAgent {
  key: string;          // identificador único (slug)
  name: string;         // nombre visible
  role: string;         // especialidad corta (para que el líder sepa a quién delegar)
  personality: string;  // cómo habla y actúa (se usa en su prompt)
  sprite: string;       // qué sprite usa en el pueblo
  brain?: string;       // cerebro propio (opcional)
  createdAt: number;
}

export interface Routine {
  _id: string;
  title: string;
  description: string;
  schedule: { type: 'interval' | 'daily'; everyMinutes?: number; at?: string };
  enabled: boolean;
  lastRun?: number;
  nextRun: number;
  createdAt: number;
}

interface DB {
  tasks: Task[];
  events: TaskEvent[];
  approvals: Approval[];
  routines: Routine[];
  customAgents: CustomAgent[];
  settings: Record<string, string>;
}

const db: DB = load();
export const bus = new EventEmitter();

function load(): DB {
  try {
    if (fs.existsSync(DB_FILE))
      return { tasks: [], events: [], approvals: [], routines: [], customAgents: [], settings: {}, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch (e) {
    console.error('No se pudo leer db.json, empezando vacío:', (e as any).message);
  }
  return { tasks: [], events: [], approvals: [], routines: [], customAgents: [], settings: {} };
}

function computeNext(schedule: Routine['schedule'], from = Date.now()): number {
  if (schedule.type === 'interval') return from + Math.max(1, schedule.everyMinutes || 60) * 60000;
  if (schedule.type === 'daily' && schedule.at) {
    const [h, m] = schedule.at.split(':').map(Number);
    const d = new Date(from);
    d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return from + 3600000;
}

let saveTimer: NodeJS.Timeout | null = null;
function persist(rootTaskId?: TaskId) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db), () => {}), 150);
  bus.emit('change', { rootTaskId });
}

const now = () => Date.now();
const getTask = (id: TaskId) => db.tasks.find((t) => t._id === id);

function logEvent(a: { taskId: TaskId; rootTaskId: TaskId; actor: string; type: string; content: string; target?: string }) {
  db.events.push({ _id: randomUUID(), createdAt: now(), ...a });
}

// ── API usada por el orquestador (misma forma que tenía en Convex) ──
export const cx = {
  createTask(a: { title: string; description: string; assignee?: string; requestedBy?: string }): TaskId {
    const id = randomUUID();
    const assignee = a.assignee ?? 'oak';
    const t: Task = {
      _id: id, title: a.title, description: a.description, assignee,
      status: 'pending', requestedBy: a.requestedBy ?? 'user', rootTaskId: id,
      createdAt: now(), updatedAt: now(),
    };
    db.tasks.push(t);
    logEvent({ taskId: id, rootTaskId: id, actor: 'user', type: 'created', content: a.title, target: assignee });
    persist(id);
    return id;
  },

  claimNext(): Task | null {
    const t = db.tasks.find((x) => x.status === 'pending');
    if (!t) return null;
    t.status = 'planning';
    t.updatedAt = now();
    logEvent({ taskId: t._id, rootTaskId: t.rootTaskId, actor: t.assignee, type: 'status', content: 'planning' });
    persist(t.rootTaskId);
    return t;
  },

  updateStatus(taskId: TaskId, status: string) {
    const t = getTask(taskId); if (!t) return;
    t.status = status; t.updatedAt = now();
    logEvent({ taskId, rootTaskId: t.rootTaskId, actor: t.assignee, type: 'status', content: status });
    persist(t.rootTaskId);
  },

  createSubtask(a: { parentTaskId: TaskId; assignee: string; title: string; description: string; delegatedBy: string }): TaskId {
    const parent = getTask(a.parentTaskId);
    const rootTaskId = parent?.rootTaskId ?? a.parentTaskId;
    const id = randomUUID();
    db.tasks.push({
      _id: id, title: a.title, description: a.description, assignee: a.assignee,
      status: 'in_progress', requestedBy: a.delegatedBy, parentTaskId: a.parentTaskId,
      rootTaskId, delegatedBy: a.delegatedBy, createdAt: now(), updatedAt: now(),
    });
    logEvent({ taskId: a.parentTaskId, rootTaskId, actor: a.delegatedBy, type: 'delegated', content: a.title, target: a.assignee });
    persist(rootTaskId);
    return id;
  },

  addEvent(a: { taskId: TaskId; actor: string; type: string; content: string; target?: string }) {
    const t = getTask(a.taskId); if (!t) return;
    logEvent({ taskId: a.taskId, rootTaskId: t.rootTaskId, actor: a.actor, type: a.type, content: a.content, target: a.target });
    persist(t.rootTaskId);
  },

  setResult(taskId: TaskId, result: string) {
    const t = getTask(taskId); if (!t) return;
    t.result = result; t.status = 'done'; t.updatedAt = now();
    logEvent({ taskId, rootTaskId: t.rootTaskId, actor: t.assignee, type: 'result', content: result });
    persist(t.rootTaskId);
  },

  failTask(taskId: TaskId, error: string) {
    const t = getTask(taskId); if (!t) return;
    t.error = error; t.status = 'failed'; t.updatedAt = now();
    logEvent({ taskId, rootTaskId: t.rootTaskId, actor: t.assignee, type: 'error', content: error });
    persist(t.rootTaskId);
  },

  requestApproval(a: { taskId: TaskId; actor: string; tool: string; input: string; reason: string }): ApprovalId {
    const t = getTask(a.taskId);
    const rootTaskId = t?.rootTaskId ?? a.taskId;
    const id = randomUUID();
    db.approvals.push({ _id: id, taskId: a.taskId, rootTaskId, actor: a.actor, tool: a.tool, input: a.input, reason: a.reason, status: 'pending', createdAt: now() });
    if (t) { t.status = 'awaiting_approval'; t.updatedAt = now(); }
    logEvent({ taskId: a.taskId, rootTaskId, actor: a.actor, type: 'approval_requested', content: `${a.tool}: ${a.reason}` });
    persist(rootTaskId);
    return id;
  },

  getApproval(approvalId: ApprovalId): Approval | undefined {
    return db.approvals.find((x) => x._id === approvalId);
  },

  resolveApproval(approvalId: ApprovalId, decision: 'approved' | 'rejected', resolvedBy = 'user') {
    const ap = db.approvals.find((x) => x._id === approvalId);
    if (!ap || ap.status !== 'pending') return;
    ap.status = decision; ap.resolvedBy = resolvedBy; ap.resolvedAt = now();
    const t = getTask(ap.taskId);
    if (t) { t.status = 'in_progress'; t.updatedAt = now(); }
    logEvent({ taskId: ap.taskId, rootTaskId: ap.rootTaskId, actor: 'user', type: 'approval_resolved', content: `${ap.tool}: ${decision}` });
    persist(ap.rootTaskId);
  },

  // ── rutinas (tareas programadas) ──
  createRoutine(a: { title: string; description: string; schedule: Routine['schedule'] }): Routine {
    const r: Routine = {
      _id: randomUUID(), title: a.title, description: a.description, schedule: a.schedule,
      enabled: true, nextRun: computeNext(a.schedule), createdAt: now(),
    };
    db.routines.push(r); persist(); return r;
  },
  listRoutines(): Routine[] { return db.routines.slice().sort((a, b) => b.createdAt - a.createdAt); },
  toggleRoutine(id: string) {
    const r = db.routines.find((x) => x._id === id); if (!r) return;
    r.enabled = !r.enabled; if (r.enabled) r.nextRun = computeNext(r.schedule); persist();
  },
  deleteRoutine(id: string) { db.routines = db.routines.filter((x) => x._id !== id); persist(); },
  tickRoutines(): number {
    const t = now(); let fired = 0;
    for (const r of db.routines) {
      if (!r.enabled || r.nextRun > t) continue;
      cx.createTask({ title: r.title, description: r.description, requestedBy: `rutina: ${r.title}` });
      r.lastRun = t; r.nextRun = computeNext(r.schedule, t); fired++;
    }
    if (fired) persist();
    return fired;
  },

  // Estado actual de cada agente (para la vista del pueblo/oficina).
  agentStates(keys: string[]) {
    const ACTIVE = ['planning', 'in_progress', 'awaiting_approval'];
    const active = db.tasks.filter((t) => ACTIVE.includes(t.status));
    return keys.map((k) => {
      const t = active.find((x) => x.assignee === k);
      let last: TaskEvent | undefined;
      for (let i = db.events.length - 1; i >= 0; i--) {
        if (db.events[i].actor === k) { last = db.events[i]; break; }
      }
      return {
        key: k,
        state: t ? (t.status === 'awaiting_approval' ? 'approval' : 'working') : 'idle',
        task: t ? t.title : null,
        lastEvent: last ? { type: last.type, content: last.content.slice(0, 90) } : null,
      };
    });
  },

  // ── ajustes persistentes (p. ej. la identidad de tu aldea) ──
  getSetting(k: string): string | undefined { return db.settings?.[k]; },
  setSetting(k: string, v: string) { (db.settings ||= {})[k] = v; persist(); },

  // ── agentes personalizados (los que crea el usuario) ──
  createAgent(a: { name: string; role: string; personality: string; sprite: string; brain?: string }): CustomAgent {
    const base = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agente';
    let key = base, n = 2;
    const usados = new Set(db.customAgents.map((x) => x.key));
    while (usados.has(key)) key = `${base}-${n++}`;
    const ag: CustomAgent = { key, name: a.name, role: a.role, personality: a.personality,
      sprite: a.sprite, brain: a.brain, createdAt: now() };
    db.customAgents.push(ag); persist(); return ag;
  },
  listCustomAgents(): CustomAgent[] { return db.customAgents.slice().sort((a, b) => a.createdAt - b.createdAt); },
  deleteAgent(key: string) { db.customAgents = db.customAgents.filter((x) => x.key !== key); persist(); },

  // ── consultas para la UI ──
  listMissions(): Task[] {
    return db.tasks.filter((t) => !t.parentTaskId).sort((a, b) => b.createdAt - a.createdAt);
  },
  getMission(rootTaskId: TaskId) {
    return {
      root: getTask(rootTaskId) ?? null,
      tasks: db.tasks.filter((t) => t.rootTaskId === rootTaskId),
      events: db.events.filter((e) => e.rootTaskId === rootTaskId).sort((a, b) => a.createdAt - b.createdAt),
      approvals: db.approvals.filter((a) => a.rootTaskId === rootTaskId),
    };
  },
  listPendingApprovals(): Approval[] {
    return db.approvals.filter((a) => a.status === 'pending').sort((a, b) => b.createdAt - a.createdAt);
  },
};
