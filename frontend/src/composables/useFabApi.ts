// All API calls for the fabrication module

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts)
  if (!r.ok) {
    const e = await r.json().catch(() => ({})) as { error?: string }
    throw new Error(e.error || r.statusText)
  }
  return r.json()
}

export interface Receta   { CODARTICULO: number; DESCRIPCION: string; UNIDADMEDIDA: string; COMPONENTES: number; REFPROVEEDOR: string }
export interface Componente { LINEAKIT: number; CODARTKIT: number; DESCRIPCION: string; UDS_KIT: number; UNIDADMEDIDA: string }
export interface Operario  { CODVENDEDOR: number; NOMVENDEDOR: string }
export interface Almacen   { CODALMACEN: string; NOMBREALMACEN: string }
export interface Stats     { total_ordenes: number; total_unidades: number; productos_distintos: number; operarios_activos: number }
export interface Fabricacion { id: number; hora: string; codarticulo: number; descripcion: string; unidades: number; codvendedor: number; nombre_operario: string; codalmacen: string; observaciones: string; sin_stock: number; estado: 'pendiente' | 'aprobado' | 'cancelado' }
export interface ComponenteFab { codarticulo: number; descripcion: string; unidades_kit: number; unidades_total: number; stock_inicial: number | null; merma_pct: number }
export interface StockItem      { CODARTICULO: number; STOCK: number }
export interface AuthUser       { CODUSUARIO: number; USUARIO: string; CODVENDEDOR: number; rol: 'personal' | 'admin' }
export interface UserConfig     { almacen_origen: string; almacen_destino: string }
export interface Seccion { NUMSECCION: number; DESCRIPCION: string }
export interface Area { id: number; nombre: string; numseccion: number; codvendedor: number; familia_desc?: string | null; rol?: string }
export interface UsuarioAdmin { codvendedor: number; usuario: string; rol: string; nombre_area: string; familia_desc: string | null; almacen_origen: string; almacen_destino: string }
export interface Colaborador { id: number; nombre: string }
export interface Merma { id: number; hora: string; codarticulo: number; descripcion: string; cantidad: number; motivo: string; codvendedor: number; nombre_operario: string }
export interface StockRecetasRow { codarticulo: number; descripcion: string; total: number; alm: Record<string, number> }
export interface StockRecetasResp { cols: string[]; rows: StockRecetasRow[] }

export const fabApi = {
  secciones:     () => apiFetch<Seccion[]>('/fab/secciones'),
  familias:      () => apiFetch<string[]>('/fab/familias'),
  areas:         () => apiFetch<Area[]>('/fab/areas'),
  areaUsuario:   (codvendedor: number) => apiFetch<Area | null>(`/fab/areas/usuario?codvendedor=${codvendedor}`),
  crearArea:     (body: { nombre: string; numseccion: number; codvendedor: number; familia_desc?: string | null }) =>
    apiFetch<{ ok: boolean; id: number }>('/fab/areas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  eliminarArea:  (id: number) => apiFetch<{ ok: boolean }>(`/fab/areas/${id}`, { method: 'DELETE' }),
  recetas:      (familia?: string | null) =>
    apiFetch<Receta[]>(`/fab/recetas${familia ? `?familia=${encodeURIComponent(familia)}` : ''}`),
  receta:       (id: number)         => apiFetch<{ producto: Receta; componentes: Componente[] }>(`/fab/receta/${id}`),
  operarios:    ()                   => apiFetch<Operario[]>('/fab/operarios'),
  almacenes:    ()                   => apiFetch<Almacen[]>('/fab/almacenes'),
  stats:        (fecha: string)      => apiFetch<Stats>(`/fab/stats?fecha=${fecha}`),
  fabricaciones:(fecha: string, codvendedor?: number) => {
    let url = `/fab/fabricaciones?fecha=${fecha}`
    if (codvendedor) url += `&codvendedor=${codvendedor}`
    return apiFetch<Fabricacion[]>(url)
  },
  componentes:  (id: number)         => apiFetch<ComponenteFab[]>(`/fab/fabricacion/${id}/componentes`),
  stock:        (codalmacen: string, articulos: string) =>
    apiFetch<StockItem[]>(`/fab/stock?codalmacen=${encodeURIComponent(codalmacen)}&articulos=${encodeURIComponent(articulos)}`),
  adminUsuarios: () => apiFetch<UsuarioAdmin[]>('/fab/admin/usuarios'),
  actualizarUsuarioAdmin: (codvendedor: number, body: Omit<UsuarioAdmin, 'codvendedor' | 'usuario'>) =>
    apiFetch<{ ok: boolean }>(`/fab/admin/usuarios/${codvendedor}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  login:        (clave: string) =>
    apiFetch<{ CODUSUARIO: number; USUARIO: string; CODVENDEDOR: number }>('/fab/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave }),
    }),
  merma:        (codarticulo: number) =>
    apiFetch<{ codartkit: number; merma_pct: number }[]>(`/fab/merma/${codarticulo}`),
  getConfig:    (codvendedor: number) =>
    apiFetch<UserConfig>(`/fab/config?codvendedor=${codvendedor}`),
  saveConfig:   (body: { codvendedor: number; almacen_origen: string; almacen_destino: string }) =>
    apiFetch<{ ok: boolean }>('/fab/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  stockRecetas: () =>
    apiFetch<StockRecetasResp>('/fab/stock-recetas'),
  colaboradores: (codvendedor: number) => apiFetch<Colaborador[]>(`/fab/colaboradores?codvendedor=${codvendedor}`),
  agregarColaborador: (codvendedor: number, nombre: string) =>
    apiFetch<{ ok: boolean; id: number }>('/fab/colaboradores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codvendedor, nombre }) }),
  eliminarColaborador: (id: number) => apiFetch<{ ok: boolean }>(`/fab/colaboradores/${id}`, { method: 'DELETE' }),
  mermas: (fecha: string) => apiFetch<Merma[]>(`/fab/mermas?fecha=${fecha}`),
  registrarMerma: (body: { codarticulo: number; descripcion: string; cantidad: number; motivo: string; codvendedor: number; nombre_operario: string }) =>
    apiFetch<{ ok: boolean; id: number; hora: string }>('/fab/mermas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  setEstado: (id: number, estado: 'pendiente' | 'aprobado' | 'cancelado') =>
    apiFetch<{ ok: boolean }>(`/fab/fabricaciones/${id}/estado`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) }),
  update: (url: string) =>
    apiFetch<{ ok: boolean; mensaje: string }>('/fab/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }),
  stockResumen: (codalmacen: string, desde: string, hasta: string) =>
    apiFetch<{ codarticulo: number; descripcion: string; stock_actual: number; consumido: number; stock_resultante: number }[]>(
      `/fab/stock-resumen?codalmacen=${encodeURIComponent(codalmacen)}&desde=${desde}&hasta=${hasta}`
    ),
  dashboard:    (desde: string, hasta: string) =>
    apiFetch<{ porDia: any[]; porProducto: any[]; porOperario: any[]; ingredientes: any[] }>(
      `/fab/dashboard?desde=${desde}&hasta=${hasta}`
    ),
  registrar:    (body: object)       => apiFetch<{ ok: boolean; id: number }>('/fab/fabricaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
}
