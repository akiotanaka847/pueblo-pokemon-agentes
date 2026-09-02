// Cargador de conectores MCP. Lee agents/mcp.json, conecta cada servidor MCP y
// adapta sus herramientas al AI SDK, envueltas con eventos + aprobación humana.
// Enchufar un conector real (Gmail, Slack, Sheets, …) = agregarlo a agents/mcp.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tool, jsonSchema } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(__dirname, 'mcp.json');

// Heurística: ¿el nombre de la tool sugiere una acción sensible (que modifica/envía)?
const SENSITIVE = /(send|create|update|delete|post|write|move|remove|archive|trash|add|insert|reply|forward|schedule|publish|upload|share|invite|pay|draft|modify|set)/i;

interface McpDef {
  server: string;
  name: string;      // nombre original en el servidor MCP
  toolName: string;  // nombre expuesto al modelo (server__name)
  description: string;
  inputSchema: any;
  client: Client;
  autoApprove: boolean;
}
const defs: McpDef[] = [];

// Conecta todos los servidores de mcp.json (una vez). Robusto: si uno falla, lo salta.
export async function initMcp(): Promise<number> {
  if (!fs.existsSync(CONFIG)) return 0;
  let cfg: any;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (e: any) {
    console.error('⚠️ agents/mcp.json inválido:', e.message);
    return 0;
  }
  const servers = cfg.mcpServers || {};
  for (const [server, sc] of Object.entries<any>(servers)) {
    if (sc.disabled) continue;
    try {
      const client = new Client({ name: 'pueblo-pokemon', version: '1.0.0' }, { capabilities: {} });
      const transport = new StdioClientTransport({
        command: sc.command,
        args: sc.args || [],
        env: { ...(process.env as any), ...(sc.env || {}) },
      });
      await client.connect(transport);
      const list = await client.listTools();
      const auto: string[] = sc.autoApprove || [];
      for (const t of list.tools) {
        defs.push({
          server,
          name: t.name,
          toolName: `${server}__${t.name}`,
          description: t.description || t.name,
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
          client,
          autoApprove: auto.includes(t.name) || !SENSITIVE.test(t.name),
        });
      }
      console.log(`🔌 Conector "${server}": ${list.tools.length} herramientas cargadas`);
    } catch (e: any) {
      console.error(`⚠️ Conector "${server}" no se pudo cargar: ${e.message}`);
    }
  }
  return defs.length;
}

// Construye las tools MCP (envueltas con eventos + aprobación) para un agente/tarea.
export function buildMcpTools(h: {
  emit: (type: string, content: string) => Promise<void>;
  awaitApproval: (toolName: string, input: any, reason: string) => Promise<boolean>;
}): Record<string, any> {
  const out: Record<string, any> = {};
  for (const d of defs) {
    out[d.toolName] = tool({
      description: `[conector ${d.server}] ${d.description}`,
      inputSchema: jsonSchema(d.inputSchema),
      execute: async (input: any) => {
        await h.emit('tool_call', `${d.toolName}(${JSON.stringify(input).slice(0, 160)})`);
        if (!d.autoApprove) {
          const ok = await h.awaitApproval(d.toolName, input, `Ejecutar ${d.toolName}`);
          if (!ok) return 'Acción RECHAZADA por el usuario. No se ejecutó.';
        }
        try {
          const res: any = await d.client.callTool({ name: d.name, arguments: input });
          const text = (res.content || [])
            .map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
            .join('\n')
            .slice(0, 8000);
          await h.emit('tool_result', `${d.toolName} ok`);
          return text || '(sin contenido)';
        } catch (e: any) {
          return `Error en ${d.toolName}: ${e.message}`;
        }
      },
    });
  }
  return out;
}
