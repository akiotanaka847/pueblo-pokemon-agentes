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

const { startServer } = await import('./server');
const { startHeartbeat } = await import('./network');
const { mainLoop } = await import('./orchestrator');

startServer();
startHeartbeat();
await mainLoop();
