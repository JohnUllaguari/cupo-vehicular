const { pool } = require('../db');
const { manejar } = require('../lib/http');
const { conTransaccion } = require('../lib/tx');

// Endpoint 6: sincronizar GasClub
module.exports.gasclub = manejar(async () => {
    const ced = await pool.query(
        `SELECT DISTINCT g.cedula
       FROM sgr_gasclub_gastos g
       JOIN colaboradores c ON c.cedula = g.cedula`
    );

    let importados = 0;
    for (const { cedula } of ced.rows) {
        importados += await conTransaccion(cedula, async (db) => {
            const filas = await db.query(
                'SELECT id FROM sgr_gasclub_gastos WHERE cedula = $1 ORDER BY id',
                [cedula]
            );
            let n = 0;
            for (const g of filas.rows) {
                const ya = await db.query(
                    "SELECT 1 FROM movimientos WHERE origen = 'GasClub' AND origen_id = $1",
                    [g.id]
                );
                if (ya.rowCount > 0) continue; // ya sincronizado

                await db.query(
                    `INSERT INTO movimientos (cedula, tipo, origen, origen_id, referencia, monto, fecha)
           SELECT cedula, 'GASTO', 'GasClub', id, referencia, total, fecha
             FROM sgr_gasclub_gastos WHERE id = $1`,
                    [g.id]
                );
                n++;
            }
            return n;
        });
    }

    const sin = await pool.query(
        `SELECT COUNT(*)::int AS n FROM sgr_gasclub_gastos g
      WHERE NOT EXISTS (SELECT 1 FROM colaboradores c WHERE c.cedula = g.cedula)`
    );
    return { status: 200, data: { importados, ignoradosSinColaborador: sin.rows[0].n } };
});

// Endpoint 5: sincronizar facturas
module.exports.facturas = manejar(async () => {
    const ced = await pool.query(
        `SELECT DISTINCT f.cedula
       FROM sgr_facturas f
       JOIN colaboradores c ON c.cedula = f.cedula`
    );

    let importadas = 0;
    let actualizadas = 0;
    for (const { cedula } of ced.rows) {
        const r = await conTransaccion(cedula, async (db) => {
            const filas = await db.query(
                'SELECT id, estado FROM sgr_facturas WHERE cedula = $1 ORDER BY id',
                [cedula]
            );
            let imp = 0;
            let act = 0;
            for (const f of filas.rows) {
                const m = await db.query(
                    "SELECT id, estado FROM movimientos WHERE origen = 'Facturas' AND origen_id = $1",
                    [f.id]
                );
                if (m.rowCount === 0) {
                    // Factura que no pasó por nuestro endpoint: se importa como gasto
                    await db.query(
                        `INSERT INTO movimientos
               (cedula, tipo, origen, origen_id, referencia, ruc_proveedor, monto, estado, fecha)
             SELECT cedula, 'GASTO', 'Facturas', id, numero_factura, ruc_proveedor, total, estado, fecha
               FROM sgr_facturas WHERE id = $1`,
                        [f.id]
                    );
                    imp++;
                } else if (m.rows[0].estado !== f.estado) {
                    // Alinear el estado con SGR_FACTURAS
                    await db.query(
                        'UPDATE movimientos SET estado = $2, fecha_actualizacion = now() WHERE id = $1',
                        [m.rows[0].id, f.estado]
                    );
                    act++;
                }
            }
            return { imp, act };
        });
        importadas += r.imp;
        actualizadas += r.act;
    }

    return { status: 200, data: { importadas, actualizadas } };
});