<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { fabApi, type Almacen, type Componente, type Receta, type AuthUser, type Colaborador } from '../composables/useFabApi'

const props = defineProps<{ user: AuthUser; inline?: boolean; colaborador?: { id: number; nombre: string } | null; familia_desc?: string | null }>()
const emit  = defineEmits<{ (e: 'registered'): void; (e: 'close'): void }>()

// ── state ──────────────────────────────────────────
const colaboradores    = ref<Colaborador[]>([])
const operarioNombre   = ref(props.colaborador?.nombre ?? props.user.USUARIO)

watch(() => props.colaborador, c => { operarioNombre.value = c?.nombre ?? props.user.USUARIO })

const recetas        = ref<Receta[]>([])
const selectedId     = ref('')
const recetaSearch   = ref('')
const comboOpen      = ref(false)
const compExpanded   = ref(false)

const filteredRecetas = computed(() => {
  const q = recetaSearch.value.toUpperCase().trim()
  if (!q) return recetas.value
  return recetas.value.filter(r =>
    r.REFPROVEEDOR.toUpperCase().includes(q) || r.DESCRIPCION.includes(q)
  )
})

function selectReceta(r: Receta) {
  recetaSearch.value = r.REFPROVEEDOR || r.DESCRIPCION
  selectedId.value   = String(r.CODARTICULO)
  comboOpen.value    = false
}

function onComboBlur() {
  setTimeout(() => { comboOpen.value = false }, 150)
}

// auto-selección al escanear: si el texto coincide exactamente con un REFPROVEEDOR
watch(recetaSearch, (val) => {
  const q = val.trim()
  if (!q) return
  const match = recetas.value.find(r => r.REFPROVEEDOR.toUpperCase() === q.toUpperCase())
  if (match) selectReceta(match)
})
const receta        = ref<Receta | null>(null)
const componentes   = ref<Componente[]>([])
const stock         = ref<Record<number, number>>({})
const stockLoaded   = ref(false)
const mermaPct      = ref<Record<number, number>>({})
const unidades      = ref(1)
const almacenes     = ref<Almacen[]>([])
const codalmacen         = ref('')
const codalmacen_destino = ref('')
const observaciones      = ref('')
const loading       = ref(false)
const loadingReceta = ref(false)

// resultado post-registro
interface ResultItem {
  codarticulo: number; descripcion: string; unidadmedida: string
  consumido: number; mermaAmt: number; mermaPct: number
  stockPrevio: number; stockRestante: number; tieneStock: boolean; udsKit: number
}
interface Resultado { descripcion: string; unidades: number; items: ResultItem[] }

const maxRestante = computed(() => {
  if (!resultado.value) return null
  const items = resultado.value.items.filter(i => i.tieneStock && i.udsKit > 0)
  if (!items.length) return null
  const min = items.reduce((m, i) => Math.min(m, i.stockRestante / i.udsKit), Infinity)
  return Math.max(0, Math.floor(min))
})
const resultado = ref<Resultado | null>(null)

// ── merma helpers ────────────────────────────────────
function getNeeded(c: Componente, uds?: number) {
  const pct = mermaPct.value[c.CODARTKIT] ?? 0
  return c.UDS_KIT * (1 + pct / 100) * (uds ?? unidades.value ?? 1)
}
function getMermaAmt(c: Componente) {
  const pct = mermaPct.value[c.CODARTKIT] ?? 0
  return c.UDS_KIT * pct / 100 * (unidades.value || 1)
}

// ── computed ────────────────────────────────────────
const maxFabricable = computed(() => {
  if (!codalmacen.value || !stockLoaded.value || !componentes.value.length) return Infinity
  let min = Infinity
  for (const c of componentes.value) {
    const needed1 = getNeeded(c, 1)
    if (needed1 > 0) min = Math.min(min, (stock.value[c.CODARTKIT] ?? 0) / needed1)
  }
  return min === Infinity ? 0 : Math.floor(min)
})

const stockInsuficiente = computed(() =>
  !!codalmacen.value && stockLoaded.value &&
  componentes.value.some(c => (stock.value[c.CODARTKIT] ?? 0) < getNeeded(c))
)

// ── mount ───────────────────────────────────────────
onMounted(async () => {
  const [alms, cfg, area] = await Promise.all([
    fabApi.almacenes(),
    fabApi.getConfig(props.user.CODVENDEDOR),
    fabApi.areaUsuario(props.user.CODVENDEDOR),
  ])
  almacenes.value = alms
  if (cfg.almacen_origen)  codalmacen.value         = cfg.almacen_origen
  if (cfg.almacen_destino) codalmacen_destino.value = cfg.almacen_destino
  if (area) colaboradores.value = await fabApi.colaboradores(area.id)
})

let _recetasReq = 0
async function fetchRecetas(fam: string | null | undefined) {
  const id = ++_recetasReq
  const r = await fabApi.recetas(fam)
  if (id === _recetasReq) recetas.value = r
}

watch(() => props.familia_desc, fetchRecetas, { immediate: true })

// ── watchers ────────────────────────────────────────
watch(selectedId, async (id) => {
  receta.value = null; componentes.value = []; stock.value = {}; stockLoaded.value = false; mermaPct.value = {}
  if (!id) return
  loadingReceta.value = true
  try {
    const [{ producto, componentes: comps }, mermas] = await Promise.all([
      fabApi.receta(Number(id)),
      fabApi.merma(Number(id)),
    ])
    receta.value      = producto
    componentes.value = comps
    const m: Record<number, number> = {}
    for (const x of mermas) m[x.codartkit] = x.merma_pct
    mermaPct.value = m
    await maybeLoadStock()
  } finally { loadingReceta.value = false }
})

watch(codalmacen, async () => {
  stock.value = {}; stockLoaded.value = false
  await maybeLoadStock()
})

async function maybeLoadStock() {
  if (!componentes.value.length || !codalmacen.value) return
  try {
    const ids  = componentes.value.map(c => c.CODARTKIT).join(',')
    const data = await fabApi.stock(codalmacen.value, ids)
    const map: Record<number, number> = {}
    for (const s of data) map[s.CODARTICULO] = s.STOCK
    stock.value = map
  } finally { stockLoaded.value = true }
}

// ── helpers ─────────────────────────────────────────
function fmtNum(n: number) {
  const v = Number(n)
  return Number.isInteger(v) ? v.toLocaleString('es-PY') : v.toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}
function compOk(c: Componente) { return (stock.value[c.CODARTKIT] ?? 0) >= getNeeded(c) }

function ajustar(delta: number) {
  unidades.value = Math.max(0.01, parseFloat(((unidades.value || 0) + delta).toFixed(2)))
}

// ── submit ──────────────────────────────────────────
async function registrar() {
  if (!receta.value)                          return alert('Selecciona una receta')
  if (!unidades.value || unidades.value <= 0) return alert('Cantidad inválida')

  // construir resultado ANTES del POST (stock actual)
  const items: ResultItem[] = componentes.value.map(c => {
    const pct         = mermaPct.value[c.CODARTKIT] ?? 0
    const consumido   = getNeeded(c)
    const mermaAmt    = getMermaAmt(c)
    const stockPrevio = stock.value[c.CODARTKIT] ?? 0
    return {
      codarticulo:   c.CODARTKIT,
      descripcion:   c.DESCRIPCION,
      unidadmedida:  c.UNIDADMEDIDA,
      udsKit:        c.UDS_KIT,
      mermaPct:      pct,
      mermaAmt,
      consumido,
      stockPrevio,
      stockRestante: stockPrevio - consumido,
      tieneStock:    stockLoaded.value && !!codalmacen.value,
    }
  })

  loading.value = true
  try {
    await fabApi.registrar({
      codarticulo:     receta.value.CODARTICULO,
      descripcion:     receta.value.DESCRIPCION,
      unidades:        unidades.value,
      codvendedor:     props.user.CODVENDEDOR || props.user.CODUSUARIO,
      nombre_operario: operarioNombre.value,
      codalmacen:          codalmacen.value,
      codalmacen_destino:  codalmacen_destino.value,
      observaciones:       observaciones.value.trim(),
      componentes:     componentes.value.map(c => ({
        ...c,
        merma_pct:     mermaPct.value[c.CODARTKIT] ?? 0,
        stock_inicial: stockLoaded.value && codalmacen.value ? (stock.value[c.CODARTKIT] ?? null) : null,
      })),
    })
    resultado.value = { descripcion: receta.value.DESCRIPCION, unidades: unidades.value, items }
    emit('registered')
  } catch (e: any) {
    alert('Error: ' + e.message)
  } finally { loading.value = false }
}

function nuevoRegistro() {
  resultado.value          = null
  selectedId.value         = ''
  recetaSearch.value       = ''
  unidades.value           = 1
  observaciones.value      = ''
}
</script>

<template>
  <div :class="['modal-card', { 'modal-card--inline': inline }]">

    <!-- Header del modal -->
    <div class="modal-header">
      <h2 class="modal-title">
        <span class="section-dot" style="width:7px;height:7px"></span>
        {{ resultado ? 'Registro completado' : 'Nueva Fabricación' }}
      </h2>
      <button class="close-btn" @click="emit('close')" aria-label="Cerrar">✕</button>
    </div>

    <!-- ══ RESULTADO ══ -->
    <div v-if="resultado" class="modal-body">
      <div class="result-ok">
        <div class="result-check">✓</div>
        <div>
          <div style="font-weight:700;font-size:.95rem">{{ resultado.descripcion }}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">
            {{ resultado.unidades }} unidad{{ resultado.unidades !== 1 ? 'es' : '' }} registrada{{ resultado.unidades !== 1 ? 's' : '' }} — {{ user.USUARIO }}
          </div>
        </div>
      </div>

      <div style="font-size:.65rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin:14px 0 6px">
        Ingredientes consumidos
      </div>

      <table class="res-table">
        <thead>
          <tr>
            <th>Ingrediente</th>
            <th style="text-align:right">Consumido</th>
            <template v-if="resultado.items.some(i => i.mermaPct > 0)">
              <th style="text-align:right">Merma</th>
            </template>
            <template v-if="resultado.items[0]?.tieneStock">
              <th style="text-align:right">Stock previo</th>
              <th style="text-align:right">Stock estimado</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in resultado.items" :key="it.codarticulo">
            <td>{{ it.descripcion }}</td>
            <td class="mono" style="text-align:right;color:#dc2626;font-weight:600">
              −{{ fmtNum(it.consumido) }} <span style="font-size:.65rem;color:var(--text-muted)">{{ it.unidadmedida }}</span>
            </td>
            <template v-if="resultado.items.some(i => i.mermaPct > 0)">
              <td class="mono" style="text-align:right;font-size:.72rem;color:var(--amber)">
                {{ it.mermaPct > 0 ? `+${fmtNum(it.mermaAmt)} (${it.mermaPct}%)` : '—' }}
              </td>
            </template>
            <template v-if="it.tieneStock">
              <td class="mono" style="text-align:right;color:var(--text-muted)">{{ fmtNum(it.stockPrevio) }}</td>
              <td class="mono" style="text-align:right;font-weight:700"
                  :style="{ color: it.stockRestante >= 0 ? '#16a34a' : '#dc2626' }">
                {{ fmtNum(it.stockRestante) }}
                <span v-if="it.stockRestante < 0" style="font-size:.7rem"> ⚠</span>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <div v-if="resultado.items[0]?.tieneStock" style="font-size:.65rem;color:var(--text-muted);margin-top:8px">
        * Stock estimado antes de sincronizar con ICG
      </div>

      <div v-if="maxRestante !== null" class="capacity-hint"
           :class="maxRestante === 0 ? 'capacity-warn' : 'capacity-ok'">
        <template v-if="maxRestante === 0">
          ✗ Sin stock restante para fabricar más unidades
        </template>
        <template v-else>
          ✓ Con el stock restante puedes fabricar hasta <strong>{{ maxRestante }}</strong> unidad{{ maxRestante !== 1 ? 'es' : '' }} más
        </template>
      </div>

      <div class="result-btns">
        <button class="btn-secondary" @click="nuevoRegistro">Nueva Fabricación</button>
        <button class="btn-primary" @click="emit('close')">Cerrar</button>
      </div>
    </div>

    <!-- ══ FORMULARIO ══ -->
    <div v-else class="modal-body">

      <!-- Selector receta con búsqueda -->
      <div class="field">
        <label class="field-label" for="receta">Receta / Producto</label>
        <div class="combo-wrap">
          <input
            id="receta"
            v-model="recetaSearch"
            @focus="comboOpen = true"
            @blur="onComboBlur"
            placeholder="Buscar receta..."
            autocomplete="off"
          />
          <div v-if="comboOpen && filteredRecetas.length" class="combo-dropdown">
            <div
              v-for="r in filteredRecetas"
              :key="r.CODARTICULO"
              class="combo-item"
              @mousedown.prevent="selectReceta(r)"
            >
              <span v-if="r.REFPROVEEDOR" class="combo-ref">{{ r.REFPROVEEDOR }}</span>
              {{ r.DESCRIPCION }}
            </div>
          </div>
        </div>
      </div>

      <!-- Almacén origen -->
      <div class="field">
        <label class="field-label" for="almacen">Almacén origen <span style="font-weight:400;text-transform:none;letter-spacing:0">(ingredientes)</span></label>
        <select id="almacen" v-model="codalmacen">
          <option value="">— Seleccionar almacén —</option>
          <option v-for="a in almacenes" :key="a.CODALMACEN" :value="a.CODALMACEN">{{ a.CODALMACEN }} — {{ a.NOMBREALMACEN }}</option>
        </select>
      </div>

      <!-- Almacén destino -->
      <div class="field">
        <label class="field-label" for="almacen-destino">Almacén destino <span style="font-weight:400;text-transform:none;letter-spacing:0">(producto terminado)</span></label>
        <select id="almacen-destino" v-model="codalmacen_destino">
          <option value="">— Seleccionar almacén —</option>
          <option v-for="a in almacenes" :key="a.CODALMACEN" :value="a.CODALMACEN">{{ a.CODALMACEN }} — {{ a.NOMBREALMACEN }}</option>
        </select>
      </div>

      <!-- Componentes -->
      <div v-if="loadingReceta" class="loading-hint">Cargando componentes...</div>
      <div v-else-if="receta" class="card-inner">
        <button class="comp-toggle" @click="compExpanded = !compExpanded">
          <span style="font-size:.62rem;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.07em">
            Componentes — {{ receta.UNIDADMEDIDA }}
          </span>
          <svg :style="{ transform: compExpanded ? 'rotate(180deg)' : 'none', transition:'transform .2s' }"
               width="12" height="12" fill="none" stroke="#166534" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <div v-if="compExpanded">
        <table class="comp-table">
          <thead>
            <tr>
              <th>Componente</th>
              <th style="text-align:right">Necesita</th>
              <th style="text-align:right;white-space:nowrap">Merma %</th>
              <template v-if="codalmacen && stockLoaded">
                <th style="text-align:right">Stock</th>
                <th style="width:18px"></th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in componentes" :key="c.CODARTKIT">
              <td>{{ c.DESCRIPCION }}</td>
              <td class="mono" style="text-align:right">
                <span>{{ fmtNum(getNeeded(c)) }}</span>
                <span style="color:var(--text-muted);font-size:.65rem"> {{ c.UNIDADMEDIDA }}</span>
                <div v-if="(mermaPct[c.CODARTKIT] ?? 0) > 0" style="font-size:.62rem;color:var(--text-muted);line-height:1.2">
                  base {{ fmtNum(c.UDS_KIT * (unidades || 1)) }} + merma {{ fmtNum(getMermaAmt(c)) }}
                </div>
              </td>
              <td style="text-align:right;padding-right:4px">
                <input
                  type="number" min="0" max="100" step="0.1"
                  :value="mermaPct[c.CODARTKIT] ?? 0"
                  @change="mermaPct[c.CODARTKIT] = parseFloat(($event.target as HTMLInputElement).value) || 0"
                  class="merma-input"
                />
              </td>
              <template v-if="codalmacen && stockLoaded">
                <td class="mono" style="text-align:right;font-weight:600"
                    :style="{ color: compOk(c) ? '#16a34a' : '#dc2626' }">
                  {{ fmtNum(stock[c.CODARTKIT] ?? 0) }}
                </td>
                <td style="text-align:center;font-size:.85rem;font-weight:700"
                    :style="{ color: compOk(c) ? '#16a34a' : '#dc2626' }">
                  {{ compOk(c) ? '✓' : '✗' }}
                </td>
              </template>
            </tr>
          </tbody>
        </table>

        <!-- Capacidad máxima -->
        <div v-if="codalmacen && stockLoaded" class="capacity-hint"
             :class="stockInsuficiente ? 'capacity-warn' : 'capacity-ok'">
          <template v-if="maxFabricable === 0">
            ✗ Sin stock suficiente para fabricar ninguna unidad
          </template>
          <template v-else-if="maxFabricable === Infinity">
            — Sin datos de stock para este almacén
          </template>
          <template v-else>
            {{ stockInsuficiente ? '⚠' : '✓' }}
            Puedes fabricar hasta <strong>{{ maxFabricable }}</strong> unidad{{ maxFabricable !== 1 ? 'es' : '' }} con el stock actual
          </template>
        </div>
        </div><!-- /compExpanded -->
      </div>

      <!-- Unidades -->
      <div class="field">
        <label class="field-label">Unidades a fabricar</label>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="stepper-btn" @click="ajustar(-1)">−</button>
          <input v-model.number="unidades" type="number" min="0.01" step="0.01" style="flex:1"
                 :style="{ borderColor: stockInsuficiente ? '#f59e0b' : '' }"/>
          <button class="stepper-btn" @click="ajustar(1)">+</button>
        </div>
      </div>

      <!-- Operario en turno -->
      <div class="field">
        <label class="field-label">En turno</label>
        <select v-model="operarioNombre">
          <option :value="user.USUARIO">{{ user.USUARIO }}</option>
          <option v-for="c in colaboradores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
        </select>
      </div>

      <!-- Observaciones -->
      <div class="field">
        <label class="field-label" for="obs">Observaciones <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcional)</span></label>
        <textarea id="obs" v-model="observaciones" rows="2" placeholder="..." style="resize:none"></textarea>
      </div>

      <button class="btn-primary" :disabled="loading || loadingReceta" @click="registrar">
        {{ loading ? 'Registrando...' : 'Registrar Fabricación' }}
      </button>

    </div>
  </div>
</template>

<style scoped>
.modal-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  width: 100%; max-width: 500px;
  max-height: 90vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}

@media (max-width: 768px) {
  .modal-card { max-width: 100%; max-height: 95vh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .modal-body { padding: 16px; gap: 12px; }
  .comp-table tbody td { padding: 8px 0; }
  .merma-input { width: 60px; }
  .res-table  { font-size: .72rem; }
  .result-btns { flex-direction: column; }
}

.modal-card--inline {
  max-width: 100%;
  max-height: none;
  box-shadow: none;
  border-radius: 16px;
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.modal-title {
  display: flex; align-items: center; gap: 8px;
  font-size: .8rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .07em; margin: 0;
}
.close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); font-size: .9rem; padding: 2px 6px;
  border-radius: 6px; transition: color .12s; line-height: 1;
}
.close-btn:hover { color: var(--text); }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 14px;
}

.field { display: flex; flex-direction: column; }

.loading-hint { font-size: .75rem; color: var(--text-muted); text-align: center; padding: 4px 0; }

/* Combo receta */
.combo-wrap { position: relative; }
.combo-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
  background: var(--panel); border: 1.5px solid var(--border-hi);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
  max-height: 200px; overflow-y: auto;
}
.combo-item {
  padding: 8px 12px; font-size: .8rem; color: var(--text-soft);
  cursor: pointer; border-bottom: 1px solid var(--border);
}
.combo-item:last-child { border-bottom: none; }
.combo-item:hover { background: #f0fdf4; color: #166534; }
.combo-ref {
  display: inline-block; font-size: .65rem; font-weight: 700;
  color: #166534; background: #dcfce7; border-radius: 4px;
  padding: 1px 5px; margin-right: 6px; font-family: 'Fira Code', monospace;
}

/* Capacity hint */
.capacity-hint {
  margin-top: 8px; font-size: .72rem; border-radius: 8px; padding: 7px 10px;
}
.capacity-ok   { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
.capacity-warn { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; }

/* Operario chip */
.operario-display {
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1.5px solid #d1fae5;
  border-radius: 10px;
  font-size: .825rem;
  color: #166534;
  font-weight: 600;
}

/* Stock warning */
.stock-warn {
  margin-top: 8px; font-size: .72rem; color: #92400e;
  background: #fffbeb; border: 1px solid #fde68a;
  border-radius: 8px; padding: 7px 10px;
}

.comp-toggle {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; background: none; border: none; cursor: pointer;
  padding: 0; margin-bottom: 8px;
}

/* Component table */
.comp-table { width: 100%; border-collapse: collapse; font-size: .75rem; }
.comp-table thead th {
  font-size: .62rem; font-weight: 600; color: #166534;
  text-transform: uppercase; letter-spacing: .06em;
  padding-bottom: 6px; border-bottom: 1px solid #bbf7d0;
}
.comp-table tbody tr { border-bottom: 1px solid #d1fae5; }
.comp-table tbody tr:last-child { border-bottom: none; }
.comp-table tbody td { padding: 6px 0; color: var(--text-soft); vertical-align: middle; }

/* Merma input */
.merma-input {
  width: 52px; text-align: right; padding: 2px 4px;
  font-size: .72rem; border-radius: 6px;
  border: 1.5px solid var(--border); background: var(--bg);
  color: var(--text); font-family: 'Fira Code', monospace;
}
.merma-input:focus { border-color: #f59e0b; outline: none; }

/* Result */
.result-ok {
  display: flex; align-items: center; gap: 14px;
  padding: 14px; background: #f0fdf4;
  border: 1px solid #86efac; border-radius: 12px;
}
.result-check {
  width: 36px; height: 36px; flex-shrink: 0;
  background: #16a34a; color: #fff;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; font-weight: 700;
}
.res-table { width: 100%; border-collapse: collapse; font-size: .775rem; }
.res-table thead th {
  font-size: .62rem; color: var(--text-muted); font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
  padding-bottom: 6px; border-bottom: 1px solid var(--border);
}
.res-table tbody tr { border-bottom: 1px solid var(--border); }
.res-table tbody tr:last-child { border-bottom: none; }
.res-table tbody td { padding: 7px 0; color: var(--text-soft); }

.result-btns { display: flex; gap: 8px; margin-top: 4px; }
.btn-secondary {
  flex: 1; padding: 9px; border-radius: 10px;
  background: var(--panel2); border: 1.5px solid var(--border);
  color: var(--text-soft); font-size: .8rem; font-weight: 600;
  cursor: pointer; font-family: 'Fira Sans', system-ui, sans-serif;
  transition: background .12s;
}
.btn-secondary:hover { background: #f0fdf4; border-color: #86efac; }
.btn-primary { flex: 1; }
</style>
