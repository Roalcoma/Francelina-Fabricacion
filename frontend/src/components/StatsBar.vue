<script setup lang="ts">
import type { Stats } from '../composables/useFabApi'

defineProps<{ stats: Stats | null }>()

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  const v = Number(n)
  return Number.isInteger(v) ? v.toLocaleString('es-PY') : v.toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}
</script>

<template>
  <div class="stats-grid">
    <div class="stat-card" style="--ac: var(--text-soft)">
      <div class="stat-label">Órdenes hoy</div>
      <div class="stat-value mono" style="--sc: var(--text)">{{ stats?.total_ordenes ?? '—' }}</div>
    </div>
    <div class="stat-card" style="--ac: var(--accent)">
      <div class="stat-label">Unidades fabricadas</div>
      <div class="stat-value mono" style="--sc: var(--accent)">{{ fmt(stats?.total_unidades) }}</div>
    </div>
    <div class="stat-card" style="--ac: var(--sky)">
      <div class="stat-label">Productos distintos</div>
      <div class="stat-value mono" style="--sc: var(--sky)">{{ stats?.productos_distintos ?? '—' }}</div>
    </div>
    <div class="stat-card" style="--ac: var(--amber)">
      <div class="stat-label">Operarios activos</div>
      <div class="stat-value mono" style="--sc: var(--amber)">{{ stats?.operarios_activos ?? '—' }}</div>
    </div>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.stat-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px 20px;
  position: relative;
  overflow: hidden;
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--ac, var(--accent));
  opacity: .7;
}
.stat-label {
  font-size: .68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .07em;
  font-weight: 600;
  margin-bottom: 8px;
}
.stat-value {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1;
  color: var(--sc, var(--text));
}

@media (max-width: 768px) {
  .stats-grid  { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat-card   { padding: 14px 16px; }
  .stat-value  { font-size: 1.4rem; }
}
</style>
