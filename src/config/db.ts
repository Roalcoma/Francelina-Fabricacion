import * as sql from 'mssql';
import 'dotenv/config';

const localConfig: any = {
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    server:   process.env.DB_HOST || '127.0.0.1',
    options:  { encrypt: false, trustServerCertificate: true },
    pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

// Config separada para el ICG ERP (puede estar en otro servidor)
const locoConfig: any = {
    user:     process.env.LOCO_USER || process.env.DB_USER,
    password: process.env.LOCO_PASS || process.env.DB_PASS,
    server:   process.env.LOCO_HOST || process.env.DB_HOST || '127.0.0.1',
    port:     Number(process.env.LOCO_PORT || process.env.DB_PORT || 1433),
    options:  { encrypt: false, trustServerCertificate: true },
    pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

// Config separada para la base de Fabricación (puede estar en otro servidor)
const fabConfig: any = {
    user:     process.env.FAB_USER || process.env.DB_USER,
    password: process.env.FAB_PASS || process.env.DB_PASS,
    server:   process.env.FAB_HOST || process.env.DB_HOST || '127.0.0.1',
    port:     Number(process.env.FAB_PORT || process.env.DB_PORT || 1433),
    options:  { encrypt: false, trustServerCertificate: true },
    pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

const FAB_LOCO_DB     = process.env.FAB_LOCO_DB     || null;
const FAB_DB          = process.env.FAB_DB          || 'FABRICACION';
const FAB_USUARIOS_DB = process.env.FAB_USUARIOS_DB || null;

const pools = new Map<string, sql.ConnectionPool>();

export const getPool = async (dbName: string): Promise<sql.ConnectionPool> => {
    if (pools.has(dbName)) return pools.get(dbName)!;

    // FAB_DB y FAB_LOCO_DB van al servidor remoto; LOCO al local; resto a localConfig
    const base = (dbName === FAB_DB
                 || (FAB_LOCO_DB     && dbName === FAB_LOCO_DB)
                 || (FAB_USUARIOS_DB && dbName === FAB_USUARIOS_DB)) ? fabConfig
               : dbName === 'LOCO' ? locoConfig
               : localConfig;
    const pool = new sql.ConnectionPool({ ...base, database: dbName });
    const connected = await pool.connect();
    pools.set(dbName, connected);
    console.log(`Pool conectado a la base de datos: ${dbName} @ ${base.server}`);
    return connected;
};

// Crea la base de fabricación si no existe (instalación nueva)
export async function asegurarBaseFab() {
    if (!/^\w+$/.test(FAB_DB)) throw new Error(`FAB_DB inválido: "${FAB_DB}" (solo letras, números y _)`);
    const master = await new sql.ConnectionPool({ ...fabConfig, database: 'master' }).connect();
    try {
        const r = await master.request().query(`IF DB_ID('${FAB_DB}') IS NULL BEGIN CREATE DATABASE [${FAB_DB}]; SELECT 1 AS creada END`);
        if (r.recordset?.length) console.log(`Base de datos ${FAB_DB} creada en ${fabConfig.server}`);
    } finally {
        await master.close();
    }
}

export const getErpPool = async (): Promise<sql.ConnectionPool> => {
    return getPool(process.env.ERP_DB || '');
};