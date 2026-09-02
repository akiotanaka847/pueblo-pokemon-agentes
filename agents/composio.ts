// Conector Composio: 1000+ apps (Gmail, Slack, Notion, Sheets…) con UN solo login.
// Composio devuelve las herramientas ya en formato Vercel AI SDK, que es justo el que
// usa nuestro orquestador → solo las envolvemos con eventos + aprobación humana.
//
// Config en agents/.env:
//   COMPOSIO_API_KEY=...            (de app.composio.dev)
//   COMPOSIO_TOOLKITS=gmail,slack   (apps a cargar, separadas por coma)
//   COMPOSIO_USER_ID=default        (opcional; identifica tus cuentas conectadas)
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

// Acciones que modifican/envían → piden tu aprobación en el tablero.
const SENSITIVE = /(send|create|update|delete|post|write|move|remove|archive|trash|add|insert|reply|forward|schedule|publish|upload|share|invite|pay|draft|modify|set)/i;

let cached: Record<string, any> = {};

export async function initComposio(): Promise<number> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return 0; // no configurado → se ignora sin romper nada
  const userId = process.env.COMPOSIO_USER_ID || 'default';
  const toolkits = (process.env.COMPOSIO_TOOLKITS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!toolkits.length) {
    console.error('⚠️ Composio: falta COMPOSIO_TOOLKITS (ej: gmail,googlecalendar,slack)');
    return 0;
  }
  try {
    const composio = new Composio({ apiKey, provider: new VercelProvider() });
    cached = ((await composio.tools.get(userId, { toolkits })) || {}) as Record<string, any>;
    const n = Object.keys(cached).length;
    console.log(`🌐 Composio: ${n} herramientas cargadas de [${toolkits.join(', ')}]`);
    return n;
  } catch (e: any) {
    console.error('⚠️ Composio no disponible:', e.message);
    cached = {};
    return 0;
  }
}

// Envuelve las tools de Composio con nuestros eventos + flujo de aprobación.
// Conservamos el objeto original (y su esquema) y solo interceptamos `execute`.
export function buildComposioTools(h: {
  emit: (type: string, content: string) => Promise<void>;
  awaitApproval: (toolName: string, input: any, reason: string) => Promise<boolean>;
}): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [name, t] of Object.entries<any>(cached)) {
    const needsApproval = SENSITIVE.test(name);
    out[name] = {
      ...t,
      execute: async (input: any, opts: any) => {
        await h.emit('tool_call', `${name}(${JSON.stringify(input ?? {}).slice(0, 140)})`);
        if (needsApproval) {
          const ok = await h.awaitApproval(name, input, `Ejecutar ${name} (Composio)`);
          if (!ok) return 'Acción RECHAZADA por el usuario. No se ejecutó.';
        }
        try {
          const res = await t.execute(input, opts);
          await h.emit('tool_result', `${name} ok`);
          return res;
        } catch (e: any) {
          return `Error en ${name}: ${e.message}`;
        }
      },
    };
  }
  return out;
}
