// Telemetría opcional con Langfuse: coste, latencia y árbol de llamadas de cada
// agente. Si no hay claves configuradas no hace NADA — ni siquiera carga
// OpenTelemetry — y los agentes funcionan exactamente igual que sin ella.
//
// AI SDK v7 cambió el modelo: ya no basta con `isEnabled: true`, hay que
// registrar una integración (registerTelemetry) que reciba los eventos.
import type { PropagateAttributesParams } from '@langfuse/tracing';

let sdk: { shutdown(): Promise<void> } | null = null;
let propagar: ((p: PropagateAttributesParams, fn: () => any) => any) | null = null;

// Grabar prompts y respuestas completos. En local no hay problema; si algún día
// se apunta a la nube, con LANGFUSE_REGISTRAR_CONTENIDO=false solo viajan
// tiempos, tokens y costes, no el contenido.
export const registrarContenido = process.env.LANGFUSE_REGISTRAR_CONTENIDO !== 'false';

export async function iniciarTelemetria(): Promise<boolean> {
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL } = process.env;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) return false;

  // Sin URL explícita el SDK usa cloud.langfuse.com por defecto. Con unas claves
  // locales y la URL olvidada, los prompts —archivos de contexto incluidos—
  // saldrían hacia la nube sin que nadie lo decidiera. Mejor no arrancar.
  if (!LANGFUSE_BASE_URL) {
    console.warn('⚠️  Telemetría desactivada: falta LANGFUSE_BASE_URL en agents/.env ' +
                 '(por ejemplo http://localhost:3000). No se envía nada.');
    return false;
  }

  const [{ NodeSDK }, { LangfuseSpanProcessor }, { LangfuseVercelAiSdkIntegration }, { registerTelemetry }, tracing] =
    await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@langfuse/otel'),
      import('@langfuse/vercel-ai-sdk'),
      import('ai'),
      import('@langfuse/tracing'),
    ]);

  sdk = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] });
  (sdk as any).start();
  registerTelemetry(new LangfuseVercelAiSdkIntegration());
  propagar = tracing.propagateAttributes as any;

  console.log(`📈 Telemetría activa → ${LANGFUSE_BASE_URL}` +
              (registrarContenido ? '' : ' (solo métricas, sin contenido)'));
  return true;
}

// Ejecuta `fn` con atributos de traza (sesión, etiquetas…). Sin telemetría,
// simplemente la ejecuta.
export function conAtributos<T>(atributos: PropagateAttributesParams, fn: () => T): T {
  return propagar ? propagar(atributos, fn) : fn();
}

// Vacía lo pendiente antes de salir: las trazas se envían por lotes y, si el
// proceso muere sin esto, las últimas se pierden.
export async function cerrarTelemetria() {
  if (!sdk) return;
  try { await sdk.shutdown(); } catch { /* al salir no hay a quién avisar */ }
}
