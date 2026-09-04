# 🎮 Pueblo Pokémon — Centro de Operaciones de Agentes

Un equipo de **agentes de IA con temática Pokémon** que trabajan de verdad: les asignas
tareas, el **Prof. Oak** las analiza y **delega** en los trabajadores, ejecutan trabajo
real con herramientas y conectores, y **te piden permiso** antes de cualquier acción
externa. Mientras tanto, los ves moverse: **a la oficina cuando trabajan**, **al parque
cuando están libres**.

Todo corre **en tu máquina**. Sin nube obligatoria, sin límites de plan.

---

## ✨ Qué hace

- 🧭 **Delegación jerárquica** — el líder descompone la tarea y reparte el trabajo.
- 🔧 **Herramientas reales** — web, archivos y datos que tú aportas.
- 🔌 **Conectores** — servidores MCP y/o [Composio](https://composio.dev) (1000+ apps).
- ✋ **Aprobación humana** — toda acción que envía o modifica algo **se pausa** y te
  pregunta, mostrando exactamente qué va a hacer.
- 🔁 **Rutinas** — tareas programadas (cada X minutos o a una hora fija).
- 👥 **Crea tus propios agentes** — nombre, especialidad, personalidad y aspecto; el líder
  empieza a delegarles al instante.
- 🌍 **Visita otras aldeas** — mira quién está en línea y entra a ver su equipo.
- 🧠 **Cerebros intercambiables** — usa el LLM que quieras (incluidos los baratos o
  gratis), global o distinto para cada personaje.
- 🏢 **Pueblo animado** — vista en vivo con sprites originales, globos de texto y
  cuadros de diálogo estilo RPG.
- 🔊 **Sonido** — fanfarrias chiptune originales al completar tareas o pedir permiso.

## 🚀 Arranque rápido

```bash
npm install
cp agents/.env.example agents/.env   # y rellena tu clave de Anthropic u OpenAI
npm run agents
```

Abre 👉 **http://localhost:4321**

Un solo comando levanta el tablero y el orquestador. Guía completa en [SETUP.md](SETUP.md).

## 🧠 Elige tu IA (y tu presupuesto)

No estás atado a un proveedor caro. Basta con poner `BRAIN` en `agents/.env`:

| `BRAIN` | Proveedor | Notas |
|---|---|---|
| `claude` | Anthropic | Máxima calidad |
| `openai` | OpenAI | Estándar |
| `custom` | **Cualquier API compatible con OpenAI** | 👇 la opción económica |

Con `custom` solo necesitas 3 datos y desbloqueas casi todo el mercado:

```bash
BRAIN=custom
CUSTOM_NAME=DeepSeek
CUSTOM_BASE_URL=https://api.deepseek.com/v1
CUSTOM_API_KEY=tu_clave
CUSTOM_MODEL=deepseek-chat
```

Preajustes listos en [`agents/.env.example`](agents/.env.example):
**DeepSeek**, **Qwen**, **Kimi**, **GLM**, **OpenRouter** (cientos de modelos con una
clave), **Groq** (rápido y con plan gratis) y **Ollama** (local, **gratis**, sin clave).

> 💡 Puedes mezclar: el líder con un modelo potente y los trabajadores con uno barato
> (`brain: 'custom'` en [`agents/roster.ts`](agents/roster.ts)).

## 🌍 Red de aldeas

Tu pueblo puede conectarse a un **hub** para que otras personas lo visiten (y tú a ellas):
ves quién está en línea y entras a mirar su equipo en directo.

```
   Tu aldea ──(cada 15s: "estoy aquí, este es mi equipo")──▶ ┌───────┐
                                                              │  HUB  │
   Aldea de un amigo ──────────────────────────────────────▶ │       │
                                                              └───┬───┘
   Tú ◀──── "¿quién está en línea?" / "enséñame la aldea X" ──────┘
```

Las aldeas **publican**, nunca reciben conexiones → funciona detrás de cualquier router,
sin abrir puertos.

**Privacidad**: solo se comparte el nombre de la aldea, tu apodo y el elenco (nombres,
roles y si están ocupados). **Nunca** tus tareas, resultados, datos ni claves.

```bash
npm run hub        # levanta el hub (puerto 4400) — despliégalo donde quieras
```
Y en `agents/.env`:
```bash
HUB_URL=http://localhost:4400   # o la URL de tu hub desplegado
VILLAGE_NAME=Pueblo Paleta
VILLAGE_OWNER=Akio
```

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────┐
│  VISTA    Tablero + pueblo animado (canvas, SSE)     │
└───────────────▲──────────────────────▲───────────────┘
                │ estado en vivo        │ tareas / aprobaciones
┌───────────────┴──────────────────────┴───────────────┐
│  ESTADO   store local (JSON) + API REST + SSE        │
└───────────────▲──────────────────────▲───────────────┘
                │                       │
┌───────────────┴──────────────────────┴───────────────┐
│  CEREBRO  Orquestador (Vercel AI SDK)                │
│           líder → delega → trabajadores → tools      │
│           conectores MCP · Composio · aprobaciones   │
└──────────────────────────────────────────────────────┘
```

Todo (servidor + orquestador) corre en **un solo proceso Node**.

## 🧑‍🤝‍🧑 El equipo

| Personaje | Rol |
|---|---|
| 🧭 Prof. Oak | **Líder**: analiza, delega y sintetiza |
| 🔎 Ash | Investigación web |
| 📊 Misty | Datos y análisis |
| ✍️ Brock | Redacción y correos |
| 💬 Pikachu | Comunicaciones |
| 🗓️ Meowth | Agenda y coordinación |
| 📣 Jessie | Difusión y contenido |
| 🗂️ James | Archivo y organización |

Roles y personalidades editables en [`agents/roster.ts`](agents/roster.ts).

## 📁 Estructura

```
agents/
  run.ts           arranque (servidor + orquestador)
  orchestrator.ts  delegación, herramientas y aprobaciones
  roster.ts        personajes, roles y prompts
  brains.ts        cerebros intercambiables (Claude / OpenAI / …)
  mcp.ts           cargador de conectores MCP
  composio.ts      conector Composio
  store.ts         datos locales (tareas, eventos, aprobaciones, rutinas)
  server.ts        API REST + SSE
  public/          el tablero
  data/            📥 archivos que leen los agentes
  output/          📤 informes y mensajes generados
tools/             generadores pixel-art (sprites, mapa, oficina)
```

## 🔐 Seguridad

- Las claves viven **solo** en `agents/.env` (ignorado por git). Usa
  [`agents/.env.example`](agents/.env.example) como plantilla.
- Las acciones sensibles (enviar, publicar, borrar) **siempre** requieren tu aprobación.
- Los datos de trabajo (`agents/db.json`, `agents/output/`) tampoco se suben.

## 🎨 Sobre los recursos gráficos y el sonido

Los **tilesets y los jingles son originales**, generados por código en
[`tools/`](tools/) (codificador PNG propio) y con la Web Audio API.

Los **sprites de los personajes** se generan con IA a partir de descripciones
propias, con `npm run sprites:ia` (ver [SETUP.md](SETUP.md)). No se usa ningún
recurso extraído de los juegos.

## 📜 Licencia

**MIT** — ver [LICENSE](LICENSE).

La fuente pixel de los cuadros de diálogo es *Upheaval*, de Brian Kent (aenigma),
de distribución libre.

> ⚠️ Proyecto personal, sin ánimo de lucro y sin afiliación con Nintendo, Creatures Inc.
> ni GAME FREAK. Pokémon y sus personajes son marcas de sus respectivos titulares; aquí
> se usan únicamente como temática de un proyecto de aficionado con arte original.
