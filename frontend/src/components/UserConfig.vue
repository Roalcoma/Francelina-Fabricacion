<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fabApi, type Almacen, type AuthUser, type Colaborador, type Seccion, type Area } from '../composables/useFabApi'

// ── update ──────────────────────────────────────────
const updateUrl     = ref('')
const updateStatus  = ref<'idle' | 'updating' | 'reconnecting' | 'done' | 'error'>('idle')
const updateError   = ref('')

async function iniciarUpdate() {
  if (!updateUrl.value.startsWith('https://')) {
    updateError.value = 'La URL debe comenzar con https://'
    return
  }
  updateError.value  = ''
  updateStatus.value = 'updating'
  try {
    await fabApi.update(updateUrl.value)
  } catch { /* servidor puede no responder si ya reinició */ }
  updateStatus.value = 'reconnecting'
  // Polling hasta que el backend responda de nuevo
  const poll = setInterval(async () => {
    try {
      await fetch('/fab/almacenes')
      clearInterval(poll)
      updateStatus.value = 'done'
      setTimeout(() => window.location.reload(), 1000)
    } catch { /* aún reiniciando */ }
  }, 2000)
  // Timeout de seguridad: 60s
  setTimeout(() => { clearInterval(poll); if (updateStatus.value === 'reconnecting') updateStatus.value = 'error'; updateError.value = 'Tiempo de espera agotado. Recarga la página manualmente.' }, 60000)
}

const props = defineProps<{ user: AuthUser }>()
const emit  = defineEmits<{ (e: 'close'): void }>()

const almacenes      = ref<Almacen[]>([])
const almacenOrigen  = ref('')
const almacenDestino = ref('')
const saving = ref(false)
const saved  = ref(false)

// ── área ─────────────────────────────────────────────
const secciones      = ref<Seccion[]>([])
const familias       = ref<string[]>([])
const areaActual     = ref<Area | null>(null)
const areaNombre     = ref('')
const areaSec        = ref<number | ''>('')
const areaFamilia    = ref('')
const areaGuardando  = ref(false)
const areaGuardada   = ref(false)

async function cargarArea() {
  areaActual.value = await fabApi.areaUsuario(props.user.CODVENDEDOR)
  if (areaActual.value) {
    areaNombre.value  = areaActual.value.nombre
    areaSec.value     = areaActual.value.numseccion
    areaFamilia.value = areaActual.value.familia_desc || ''
  }
}

async function guardarArea() {
  if (!areaNombre.value.trim()) return
  areaGuardando.value = true
  try {
    await fabApi.crearArea({
      nombre:       areaNombre.value.trim(),
      numseccion:   0,
      codvendedor:  props.user.CODVENDEDOR,
      familia_desc: areaFamilia.value || null,
    })
    await cargarArea()
    areaGuardada.value = true
    setTimeout(() => areaGuardada.value = false, 2000)
  } finally { areaGuardando.value = false }
}

// ── colaboradores ────────────────────────────────────
const colaboradores   = ref<Colaborador[]>([])
const nuevoColabNombre = ref('')
const colabGuardando   = ref(false)

async function cargarColaboradores() {
  colaboradores.value = await fabApi.colaboradores(props.user.CODVENDEDOR)
}

async function agregarColab() {
  if (!nuevoColabNombre.value.trim()) return
  colabGuardando.value = true
  try {
    await fabApi.agregarColaborador(props.user.CODVENDEDOR, nuevoColabNombre.value.trim())
    nuevoColabNombre.value = ''
    await cargarColaboradores()
  } finally { colabGuardando.value = false }
}

async function eliminarColab(id: number) {
  await fabApi.eliminarColaborador(id)
  await cargarColaboradores()
}

onMounted(async () => {
  const [alms, cfg] = await Promise.all([
    fabApi.almacenes(),
    fabApi.getConfig(props.user.CODVENDEDOR),
  ])
  almacenes.value      = alms
  almacenOrigen.value  = cfg.almacen_origen  || ''
  almacenDestino.value = cfg.almacen_destino || ''
  const [secs, fams] = await Promise.all([fabApi.secciones(), fabApi.familias()])
  secciones.value = secs
  familias.value  = fams
  await cargarColaboradores()
  await cargarArea()
})

async function guardar() {
  saving.value = true
  try {
    await fabApi.saveConfig({
      codvendedor:     props.user.CODVENDEDOR,
      almacen_origen:  almacenOrigen.value,
      almacen_destino: almacenDestino.value,
    })
    saved.value = true
    setTimeout(() => { saved.value = false; emit('close') }, 900)
  } finally { saving.value = false }
}
</script>

<template>
  <div class="cfg-backdrop" @click.self="emit('close')">
    <div class="cfg-card">
      <div class="cfg-header">
        <span>Configuración — {{ user.USUARIO }}</span>
        <button class="close-btn" @click="emit('close')" aria-label="Cerrar">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="cfg-body">
        <p class="cfg-hint">Estos almacenes se usarán como valores por defecto al registrar fabricaciones. Puedes cambiarlos en el formulario cuando sea necesario.</p>

        <div class="field-group">
          <label class="field-label">Almacén de origen <span class="hint">(ingredientes)</span></label>
          <select v-model="almacenOrigen">
            <option value="">Sin preferencia</option>
            <option v-for="a in almacenes" :key="a.CODALMACEN" :value="a.CODALMACEN">
              {{ a.CODALMACEN }} – {{ a.NOMBREALMACEN }}
            </option>
          </select>
        </div>

        <div class="field-group">
          <label class="field-label">Almacén de destino <span class="hint">(producto terminado)</span></label>
          <select v-model="almacenDestino">
            <option value="">Sin preferencia</option>
            <option v-for="a in almacenes" :key="a.CODALMACEN" :value="a.CODALMACEN">
              {{ a.CODALMACEN }} – {{ a.NOMBREALMACEN }}
            </option>
          </select>
        </div>
      </div>

      <div class="cfg-footer">
        <button class="btn-cancel" @click="emit('close')">Cancelar</button>
        <button class="btn-save" :disabled="saving" @click="guardar">
          {{ saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>

      <!-- ── Área ── -->
      <div class="update-section">
        <div class="update-title">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Área
        </div>
        <p class="cfg-hint" style="margin:0">Define el área de este usuario y la familia de artículos que filtrará las recetas.</p>
        <div v-if="areaActual" class="articulo-chip">
          Área actual: <strong>{{ areaActual.nombre }}</strong>
          <span v-if="areaActual.familia_desc"> — {{ areaActual.familia_desc }}</span>
        </div>
        <div class="field-group">
          <label class="field-label">Nombre del área</label>
          <input v-model="areaNombre" placeholder="Ej: Cocina, Panadería…" style="font-size:.78rem"/>
        </div>
        <div class="field-group">
          <label class="field-label">Familia de artículos <span class="hint">(filtra recetas)</span></label>
          <select v-model="areaFamilia" style="font-size:.78rem">
            <option value="">Sin filtro</option>
            <option v-for="f in familias" :key="f" :value="f">{{ f }}</option>
          </select>
        </div>
        <div v-if="areaGuardada" class="msg-ok-sm">✓ Área guardada</div>
        <button class="btn-save" :disabled="areaGuardando || !areaNombre.trim()" @click="guardarArea">
          {{ areaGuardando ? 'Guardando…' : 'Guardar área' }}
        </button>
      </div>

      <!-- ── Colaboradores ── -->
      <div class="update-section">
        <div class="update-title">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
          </svg>
          Colaboradores
        </div>
        <div class="colab-list">
          <div v-if="!colaboradores.length" class="cfg-hint" style="margin:0">Sin colaboradores aún.</div>
          <div v-for="c in colaboradores" :key="c.id" class="colab-row">
            <span class="colab-nombre">{{ c.nombre }}</span>
            <button class="btn-del-colab" @click="eliminarColab(c.id)" title="Eliminar">
              <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="colab-add-row">
          <input v-model="nuevoColabNombre" placeholder="Nombre del colaborador" @keydown.enter="agregarColab" style="flex:1;font-size:.78rem"/>
          <button class="btn-add-colab" :disabled="colabGuardando || !nuevoColabNombre.trim()" @click="agregarColab">
            {{ colabGuardando ? '…' : 'Agregar' }}
          </button>
        </div>
      </div>

      <!-- ── Actualización ── -->
      <div class="update-section">
        <div class="update-title">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Actualizar módulo
        </div>

        <template v-if="updateStatus === 'idle' || updateStatus === 'error'">
          <p class="cfg-hint" style="margin:0">Pega el enlace del .zip de GitHub para actualizar los archivos del módulo.</p>
          <input v-model="updateUrl" placeholder="https://github.com/.../archive/refs/heads/main.zip" style="font-size:.73rem"/>
          <div v-if="updateError" class="update-err">{{ updateError }}</div>
          <button class="btn-update" @click="iniciarUpdate">Actualizar ahora</button>
        </template>

        <template v-else-if="updateStatus === 'updating'">
          <div class="update-progress">
            <span class="spin-dot"></span> Descargando y aplicando actualización…
          </div>
        </template>

        <template v-else-if="updateStatus === 'reconnecting'">
          <div class="update-progress">
            <span class="spin-dot"></span> Servidor reiniciando — esperando reconexión…
          </div>
        </template>

        <template v-else-if="updateStatus === 'done'">
          <div class="update-ok">✓ Actualización completa — recargando…</div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cfg-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: center;
}
.cfg-card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 18px; width: 100%; max-width: 420px;
  box-shadow: 0 12px 40px rgba(0,0,0,.15);
  overflow-y: auto; max-height: 92dvh;
}
.cfg-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  font-size: .78rem; font-weight: 700; color: var(--text);
}
.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 8px;
  background: var(--panel2); border: 1px solid var(--border);
  color: var(--text-muted); cursor: pointer;
}
.close-btn:hover { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }

.cfg-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.cfg-hint { font-size: .72rem; color: var(--text-muted); margin: 0; line-height: 1.5; }
.field-group { display: flex; flex-direction: column; gap: 5px; }
.hint { font-weight: 400; color: var(--text-muted); }

.cfg-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 18px; border-top: 1px solid var(--border);
}
.btn-cancel {
  padding: 7px 16px; border-radius: 9px; font-size: .78rem;
  background: var(--panel2); border: 1.5px solid var(--border);
  color: var(--text-soft); cursor: pointer;
  font-family: 'Fira Sans', system-ui, sans-serif;
}
.btn-save {
  padding: 7px 18px; border-radius: 9px; font-size: .78rem; font-weight: 600;
  background: linear-gradient(135deg,#15803d,#16a34a);
  border: none; color: #fff; cursor: pointer;
  font-family: 'Fira Sans', system-ui, sans-serif;
  transition: opacity .15s;
}
.btn-save:disabled { opacity: .6; }

.update-section {
  border-top: 1px solid var(--border);
  padding: 14px 18px;
  display: flex; flex-direction: column; gap: 10px;
}
.update-title {
  display: flex; align-items: center; gap: 6px;
  font-size: .72rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .06em;
}
.btn-update {
  padding: 7px 16px; border-radius: 9px; font-size: .78rem; font-weight: 600;
  background: #1e40af; border: none; color: #fff; cursor: pointer;
  font-family: 'Fira Sans', system-ui, sans-serif;
  transition: opacity .15s; align-self: flex-start;
}
.btn-update:hover { opacity: .88; }
.update-progress {
  display: flex; align-items: center; gap: 8px;
  font-size: .75rem; color: var(--text-muted);
}
.spin-dot {
  width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid #1e40af; border-top-color: transparent;
  display: inline-block; flex-shrink: 0;
  animation: spin .7s linear infinite;
}
.update-ok  { font-size: .75rem; color: #16a34a; font-weight: 600; }
.update-err { font-size: .72rem; color: #dc2626; }

.colab-list { display: flex; flex-direction: column; gap: 4px; }
.colab-row  { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 8px; background: var(--panel2); }
.colab-nombre { font-size: .78rem; color: var(--text); }
.btn-del-colab {
  display: flex; align-items: center; padding: 3px; border-radius: 5px;
  background: none; border: none; color: var(--text-muted); cursor: pointer;
}
.btn-del-colab:hover { color: #dc2626; }
.colab-add-row { display: flex; gap: 6px; align-items: center; }
.btn-add-colab {
  padding: 6px 12px; border-radius: 9px; font-size: .75rem; font-weight: 600;
  background: #15803d; border: none; color: #fff; cursor: pointer; font-family: inherit;
  white-space: nowrap;
}
.btn-add-colab:disabled { opacity: .5; cursor: default; }

.articulo-chip {
  font-size: .72rem; color: #15803d; background: #dcfce7;
  border-radius: 8px; padding: 4px 8px; line-height: 1.4;
}
.msg-ok-sm { font-size: .73rem; color: #16a34a; font-weight: 600; }
</style>
