// Orquestador del Pueblo Pokémon (multi-cerebro).
// Lee tareas de Convex, corre a Oak (líder) que delega en trabajadores mediante el
// Vercel AI SDK (interfaz unificada sobre Claude / OpenAI / …). Ejecutan tools reales
// y piden aprobación humana para acciones sensibles. Todo se emite a Convex para la UI.
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cx, TaskId } from './store';
import { roster, LEADER, workerKeys, CharacterKey } from './roster';
import { getModel } from './brains';
import { initMcp, buildMcpTools } from './mcp';
import { initComposio, buildComposioTools } from './composio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function emit(taskId: TaskId, actor: string, type: string, content: string, target?: string) {
  try {
    await cx.addEvent({ taskId, actor, type, content: (content || '').slice(0, 4000), target });
  } catch (e: any) {
    console.error('emit error:', e.message);
  }
}

// Pide aprobación humana y espera la decisión (send_message y tools MCP sensibles).
async function awaitApproval(
  ctx: { taskId: TaskId; actor: CharacterKey },
  toolName: string,
  input: any,
  reason: string,
): Promise<boolean> {
  const approvalId = (await cx.requestApproval({
    taskId: ctx.taskId, actor: ctx.actor, tool: toolName, input: JSON.stringify(input), reason,
  })) as any;
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    if (Date.now() > deadline) return false;
    await sleep(2000);
    const a: any = await cx.getApproval(approvalId);
    if (a?.status === 'approved') return true;
    if (a?.status === 'rejected') return false;
  }
}

// ── Herramientas (agnósticas de proveedor), ligadas a una tarea/agente ──
function makeTools(ctx: { taskId: TaskId; actor: CharacterKey; isLeader: boolean }) {
  const tools: Record<string, any> = {
    fetch_url: tool({
      description: 'Descarga el contenido de texto de una URL (páginas web o APIs).',
      inputSchema: z.object({ url: z.string().describe('URL http(s) a descargar') }),
      execute: async ({ url }) => {
        await emit(ctx.taskId, ctx.actor, 'tool_call', `fetch_url: ${url}`);
        try {
          const res = await fetch(url, { headers: { 'user-agent': 'PuebloPokemonAgent/1.0' } });
          const raw = await res.text();
          const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
          await emit(ctx.taskId, ctx.actor, 'tool_result', `fetch_url ok (${text.length} chars)`);
          return text || '(respuesta vacía)';
        } catch (e: any) {
          return `Error al descargar: ${e.message}`;
        }
      },
    }),

    read_data: tool({
      description: 'Lee un archivo de la carpeta de datos que el usuario suministra (agents/data).',
      inputSchema: z.object({ filename: z.string() }),
      execute: async ({ filename }) => {
        const safe = path.basename(filename);
        const p = path.join(DATA_DIR, safe);
        await emit(ctx.taskId, ctx.actor, 'tool_call', `read_data: ${safe}`);
        if (!fs.existsSync(p)) {
          const avail = fs.readdirSync(DATA_DIR).join(', ') || '(ninguno)';
          return `No existe ${safe}. Archivos disponibles: ${avail}`;
        }
        return fs.readFileSync(p, 'utf8').slice(0, 8000);
      },
    }),

    write_note: tool({
      description: 'Guarda un resultado/informe en un archivo local (agents/output).',
      inputSchema: z.object({ filename: z.string(), content: z.string() }),
      execute: async ({ filename, content }) => {
        const safe = path.basename(filename);
        fs.writeFileSync(path.join(OUT_DIR, safe), content, 'utf8');
        await emit(ctx.taskId, ctx.actor, 'tool_result', `nota guardada: ${safe}`);
        return `Guardado en output/${safe}`;
      },
    }),

    // SENSIBLE: requiere aprobación humana (se resuelve dentro del propio execute).
    send_message: tool({
      description: 'Envía un correo/mensaje EXTERNO a alguien. SIEMPRE requiere aprobación del humano.',
      inputSchema: z.object({
        to: z.string(),
        subject: z.string(),
        body: z.string(),
        reason: z.string().describe('por qué hay que enviarlo'),
      }),
      execute: async ({ to, subject, body, reason }) => {
        const ok = await awaitApproval(
          { taskId: ctx.taskId, actor: ctx.actor }, 'send_message', { to, subject, body }, reason || `Enviar a ${to}`,
        );
        if (!ok) return 'El usuario RECHAZÓ el envío (o expiró la espera). No se envió el mensaje.';
        const stamp = `[${new Date().toISOString()}] Para: ${to}\nAsunto: ${subject}\n\n${body}\n---\n`;
        fs.appendFileSync(path.join(OUT_DIR, 'mensajes-enviados.txt'), stamp);
        await emit(ctx.taskId, ctx.actor, 'tool_result', `mensaje enviado a ${to}: ${subject}`);
        return `Mensaje enviado a ${to}.`;
      },
    }),
  };

  if (ctx.isLeader) {
    tools.delegate = tool({
      description: 'Delega una subtarea a un agente trabajador del pueblo y espera su resultado.',
      inputSchema: z.object({
        worker: z.enum(workerKeys as unknown as [string, ...string[]]).describe('clave del trabajador'),
        title: z.string(),
        instructions: z.string().describe('instrucciones claras y completas para el trabajador'),
      }),
      execute: async ({ worker, title, instructions }) => {
        const subtaskId = (await cx.createSubtask({
          parentTaskId: ctx.taskId,
          assignee: worker,
          title,
          description: instructions,
          delegatedBy: LEADER,
        })) as TaskId;
        const result = await runAgent(worker as CharacterKey, subtaskId, `${title}\n\n${instructions}`, false);
        await cx.setResult(subtaskId, result);
        return `Resultado de ${roster[worker as CharacterKey].name}:\n${result}`;
      },
    });
  }

  // Conectores externos (MCP y Composio), con aprobación para las acciones sensibles.
  const wiring = {
    emit: (type: string, content: string) => emit(ctx.taskId, ctx.actor, type, content),
    awaitApproval: (t: string, i: any, r: string) => awaitApproval({ taskId: ctx.taskId, actor: ctx.actor }, t, i, r),
  };
  Object.assign(tools, buildMcpTools(wiring));
  Object.assign(tools, buildComposioTools(wiring));

  return tools;
}

// ── Correr un agente (líder o trabajador) con su cerebro ──
async function runAgent(
  actor: CharacterKey,
  taskId: TaskId,
  prompt: string,
  isLeader: boolean,
): Promise<string> {
  const tools = makeTools({ taskId, actor, isLeader });
  const brain = getModel(roster[actor].brain);
  const system =
    roster[actor].systemPrompt +
    `\n\nResponde SIEMPRE en español, de forma concisa. Al terminar, entrega un resultado claro y accionable.`;

  await emit(taskId, actor, 'status', `${isLeader ? 'analizando y planificando' : 'trabajando'} · cerebro: ${brain.label}`);

  try {
    const res = await generateText({
      model: brain.model,
      system,
      prompt,
      tools,
      stopWhen: stepCountIs(isLeader ? 24 : 14),
      onStepFinish: async (step: any) => {
        const t = (step?.text || '').trim();
        if (t) await emit(taskId, actor, 'message', t);
      },
    });
    return res.text || '(sin resultado)';
  } catch (e: any) {
    const msg = `⚠️ Error del agente ${actor} (${brain.label}): ${e.message}`;
    await emit(taskId, actor, 'error', msg);
    return msg;
  }
}

// ── El líder toma una tarea raíz, delega y sintetiza ──
async function runLeader(task: any) {
  const taskId = task._id as TaskId;
  await cx.updateStatus(taskId, 'in_progress');
  const workerLines = (workerKeys as readonly CharacterKey[])
    .map((k) => `- ${k} (${roster[k].name}): ${roster[k].role}`)
    .join('\n');
  const prompt =
    `Nueva tarea del usuario: "${task.title}".\n\nDetalle: ${task.description}\n\n` +
    `Eres el LÍDER. Analiza la tarea, decide qué trabajadores necesitas y DELEGA con la herramienta 'delegate' ` +
    `(una llamada por subtarea, con instrucciones completas). Trabajadores disponibles:\n${workerLines}\n\n` +
    `Cuando tengas sus resultados, SINTETIZA todo en una respuesta final para el usuario. ` +
    `IMPORTANTE: tu respuesta final DEBE contener la respuesta completa y útil (datos, conclusiones y ` +
    `recomendaciones concretas obtenidas de los trabajadores), NO solo un "tarea completada".`;
  try {
    const result = await runAgent(LEADER, taskId, prompt, true);
    await cx.setResult(taskId, result);
    console.log(`✔ Tarea completada: ${task.title}`);
  } catch (e: any) {
    await cx.failTask(taskId, e.message);
    console.error(`✖ Tarea fallida: ${task.title} — ${e.message}`);
  }
}

// ── Bucle principal: reclama tareas pendientes y las procesa ──
export async function mainLoop() {
  const g = getModel();
  const nMcp = await initMcp();
  const nComposio = await initComposio();
  console.log(`🧠 Orquestador iniciado (cerebro: ${g.label} · ${nMcp} tools MCP · ${nComposio} tools Composio). Esperando tareas…`);
  for (;;) {
    let task: any = null;
    try {
      task = await cx.claimNext();
    } catch (e: any) {
      console.error('Error al reclamar tarea:', e.message);
      await sleep(3000);
      continue;
    }
    if (task) {
      console.log(`▶ Nueva tarea: "${task.title}"`);
      await runLeader(task);
    } else {
      await sleep(2500);
    }
  }
}
