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

Los escenarios se generan por código, sin dependencias externas:

```bash
npm run map       # tileset del pueblo
npm run office    # tileset de la oficina
npm run sprites   # personajes dibujados por código (versión sencilla)
```

Los **personajes** se generan con IA, que da mucha mejor calidad. Necesita
`OPENAI_API_KEY` en `agents/.env`:

```bash
npm run sprites:ia -- ash        # un personaje (prueba)
npm run sprites:ia -- --todos    # los nueve
```

Hay **dos motores de imagen**. Por defecto usa OpenAI; con `--motor=google` usa
Gemini (`GOOGLE_API_KEY` en `agents/.env`), que da mejor calidad en criaturas:

```bash
npm run sprites:ia -- pikachu --motor=google
```

Gemini no sabe devolver fondo transparente, así que se le pide **magenta puro** y
se recorta por color. `limpiarFondo()` detecta sola con qué caso trata: si llega
transparencia real umbraliza el alfa, y si llega opaca aplica el croma.

Cómo funciona: pide **una sola imagen** con las tres vistas (frente, perfil y
espalda) — dentro de una misma generación el modelo mantiene el mismo personaje,
cosa que no ocurre si pides cada vista por separado. Después limpia el fondo,
localiza cada vista leyendo el canal alfa, espeja el perfil para obtener el
derecho y monta la rejilla de 48x48.

- Las descripciones están en `PERSONAJES`, dentro de `tools/generate-sprites-ai.mjs`.
- `-- --rehacer` reprocesa las imágenes ya descargadas **sin volver a pagar** la
  generación: útil para afinar el recorte.
- Si el filtro de contenido de OpenAI rechaza una descripción, ese personaje se
  anota y el resto continúa. Suele pasar cuando la descripción se acerca
  demasiado a un personaje con copyright: reescríbela como personaje propio.
- Las imágenes originales quedan en `.preview/ia-crudo/` (no se publican).
- `ALTURA` fija la altura relativa de cada personaje. Las criaturas van al 62-68%
  para que no midan lo mismo que un adulto. Los sprites se anclan por los **pies**,
  así los bajitos se apoyan en el suelo en vez de quedar flotando.

## 👥 Crear tus propios agentes

Pestaña **👥 Equipo → "➕ Crear un agente nuevo"**: nombre, especialidad, personalidad
y aspecto (eliges entre los sprites disponibles). Se suma al equipo y el líder empieza
a delegarle tareas de inmediato. Puedes borrarlos con la papelera.

## 🌍 Visitar otras aldeas

1. Levanta un hub (o usa el de un amigo): `npm run hub`
2. En `agents/.env` pon `HUB_URL`, `VILLAGE_NAME` y `VILLAGE_OWNER`.
3. Reinicia con `npm run agents`. En la pestaña **🌍 Aldeas** verás quién está en línea;
   pulsa una para visitarla y "Volver a mi pueblo" para salir.

Para que te visiten desde fuera de tu red, despliega `hub/server.ts` en un servicio con
plan gratuito (Fly.io, Render, Railway) y usa esa URL como `HUB_URL`.
