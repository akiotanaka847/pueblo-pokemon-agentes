// Cerebros intercambiables: una interfaz unificada (Vercel AI SDK) sobre cualquier LLM.
//
// Cambiar de cerebro = cambiar `BRAIN` en agents/.env, o darle uno distinto a cada
// personaje (roster[key].brain).
//
// 'custom' vale para CUALQUIER API compatible con OpenAI, que es casi todo el mercado
// barato: DeepSeek, Qwen (Alibaba), Kimi (Moonshot), GLM (Zhipu), Groq, OpenRouter…
// e incluso modelos LOCALES y gratis con Ollama. Solo necesita 3 datos:
// CUSTOM_BASE_URL, CUSTOM_API_KEY y CUSTOM_MODEL.
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type BrainId = 'claude' | 'openai' | 'custom';

export const DEFAULT_BRAIN: BrainId = (process.env.BRAIN as BrainId) || 'claude';

export const brainLabel: Record<BrainId, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  custom: 'Personalizado',
};

export function getModel(brain?: BrainId): { id: BrainId; label: string; model: any } {
  const id: BrainId = brain || DEFAULT_BRAIN;

  if (id === 'openai') {
    return { id, label: brainLabel.openai, model: openai(process.env.OPENAI_MODEL || 'gpt-4o-mini') };
  }

  if (id === 'custom') {
    const baseURL = process.env.CUSTOM_BASE_URL;
    const model = process.env.CUSTOM_MODEL;
    if (!baseURL || !model) {
      throw new Error(
        'Cerebro "custom": faltan CUSTOM_BASE_URL y/o CUSTOM_MODEL en agents/.env. ' +
          'Ejemplo DeepSeek: CUSTOM_BASE_URL=https://api.deepseek.com/v1 CUSTOM_MODEL=deepseek-v4-flash',
      );
    }
    const nombre = process.env.CUSTOM_NAME || 'Personalizado';
    const provider = createOpenAICompatible({
      name: nombre.toLowerCase().replace(/\s+/g, '-'),
      baseURL,
      // Ollama y otros locales no piden clave: se manda un valor cualquiera.
      apiKey: process.env.CUSTOM_API_KEY || 'no-key-needed',
    });
    return { id, label: nombre, model: provider(model) };
  }

  return { id: 'claude', label: brainLabel.claude, model: anthropic(process.env.CLAUDE_MODEL || 'claude-sonnet-5') };
}
