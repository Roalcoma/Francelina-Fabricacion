<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { fabApi, type Receta, type Merma, type AuthUser } from '../composables/useFabApi'

const props = defineProps<{ user: AuthUser; colaborador?: { id: number; nombre: string } | null; familia_desc?: string | null }>()

// ── form ──────────────────────────────────────────────────
const buscar      = ref('')
const sugerencias = ref<Receta[]>([])
const articulo    = ref<Receta | null>(null)
const cantidad    = ref<number | ''>('')
const motivo      = ref('')
const guardando   = ref(false)
const guardadoOk  = ref(false)
const errorMsg    = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(buscar, val => {
  articulo.value = null
  if (searchTimer) clearTimeout(searchTimer)
  if (!val.trim()) { sugerencias.value = []; return }
  searchTimer = setTimeout(async () => {
    sugerencias.value = await fabApi.recetas(props.familia_desc)
  }, 300)
})

function elegirArticulo(r: Receta) {
  articulo.value = r
  buscar.value   = r.DESCRIPCION
  sugerencias.value = []
}

async function registrar() {
  if (!articulo.value || !cantidad.value || !motivo.value.trim()) {
    errorMsg.value = 'Completa todos los campos.'; return
  }
  if (Number(cantidad.value) <= 0) {
    errorMsg.value = 'La cantidad debe ser mayor a 0.'; return
  }
  errorMsg.value = ''
  guardando.value = true
  try {
    await fabApi.registrarMerma({
      codarticulo:     articulo.value.CODARTICULO,
      descripcion:     articulo.value.DESCRIPCION,
      cantidad:        Number(cantidad.value),
      motivo:          motivo.value.trim(),
      codvendedor:     props.user.CODVENDEDOR,
      nombre_operario: props.colaborador?.nombre ?? props.user.USUARIO,
    })
    guardadoOk.value = true
    buscar.value = ''; articulo.value = null; cantidad.value = ''; motivo.value = ''
    await cargarLista()
    setTimeout(() => guardadoOk.value = false, 2000)
  } catch (e: any) {
    errorMsg.value = e.message
  } finally {
    guardando.value = false
  }
}

// ── lista ─────────────────────────────────────────────────
const fecha  = ref(new Date().toISOString().split('T')[0])
const lista  = ref<Merma[]>([])
const cargandoLista = ref(false)

async function cargarLista() {
  cargandoLista.value = true
  try { lista.value = await fabApi.mermas(fecha.value) }
  finally { cargandoLista.value = false }
}

onMounted(cargarLista)
watch(fecha, cargarLista)
</script>

<template>
  <div class="merma-wrap">

    <!-- ── Formulario ── -->
    <div class="merma-form-card">
      <div class="form-title">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        Registrar Merma
      </div>

      <div class="form-body">
        <!-- Artículo -->
        <div class="field-group">
          <label class="field-label">Artículo</label>
          <div class="autocomplete-wrap">
            <input
              v-model="buscar"
              placeholder="Buscar artículo…"
              class="field-input"
              autocomplete="off"
            />
            <ul v-if="sugerencias.length" class="sugerencias">
              <li
                v-for="s in sugerencias.slice(0, 8)"
                :key="s.CODARTICULO"
                @click="elegirArticulo(s)"
                class="sug-item"
              >
                <span class="sug-desc">{{ s.DESCRIPCION }}</span>
                <span class="sug-cod">{{ s.CODARTICULO }}</span>
              </li>
            </ul>
          </div>
          <div v-if="articulo" class="articulo-chip">
            ✓ {{ articulo.CODARTICULO }} — {{ articulo.DESCRIPCION }}
          </div>
        </div>

        <!-- Cantidad -->
        <div class="field-group">
          <label class="field-label">Cantidad</label>
          <input v-model="cantidad" type="number" min="0.01" step="0.01" placeholder="0" class="field-input"/>
        </div>

        <!-- Motivo -->
        <div class="field-group">
          <label class="field-label">Motivo</label>
          <textarea v-model="motivo" rows="3" placeholder="Describe el motivo de la merma…" class="field-input textarea"></textarea>
        </div>

        <!-- Usuario -->
        <div class="field-group">
          <label class="field-label">Responsable</label>
          <input :value="colaborador?.nombre ?? user.USUARIO" disabled class="field-input field-disabled"/>
        </div>

        <div v-if="errorMsg" class="msg-error">{{ errorMsg }}</div>
        <div v-if="guardadoOk" class="msg-ok">✓ Merma registrada</div>

        <button class="btn-registrar" :disabled="guardando" @click="registrar">
          {{ guardando ? 'Registrando…' : 'Registrar merma' }}
        </button>
      </div>
    </div>

    <!-- ── Lista ── -->
    <div class="merma-lista">
      <div class="lista-header">
        <span class="lista-title">Registro de mermas</span>
        <input type="date" v-model="fecha" class="date-pick"/>
        <button class="btn-refresh" @click="cargarLista" title="Actualizar">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
      </div>

      <div v-if="cargandoLista" class="lista-empty">Cargando…</div>
      <div v-else-if="!lista.length" class="lista-empty">Sin mermas para esta fecha.</div>
      <div v-else class="tabla-wrap">
        <table class="merma-tabla">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Artículo</th>
              <th>Cant.</th>
              <th>Motivo</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in lista" :key="m.id">
              <td class="mono">{{ m.hora }}</td>
              <td>{{ m.descripcion }}</td>
              <td class="mono center">{{ m.cantidad }}</td>
              <td class="motivo-cell">{{ m.motivo }}</td>
              <td>{{ m.nombre_operario }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<style scoped>
.merma-wrap {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 18px;
  padding: 20px 24px;
  height: 100%;
  box-sizing: border-box;
  align-items: start;
}

/* ── Formulario ── */
.merma-form-card {
  background: var(--panel);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}
.form-title {
  display: flex; align-items: center; gap: 7px;
  padding: 12px 16px;
  font-size: .73rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 1px solid var(--border);
  background: var(--panel2);
}
.form-body {
  padding: 16px;
  display: flex; flex-direction: column; gap: 13px;
}
.field-group { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: .72rem; font-weight: 600; color: var(--text-muted); }
.field-input {
  padding: 8px 10px; border-radius: 10px; font-size: .8rem;
  border: 1.5px solid var(--border); background: var(--panel2);
  color: var(--text); font-family: inherit; width: 100%; box-sizing: border-box;
}
.field-input:focus { outline: none; border-color: #16a34a; }
.textarea { resize: vertical; min-height: 70px; }
.field-disabled { opacity: .6; cursor: default; }

.autocomplete-wrap { position: relative; }
.sugerencias {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
  background: var(--panel); border: 1.5px solid var(--border); border-radius: 10px;
  list-style: none; margin: 0; padding: 4px 0;
  box-shadow: 0 6px 20px rgba(0,0,0,.12); max-height: 220px; overflow-y: auto;
}
.sug-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 12px; cursor: pointer; gap: 8px;
}
.sug-item:hover { background: var(--panel2); }
.sug-desc { font-size: .78rem; color: var(--text); }
.sug-cod  { font-size: .68rem; color: var(--text-muted); font-family: 'Fira Code', monospace; }
.articulo-chip {
  font-size: .72rem; color: #15803d; background: #dcfce7;
  border-radius: 8px; padding: 4px 8px; line-height: 1.4;
}

.btn-registrar {
  padding: 9px; border-radius: 10px; font-size: .8rem; font-weight: 700;
  background: linear-gradient(135deg, #15803d, #16a34a);
  border: none; color: #fff; cursor: pointer; font-family: inherit;
  transition: opacity .15s; margin-top: 2px;
}
.btn-registrar:disabled { opacity: .6; cursor: wait; }

.msg-error { font-size: .73rem; color: #dc2626; }
.msg-ok    { font-size: .73rem; color: #16a34a; font-weight: 600; }

/* ── Lista ── */
.merma-lista { display: flex; flex-direction: column; gap: 10px; }
.lista-header {
  display: flex; align-items: center; gap: 8px;
}
.lista-title { font-size: .8rem; font-weight: 700; color: var(--text); flex: 1; }
.date-pick {
  font-size: .78rem; padding: 6px 10px; border-radius: 10px;
  border: 1.5px solid var(--border); background: var(--panel2);
  color: var(--text); font-family: inherit;
}
.btn-refresh {
  padding: 6px 9px; border-radius: 10px;
  border: 1.5px solid var(--border); background: var(--panel2);
  color: var(--text-muted); cursor: pointer; display: flex; align-items: center;
}
.btn-refresh:hover { color: var(--text); }

.lista-empty { font-size: .83rem; color: var(--text-muted); padding: 24px 0; text-align: center; }
.tabla-wrap { overflow-x: auto; border-radius: 14px; border: 1.5px solid var(--border); }
.merma-tabla { width: 100%; border-collapse: collapse; font-size: .78rem; }
.merma-tabla th {
  background: var(--panel2); padding: 9px 12px; text-align: left;
  font-weight: 700; font-size: .7rem; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .05em;
  border-bottom: 1.5px solid var(--border);
}
.merma-tabla td {
  padding: 9px 12px; border-bottom: 1px solid var(--border);
  color: var(--text-soft); vertical-align: top;
}
.merma-tabla tr:last-child td { border-bottom: none; }
.merma-tabla tr:hover td { background: var(--panel2); }
.mono   { font-family: 'Fira Code', monospace; font-size: .75rem; }
.center { text-align: center; }
.motivo-cell { max-width: 260px; white-space: pre-wrap; word-break: break-word; }

@media (max-width: 768px) {
  .merma-wrap { grid-template-columns: 1fr; }
  .merma-tabla th:nth-child(5),
  .merma-tabla td:nth-child(5) { display: none; }
}
</style>
