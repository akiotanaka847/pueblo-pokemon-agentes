# 🎮 Pueblo Pokémon — Centro de Operaciones de Agentes

Tu equipo de agentes de IA con temática Pokémon: les asignas tareas, el **Prof. Oak**
las analiza y **delega** en los trabajadores, ejecutan trabajo real con herramientas
y conectores, y **te piden permiso** antes de cualquier acción externa.
Todo corre **en tu máquina**, sin nube ni límites.

## ▶️ Arrancar (un solo comando)

```bash
npm run agents
```

Luego abre 👉 **http://localhost:4321**

Eso levanta el servidor del tablero **y** el orquestador de agentes en el mismo proceso.
Para pararlo: `Ctrl + C`.

> 💡 Haz **un clic** en la página la primera vez: los navegadores bloquean el audio
> hasta que el usuario interactúa (así suenan la fanfarria y los avisos).

## 🔑 Configuración (`agents/.env`)

Este archivo es **local y está fuera de git**. Contiene:

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Cerebro Claude (por defecto) |
| `OPENAI_API_KEY` | Cerebro OpenAI (alternativo) |
| `BRAIN` | Cerebro por defecto: `claude` u `openai` |
| `CLAUDE_MODEL` / `OPENAI_MODEL` | Modelos concretos |
| `COMPOSIO_API_KEY` + `COMPOSIO_TOOLKITS` | Conectores de 1000+ apps (opcional) |

### Cambiar de cerebro
- **Todos**: pon `BRAIN=openai` en `agents/.env` y reinicia.
- **Solo uno**: en `agents/roster.ts`, añade `brain: 'openai'` a ese personaje.

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

Los roles se editan en [`agents/roster.ts`](agents/roster.ts).

## 🖥️ El tablero

- **Nueva tarea** — escribe qué necesitas (o usa un atajo de ejemplo).
- **Pestañas** — 🗂️ Misiones · 🔁 Rutinas · 👥 Equipo (roles y estado en vivo).
- **El pueblo en vivo** — los personajes **van a la oficina** cuando trabajan y
  **al parque** cuando están libres. Con globos de texto de lo que hacen.
- **Cuadros de diálogo Pokémon** — los resultados aparecen escribiéndose letra a letra.
- **Sonidos** — fanfarria al completar una tarea, aviso cuando piden permiso (botón 🔊).

## ✋ Aprobaciones

Las acciones que **modifican o envían algo** (correo, publicar, borrar) se **pausan**
y aparecen en *"Necesitan tu permiso"* mostrando exactamente qué se va a hacer.
Tú decides: **Aprobar** o **Rechazar**. Las de solo lectura corren solas.

## 🔁 Rutinas

En la pestaña *Rutinas* creas tareas que se repiten (cada X minutos o cada día a una
hora). El programador las lanza solo y el equipo trabaja sin que estés presente.

## 🔌 Conectores

Dos caminos, y puedes usar ambos:

1. **Composio** (recomendado, 1000+ apps con un login) — crea cuenta en
   https://app.composio.dev, conecta tus apps, y rellena en `agents/.env`:
   ```bash
   COMPOSIO_API_KEY=tu_clave
   COMPOSIO_TOOLKITS=gmail,googlecalendar,slack
   ```
2. **Servidores MCP directos** — edita `agents/mcp.json` (plantilla con ejemplos en
   [`agents/mcp.example.json`](agents/mcp.example.json)). Los tokens se quedan en tu máquina.

## 📁 Dónde está cada cosa

```
agents/
  run.ts          arranque (carga .env, servidor + orquestador)
  orchestrator.ts el cerebro: delegación, herramientas, aprobaciones
  roster.ts       los 8 personajes, sus roles y prompts
  brains.ts       cerebros intercambiables (Claude / OpenAI / …)
  mcp.ts          cargador de conectores MCP
  composio.ts     conector Composio
  store.ts        datos locales (tareas, eventos, aprobaciones, rutinas)
  server.ts       API REST + SSE en tiempo real
  public/         el tablero
  data/           📥 deja aquí archivos para que los agentes los lean
  output/         📤 aquí guardan informes y mensajes
tools/            generadores pixel-art (sprites, mapa, oficina)
```

## Problemas comunes

- **No abre localhost:4321** → ¿está corriendo `npm run agents`?
- **No suena nada** → haz clic en la página una vez, y revisa el botón 🔊.
- **"0 tools Composio"** → normal si no configuraste `COMPOSIO_API_KEY`.
- **Cambié el tablero y no lo veo** → recarga forzada (`Cmd+Shift+R`).

---

## 🎨 Regenerar los gráficos

Todo el pixel-art se genera por código, sin dependencias externas:

```bash
npm run sprites   # personajes (walk-cycle 4 direcciones)
npm run map       # tileset del pueblo
npm run office    # tileset de la oficina
```

Edita las paletas y formas en `tools/` y vuelve a ejecutarlos.
