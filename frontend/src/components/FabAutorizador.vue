<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fabApi, type Fabricacion } from '../composables/useFabApi'

const fecha      = ref(new Date().toISOString().split('T')[0])
const filas      = ref<Fabricacion[]>([])
const cargando   = ref(false)
const filtroEstado = ref<'todos' | 'pendiente' | 'aprobado' | 'cancelado'>('todos')
const actualizando = ref<Set<number>>(new Set())

async function cargar() {
  cargando.value = true
  try { filas.value = await fabApi.fabricaciones(fecha.value) }
  finally { cargando.value = false }
}

async function setEstado(f: Fabricacion, estado: 'aprobado' | 'cancelado' | 'pendiente') {
  if (actualizando.value.has(f.id)) return
  actualizando.value = new Set([...actualizando.value, f.id])
  try {
    await fabApi.setEstado(f.id, estado)
    f.estado = estado
  } finally {
    actualizando.value = new Set([...actualizando.value].filter(x => x !== f.id))
  }
}

const visibles = computed(() =>
  filtroEstado.value === 'todos'
    ? filas.value
    : filas.value.filter(f => f.estado === filtroEstado.value)
)

const conteo = computed(() => ({
  pendiente: filas.value.filter(f => f.estado === 'pendiente').length,
  aprobado:  filas.value.filter(f => f.estado === 'aprobado').length,
  cancelado: filas.value.filter(f => f.estado === 'cancelado').length,
}))

onMounted(cargar)
</script>

<template>
  <div class="aut-wrap">
    <div class="aut-toolbar">
      <input type="date" v-model="fecha" @change="cargar" class="date-pick"/>

      <div class="chips">
        <button :class="['chip', { active: filtroEstado === 'todos' }]" @click="filtroEstado = 'todos'">
          Todos <span class="badge">{{ filas.length }}</span>
        </button>
        <button :class="['chip chip-pend', { active: filtroEstado === 'pendiente' }]" @click="filtroEstado = 'pendiente'">
          Pendiente <span class="badge">{{ conteo.pendiente }}</span>
        </button>
        <button :class="['chip chip-apro', { active: filtroEstado === 'aprobado' }]" @click="filtroEstado = 'aprobado'">
          Aprobado <span class="badge">{{ conteo.aprobado }}</span>
        </button>
        <button :class="['chip chip-canc', { active: filtroEstado === 'cancelado' }]" @click="filtroEstado = 'cancelado'">
          Cancelado <span class="badge">{{ conteo.cancelado }}</span>
        </button>
      </div>

      <button class="btn-refresh" @click="cargar" :disabled="cargando" title="Actualizar">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
      </button>
    </div>

    <div v-if="cargando" class="aut-empty">Cargando…</div>
    <div v-else-if="!visibles.length" class="aut-empty">Sin registros para esta fecha.</div>

    <div v-else class="aut-table-wrap">
      <table class="aut-table">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Artículo</th>
            <th>Descripción</th>
            <th>Uds.</th>
            <th>Operario</th>
            <th>Almacén</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in visibles" :key="f.id" :class="['fab-row', `row-${f.estado}`]">
            <td class="mono">{{ f.hora?.slice(0,5) }}</td>
            <td class="mono">{{ f.codarticulo }}</td>
            <td>{{ f.descripcion }}</td>
            <td class="mono center">{{ f.unidades }}</td>
            <td>{{ f.nombre_operario }}</td>
            <td class="mono">{{ f.codalmacen }}</td>
            <td>
              <span :class="['estado-chip', `chip-${f.estado}`]">
                {{ f.estado }}
              </span>
            </td>
            <td class="acciones">
              <button
                v-if="f.estado !== 'aprobado'"
                class="btn-aprobar"
                :disabled="actualizando.has(f.id)"
                @click="setEstado(f, 'aprobado')"
              >Aprobar</button>
              <button
                v-if="f.estado !== 'cancelado'"
                class="btn-cancelar"
                :disabled="actualizando.has(f.id)"
                @click="setEstado(f, 'cancelado')"
              >Cancelar</button>
              <button
                v-if="f.estado !== 'pendiente'"
                class="btn-pendiente"
                :disabled="actualizando.has(f.id)"
                @click="setEstado(f, 'pendiente')"
              >Resetear</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.aut-wrap {
  display: flex; flex-direction: column; gap: 14px;
  padding: 20px 24px; height: 100%; box-sizing: border-box;
}

.aut-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}

.date-pick {
  font-size: .8rem; padding: 6px 10px; border-radius: 10px;
  border: 1.5px solid var(--border); background: var(--panel2);
  color: var(--text); font-family: inherit;
}

.chips { display: flex; gap: 6px; flex-wrap: wrap; }

.chip {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: 20px; font-size: .73rem; font-weight: 600;
  border: 1.5px solid var(--border); background: var(--panel2);
  color: var(--text-muted); cursor: pointer; transition: all .15s;
}
.chip.active, .chip:hover { background: var(--panel); color: var(--text); border-color: var(--text-muted); }
.chip-pend.active { background: #fef3c7; border-color: #f59e0b; color: #92400e; }
.chip-apro.active { background: #dcfce7; border-color: #16a34a; color: #15803d; }
.chip-canc.active { background: #fee2e2; border-color: #dc2626; color: #991b1b; }

.badge {
  background: var(--border); color: var(--text-muted);
  border-radius: 10px; padding: 1px 6px; font-size: .68rem;
}
.chip.active .badge { background: rgba(0,0,0,.1); color: inherit; }

.btn-refresh {
  margin-left: auto; padding: 6px 10px; border-radius: 10px;
  border: 1.5px solid var(--border); background: var(--panel2);
  color: var(--text-muted); cursor: pointer; display: flex; align-items: center;
}
.btn-refresh:hover { color: var(--text); }

.aut-empty { color: var(--text-muted); font-size: .83rem; text-align: center; padding: 40px 0; }

.aut-table-wrap { overflow-x: auto; border-radius: 14px; border: 1.5px solid var(--border); }

.aut-table {
  width: 100%; border-collapse: collapse; font-size: .78rem;
}
.aut-table th {
  background: var(--panel2); padding: 9px 12px; text-align: left;
  font-weight: 700; font-size: .7rem; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .05em;
  border-bottom: 1.5px solid var(--border);
}
.aut-table td {
  padding: 9px 12px; border-bottom: 1px solid var(--border);
  color: var(--text-soft); vertical-align: middle;
}
.fab-row:last-child td { border-bottom: none; }
.fab-row:hover td { background: var(--panel2); }
.row-aprobado td  { background: rgba(22,163,74,.04); }
.row-cancelado td { background: rgba(220,38,38,.04); }

.mono   { font-family: 'Fira Code', monospace; font-size: .75rem; }
.center { text-align: center; }

.estado-chip {
  display: inline-block; padding: 2px 9px; border-radius: 12px;
  font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
}
.chip-pendiente { background: #fef3c7; color: #92400e; }
.chip-aprobado  { background: #dcfce7; color: #15803d; }
.chip-cancelado { background: #fee2e2; color: #991b1b; }

.acciones { display: flex; gap: 5px; }

.btn-aprobar, .btn-cancelar, .btn-pendiente {
  padding: 4px 10px; border-radius: 8px; font-size: .7rem; font-weight: 600;
  border: none; cursor: pointer; font-family: inherit; transition: opacity .15s;
}
.btn-aprobar  { background: #16a34a; color: #fff; }
.btn-cancelar { background: #dc2626; color: #fff; }
.btn-pendiente { background: var(--panel2); color: var(--text-muted); border: 1.5px solid var(--border); }
.btn-aprobar:disabled, .btn-cancelar:disabled, .btn-pendiente:disabled { opacity: .5; cursor: wait; }

@media (max-width: 768px) {
  .aut-wrap { padding: 12px 14px; }
  .aut-table th:nth-child(1),
  .aut-table td:nth-child(1),
  .aut-table th:nth-child(3),
  .aut-table td:nth-child(3),
  .aut-table th:nth-child(6),
  .aut-table td:nth-child(6) { display: none; }
}
</style>
