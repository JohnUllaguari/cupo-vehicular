const { pool } = require('../db');

// Ejecuta fn dentro de una transacción, bloqueando por cédula.
// Si fn lanza un error, se hace ROLLBACK y nada queda a medias.
async function conTransaccion(cedula, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [cedula]);
        const resultado = await fn(client);
        await client.query('COMMIT');
        return resultado;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// Saldo = acreditaciones - gastos, calculado en SQL para no sumar decimales en JavaScript
async function obtenerSaldo(db, cedula) {
    const r = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'ACREDITACION' THEN monto ELSE -monto END), 0)::numeric(12,2) AS saldo
     FROM movimientos WHERE cedula = $1`,
        [cedula]
    );
    return r.rows[0].saldo;
}

module.exports = { conTransaccion, obtenerSaldo };