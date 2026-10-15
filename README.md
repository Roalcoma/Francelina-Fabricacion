# Fabricación

Aplicación web para registrar la producción de cocina/planta a partir de las **recetas del ERP ICG**. El personal registra lo fabricado, la app calcula los ingredientes consumidos con su merma y verifica stock; los administradores autorizan las órdenes para que se reflejen en ICG.

## Funcionalidades

- Login con los usuarios y claves de ICG; roles `admin` y `personal`.
- Recetas (kits de ICG) filtradas por el área de cada usuario.
- Órdenes de fabricación con cálculo de ingredientes, % de merma recordado por receta y alerta de stock insuficiente.
- Registro de mermas con sus ingredientes.
- Autorizador: aprobar/cancelar órdenes por rango de fechas; estados `pendiente`, `aprobado`, `ICG`, `cancelado`.
- Dashboard de producción y resumen de stock por almacén.
- Administración de usuarios: área, familia, rol, almacenes por defecto y colaboradores.
- Base de datos propia creada automáticamente con migraciones versionadas.
- Instalador para Windows y actualización desde GitHub con un clic.

## Stack

Node.js · TypeScript · Express 5 · mssql · Vue 3 · Vite · SQL Server · PowerShell / NSSM

## Requisitos

- Node.js 20 LTS o superior
- SQL Server con la base del ERP ICG y la base `GENERAL` (usuarios)
- Usuario SQL con permiso para crear bases (solo en la primera instalación)
- Windows + [NSSM](https://nssm.cc) (opcional, para dejarla como servicio)

## Instalación

### Rápida (cliente Windows)

```powershell
powershell -ExecutionPolicy Bypass -File instalar.ps1
```

Pide los datos de conexión, crea `.env`, compila, hace un arranque de prueba y (si hay NSSM) instala el servicio `Fabricacion`.

### Manual

```bash
git clone https://github.com/Roalcoma/Francelina-Fabricacion.git
cd Francelina-Fabricacion
npm install
npm install --prefix frontend
cp .env.example .env    # completar los valores
```

## Variables de entorno

```env
FAB_HOST=192.168.0.10
FAB_PORT=1433
FAB_USER=usuario_sql
FAB_PASS=cambiar_esto
FAB_DB=FABRICACION
FAB_LOCO_DB=NOMBRE_BASE_ICG
FAB_USUARIOS_DB=GENERAL
FAB_ADMINS=1,5
PORT=3000
FAB_SECRET=
```

## Ejecución

```bash
# desarrollo
npm run dev                       # API en http://localhost:3000
npm run dev --prefix frontend     # UI en http://localhost:5173

# producción
npx tsc
npm run build --prefix frontend
npm start                         # API + UI en http://localhost:3000
```

## Despliegue y actualización

- Primera vez: `instalar.ps1`.
- Actualizar: desde la UI (admin) o

```powershell
powershell -ExecutionPolicy Bypass -File update.ps1 -Url https://github.com/Roalcoma/Francelina-Fabricacion/archive/refs/heads/main.zip
```

  Descarga el código, reinstala dependencias y recompila; el servicio se reinicia solo.

## Estructura

```
src/
  index.ts                 servidor Express
  config/db.ts             conexiones SQL Server
  routes/fabricacion.ts    API /fab, migraciones y sesiones
  utils/encriptacion.ts    cifrado de claves compatible con ICG
frontend/                  SPA Vue 3 (Vite)
docs/DOCUMENTACION.md      documentación técnica
instalar.ps1               instalador
update.ps1                 actualizador
```

Más detalle en [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md).
