# Fabricación (fab_standalone) — guía para agentes

App web para registrar producción a partir de las recetas (kits) del ERP ICG: órdenes de fabricación con cálculo de ingredientes y merma, autorizador para admins, registro de mermas. Express + Vue, SQL Server. Es la versión independiente del módulo `/fab` de `../PRY_fact`.

Documentación completa: @docs/DOCUMENTACION.md

## Comandos

```bash
npm run dev                       # API en :3000 (ts-node-dev)
npm run dev --prefix frontend     # Vite :5173, proxy /fab → :3000
npx tsc --noEmit                  # chequeo de tipos backend (no hay tests)
npx tsc && npm run build --prefix frontend && npm start   # build y arranque como en producción
```

El servidor exige `FAB_HOST`, `FAB_USER`, `FAB_PASS`, `FAB_LOCO_DB` en `.env` (ver `.env.example`) y al arrancar crea la base, aplica migraciones y verifica las tablas ICG.

## Mapa de arquitectura

- `src/index.ts` — valida `.env`, `migrateFab()`, `verificarErp()`, sirve `/fab` y `frontend/dist` con fallback SPA.
- `src/routes/fabricacion.ts` — TODO el backend: `MIGRACIONES`, token HMAC (`crearToken`/`leerToken`), middleware de sesión, `soloAdmin`, rutas.
- `src/config/db.ts` — `getPool(db)` cachea un pool por base; `asegurarBaseFab()` crea `FAB_DB`.
- `src/utils/encriptacion.ts` — cifrado de claves igual al de ICG (login contra `USUARIOS`).
- `frontend/src/App.vue` — login + pestañas (Fabricación, Merma, Dashboard, Autorizador, Usuarios).
- `frontend/src/composables/useFabApi.ts` — todas las llamadas HTTP y tipos; maneja el token en `localStorage` (`fab_auth`).
- `instalar.ps1` — instalación en cliente (crea `.env`, compila, primer arranque, servicio NSSM `Fabricacion`).
- `update.ps1` — actualización desde ZIP de GitHub + recompilación (lo llama `POST /fab/update`).

## Convenciones

- TypeScript strict, Express 5, Vue 3 `<script setup>`. Todo en español.
- Rutas nuevas: `fabRouter.<verbo>(ruta, [soloAdmin,] wrap(async (req, res) => …))`; el usuario sale de `sesion(req).cv`, nunca del body.
- SQL siempre parametrizado (`.input(...)`); upserts con `MERGE`; bajas lógicas con `activo = 0`.
- Lecturas de ICG → `getPool(LOCO)` / `getPool(USUARIOS_DB)`. Escrituras solo en `getPool(FAB)`.
- Esquema: **agregar** un paso al final de `MIGRACIONES`, idempotente (`IF OBJECT_ID… IS NULL`, `IF COL_LENGTH… IS NULL`). Nunca editar ni reordenar pasos publicados.
- Nuevas llamadas del frontend van en `useFabApi.ts`, no `fetch` sueltos en componentes.
- Este código es idéntico a `../PRY_fact/src/routes/fabricacion.ts` y `../PRY_fact/frontend/src/`: avisa al usuario si cambias algo para que lo replique.

## Trampas

- El estado `ICG` lo pone un proceso externo (usa `HASHID`); la API no deja moverlo salvo a `cancelado`.
- Borrar `.fab_secret` (o cambiar `FAB_SECRET`) invalida todas las sesiones.
- `personal` ve recetas solo de la familia de su área; si un usuario "no ve recetas", revisar `areas`.
- `update.ps1` no actualiza `frontend/package.json` ni `vite.config.ts`.
- `POST /fab/update` termina el proceso (`process.exit(0)`): sin NSSM/nodemon, la app queda caída.
- Fechas: se usa `hoy()` / `fechaLocal()` con corrección de zona horaria; no usar `toISOString()` directo.

## Qué NO hacer

- No leer ni copiar valores de `.env` ni `.fab_secret` (están en `.gitignore`).
- No escribir en las bases ICG.
- No hacer `git push` ni crear ramas sin que lo pida el usuario.
- No disparar `/fab/update` ni `instalar.ps1` contra un cliente real para probar.
- No agregar router/store/librerías de UI al frontend: es deliberadamente simple.
