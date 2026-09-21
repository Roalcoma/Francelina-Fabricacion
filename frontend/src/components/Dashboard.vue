<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { fabApi, type StockRecetasRow } from '../composables/useFabApi'

const today = new Date().toISOString().split('T')[0]
const desde = ref(new Date(new Date().setDate(new Date().getDate() - 29)).toISOString().split('T')[0])
const hasta = ref(today)

const loading     = ref(false)
const porDia      = ref<any[]>([])
const porProducto = ref<any[]>([])
const porOperario = ref<any[]>([])
const ingredientes = ref<any[]>([])

// ── stock recetas ──────────────────────────────────────────
const stockCols     = ref<string[]>([])
const stockRows     = ref<StockRecetasRow[]>([])
const loadingStock  = ref(false)

onMounted(() => { cargar(); cargarStock() })
watch([desde, hasta], () => cargar())

async function cargar() {
  loading.value = true
  try {
    const d = await fabApi.dashboard(desde.value, hasta.value)
    porDia.value       = d.porDia
    porProducto.value  = d.porProducto
    porOperario.value  = d.porOperario
    ingredientes.value = d.ingredientes
  } finally { loading.value = false }
}

async function cargarStock() {
  loadingStock.value = true
  try {
    const r = await fabApi.stockRecetas()
    stockCols.value = r.cols
    stockRows.value = r.rows
  } finally { loadingStock.value = false }
}

function fmtNum(n: number) {
  const v = Number(n)
  return Number.isInteger(v) ? v.toLocaleString('es-PY') : v.toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}
function fmtFecha(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const totalOrdenes  = computed(() => porDia.value.reduce((a, r) => a + Number(r.ordenes), 0))
const totalUnidades = computed(() => porDia.value.reduce((a, r) => a + Number(r.unidades), 0))

function barWidth(val: number, max: number) {
  return max > 0 ? Math.max(4, Math.round((val / max) * 100)) : 0
}
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:20px">

    <!-- Filtros -->
    <div class="dash-toolbar">
      <h2 class="dash-title"><span class="section-dot"></span> Dashboard de Fabricación</h2>
      <div style="display:flex;align-items:center;gap:10px">
        <label class="field-label" style="margin:0;white-space:nowrap">Del</label>
        <input type="date" v-model="desde" style="width:140px;padding:5px 8px;font-size:.8rem"/>
        <label class="field-label" style="margin:0;white-space:nowrap">al</label>
        <input type="date" v-model="hasta" style="width:140px;padding:5px 8px;font-size:.8rem"/>
        <button @click="cargar" class="btn-refresh" :disabled="loading">
          {{ loading ? '...' : 'Actualizar' }}
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">Total órdenes</div>
        <div class="kpi-val mono">{{ totalOrdenes }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Unidades producidas</div>
        <div class="kpi-val mono" style="color:var(--accent)">{{ fmtNum(totalUnidades) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Productos distintos</div>
        <div class="kpi-val mono" style="color:var(--sky)">{{ porProducto.length }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Operarios activos</div>
        <div class="kpi-val mono" style="color:var(--amber)">{{ porOperario.length }}</div>
      </div>
    </div>

    <!-- 4 tablas -->
    <div class="reports-grid">

      <!-- Por día -->
      <div class="card report-card">
        <div class="report-header">Producción por día</div>
        <div v-if="!porDia.length" class="empty-rep">Sin datos</div>
        <table v-else class="rep-table">
          <thead><tr><th>Fecha</th><th style="text-align:right">Órdenes</th><th style="text-align:right">Unidades</th></tr></thead>
          <tbody>
            <tr v-for="r in porDia" :key="r.fecha">
              <td class="mono" style="color:var(--text-muted)">{{ fmtFecha(r.fecha) }}</td>
              <td style="text-align:right">{{ r.ordenes }}</td>
              <td class="mono" style="text-align:right;color:var(--accent);font-weight:600">{{ fmtNum(r.unidades) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Por producto -->
      <div class="card report-card">
        <div class="report-header">Por producto</div>
        <div v-if="!porProducto.length" class="empty-rep">Sin datos</div>
        <div v-else style="display:flex;flex-direction:column;gap:8px;padding:12px 16px">
          <div v-for="r in porProducto" :key="r.descripcion" class="bar-row">
            <div class="bar-label" :title="r.descripcion">{{ r.descripcion }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: barWidth(r.unidades, porProducto[0]?.unidades) + '%' }"></div>
            </div>
            <div class="bar-val mono">{{ fmtNum(r.unidades) }}</div>
          </div>
        </div>
      </div>

      <!-- Por operario -->
      <div class="card report-card">
        <div class="report-header">Por operario</div>
        <div v-if="!porOperario.length" class="empty-rep">Sin datos</div>
        <table v-else class="rep-table">
          <thead><tr><th>Operario</th><th style="text-align:right">Órdenes</th><th style="text-align:right">Unidades</th></tr></thead>
          <tbody>
            <tr v-for="r in porOperario" :key="r.nombre_operario">
              <td style="font-weight:500">{{ r.nombre_operario }}</td>
              <td style="text-align:right">{{ r.ordenes }}</td>
              <td class="mono" style="text-align:right;color:var(--accent);font-weight:600">{{ fmtNum(r.unidades) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Ingredientes consumidos -->
      <div class="card report-card">
        <div class="report-header">Ingredientes más consumidos</div>
        <div v-if="!ingredientes.length" class="empty-rep">Sin datos</div>
        <div v-else style="display:flex;flex-direction:column;gap:8px;padding:12px 16px">
          <div v-for="r in ingredientes.slice(0,15)" :key="r.descripcion" class="bar-row">
            <div class="bar-label" :title="r.descripcion">{{ r.descripcion }}</div>
            <div class="bar-track">
              <div class="bar-fill" style="background:#0284c7" :style="{ width: barWidth(r.total_consumido, ingredientes[0]?.total_consumido) + '%' }"></div>
            </div>
            <div class="bar-val mono" style="color:#0284c7">{{ fmtNum(r.total_consumido) }}</div>
          </div>
        </div>
      </div>

    </div>

    <!-- Stock actual de recetas -->
    <div class="card">
      <div class="report-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <span>Stock actual de recetas</span>
        <button class="btn-refresh" :disabled="loadingStock" @click="cargarStock" style="font-size:.7rem;padding:4px 12px">
          {{ loadingStock ? '…' : 'Actualizar' }}
        </button>
      </div>

      <div v-if="loadingStock && !stockRows.length" class="empty-rep">Cargando…</div>
      <div v-else-if="!stockRows.length" class="empty-rep">Sin recetas con stock cargado</div>
      <div v-else style="overflow-x:auto">
        <table class="rep-table stock-pivot">
          <thead>
            <tr>
              <th>Receta</th>
              <th style="text-align:right">Total</th>
              <th v-for="col in stockCols" :key="col" style="text-align:right">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in stockRows" :key="r.codarticulo">
              <td style="font-weight:500;white-space:nowrap">{{ r.descripcion }}</td>
              <td class="mono" style="text-align:right;font-weight:700;color:var(--accent)">{{ fmtNum(r.total) }}</td>
              <td v-for="col in stockCols" :key="col" class="mono" style="text-align:right;color:var(--text-soft)">
                {{ r.alm[col] != null ? fmtNum(r.alm[col]) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<style scoped>
.dash-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.dash-title {
  display: flex; align-items: center; gap: 8px;
  font-size: .8rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .07em; margin: 0;
}
.btn-refresh {
  padding: 6px 14px; border-radius: 9px;
  background: var(--panel); border: 1.5px solid var(--border);
  font-size: .78rem; color: var(--text-soft); cursor: pointer;
  font-family: 'Fira Sans', system-ui, sans-serif;
  transition: background .12s;
}
.btn-refresh:hover:not(:disabled) { background: #f0fdf4; border-color: #86efac; }
.btn-refresh:disabled { opacity: .5; }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.kpi-card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 14px; padding: 18px 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
}
.kpi-label { font-size: .68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .07em; font-weight: 600; margin-bottom: 8px; }
.kpi-val   { font-size: 1.75rem; font-weight: 700; line-height: 1; color: var(--text); }

/* Reports grid */
.reports-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

@media (max-width: 768px) {
  .kpi-row     { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .kpi-card    { padding: 14px 16px; }
  .kpi-val     { font-size: 1.4rem; }
  .reports-grid { grid-template-columns: 1fr; }
  .dash-toolbar { flex-direction: column; align-items: flex-start; gap: 10px; }
  .dash-toolbar > div { width: 100%; flex-wrap: wrap; }
}
.report-card  { display: flex; flex-direction: column; }
.report-header {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  font-size: .72rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .07em;
}
.empty-rep { padding: 32px; text-align: center; color: var(--text-muted); font-size: .78rem; }

/* Table */
.rep-table { width: 100%; border-collapse: collapse; font-size: .775rem; }
.rep-table thead th {
  padding: 8px 16px; text-align: left; font-size: .62rem; font-weight: 600;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: .07em;
  border-bottom: 1px solid var(--border);
}
.rep-table tbody tr { border-bottom: 1px solid var(--border); }
.rep-table tbody tr:last-child { border-bottom: none; }
.rep-table tbody td { padding: 8px 16px; color: var(--text-soft); }

/* Bars */
.bar-row { display: flex; align-items: center; gap: 8px; font-size: .75rem; }
.bar-label { width: 140px; flex-shrink: 0; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { flex: 1; height: 6px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.bar-fill  { height: 100%; background: var(--accent); border-radius: 4px; transition: width .3s; }
.bar-val   { width: 60px; text-align: right; flex-shrink: 0; font-size: .72rem; color: var(--accent); font-weight: 600; }

/* Stock pivot table */
.stock-pivot td, .stock-pivot th { white-space: nowrap; }
.stock-pivot td:not(:first-child), .stock-pivot th:not(:first-child) { min-width: 80px; }
</style>
