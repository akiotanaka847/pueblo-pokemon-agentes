// Prueba rápida de un cerebro: tsx agents/braincheck.ts [claude|openai]
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { generateText } from 'ai';
import { getModel } from './brains';

const brain = (process.argv[2] as any) || 'openai';
const m = getModel(brain);
console.log(`Probando cerebro: ${m.label}…`);
const res = await generateText({ model: m.model, prompt: 'Responde en una sola frase corta: ¿qué modelo de IA eres?' });
console.log(`✔ ${m.label} responde:`, res.text);
