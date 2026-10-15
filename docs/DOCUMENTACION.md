# Fabricación (fab_standalone) — Documentación técnica

Repositorio: `Roalcoma/Francelina-Fabricacion` (GitHub).

## 1. Propósito y contexto de negocio

Aplicación web para registrar la **producción en cocina / planta** a partir de las **recetas (kits) del ERP ICG**. El personal elige una receta de su área, indica cuántas unidades fabricó y la app calcula los ingredientes consumidos (con % de merma), verifica stock y guarda la orden. Un administrador revisa y **autoriza** las órdenes; un proceso del lado de ICG las toma (usando `HASHID`) y las marca con estado `ICG` cuando ya se reflejaron en el ERP. También permite registrar **mermas** (pérdidas) de productos con sus ingredientes.

Es la versión independiente del módulo que vive dentro de `../PRY_fact` (`src/routes/fabricacion.ts` y `frontend/src/` son idénticos). Esta versión agrega: servidor que sirve el frontend compilado, validación de variables y de tablas ICG al arrancar, instalador `instalar.ps1` y un `update.ps1` que recompila.

## 2. Arquitectura y flujo de datos

```
Navegador (Vue SPA, frontend/dist)
   │  Authorization: Bearer <token HMAC>
   ▼
src/index.ts (Express)
   ├─ /fab/*  → src/routes/fabricacion.ts
   ├─ estáticos frontend/dist + fallback SPA (/{*path} → index.html)
   └─ arranque: valida .env → migrateFab() (crea base + migraciones) → verificarErp() → listen

fabricacion.ts
   ├─ login: clave → encriptacion.encriptar() → USUARIOS de ICG (FAB_USUARIOS_DB)
   ├─ lecturas de catálogo / recetas / stock → FAB_LOCO_DB (ICG)
   └─ escrituras (fabricaciones, mermas, áreas, config) → FAB_DB (base propia)
```

### 2.1 Sesión y roles

- Token propio: `base64url(JSON{cv, rol, exp}) + "." + HMAC-SHA256`, válido 7 días, comparado con `timingSafeEqual`.
- Clave de firma: `FAB_SECRET` o, si falta, archivo `.fab_secret` (se genera solo la primera vez). Si se borra `.fab_secret`, todas las sesiones se invalidan.
- Rol `admin`: `CODUSUARIO` listado en `FAB_ADMINS` o `areas.rol = 'admin'`. El resto es `personal`.
- `personal` ve solo las recetas de la familia de su área.

### 2.2 Estados de una fabricación

`pendiente` → `aprobado` (admin) → `ICG` (lo pone el proceso externo de ICG). `cancelado` desde cualquier estado. Una orden en `ICG` solo puede pasar a `cancelado`.

### 2.3 Cálculo de ingredientes

`unidades_total = UDS_KIT × unidades × (1 + merma_pct/100)`. Si se eligió almacén y algún ingrediente tiene `stock_inicial` menor, la orden se guarda con `sin_stock = 1`. El % de merma usado se guarda por receta+ingrediente en `merma_recetas` y se propone la próxima vez.

## 3. Stack

- Backend: Node.js, TypeScript (commonjs, strict), Express 5, `mssql` 12, `dotenv`, `crypto` nativo.
- Frontend: Vue 3 + Vite 6 (sin router ni store; pestañas en `App.vue`, llamadas en `composables/useFabApi.ts`).
- SQL Server (ICG + base `FABRICACION`).
- Despliegue Windows: PowerShell + NSSM (opcional).

## 4. Estructura de carpetas

```
fab_standalone/
├── src/
│   ├── index.ts               # Express, validación de .env, sirve frontend/dist
│   ├── config/db.ts           # pools por base; asegurarBaseFab() crea FAB_DB
│   ├── routes/fabricacion.ts  # migraciones, login, todas las rutas /fab
│   └── utils/encriptacion.ts  # cifrado de claves compatible con ICG
├── frontend/
│   ├── src/App.vue            # layout, login, pestañas
│   ├── src/components/        # FabForm, FabLog, FabMerma, FabAutorizador, Dashboard,
│   │                          # AdminUsuarios, UserConfig, StatsBar, Login
│   ├── src/composables/useFabApi.ts
│   └── vite.config.ts         # proxy /fab y /api → :3000
├── instalar.ps1               # instalación desde cero en un cliente
├── update.ps1                 # actualización desde ZIP de GitHub + recompilación
├── .env.example
└── tsconfig.json
```

### Pestañas del frontend

| Pestaña | Componente | Rol |
|---|---|---|
| Fabricación | `FabForm.vue` + `FabLog.vue` | todos |
| Merma | `FabMerma.vue` | todos |
| Dashboard | `Dashboard.vue` | admin |
| Autorizador | `FabAutorizador.vue` | admin |
| Usuarios | `AdminUsuarios.vue` | admin |
| Configuración de usuario | `UserConfig.vue` | todos |

## 5. Endpoints (`/fab`)

Todos requieren `Authorization: Bearer <token>` salvo `/fab/login`. Errores: `{ error }` con 400/401/403/500.

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| POST | `/fab/login` | — | `{clave}` → usuario ICG, rol y token. |
| GET | `/fab/recetas?familia=` | todos | Artículos con kit; personal filtrado por su área. |
| GET | `/fab/receta/:id` | todos | Componentes del kit. |
| GET | `/fab/operarios` | todos | Vendedores ICG. |
| GET | `/fab/stock` | todos | Stock por artículo y almacén. |
| GET | `/fab/almacenes` | todos | Almacenes ICG. |
| GET | `/fab/stats?fecha=` | todos | KPIs del día. |
| GET | `/fab/fabricaciones?desde&hasta&codvendedor` | todos | Órdenes en el rango. |
| PATCH | `/fab/fabricaciones/:id/estado` | admin | Cambia el estado. |
| GET | `/fab/fabricacion/:id/componentes` | todos | Ingredientes de la orden. |
| GET | `/fab/dashboard?desde&hasta` | admin | Resumen de producción. |
| GET | `/fab/stock-resumen` | admin | Pivot de stock por almacén. |
| GET | `/fab/merma/:codarticulo` | todos | Merma guardada por ingrediente. |
| GET / POST | `/fab/config` | todos / admin | Almacenes origen/destino por usuario. |
| GET | `/fab/stock-recetas` | admin | Stock de ingredientes de recetas. |
| POST | `/fab/fabricaciones` | todos | Crea orden + componentes en transacción. |
| GET | `/fab/secciones`, `/fab/familias` | todos | Catálogos ICG. |
| GET | `/fab/areas`, `/fab/areas/usuario` | todos | Áreas / área del usuario. |
| POST, DELETE | `/fab/areas`, `/fab/areas/:id` | admin | Alta/edición (MERGE) y baja lógica. |
| GET, POST, DELETE | `/fab/colaboradores[/:id]` | todos / admin | Colaboradores. |
| GET | `/fab/mermas`, `/fab/mermas/:id/componentes` | todos | Mermas registradas. |
| POST | `/fab/mermas` | todos | Registra merma + ingredientes. |
| GET | `/fab/admin/usuarios` | admin | Usuarios ICG con área, rol y almacenes. |
| PUT | `/fab/admin/usuarios/:codvendedor` | admin | Actualiza área, rol y almacenes. |
| POST | `/fab/update` | admin | `{url}` de ZIP de rama GitHub (validado por regex) → `update.ps1` → `process.exit(0)`. |

## 6. Base de datos

### 6.1 Base propia `FAB_DB` (default `FABRICACION`)

Se crea sola si no existe (requiere permiso `CREATE DATABASE`). Las tablas se crean con **migraciones versionadas** (`MIGRACIONES` en `fabricacion.ts`, registro en `_migraciones`, cada paso en transacción):

| # | Cambio |
|---|---|
| 1 | `fabricaciones` |
| 2 | `fabricaciones_componentes` |
| 3 | columnas `stock_inicial`, `merma_pct`, `sin_stock`, `estado`, `codalmacen_destino`, `HASHID` |
| 4 | `merma_recetas` (PK codarticulo+codartkit) |
| 5 | `configuracion_usuarios` (almacenes por usuario) |
| 6 | `areas` (nombre, numseccion, codvendedor, familia_desc, rol, activo) |
| 7 | índice único: un área activa por usuario |
| 8 | `colaboradores` |
| 9 | `mermas` |
| 10 | almacenes en `mermas` + `mermas_componentes` |

Regla: **solo se agregan pasos al final**; nunca se editan ni reordenan los publicados. Los pasos son idempotentes.

### 6.2 Bases ICG (solo lectura)

- `FAB_LOCO_DB`: `ARTICULOS`, `ARTICULOSLIN`, `KITS`, `FAMILIAS`, `STOCKS`, `ALMACEN`, `VENDEDORES`, `SECCIONES` (verificadas al arrancar por `verificarErp()`).
- `FAB_USUARIOS_DB`: `USUARIOS` (login con `NEWPASS`/`PASS` cifrados, excluye bloqueados y descatalogados).

No hay scripts `.sql` sueltos: todo el esquema está en el código.

## 7. Integraciones externas

- **ICG** (SQL Server) para catálogo, stock y usuarios. El cifrado de `utils/encriptacion.ts` replica el de ICG.
- **Proceso de ICG** (fuera de este repo) que importa las órdenes aprobadas y las pasa a estado `ICG`.
- **GitHub**: descarga del ZIP para `update.ps1`.

## 8. Variables de configuración (`.env`, ver `.env.example`)

| Variable | Uso |
|---|---|
| `FAB_HOST`, `FAB_PORT`, `FAB_USER`, `FAB_PASS` | Servidor SQL (obligatorias salvo puerto). |
| `FAB_DB` | Base propia (default `FABRICACION`). |
| `FAB_LOCO_DB` | Base ICG con artículos/recetas/stock (obligatoria). |
| `FAB_USUARIOS_DB` | Base con `USUARIOS` (normalmente `GENERAL`). |
| `FAB_ADMINS` | `CODUSUARIO` administradores, separados por coma. |
| `PORT` | Puerto web (default 3000). |
| `FAB_SECRET` | Clave de firma de sesiones (opcional, si no `.fab_secret`). |
| `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_PORT`, `LOCO_*` | Fallbacks heredados de `config/db.ts` de PRY_fact; no hacen falta aquí. |

## 9. Instalación, ejecución, compilación y despliegue

### Desarrollo

```bash
npm install && npm install --prefix frontend
npm run dev                       # ts-node-dev src/index.ts (API en :3000)
npm run dev --prefix frontend     # Vite :5173 con proxy a :3000
```

### Compilación

```bash
npx tsc                           # backend → dist/
npm run build --prefix frontend   # frontend → frontend/dist/
npm start                         # node dist/index.js (sirve API + frontend)
```

### Instalación en un cliente (`instalar.ps1`)

`powershell -ExecutionPolicy Bypass -File instalar.ps1` (como administrador):
1. Pide los datos y crea `.env` (si ya existe lo conserva).
2. Si el paquete no viene precompilado: `npm install`, `tsc`, build del frontend.
3. Primer arranque de prueba (crea base y tablas, valida ICG); logs en `logs/primer-inicio*.log`.
4. Si hay **NSSM** en el PATH, instala el servicio de Windows `Fabricacion` con arranque automático y logs en `logs/`.

### Actualización (`update.ps1`)

`update.ps1 -Url https://github.com/<usuario>/<repo>/archive/refs/heads/<rama>.zip` (o desde la UI, `POST /fab/update`): descarga el ZIP, copia `src/`, `frontend/src/`, `frontend/index.html`, `package.json` y el propio `update.ps1`, y luego `npm install` + `tsc` + build del frontend. Al terminar el proceso Node sale con código 0; el servicio NSSM (o nodemon) lo reinicia.

## 10. Problemas conocidos y deuda técnica

- `update.ps1` no copia `frontend/package.json` ni `vite.config.ts`: si cambian dependencias del frontend no se actualizan.
- `update.ps1` sin `try/catch` por paso: si `tsc` falla el servidor reinicia igual con el `dist/` viejo.
- `POST /fab/update` ejecuta PowerShell con `-ExecutionPolicy Bypass` (restringido a admin y a URLs de GitHub, pero cualquier repo de GitHub vale).
- `GET /fab/fabricaciones` no restringe por rol: un usuario `personal` puede pedir órdenes de otros con `codvendedor`.
- `config/db.ts` arrastra lógica de PRY_fact (`LOCO_*`, `DB_*`) que aquí no aplica.
- `.env` generado por `instalar.ps1` guarda la contraseña SQL en texto plano.
- Código duplicado con `../PRY_fact`: los cambios deben replicarse a mano.
- Sin tests.
