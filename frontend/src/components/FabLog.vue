<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { fabApi, type Fabricacion, type Operario, type ComponenteFab } from '../composables/useFabApi'

const props = defineProps<{ fecha: string; refreshKey: number }>()

// ── state ──────────────────────────────────────────
const rows        = ref<Fabricacion[]>([])
const operarios   = ref<Operario[]>([])
const filtroOp    = ref('')
const loading     = ref(false)
const error       = ref('')

const modalOpen    = ref(false)
const modalNombre  = ref('')
const modalSinStock = ref(false)
const modalComps   = ref<ComponenteFab[]>([])
const modalLoading = ref(false)

onMounted(async () => {
  operarios.value = await fabApi.operarios()
  await cargar()
})

watch([() => props.fecha, () => props.refreshKey, filtroOp], () => cargar())

async function cargar() {
  loading.value = true
  error.value   = ''
  try {
    rows.value = await fabApi.fabricaciones(props.fecha, filtroOp.value ? Number(filtroOp.value) : undefined)
  } catch (e: any) {
    error.value = e.message
  } finally { loading.value = false }
}

async function verModal(id: number, nombre: string, sinStock: number) {
  modalNombre.value   = nombre
  modalSinStock.value = !!sinStock
  modalComps.value    = []
  modalOpen.value     = true
  modalLoading.value  = true
  try { modalComps.value = await fabApi.componentes(id) }
  finally { modalLoading.value = false }
}

function fmtHora(dt: string) {
  return new Date(dt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
}
function fmtNum(n: number) {
  const v = Number(n)
  return Number.isInteger(v) ? v.toLocaleString('es-PY') : v.toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}
function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
</script>

<template>
  <div class="card" style="flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column">

    <!-- Header -->
    <div class="log-header">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="section-dot"></span>
        <h2 class="log-title">Fabricaciones — {{ formatFecha(fecha) }}</h2>
      </div>
      <select v-model="filtroOp" style="width:auto;padding:5px 10px;font-size:.75rem">
        <option value="">Todos los operarios</option>
        <option v-for="o in operarios" :key="o.CODVENDEDOR" :value="o.CODVENDEDOR">{{ o.NOMVENDEDOR }}</option>
      </select>
    </div>

    <!-- Tabla -->
    <div style="overflow-x:auto;flex:1">
      <table class="tbl">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Producto</th>
            <th style="text-align:right">Uds.</th>
            <th>Operario</th>
            <th>Almacén</th>
            <th>Obs.</th>
            <th style="width:28px"></th>
            <th style="width:32px"></th>
          </tr>
        </thead>
        <tbody>
          <!-- loading -->
          <tr v-if="loading">
            <td colspan="8" class="empty-cell">
              <svg width="16" height="16" class="spin" style="display:inline;margin-right:6px;vertical-align:middle" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>Cargando...
            </td>
          </tr>
          <!-- error -->
          <tr v-else-if="error">
            <td colspan="8" class="empty-cell" style="color:#dc2626">{{ error }}</td>
          </tr>
          <!-- vacío -->
          <tr v-else-if="!rows.length">
            <td colspan="8" class="empty-cell">Sin fabricaciones para este día</td>
          </tr>
          <!-- datos -->
          <tr v-else v-for="r in rows" :key="r.id" class="tbl-row fade-in" @click="verModal(r.id, r.descripcion, r.sin_stock)">
            <td class="mono" style="color:var(--text-muted);font-size:.7rem;white-space:nowrap;padding:12px 16px">{{ fmtHora(r.hora) }}</td>
            <td style="padding:12px 16px;font-weight:500;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.descripcion }}</td>
            <td class="mono" style="padding:12px 16px;text-align:right;font-weight:600;color:var(--accent)">{{ fmtNum(r.unidades) }}</td>
            <td style="padding:12px 16px;color:var(--text-soft)">{{ r.nombre_operario || '—' }}</td>
            <td style="padding:12px 16px">
              <span v-if="r.codalmacen" class="badge">{{ r.codalmacen }}</span>
              <span v-else style="color:var(--text-muted)">—</span>
            </td>
            <td style="padding:12px 16px;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="r.observaciones">{{ r.observaciones }}</td>
            <td style="padding:12px 16px;text-align:center">
              <span v-if="r.sin_stock" class="badge-sinstock" title="Stock insuficiente al fabricar">⚠</span>
            </td>
            <td style="padding:12px 16px;text-align:center">
              <svg width="14" height="14" fill="none" :stroke="'var(--text-muted)'" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z"/>
              </svg>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div v-if="rows.length" class="log-footer">
      {{ rows.length }} {{ rows.length !== 1 ? 'fabricaciones' : 'fabricación' }}
    </div>

  </div>

  <!-- Modal componentes -->
  <Teleport to="body">
    <div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen = false">
      <div class="modal-card">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <h3 style="font-size:.875rem;font-weight:600;margin:0">{{ modalNombre }}</h3>
          <button @click="modalOpen = false" class="close-btn" aria-label="Cerrar">✕</button>
        </div>
        <div v-if="modalSinStock" style="margin:12px 16px 0;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:.72rem;color:#92400e">
          ⚠ Stock insuficiente en uno o más ingredientes al momento de fabricar
        </div>
        <div style="padding:16px;max-height:320px;overflow-y:auto;font-size:.775rem">
          <div v-if="modalLoading" style="color:var(--text-muted);padding:8px">Cargando...</div>
          <div v-else-if="!modalComps.length" style="color:var(--text-muted);padding:8px">Sin componentes</div>
          <table v-else style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th class="mth">Componente</th>
                <th class="mth" style="text-align:right">Consumido</th>
                <th class="mth" style="text-align:right">Merma</th>
                <th class="mth" style="text-align:right">Stock inicial</th>
                <th class="mth" style="text-align:right">Stock restante</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in modalComps" :key="c.codarticulo" style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 0;color:var(--text-soft)">{{ c.descripcion || '#' + c.codarticulo }}</td>
                <td class="mono" style="padding:8px 0;text-align:right;color:#dc2626;font-weight:600">−{{ fmtNum(c.unidades_total) }}</td>
                <td class="mono" style="padding:8px 0;text-align:right;color:var(--amber);font-size:.72rem">
                  {{ c.merma_pct > 0 ? `${c.merma_pct}%` : '—' }}
                </td>
                <td class="mono" style="padding:8px 0;text-align:right;color:var(--text-muted)">
                  {{ c.stock_inicial != null ? fmtNum(c.stock_inicial) : '—' }}
                </td>
                <td class="mono" style="padding:8px 0;text-align:right;font-weight:700"
                    :style="{ color: c.stock_inicial == null ? 'var(--text-muted)' : (c.stock_inicial - c.unidades_total) >= 0 ? '#16a34a' : '#dc2626' }">
                  {{ c.stock_inicial != null ? fmtNum(c.stock_inicial - c.unidades_total) : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.log-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.log-title {
  font-size: .72rem;
  font-weight: 600;
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: .07em;
  margin: 0;
}
.log-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  font-size: .7rem;
  color: var(--text-muted);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: .775rem;
}
.tbl thead th {
  padding: 10px 16px;
  text-align: left;
  color: var(--text-muted);
  font-weight: 600;
  font-size: .65rem;
  text-transform: uppercase;
  letter-spacing: .08em;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
}
.empty-cell {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
}
.close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); font-size: .9rem;
  padding: 2px 6px; border-radius: 6px;
  transition: color .12s; line-height: 1;
}
.close-btn:hover { color: var(--text); }
.badge-sinstock {
  display: inline-flex; align-items: center; justify-content: center;
  background: #fffbeb; border: 1px solid #fde68a;
  color: #92400e; border-radius: 6px;
  font-size: .65rem; padding: 2px 5px; font-weight: 700;
  cursor: default;
}
.mth {
  text-align: left;
  padding-bottom: 8px;
  color: var(--text-muted);
  font-size: .65rem;
  text-transform: uppercase;
  letter-spacing: .07em;
  font-weight: 600;
}

@media (max-width: 768px) {
  .log-header { flex-wrap: wrap; gap: 8px; }
  .log-header select { width: 100%; }
  /* hide obs and icon columns (6th and beyond) */
  .tbl thead th:nth-child(n+6),
  .tbl tbody td:nth-child(n+6) { display: none; }
  .tbl thead th, .tbl tbody td { padding: 10px 10px !important; }
}
</style>
