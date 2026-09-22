<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fabApi, type UsuarioAdmin, type Almacen, type Colaborador } from '../composables/useFabApi'

const usuarios  = ref<UsuarioAdmin[]>([])
const almacenes = ref<Almacen[]>([])
const familias  = ref<string[]>([])
const guardando = ref<number | null>(null)
const editando  = ref<Record<number, UsuarioAdmin>>({})
const msg       = ref<{ id: number; ok: boolean; text: string } | null>(null)
const cargando  = ref(false)
const errorCarga = ref('')

// ── colaboradores por área ───────────────────────────────
const areaExpandida   = ref<number | null>(null)
const colabsArea      = ref<Colaborador[]>([])
const nuevoColab      = ref('')
const cargandoColabs  = ref(false)

async function toggleColabs(area_id: number | null) {
  if (!area_id || areaExpandida.value === area_id) { areaExpandida.value = null; return }
  areaExpandida.value = area_id
  cargandoColabs.value = true
  try { colabsArea.value = await fabApi.colaboradores(area_id) } finally { cargandoColabs.value = false }
}

async function agregarColab(area_id: number) {
  const nombre = nuevoColab.value.trim()
  if (!nombre) return
  const { id } = await fabApi.agregarColaborador(area_id, nombre)
  colabsArea.value.push({ id, nombre })
  nuevoColab.value = ''
}

async function eliminarColab(id: number) {
  await fabApi.eliminarColaborador(id)
  colabsArea.value = colabsArea.value.filter(c => c.id !== id)
}

async function cargar() {
  cargando.value = true
  errorCarga.value = ''
  try {
    const u = await fabApi.adminUsuarios()
    usuarios.value = u
    for (const row of u) editando.value[row.codvendedor] = { ...row }
    fabApi.familias().then(f  => { familias.value  = f }).catch(() => {})
    fabApi.almacenes().then(a => { almacenes.value = a }).catch(() => {})
  } catch (e: any) {
    errorCarga.value = e.message
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

async function guardar(cv: number) {
  guardando.value = cv
  msg.value = null
  try {
    await fabApi.actualizarUsuarioAdmin(cv, editando.value[cv])
    const idx = usuarios.value.findIndex(u => u.codvendedor === cv)
    if (idx >= 0) usuarios.value[idx] = { ...editando.value[cv], codvendedor: cv, usuario: usuarios.value[idx].usuario }
    msg.value = { id: cv, ok: true, text: 'Guardado' }
  } catch (e: any) {
    msg.value = { id: cv, ok: false, text: e.message }
  } finally {
    guardando.value = null
    setTimeout(() => { if (msg.value?.id === cv) msg.value = null }, 2500)
  }
}
</script>

<template>
  <div class="admin-wrap">
    <div class="admin-header">
      <h2 class="admin-title">Gestión de Usuarios</h2>
      <p class="admin-sub">Configura el rol, área y almacenes de cada operario.</p>
    </div>

    <div v-if="cargando" class="admin-estado">Cargando…</div>
    <div v-else-if="errorCarga" class="admin-estado error">
      {{ errorCarga }}
      <button class="btn-retry" @click="cargar">Reintentar</button>
    </div>

    <div v-else class="tabla-wrap">
      <table class="tabla">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Área</th>
            <th>Familia</th>
            <th>Almacén origen</th>
            <th>Almacén destino</th>
            <th>Colaboradores</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="u in usuarios" :key="u.codvendedor">
          <tr>
            <td class="td-user">{{ u.usuario }}</td>

            <td>
              <select v-model="editando[u.codvendedor].rol" class="cell-input cell-select">
                <option value="personal">Personal</option>
                <option value="admin">Admin</option>
              </select>
            </td>

            <td>
              <input v-model="editando[u.codvendedor].nombre_area" class="cell-input" placeholder="Nombre área"/>
            </td>

            <td>
              <select v-model="editando[u.codvendedor].familia_desc" class="cell-input cell-select">
                <option :value="null">Sin filtro</option>
                <option v-for="f in familias" :key="f" :value="f">{{ f }}</option>
              </select>
            </td>

            <td>
              <select v-model="editando[u.codvendedor].almacen_origen" class="cell-input cell-select">
                <option value="">—</option>
                <option v-for="a in almacenes" :key="a.CODALMACEN" :value="a.CODALMACEN">{{ a.CODALMACEN }} — {{ a.NOMBREALMACEN }}</option>
              </select>
            </td>

            <td>
              <select v-model="editando[u.codvendedor].almacen_destino" class="cell-input cell-select">
                <option value="">—</option>
                <option v-for="a in almacenes" :key="a.CODALMACEN" :value="a.CODALMACEN">{{ a.CODALMACEN }} — {{ a.NOMBREALMACEN }}</option>
              </select>
            </td>

            <td>
              <button
                v-if="u.area_id"
                class="btn-colabs"
                :class="{ active: areaExpandida === u.area_id }"
                @click="toggleColabs(u.area_id)"
              >{{ areaExpandida === u.area_id ? '▲' : '▼' }} {{ u.area_id ? '' : '—' }}</button>
              <span v-else class="text-muted">Sin área</span>
            </td>

            <td class="td-action">
              <span v-if="msg?.id === u.codvendedor" :class="['msg', msg.ok ? 'ok' : 'err']">{{ msg.text }}</span>
              <button class="btn-save" :disabled="guardando === u.codvendedor" @click="guardar(u.codvendedor)">
                {{ guardando === u.codvendedor ? '…' : 'Guardar' }}
              </button>
            </td>
          </tr>

          <tr v-if="areaExpandida === u.area_id && u.area_id" class="colab-row">
            <td colspan="8" class="colab-cell">
              <div class="colab-panel">
                <span v-if="cargandoColabs" class="colab-empty">Cargando…</span>
                <template v-else>
                  <div v-if="!colabsArea.length" class="colab-empty">Sin colaboradores</div>
                  <span v-for="c in colabsArea" :key="c.id" class="colab-chip">
                    {{ c.nombre }}
                    <button class="btn-del-colab" @click="eliminarColab(c.id)">×</button>
                  </span>
                  <div class="colab-add">
                    <input v-model="nuevoColab" class="cell-input colab-input" placeholder="Nuevo colaborador…"
                      @keydown.enter="agregarColab(u.area_id!)"/>
                    <button class="btn-save" @click="agregarColab(u.area_id!)">+</button>
                  </div>
                </template>
              </div>
            </td>
          </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.admin-wrap   { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.admin-header { display: flex; flex-direction: column; gap: 4px; }
.admin-title  { font-size: .95rem; font-weight: 700; color: var(--text); margin: 0; }
.admin-sub    { font-size: .75rem; color: var(--text-muted); margin: 0; }

.tabla-wrap { overflow-x: auto; border-radius: 14px; border: 1.5px solid var(--border); }
.tabla { width: 100%; border-collapse: collapse; font-size: .78rem; }
.tabla th {
  background: var(--panel2); padding: 9px 12px; text-align: left;
  font-weight: 700; font-size: .7rem; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .05em;
  border-bottom: 1.5px solid var(--border);
}
.tabla td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.tabla tr:last-child td { border-bottom: none; }
.tabla tr:hover td { background: var(--panel2); }

.td-user   { font-weight: 600; color: var(--text); white-space: nowrap; }
.td-action { white-space: nowrap; display: flex; align-items: center; gap: 8px; }

.cell-input {
  padding: 5px 8px; border-radius: 8px; font-size: .77rem;
  border: 1.5px solid var(--border); background: var(--panel2);
  color: var(--text); font-family: inherit; width: 100%; box-sizing: border-box;
}
.cell-input:focus { outline: none; border-color: #16a34a; }
.cell-select { cursor: pointer; }

.btn-save {
  padding: 5px 12px; border-radius: 8px; font-size: .75rem; font-weight: 700;
  background: linear-gradient(135deg,#15803d,#16a34a);
  border: none; color: #fff; cursor: pointer; white-space: nowrap;
}
.btn-save:disabled { opacity: .6; cursor: wait; }

.msg    { font-size: .72rem; font-weight: 600; }
.msg.ok { color: #16a34a; }
.msg.err{ color: #dc2626; }
.admin-estado { padding: 40px; text-align: center; color: var(--text-muted); font-size: .83rem; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.admin-estado.error { color: #dc2626; }
.btn-retry { padding: 6px 14px; border-radius: 8px; border: 1.5px solid #dc2626; background: transparent; color: #dc2626; font-size: .75rem; cursor: pointer; }

.text-muted { font-size: .72rem; color: var(--text-muted); }

.btn-colabs {
  padding: 4px 10px; border-radius: 8px; font-size: .72rem; font-weight: 600;
  background: var(--panel2); border: 1.5px solid var(--border); color: var(--text-muted);
  cursor: pointer; transition: background .15s;
}
.btn-colabs.active, .btn-colabs:hover { background: #dcfce7; border-color: #16a34a; color: #15803d; }

.colab-row td { background: var(--panel2) !important; }
.colab-cell { padding: 12px 16px !important; }
.colab-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

.colab-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 999px; font-size: .72rem; font-weight: 600;
  background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;
}
.btn-del-colab {
  background: none; border: none; cursor: pointer; color: #15803d;
  font-size: .85rem; line-height: 1; padding: 0 2px;
}
.btn-del-colab:hover { color: #dc2626; }

.colab-add { display: flex; align-items: center; gap: 6px; }
.colab-input { width: 180px !important; }
.colab-empty { font-size: .72rem; color: var(--text-muted); font-style: italic; }
</style>
