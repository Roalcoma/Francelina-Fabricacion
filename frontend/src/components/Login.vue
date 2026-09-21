<script setup lang="ts">
import { ref } from 'vue'
import { fabApi } from '../composables/useFabApi'

const emit = defineEmits<{ (e: 'login', user: { CODUSUARIO: number; USUARIO: string }): void }>()

const clave   = ref('')
const loading = ref(false)
const error   = ref('')

async function ingresar() {
  if (!clave.value.trim()) { error.value = 'Ingresa tu clave'; return }
  loading.value = true
  error.value   = ''
  try {
    const user = await fabApi.login(clave.value)
    emit('login', user)
  } catch (e: any) {
    error.value = e.message || 'Clave incorrecta'
    clave.value = ''
  } finally { loading.value = false }
}
</script>

<template>
  <div class="login-shell">
    <div class="login-card">

      <!-- Logo -->
      <div class="logo-row">
        <div class="logo-badge">F</div>
        <div>
          <div class="logo-title">Fabricación</div>
          <div class="logo-sub">Árbol Áureo — Módulo de Recetas</div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Form -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <label class="field-label" for="clave">Clave de acceso</label>
          <input
            id="clave"
            v-model="clave"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            @keyup.enter="ingresar"
            :disabled="loading"
            style="font-size:.9rem;letter-spacing:.1em"
          />
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>

        <button class="btn-primary" :disabled="loading" @click="ingresar">
          {{ loading ? 'Verificando...' : 'Ingresar' }}
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.login-shell {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.login-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 36px 32px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 4px 24px rgba(22,163,74,.08), 0 1px 4px rgba(0,0,0,.06);
}

.logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}
.logo-badge {
  width: 44px; height: 44px;
  background: linear-gradient(135deg, #15803d, #16a34a);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Fira Code', monospace;
  font-weight: 700; font-size: 1.1rem; color: #fff;
  box-shadow: 0 4px 14px rgba(22,163,74,.3);
  flex-shrink: 0;
}
.logo-title { font-weight: 700; font-size: 1rem; color: var(--text); line-height: 1.2; }
.logo-sub   { font-size: .7rem; color: var(--text-muted); margin-top: 2px; }

.divider {
  height: 1px;
  background: var(--border);
  margin-bottom: 24px;
}

.error-msg {
  font-size: .775rem;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 10px;
  padding: 8px 12px;
  text-align: center;
}
</style>
