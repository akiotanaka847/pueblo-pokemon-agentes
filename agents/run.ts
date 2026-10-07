// Punto de entrada: carga config local (agents/.env), arranca el servidor (tablero
// + API) y el orquestador de agentes en el mismo proceso. Sin Convex, sin nube.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
  console.error('❌ Necesitas al menos ANTHROPIC_API_KEY u OPENAI_API_KEY en agents/.env');
  process.exit(1);
}

// La telemetría se inicia ANTES que el orquestador: las llamadas al modelo
// deben encontrar ya registrada la integración.
const { iniciarTelemetria, cerrarTelemetria } = await import('./telemetria');
await iniciarTelemetria();
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(senal, async () => { await cerrarTelemetria(); process.exit(0); });
}

const { startServer } = await import('./server');
const { startHeartbeat } = await import('./network');
const { mainLoop } = await import('./orchestrator');

startServer();
startHeartbeat();
await mainLoop();
