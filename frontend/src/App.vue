<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import StatsBar   from './components/StatsBar.vue'
import FabForm    from './components/FabForm.vue'
import FabLog     from './components/FabLog.vue'
import Dashboard       from './components/Dashboard.vue'
import FabAutorizador  from './components/FabAutorizador.vue'
import FabMerma        from './components/FabMerma.vue'
import Login          from './components/Login.vue'
import UserConfig     from './components/UserConfig.vue'
import AdminUsuarios  from './components/AdminUsuarios.vue'
import { fabApi, type Stats, type AuthUser, type Colaborador, type Area } from './composables/useFabApi'

// ── auth ───────────────────────────────────────────
const AUTH_KEY  = 'fab_auth'
const COLAB_KEY = 'fab_colab'

const currentUser = ref<AuthUser | null>(
  JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
)

function onLogin(user: AuthUser) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  currentUser.value = user
  cargarColaboradores()
  cargarArea()
}

function logout() {
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(COLAB_KEY)
  localStorage.removeItem('fab_area')
  currentUser.value = null
  colaboradorActual.value = null
  colaboradores.value = []
  areaActual.value = null
}

// ── área del usuario ────────────────────────────────
const areaActual = ref<Area | null>(null)

async function cargarArea() {
  if (!currentUser.value) return
  try {
    const a = await fabApi.areaUsuario(currentUser.value.CODVENDEDOR)
    areaActual.value = a
    localStorage.setItem('fab_area', JSON.stringify(a))
  } catch { /* silencioso */ }
}

// ── colaboradores ───────────────────────────────────
const colaboradores    = ref<Colaborador[]>([])
const colaboradorActual = ref<Colaborador | null>(
  JSON.parse(localStorage.getItem(COLAB_KEY) || 'null')
)
const showColabPicker  = ref(false)

async function cargarColaboradores() {
  if (!currentUser.value) return
  try { colaboradores.value = await fabApi.colaboradores(currentUser.value.CODVENDEDOR) }
  catch { /* silencioso */ }
}

function elegirColaborador(c: Colaborador | null) {
  colaboradorActual.value = c
  localStorage.setItem(COLAB_KEY, JSON.stringify(c))
  showColabPicker.value = false
}

onMounted(() => {
  if (currentUser.value) { cargarColaboradores(); cargarArea() }
})

// ── navigation ──────────────────────────────────────
const activeTab      = ref<'fab' | 'dashboard' | 'autorizador' | 'merma' | 'usuarios'>('fab')
const showFabModal   = ref(false)
const showConfigModal = ref(false)

// ── tablet detection ────────────────────────────────
const isTablet = ref(window.innerWidth <= 768)
function onResize() { isTablet.value = window.innerWidth <= 768 }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// ── fab data ────────────────────────────────────────
const today      = new Date().toISOString().split('T')[0]
const fecha      = ref(today)
const stats      = ref<Stats | null>(null)
const refreshKey = ref(0)

onMounted(() => { if (currentUser.value) cargarStats() })
watch(fecha, () => cargarStats())

async function cargarStats() {
  try { stats.value = await fabApi.stats(fecha.value) }
  catch { /* silencioso */ }
}

function onRegistered() {
  showFabModal.value = false
  refreshKey.value++
  cargarStats()
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
</script>

<template>
  <Login v-if="!currentUser" @login="onLogin"/>

  <div v-else class="app-shell">

    <!-- ══ HEADER ══ -->
    <header class="site-header">
      <div class="logo-row">
        <div class="logo-badge">F</div>
        <div>
          <div class="logo-title">Fabricación</div>
          <div class="logo-sub">Árbol Áureo</div>
        </div>
      </div>

      <nav class="tabs">
        <button :class="['tab', { active: activeTab === 'fab' }]" @click="activeTab = 'fab'">
          Fabricaciones
        </button>
        <button :class="['tab', { active: activeTab === 'merma' }]" @click="activeTab = 'merma'">
          Merma
        </button>
        <template v-if="currentUser?.rol === 'admin'">
          <button :class="['tab', { active: activeTab === 'dashboard' }]" @click="activeTab = 'dashboard'">
            Dashboard
          </button>
          <button :class="['tab', { active: activeTab === 'autorizador' }]" @click="activeTab = 'autorizador'">
            Autorizador
          </button>
          <button :class="['tab', { active: activeTab === 'usuarios' }]" @click="activeTab = 'usuarios'">
            Usuarios
          </button>
        </template>
      </nav>

      <input v-if="activeTab === 'fab'" type="date" v-model="fecha" class="date-input"/>

      <div class="header-right">
        <span class="user-chip">{{ currentUser?.USUARIO }}</span>

        <!-- Selector de colaborador -->
        <div class="colab-wrap">
          <button class="colab-btn" :class="{ 'colab-btn--none': !colaboradorActual }" @click="showColabPicker = !showColabPicker">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span>{{ colaboradorActual?.nombre ?? 'Colaborador' }}</span>
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-if="showColabPicker" class="colab-picker" @click.stop>
            <div class="colab-picker-title">Seleccionar colaborador</div>
            <button class="colab-item" :class="{ active: !colaboradorActual }" @click="elegirColaborador(null)">
              — Ninguno
            </button>
            <button
              v-for="c in colaboradores" :key="c.id"
              class="colab-item" :class="{ active: colaboradorActual?.id === c.id }"
              @click="elegirColaborador(c)"
            >{{ c.nombre }}</button>
            <div v-if="!colaboradores.length" class="colab-empty">Sin colaboradores. Agrégalos en Configuración.</div>
          </div>
        </div>

        <button v-if="currentUser?.rol === 'admin'" @click="showConfigModal = true" class="logout-btn" aria-label="Configuración">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button @click="logout" class="logout-btn" aria-label="Cerrar sesión">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- ══ MAIN ══ -->
    <main class="main-area" @click="showColabPicker = false">

      <!-- Fabricaciones -->
      <template v-if="activeTab === 'fab'">

        <!-- Tablet: formulario como pantalla principal -->
        <FabForm
          v-if="isTablet && showFabModal"
          :user="currentUser!"
          :colaborador="colaboradorActual"
          :familia_desc="areaActual?.familia_desc ?? null"
          :inline="true"
          @registered="onRegistered"
          @close="showFabModal = false"
        />

        <!-- Vista normal (o desktop siempre) -->
        <template v-else>
          <StatsBar :stats="stats"/>
          <div class="fab-toolbar">
            <h2 class="fab-title">
              <span class="section-dot"></span>
              Fabricaciones — {{ formatFecha(fecha) }}
            </h2>
            <button class="btn-nueva" @click="showFabModal = true">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Nueva Fabricación
            </button>
          </div>
          <FabLog :fecha="fecha" :refresh-key="refreshKey" style="flex:1"/>
        </template>

      </template>

      <!-- Dashboard -->
      <Dashboard v-else-if="activeTab === 'dashboard'"/>

      <!-- Autorizador -->
      <FabAutorizador v-else-if="activeTab === 'autorizador'"/>

      <!-- Merma -->
      <FabMerma v-else-if="activeTab === 'merma'" :user="currentUser!" :colaborador="colaboradorActual" :familia_desc="areaActual?.familia_desc ?? null"/>

      <!-- Usuarios (solo admin) -->
      <AdminUsuarios v-else-if="activeTab === 'usuarios'"/>

    </main>

    <!-- ══ MODAL: Nueva Fabricación (solo desktop) ══ -->
    <Teleport to="body">
      <div v-if="!isTablet && showFabModal" class="modal-backdrop" @click.self="showFabModal = false">
        <FabForm
          :user="currentUser!"
          :colaborador="colaboradorActual"
          :familia_desc="areaActual?.familia_desc ?? null"
          @registered="onRegistered"
          @close="showFabModal = false"
        />
      </div>
    </Teleport>

    <!-- ══ MODAL: Configuración usuario ══ -->
    <Teleport to="body">
      <UserConfig v-if="showConfigModal" :user="currentUser!" @close="showConfigModal = false; cargarArea()"/>
    </Teleport>

  </div>
</template>

<style scoped>
.app-shell { min-height: 100vh; display: flex; flex-direction: column; }

/* ── Header ─────────────────────────────────────── */
.site-header {
  position: sticky; top: 0; z-index: 30;
  background: #ffffff;
  border-bottom: 2px solid #16a34a;
  padding: 10px 20px;
  display: flex; align-items: center; gap: 16px;
  box-shadow: 0 2px 8px rgba(22,163,74,.08);
}
.logo-row   { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.logo-badge {
  width: 34px; height: 34px;
  background: linear-gradient(135deg, #15803d, #16a34a);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Fira Code', monospace;
  font-weight: 700; font-size: .9rem; color: #fff;
  box-shadow: 0 2px 10px rgba(22,163,74,.3);
  flex-shrink: 0;
}
.logo-title { font-weight: 700; font-size: .8rem; color: var(--text); line-height: 1.2; }
.logo-sub   { font-size: .65rem; color: var(--text-muted); }

/* ── Tabs ───────────────────────────────────────── */
.tabs { display: flex; align-items: center; gap: 4px; flex: 1; justify-content: center; }
.tab {
  padding: 6px 18px;
  border-radius: 8px;
  border: 1.5px solid transparent;
  background: none;
  font-size: .8rem;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  font-family: 'Fira Sans', system-ui, sans-serif;
  transition: all .15s;
}
.tab:hover { background: #f0fdf4; color: var(--text); }
.tab.active {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
  font-weight: 600;
}

/* ── Header right ───────────────────────────────── */
.header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.user-chip {
  font-size: .72rem; font-weight: 600; color: #166534;
  background: #dcfce7; border: 1px solid #86efac;
  border-radius: 20px; padding: 4px 10px;
}
.date-input { width: 132px; padding: 5px 8px; font-size: .8rem; }
/* ── Colaborador picker ─────────────────────────── */
.colab-wrap { position: relative; }
.colab-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 20px; cursor: pointer;
  background: #dcfce7; border: 1.5px solid #86efac;
  color: #15803d; font-size: .73rem; font-weight: 600;
  font-family: inherit; transition: all .15s; white-space: nowrap;
}
.colab-btn--none {
  background: var(--panel2); border-color: var(--border);
  color: var(--text-muted);
}
.colab-btn:hover { opacity: .85; }
.colab-picker {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 200;
  background: var(--panel); border: 1.5px solid var(--border);
  border-radius: 12px; min-width: 200px;
  box-shadow: 0 8px 24px rgba(0,0,0,.13);
  display: flex; flex-direction: column; overflow: hidden;
}
.colab-picker-title {
  padding: 8px 12px; font-size: .68rem; font-weight: 700;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 1px solid var(--border);
}
.colab-item {
  padding: 9px 14px; font-size: .8rem; color: var(--text-soft);
  background: none; border: none; cursor: pointer; text-align: left;
  font-family: inherit; transition: background .1s;
}
.colab-item:hover  { background: var(--panel2); }
.colab-item.active { color: #15803d; font-weight: 700; background: #f0fdf4; }
.colab-empty { padding: 10px 14px; font-size: .73rem; color: var(--text-muted); }

.logout-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  background: var(--panel2); border: 1.5px solid var(--border);
  border-radius: 8px; color: var(--text-muted); cursor: pointer;
  transition: all .15s;
}
.logout-btn:hover { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }

/* ── Main ───────────────────────────────────────── */
.main-area {
  flex: 1; padding: 20px 24px;
  max-width: 1600px; margin: 0 auto; width: 100%;
  display: flex; flex-direction: column; gap: 16px;
}

/* ── Toolbar ────────────────────────────────────── */
.fab-toolbar {
  display: flex; align-items: center; justify-content: space-between;
}
.fab-title {
  display: flex; align-items: center; gap: 8px;
  font-size: .8rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .07em; margin: 0;
}
.btn-nueva {
  display: flex; align-items: center; gap: 7px;
  background: linear-gradient(135deg, #15803d, #16a34a);
  color: #fff; border: none; border-radius: 10px;
  padding: 8px 16px; font-size: .8rem; font-weight: 600;
  cursor: pointer; font-family: 'Fira Sans', system-ui, sans-serif;
  box-shadow: 0 2px 8px rgba(22,163,74,.25);
  transition: opacity .15s, box-shadow .15s;
  white-space: nowrap;
}
.btn-nueva:hover { opacity: .9; box-shadow: 0 4px 14px rgba(22,163,74,.35); }

/* ── Responsive ─────────────────────────────────── */
@media (max-width: 768px) {
  /* Fila 1: logo (izq) + botones (der) */
  .site-header  { flex-wrap: wrap; padding: 8px 14px; gap: 6px 0; }
  .logo-row     { order: 1; flex: 0 0 auto; }
  .header-right { order: 1; flex: 0 0 auto; margin-left: auto; gap: 8px; }
  /* Fila 2: tabs + fecha — min-width fuerza el salto de línea */
  .tabs         { order: 2; flex: 1 0 auto; min-width: calc(100% - 132px); justify-content: flex-start; gap: 5px; margin-top: 6px; }
  .date-input   { order: 2; flex: 0 0 120px; font-size: .75rem; padding: 5px 6px; align-self: center; margin-top: 6px; }
  .logo-sub     { display: none; }
  .user-chip    { display: none; }
  .logout-btn   { width: 34px; height: 34px; }
  .tab          { flex: 1; padding: 11px 6px; font-size: .9rem; font-weight: 600; text-align: center; border-radius: 10px; }
  .main-area    { padding: 12px 14px; gap: 12px; }
}

@media (max-width: 560px) {
  .site-header  { flex-wrap: wrap; padding: 8px 12px; gap: 8px; }
  .logo-row     { order: 1; flex: 1; }
  .header-right { order: 2; gap: 6px; margin-left: auto; }
  .tabs         { order: 3; flex: unset; width: 100%; justify-content: flex-start; gap: 2px; }
  .date-input   { order: 4; width: 100%; box-sizing: border-box; font-size: .78rem; }
  .logo-sub     { display: none; }
  .user-chip    { display: none; }
}
</style>
