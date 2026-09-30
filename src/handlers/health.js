const { pool } = require('../db');

module.exports.health = async () => {
    const r = await pool.query('SELECT now() AS ahora');
    return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, ahora: r.rows[0].ahora }),
    };
};