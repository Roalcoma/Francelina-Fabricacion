import { Router, Request, Response } from 'express';
import * as sql from 'mssql';
import { getPool } from '../config/db';
import { encriptacion } from '../utils/encriptacion';
import { exec } from 'child_process';
import * as path from 'path';

export const fabRouter = Router();

const LOCO        = process.env.FAB_LOCO_DB     || 'LOCO';
const FAB         = process.env.FAB_DB          || 'FABRICACION';
const USUARIOS_DB = process.env.FAB_USUARIOS_DB || LOCO;

export async function migrateFab() {
    const pool = await getPool(FAB);
    await pool.request().query(`
        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('fabricaciones_componentes') AND name = 'stock_inicial'
        )
        ALTER TABLE fabricaciones_componentes ADD stock_inicial FLOAT NULL;

        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('fabricaciones') AND name = 'sin_stock'
        )
        ALTER TABLE fabricaciones ADD sin_stock BIT NOT NULL DEFAULT 0;

        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('fabricaciones') AND name = 'estado'
        )
        ALTER TABLE fabricaciones ADD estado VARCHAR(10) NOT NULL DEFAULT 'pendiente';

        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('fabricaciones') AND name = 'codalmacen_destino'
        )
        ALTER TABLE fabricaciones ADD codalmacen_destino VARCHAR(10) NULL;

        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('fabricaciones') AND name = 'HASHID'
        )
        ALTER TABLE fabricaciones ADD HASHID NVARCHAR(40) NOT NULL DEFAULT CONVERT(NVARCHAR(40), NEWID());

        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('fabricaciones_componentes') AND name = 'merma_pct'
        )
        ALTER TABLE fabricaciones_componentes ADD merma_pct FLOAT NOT NULL DEFAULT 0;

        IF OBJECT_ID('merma_recetas') IS NULL
        CREATE TABLE merma_recetas (
            codarticulo INT NOT NULL,
            codartkit   INT NOT NULL,
            merma_pct   FLOAT NOT NULL DEFAULT 0,
            PRIMARY KEY (codarticulo, codartkit)
        );

        IF OBJECT_ID('configuracion_usuarios') IS NULL
        CREATE TABLE configuracion_usuarios (
            codvendedor     INT          PRIMARY KEY,
            almacen_origen  VARCHAR(10)  NULL,
            almacen_destino VARCHAR(10)  NULL
        );

        IF OBJECT_ID('areas') IS NULL
        CREATE TABLE areas (
            id           INT IDENTITY PRIMARY KEY,
            nombre       NVARCHAR(100) NOT NULL,
            numseccion   INT           NOT NULL,
            codvendedor  INT           NOT NULL,
            activo       BIT           NOT NULL DEFAULT 1,
            familia_desc NVARCHAR(100) NULL
        );

        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('areas') AND name = 'familia_desc'
        )
        ALTER TABLE areas ADD familia_desc NVARCHAR(100) NULL;

        IF NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('areas') AND name = 'rol'
        )
        ALTER TABLE areas ADD rol NVARCHAR(20) NOT NULL DEFAULT 'personal';

        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('areas') AND name = 'numdpto'
        ) AND NOT EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('areas') AND name = 'numseccion'
        )
        EXEC sp_rename 'areas.numdpto', 'numseccion', 'COLUMN';

        IF OBJECT_ID('colaboradores') IS NULL
        CREATE TABLE colaboradores (
            id          INT IDENTITY PRIMARY KEY,
            codvendedor INT           NOT NULL,
            nombre      NVARCHAR(100) NOT NULL,
            activo      BIT           NOT NULL DEFAULT 1
        );

        IF NOT EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME='colaboradores' AND COLUMN_NAME='area_id'
        )
        BEGIN
            ALTER TABLE colaboradores ADD area_id INT NULL;
            UPDATE c SET c.area_id = a.id
            FROM colaboradores c JOIN areas a ON a.codvendedor=c.codvendedor AND a.activo=1;
        END

        IF OBJECT_ID('mermas') IS NULL
        CREATE TABLE mermas (
            id              INT IDENTITY PRIMARY KEY,
            fecha           DATE         NOT NULL DEFAULT GETDATE(),
            hora            TIME         NOT NULL DEFAULT GETDATE(),
            codarticulo     INT          NOT NULL,
            descripcion     NVARCHAR(200) NOT NULL,
            cantidad        FLOAT        NOT NULL,
            motivo          NVARCHAR(300) NOT NULL,
            codvendedor     INT          NOT NULL,
            nombre_operario NVARCHAR(100) NOT NULL
        );
    `);
}

// ── helpers ───────────────────────────────────────────────
function wrap(fn: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
        try { await fn(req, res); }
        catch (e: any) { res.status(500).json({ error: e.message }); }
    };
}

// ── POST /fab/login ───────────────────────────────────────
fabRouter.post('/login', wrap(async (req, res) => {
    const { clave } = req.body as { clave: string };
    if (!clave) return void res.status(400).json({ error: 'Clave requerida' });

    const enc  = encriptacion.encriptar(clave);
    const pool = await getPool(USUARIOS_DB);
    const r = await pool.request()
        .input('enc', sql.NVarChar(200), enc)
        .query(`
            SELECT TOP 1 CODUSUARIO, USUARIO, CODUSUARIO AS CODVENDEDOR
            FROM USUARIOS
            WHERE (NEWPASS = @enc OR PASS = @enc)
              AND ISNULL(BLOQUEADO,'F') != 'T'
              AND ISNULL(DESCATALOGADO,'F') != 'T'
        `);

    if (!r.recordset.length) return void res.status(401).json({ error: 'Clave incorrecta' });
    const user = r.recordset[0];
    const fabPool = await getPool(FAB);
    const rolR = await fabPool.request()
        .input('cv', sql.Int, user.CODVENDEDOR)
        .query(`SELECT TOP 1 ISNULL(rol,'personal') AS rol FROM areas WHERE codvendedor=@cv AND activo=1`);
    res.json({ ...user, rol: rolR.recordset[0]?.rol ?? 'personal' });
}));

// ── GET /fab/recetas?buscar=&familia= ────────────────────
fabRouter.get('/recetas', wrap(async (req, res) => {
    const familia = (req.query.familia as string) || null;
    const pool    = await getPool(LOCO);
    const rq = pool.request();
    if (familia) rq.input('fam', sql.NVarChar(100), familia);
    const r = await rq.query(`
        SELECT a.CODARTICULO, a.DESCRIPCION, a.UNIDADMEDIDA,
               ISNULL((SELECT TOP 1 al.CODBARRAS FROM ARTICULOSLIN al WHERE al.CODARTICULO=a.CODARTICULO),'') AS REFPROVEEDOR,
               COUNT(k.CODARTKIT) AS COMPONENTES
        FROM ARTICULOS a
        JOIN KITS k ON k.CODARTICULO=a.CODARTICULO AND k.TALLA='.' AND k.COLOR='.'
        WHERE a.ESKIT='T'
          AND ISNULL(a.DESCATALOGADO,'F') != 'T'
          ${familia ? `AND EXISTS (SELECT 1 FROM FAMILIAS f WHERE f.NUMFAMILIA=a.FAMILIA AND UPPER(f.DESCRIPCION)=UPPER(@fam))` : ''}
        GROUP BY a.CODARTICULO, a.DESCRIPCION, a.UNIDADMEDIDA
        ORDER BY a.DESCRIPCION
    `);
    res.json(r.recordset);
}));

// ── GET /fab/receta/:id ───────────────────────────────────
fabRouter.get('/receta/:id', wrap(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return void res.status(400).json({ error: 'id inválido' });

    const pool = await getPool(LOCO);

    const [artR, compR] = await Promise.all([
        pool.request().input('id', sql.Int, id)
            .query(`SELECT CODARTICULO, DESCRIPCION, UNIDADMEDIDA FROM ARTICULOS WHERE CODARTICULO=@id AND ESKIT='T'`),
        pool.request().input('id', sql.Int, id)
            .query(`
                SELECT k.LINEAKIT, k.CODARTKIT, ak.DESCRIPCION, k.UNIDADES AS UDS_KIT, ak.UNIDADMEDIDA
                FROM KITS k
                JOIN ARTICULOS ak ON ak.CODARTICULO=k.CODARTKIT
                WHERE k.CODARTICULO=@id AND k.TALLA='.' AND k.COLOR='.'
                ORDER BY k.LINEAKIT
            `),
    ]);

    if (!artR.recordset.length) return void res.status(404).json({ error: 'Receta no encontrada' });

    res.json({ producto: artR.recordset[0], componentes: compR.recordset });
}));

// ── GET /fab/operarios ────────────────────────────────────
fabRouter.get('/operarios', wrap(async (req, res) => {
    const pool = await getPool(LOCO);
    const r = await pool.request().query(`
        SELECT CODVENDEDOR, NOMVENDEDOR FROM VENDEDORES
        WHERE ISNULL(BLOQUEADO,'F')='F'
        ORDER BY NOMVENDEDOR
    `);
    res.json(r.recordset);
}));

// ── GET /fab/stock?codalmacen=X&articulos=1,2,3 ───────────
fabRouter.get('/stock', wrap(async (req, res) => {
    const codalmacen = req.query.codalmacen as string;
    const ids = (req.query.articulos as string || '').split(',').map(Number).filter(n => n > 0);
    if (!codalmacen || !ids.length) return void res.json([]);
    const pool = await getPool(LOCO);
    const r = await pool.request()
        .input('alm', sql.VarChar(10), codalmacen)
        .query(`
            SELECT CODARTICULO, SUM(ISNULL(STOCK, 0)) AS STOCK
            FROM STOCKS
            WHERE CODALMACEN = @alm AND TALLA='.' AND COLOR='.'
              AND CODARTICULO IN (${ids.join(',')})
            GROUP BY CODARTICULO
        `);
    res.json(r.recordset);
}));

// ── GET /fab/almacenes ────────────────────────────────────
fabRouter.get('/almacenes', wrap(async (req, res) => {
    const pool = await getPool(LOCO);
    const r = await pool.request().query(`SELECT CODALMACEN, NOMBREALMACEN FROM ALMACEN ORDER BY CODALMACEN`);
    res.json(r.recordset);
}));

// ── GET /fab/stats?fecha= ─────────────────────────────────
fabRouter.get('/stats', wrap(async (req, res) => {
    const fecha = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const pool  = await getPool(FAB);
    const r = await pool.request()
        .input('f', sql.Date, fecha)
        .query(`
            SELECT
                COUNT(*)                    AS total_ordenes,
                ISNULL(SUM(unidades),0)     AS total_unidades,
                COUNT(DISTINCT codarticulo) AS productos_distintos,
                COUNT(DISTINCT codvendedor) AS operarios_activos
            FROM fabricaciones WHERE fecha=@f
        `);
    res.json(r.recordset[0]);
}));

// ── GET /fab/fabricaciones?fecha=&codvendedor= ────────────
fabRouter.get('/fabricaciones', wrap(async (req, res) => {
    const fecha       = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const codvendedor = req.query.codvendedor ? parseInt(req.query.codvendedor as string) : null;
    const pool        = await getPool(FAB);

    const rq = pool.request().input('f', sql.Date, fecha);
    if (codvendedor !== null) rq.input('v', sql.Int, codvendedor);

    const r = await rq.query(`
        SELECT f.id, f.hora, f.codarticulo, f.descripcion, f.unidades,
               f.codvendedor, f.nombre_operario, f.codalmacen, f.observaciones,
               ISNULL(f.sin_stock, 0) AS sin_stock,
               ISNULL(f.estado, 'pendiente') AS estado
        FROM fabricaciones f
        WHERE f.fecha=@f
          ${codvendedor !== null ? 'AND f.codvendedor=@v' : ''}
        ORDER BY f.hora DESC
    `);
    res.json(r.recordset);
}));

// ── PATCH /fab/fabricaciones/:id/estado ──────────────────
fabRouter.patch('/fabricaciones/:id/estado', wrap(async (req, res) => {
    const id     = parseInt(req.params.id as string);
    const estado = (req.body as { estado: string }).estado;
    if (!['pendiente', 'aprobado', 'cancelado'].includes(estado))
        return void res.status(400).json({ error: 'Estado inválido' });
    const pool = await getPool(FAB);
    await pool.request()
        .input('id',     sql.Int,        id)
        .input('estado', sql.VarChar(10), estado)
        .query(`UPDATE fabricaciones SET estado=@estado WHERE id=@id`);
    res.json({ ok: true });
}));

// ── GET /fab/fabricacion/:id/componentes ──────────────────
fabRouter.get('/fabricacion/:id/componentes', wrap(async (req, res) => {
    const id   = parseInt(req.params.id as string);
    const pool = await getPool(FAB);
    const r = await pool.request()
        .input('id', sql.Int, id)
        .query(`SELECT codarticulo, descripcion, unidades_kit, unidades_total, stock_inicial, ISNULL(merma_pct,0) AS merma_pct FROM fabricaciones_componentes WHERE id_fabricacion=@id ORDER BY id`);
    res.json(r.recordset);
}));

// ── GET /fab/dashboard?desde=&hasta= ─────────────────────
fabRouter.get('/dashboard', wrap(async (req, res) => {
    const hoy   = new Date().toISOString().split('T')[0];
    const desde = (req.query.desde as string) || hoy;
    const hasta = (req.query.hasta as string) || hoy;
    const pool  = await getPool(FAB);
    const r = await pool.request()
        .input('d', sql.Date, desde)
        .input('h', sql.Date, hasta)
        .query(`
            SELECT CONVERT(varchar,fecha,23) AS fecha, COUNT(*) AS ordenes, ISNULL(SUM(unidades),0) AS unidades
            FROM fabricaciones WHERE fecha BETWEEN @d AND @h GROUP BY fecha ORDER BY fecha;

            SELECT descripcion, COUNT(*) AS ordenes, ISNULL(SUM(unidades),0) AS unidades
            FROM fabricaciones WHERE fecha BETWEEN @d AND @h GROUP BY descripcion ORDER BY SUM(unidades) DESC;

            SELECT ISNULL(nombre_operario,'Sin nombre') AS nombre_operario, COUNT(*) AS ordenes, ISNULL(SUM(unidades),0) AS unidades
            FROM fabricaciones WHERE fecha BETWEEN @d AND @h GROUP BY nombre_operario ORDER BY COUNT(*) DESC;

            SELECT fc.descripcion, SUM(fc.unidades_total) AS total_consumido
            FROM fabricaciones_componentes fc
            JOIN fabricaciones f ON f.id = fc.id_fabricacion
            WHERE f.fecha BETWEEN @d AND @h
            GROUP BY fc.descripcion ORDER BY SUM(fc.unidades_total) DESC;
        `);
    const rs = r.recordsets as any[];
    res.json({
        porDia:       rs[0],
        porProducto:  rs[1],
        porOperario:  rs[2],
        ingredientes: rs[3],
    });
}));

// ── GET /fab/stock-resumen?codalmacen=&desde=&hasta= ──────
fabRouter.get('/stock-resumen', wrap(async (req, res) => {
    const codalmacen = (req.query.codalmacen as string) || '';
    const hoy   = new Date().toISOString().split('T')[0];
    const desde = (req.query.desde as string) || hoy;
    const hasta = (req.query.hasta as string) || hoy;

    if (!codalmacen) return void res.json([]);

    // 1. consumido por ingrediente en el período (dbfabricacion)
    const fabPool = await getPool(FAB);
    const consumido = await fabPool.request()
        .input('alm', sql.NVarChar(10), codalmacen)
        .input('d',   sql.Date,         desde)
        .input('h',   sql.Date,         hasta)
        .query(`
            SELECT fc.codarticulo, fc.descripcion, SUM(fc.unidades_total) AS consumido
            FROM fabricaciones_componentes fc
            JOIN fabricaciones f ON f.id = fc.id_fabricacion
            WHERE f.codalmacen = @alm AND f.fecha BETWEEN @d AND @h
            GROUP BY fc.codarticulo, fc.descripcion
        `);

    if (!consumido.recordset.length) return void res.json([]);

    // 2. stock actual en ICG para esos artículos
    const ids = consumido.recordset.map(r => r.codarticulo).join(',');
    const locoPool = await getPool(LOCO);
    const stocks = await locoPool.request()
        .input('alm', sql.VarChar(10), codalmacen)
        .query(`
            SELECT CODARTICULO, SUM(ISNULL(STOCK,0)) AS stock_actual
            FROM STOCKS
            WHERE CODALMACEN = @alm AND TALLA='.' AND COLOR='.'
              AND CODARTICULO IN (${ids})
            GROUP BY CODARTICULO
        `);

    const stockMap: Record<number, number> = {};
    for (const s of stocks.recordset) stockMap[s.CODARTICULO] = Number(s.stock_actual);

    const result = consumido.recordset.map(r => ({
        codarticulo:    r.codarticulo,
        descripcion:    r.descripcion,
        stock_actual:   stockMap[r.codarticulo] ?? 0,
        consumido:      Number(r.consumido),
        stock_resultante: (stockMap[r.codarticulo] ?? 0) - Number(r.consumido),
    }));

    res.json(result);
}));

// ── GET /fab/merma/:codarticulo ───────────────────────────
fabRouter.get('/merma/:codarticulo', wrap(async (req, res) => {
    const ca = parseInt(req.params.codarticulo as string);
    if (isNaN(ca)) return void res.json([]);
    const pool = await getPool(FAB);
    const r = await pool.request()
        .input('ca', sql.Int, ca)
        .query(`SELECT codartkit, merma_pct FROM merma_recetas WHERE codarticulo=@ca`);
    res.json(r.recordset);
}));

// ── GET /fab/config?codvendedor= ──────────────────────────
fabRouter.get('/config', wrap(async (req, res) => {
    const cv = parseInt(req.query.codvendedor as string);
    if (isNaN(cv)) return void res.json({ almacen_origen: '', almacen_destino: '' });
    const pool = await getPool(FAB);
    const r = await pool.request()
        .input('cv', sql.Int, cv)
        .query(`SELECT almacen_origen, almacen_destino FROM configuracion_usuarios WHERE codvendedor=@cv`);
    res.json(r.recordset[0] ?? { almacen_origen: '', almacen_destino: '' });
}));

// ── POST /fab/config ──────────────────────────────────────
fabRouter.post('/config', wrap(async (req, res) => {
    const { codvendedor, almacen_origen, almacen_destino } = req.body as {
        codvendedor: number; almacen_origen: string; almacen_destino: string;
    };
    const pool = await getPool(FAB);
    await pool.request()
        .input('cv', sql.Int,        codvendedor)
        .input('ao', sql.VarChar(10), almacen_origen  || '')
        .input('ad', sql.VarChar(10), almacen_destino || '')
        .query(`
            MERGE configuracion_usuarios AS t
            USING (SELECT @cv AS codvendedor) AS s ON t.codvendedor = s.codvendedor
            WHEN MATCHED     THEN UPDATE SET almacen_origen=@ao, almacen_destino=@ad
            WHEN NOT MATCHED THEN INSERT (codvendedor, almacen_origen, almacen_destino) VALUES (@cv,@ao,@ad);
        `);
    res.json({ ok: true });
}));

// ── GET /fab/stock-recetas ────────────────────────────────
fabRouter.get('/stock-recetas', wrap(async (req, res) => {
    const pool = await getPool(LOCO);
    const r = await pool.request().query(`
        SELECT a.CODARTICULO, a.DESCRIPCION, ISNULL(s.CODALMACEN,'') AS CODALMACEN,
               SUM(ISNULL(s.STOCK, 0)) AS stock
        FROM ARTICULOS a
        LEFT JOIN STOCKS s ON s.CODARTICULO=a.CODARTICULO AND s.TALLA='.' AND s.COLOR='.'
        WHERE a.ESKIT='T' AND ISNULL(a.DESCATALOGADO,'F') != 'T'
          AND EXISTS (SELECT 1 FROM KITS k WHERE k.CODARTICULO=a.CODARTICULO AND k.TALLA='.' AND k.COLOR='.')
        GROUP BY a.CODARTICULO, a.DESCRIPCION, s.CODALMACEN
        HAVING SUM(ISNULL(s.STOCK,0)) != 0
        ORDER BY a.DESCRIPCION, s.CODALMACEN
    `);

    const pivot: Record<number, { codarticulo: number; descripcion: string; total: number; alm: Record<string, number> }> = {};
    const colsSet = new Set<string>();

    for (const row of r.recordset) {
        if (!pivot[row.CODARTICULO])
            pivot[row.CODARTICULO] = { codarticulo: row.CODARTICULO, descripcion: row.DESCRIPCION, total: 0, alm: {} };
        if (row.CODALMACEN) {
            pivot[row.CODARTICULO].alm[row.CODALMACEN] = Number(row.stock);
            pivot[row.CODARTICULO].total += Number(row.stock);
            colsSet.add(row.CODALMACEN);
        }
    }

    res.json({ cols: [...colsSet].sort(), rows: Object.values(pivot) });
}));

// ── POST /fab/fabricaciones ───────────────────────────────
fabRouter.post('/fabricaciones', wrap(async (req, res) => {
    const { codarticulo, descripcion, unidades, codvendedor, nombre_operario, codalmacen, codalmacen_destino, observaciones, componentes } = req.body as {
        codarticulo: number; descripcion: string; unidades: number;
        codvendedor: number; nombre_operario: string; codalmacen: string; codalmacen_destino: string;
        observaciones: string; componentes: Array<{ CODARTKIT: number; DESCRIPCION: string; UDS_KIT: number; stock_inicial?: number | null; merma_pct?: number }>;
    };

    if (!codarticulo || !unidades || codvendedor == null) {
        return void res.status(400).json({ error: 'Faltan: codarticulo, unidades, codvendedor' });
    }

    // sin_stock: almacén seleccionado y algún ingrediente con stock insuficiente
    const sinStock = !!codalmacen && (componentes || []).some(c => {
        const si    = c.stock_inicial ?? 0;
        const merma = c.merma_pct ?? 0;
        return si < (c.UDS_KIT || 0) * unidades * (1 + merma / 100);
    });

    const pool = await getPool(FAB);
    const tx   = new sql.Transaction(pool as sql.ConnectionPool);
    await tx.begin();

    try {
        const ir = await new sql.Request(tx)
            .input('ca',  sql.Int,           codarticulo)
            .input('des', sql.NVarChar(40),  descripcion || '')
            .input('uds', sql.Float,         unidades)
            .input('cv',  sql.Int,           codvendedor)
            .input('nom', sql.NVarChar(100), nombre_operario || '')
            .input('alm', sql.NVarChar(3),   codalmacen || '')
            .input('ald', sql.NVarChar(10),  codalmacen_destino || '')
            .input('obs', sql.NVarChar(500), observaciones || '')
            .input('ss',  sql.Bit,           sinStock ? 1 : 0)
            .query(`
                INSERT INTO fabricaciones (codarticulo, descripcion, unidades, codvendedor, nombre_operario, codalmacen, codalmacen_destino, observaciones, sin_stock)
                OUTPUT INSERTED.id, INSERTED.hora
                VALUES (@ca, @des, @uds, @cv, @nom, @alm, @ald, @obs, @ss)
            `);

        const { id, hora } = ir.recordset[0];
        const fabPool = await getPool(FAB);

        for (const c of (componentes || [])) {
            const si       = c.stock_inicial != null ? c.stock_inicial : null;
            const merma    = c.merma_pct ?? 0;
            const uTot     = (c.UDS_KIT || 0) * unidades * (1 + merma / 100);
            await new sql.Request(tx)
                .input('ifab', sql.Int,          id)
                .input('ca',   sql.Int,          c.CODARTKIT)
                .input('des',  sql.NVarChar(40), c.DESCRIPCION || '')
                .input('ukit', sql.Float,        c.UDS_KIT || 0)
                .input('utot', sql.Float,        uTot)
                .input('si',   sql.Float,        si)
                .input('mp',   sql.Float,        merma)
                .query(`INSERT INTO fabricaciones_componentes (id_fabricacion, codarticulo, descripcion, unidades_kit, unidades_total, stock_inicial, merma_pct)
                        VALUES (@ifab, @ca, @des, @ukit, @utot, @si, @mp)`);

            // persistir config de merma para este componente
            await fabPool.request()
                .input('ca', sql.Int,   codarticulo)
                .input('ck', sql.Int,   c.CODARTKIT)
                .input('mp', sql.Float, merma)
                .query(`
                    MERGE merma_recetas AS t
                    USING (SELECT @ca AS codarticulo, @ck AS codartkit) AS s ON t.codarticulo=s.codarticulo AND t.codartkit=s.codartkit
                    WHEN MATCHED     THEN UPDATE SET merma_pct=@mp
                    WHEN NOT MATCHED THEN INSERT (codarticulo, codartkit, merma_pct) VALUES (@ca,@ck,@mp);
                `);
        }

        await tx.commit();
        res.json({ ok: true, id, hora });
    } catch (e) {
        await tx.rollback();
        throw e;
    }
}));

// ── GET /fab/secciones ────────────────────────────────────
fabRouter.get('/secciones', wrap(async (req, res) => {
    const pool = await getPool(LOCO);
    const r = await pool.request().query(`SELECT NUMSECCION, DESCRIPCION FROM SECCIONES WHERE NUMDPTO=2 ORDER BY NUMSECCION`);
    res.json(r.recordset);
}));

// ── GET /fab/familias ─────────────────────────────────────
fabRouter.get('/familias', wrap(async (req, res) => {
    const pool = await getPool(LOCO);
    const r = await pool.request().query(`
        SELECT DISTINCT DESCRIPCION FROM FAMILIAS
        WHERE ISNULL(DESCRIPCION,'') != ''
        ORDER BY DESCRIPCION
    `);
    res.json(r.recordset.map((row: any) => row.DESCRIPCION as string));
}));

// ── GET  /fab/areas ───────────────────────────────────────
fabRouter.get('/areas', wrap(async (req, res) => {
    const pool = await getPool(FAB);
    const r = await pool.request().query(`SELECT id, nombre, numseccion, codvendedor, familia_desc, ISNULL(rol,'personal') AS rol FROM areas WHERE activo=1 ORDER BY nombre`);
    res.json(r.recordset);
}));

// ── GET /fab/areas/usuario?codvendedor= ───────────────────
fabRouter.get('/areas/usuario', wrap(async (req, res) => {
    const cv   = parseInt(req.query.codvendedor as string);
    const pool = await getPool(FAB);
    const r    = await pool.request().input('cv', sql.Int, cv)
        .query(`SELECT TOP 1 id, nombre, numseccion, familia_desc, ISNULL(rol,'personal') AS rol FROM areas WHERE codvendedor=@cv AND activo=1`);
    res.json(r.recordset[0] || null);
}));

// ── POST /fab/areas ───────────────────────────────────────
fabRouter.post('/areas', wrap(async (req, res) => {
    const { nombre, numseccion, codvendedor, familia_desc, rol } = req.body as { nombre: string; numseccion?: number; codvendedor: number; familia_desc?: string; rol?: string };
    if (!nombre?.trim() || codvendedor == null)
        return void res.status(400).json({ error: 'nombre y codvendedor requeridos' });
    const pool = await getPool(FAB);
    await pool.request().input('cv', sql.Int, codvendedor)
        .query(`UPDATE areas SET activo=0 WHERE codvendedor=@cv`);
    const r = await pool.request()
        .input('nom', sql.NVarChar(100), nombre.trim())
        .input('sec', sql.Int, numseccion ?? 0)
        .input('cv',  sql.Int, codvendedor)
        .input('fam', sql.NVarChar(100), familia_desc?.trim() || null)
        .input('rol', sql.NVarChar(20),  rol || 'personal')
        .query(`INSERT INTO areas (nombre, numseccion, codvendedor, familia_desc, rol) OUTPUT INSERTED.id VALUES (@nom, @sec, @cv, @fam, @rol)`);
    res.json({ ok: true, id: r.recordset[0].id });
}));

// ── DELETE /fab/areas/:id ─────────────────────────────────
fabRouter.delete('/areas/:id', wrap(async (req, res) => {
    const pool = await getPool(FAB);
    await pool.request().input('id', sql.Int, parseInt(req.params.id as string))
        .query(`UPDATE areas SET activo=0 WHERE id=@id`);
    res.json({ ok: true });
}));

// ── GET  /fab/colaboradores?area_id= ─────────────────────
fabRouter.get('/colaboradores', wrap(async (req, res) => {
    const aid  = parseInt(req.query.area_id as string);
    const pool = await getPool(FAB);
    const r    = await pool.request()
        .input('aid', sql.Int, aid)
        .query(`SELECT id, nombre FROM colaboradores WHERE area_id=@aid AND activo=1 ORDER BY nombre`);
    res.json(r.recordset);
}));

// ── POST /fab/colaboradores ───────────────────────────────
fabRouter.post('/colaboradores', wrap(async (req, res) => {
    const { area_id, nombre } = req.body as { area_id: number; nombre: string };
    if (area_id == null || !nombre?.trim())
        return void res.status(400).json({ error: 'area_id y nombre requeridos' });
    const pool = await getPool(FAB);
    const r    = await pool.request()
        .input('aid', sql.Int,           area_id)
        .input('nom', sql.NVarChar(100), nombre.trim())
        .query(`INSERT INTO colaboradores (area_id, nombre) OUTPUT INSERTED.id VALUES (@aid, @nom)`);
    res.json({ ok: true, id: r.recordset[0].id });
}));

// ── DELETE /fab/colaboradores/:id ─────────────────────────
fabRouter.delete('/colaboradores/:id', wrap(async (req, res) => {
    const id   = parseInt(req.params.id as string);
    const pool = await getPool(FAB);
    await pool.request().input('id', sql.Int, id)
        .query(`UPDATE colaboradores SET activo=0 WHERE id=@id`);
    res.json({ ok: true });
}));

// ── GET /fab/mermas?fecha= ────────────────────────────────
fabRouter.get('/mermas', wrap(async (req, res) => {
    const fecha = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const pool  = await getPool(FAB);
    const r = await pool.request()
        .input('f', sql.Date, fecha)
        .query(`SELECT id, CONVERT(varchar(5), hora, 108) AS hora, codarticulo, descripcion,
                       cantidad, motivo, codvendedor, nombre_operario
                FROM mermas WHERE fecha=@f ORDER BY hora DESC`);
    res.json(r.recordset);
}));

// ── POST /fab/mermas ──────────────────────────────────────
fabRouter.post('/mermas', wrap(async (req, res) => {
    const { codarticulo, descripcion, cantidad, motivo, codvendedor, nombre_operario } =
        req.body as { codarticulo: number; descripcion: string; cantidad: number; motivo: string; codvendedor: number; nombre_operario: string };
    if (!codarticulo || !cantidad || !motivo || codvendedor == null)
        return void res.status(400).json({ error: 'Faltan campos requeridos' });
    const pool = await getPool(FAB);
    const r = await pool.request()
        .input('ca',  sql.Int,           codarticulo)
        .input('des', sql.NVarChar(200), descripcion || '')
        .input('can', sql.Float,         cantidad)
        .input('mot', sql.NVarChar(300), motivo)
        .input('cv',  sql.Int,           codvendedor)
        .input('nom', sql.NVarChar(100), nombre_operario || '')
        .query(`INSERT INTO mermas (codarticulo, descripcion, cantidad, motivo, codvendedor, nombre_operario)
                OUTPUT INSERTED.id, CONVERT(varchar(5), INSERTED.hora, 108) AS hora
                VALUES (@ca, @des, @can, @mot, @cv, @nom)`);
    res.json({ ok: true, ...r.recordset[0] });
}));

// ── GET /fab/admin/usuarios ───────────────────────────────────────
fabRouter.get('/admin/usuarios', wrap(async (req, res) => {
    const [locoPool, fabPool] = await Promise.all([getPool(USUARIOS_DB), getPool(FAB)]);
    const [usuariosR, areasR, configsR] = await Promise.all([
        locoPool.request().query(`
            SELECT CODUSUARIO, USUARIO FROM USUARIOS
            WHERE ISNULL(BLOQUEADO,'F')!='T' AND ISNULL(DESCATALOGADO,'F')!='T'
            ORDER BY USUARIO
        `),
        fabPool.request().query(`SELECT id, codvendedor, nombre, familia_desc, ISNULL(rol,'personal') AS rol FROM areas WHERE activo=1`),
        fabPool.request().query(`SELECT codvendedor, almacen_origen, almacen_destino FROM configuracion_usuarios`),
    ]);
    const areaMap: Record<number,any>   = {};
    const cfgMap:  Record<number,any>   = {};
    for (const a of areasR.recordset)   areaMap[a.codvendedor] = a;
    for (const c of configsR.recordset) cfgMap[c.codvendedor]  = c;
    res.json(usuariosR.recordset.map(u => ({
        codvendedor:     u.CODUSUARIO,
        usuario:         u.USUARIO,
        area_id:         areaMap[u.CODUSUARIO]?.id              ?? null,
        rol:             areaMap[u.CODUSUARIO]?.rol             ?? 'personal',
        nombre_area:     areaMap[u.CODUSUARIO]?.nombre          ?? '',
        familia_desc:    areaMap[u.CODUSUARIO]?.familia_desc    ?? null,
        almacen_origen:  cfgMap[u.CODUSUARIO]?.almacen_origen   ?? '',
        almacen_destino: cfgMap[u.CODUSUARIO]?.almacen_destino  ?? '',
    })));
}));

// ── PUT /fab/admin/usuarios/:codvendedor ──────────────────────────
fabRouter.put('/admin/usuarios/:codvendedor', wrap(async (req, res) => {
    const cv = parseInt(req.params.codvendedor as string);
    const { rol, nombre_area, familia_desc, almacen_origen, almacen_destino } = req.body as {
        rol: string; nombre_area: string; familia_desc?: string | null;
        almacen_origen: string; almacen_destino: string;
    };
    const fabPool = await getPool(FAB);
    if (nombre_area?.trim()) {
        await fabPool.request().input('cv', sql.Int, cv)
            .query(`UPDATE areas SET activo=0 WHERE codvendedor=@cv`);
        await fabPool.request()
            .input('nom', sql.NVarChar(100), nombre_area.trim())
            .input('cv',  sql.Int,           cv)
            .input('fam', sql.NVarChar(100), familia_desc?.trim() || null)
            .input('rol', sql.NVarChar(20),  rol || 'personal')
            .query(`INSERT INTO areas (nombre, numseccion, codvendedor, familia_desc, rol) VALUES (@nom, 0, @cv, @fam, @rol)`);
    } else {
        await fabPool.request()
            .input('cv',  sql.Int,          cv)
            .input('rol', sql.NVarChar(20), rol || 'personal')
            .query(`UPDATE areas SET rol=@rol WHERE codvendedor=@cv AND activo=1`);
    }
    await fabPool.request()
        .input('cv', sql.Int,        cv)
        .input('ao', sql.VarChar(10), almacen_origen  || '')
        .input('ad', sql.VarChar(10), almacen_destino || '')
        .query(`
            MERGE configuracion_usuarios AS t
            USING (SELECT @cv AS codvendedor) AS s ON t.codvendedor=s.codvendedor
            WHEN MATCHED     THEN UPDATE SET almacen_origen=@ao, almacen_destino=@ad
            WHEN NOT MATCHED THEN INSERT (codvendedor,almacen_origen,almacen_destino) VALUES (@cv,@ao,@ad);
        `);
    res.json({ ok: true });
}));

// ── Actualización desde ZIP de GitHub ──────────────────────────────
fabRouter.post('/update', (async (req: Request, res: Response) => {
    const { url } = req.body as { url?: string };
    if (!url || !url.startsWith('https://')) {
        return res.status(400).json({ error: 'URL inválida. Debe ser https://...' });
    }

    const script = path.join(__dirname, '../../update.ps1');
    const cmd    = `powershell -ExecutionPolicy Bypass -File "${script}" -Url "${url}"`;

    res.json({ ok: true, mensaje: 'Actualización iniciada. El servidor se reiniciará en segundos.' });

    // ejecutar después de responder
    setTimeout(() => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) console.error('[update] Error:', stderr || err.message);
            else      console.log('[update]', stdout);
            process.exit(0); // nodemon reinicia automáticamente
        });
    }, 300);
}) as any);
