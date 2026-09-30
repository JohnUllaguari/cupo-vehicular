const { manejar, ErrorNegocio } = require('../lib/http');
const { validarCedula, validarMonto } = require('../lib/validaciones');
const { conTransaccion, obtenerSaldo } = require('../lib/tx');

// Endpoint 1: crear colaborador
module.exports.crear = manejar(async ({ body }) => {
    const cedula = validarCedula(body.cedula);
    const cupo = validarMonto(body.cupoMensual, 'cupoMensual');

    return conTransaccion(cedula, async (db) => {
        const existe = await db.query('SELECT 1 FROM colaboradores WHERE cedula = $1', [cedula]);
        if (existe.rowCount > 0) throw new ErrorNegocio(409, 'El colaborador ya existe');

        const ins = await db.query(
            'INSERT INTO colaboradores (cedula, cupo_mensual) VALUES ($1, $2) RETURNING id, cedula, cupo_mensual',
            [cedula, cupo]
        );
        await db.query(
            'INSERT INTO cupo_historial (cedula, cupo_anterior, cupo_nuevo) VALUES ($1, NULL, $2)',
            [cedula, cupo]
        );
        return { status: 201, data: ins.rows[0] };
    });
});

// Endpoint 2: actualizar cupo (NO modifica el saldo)
module.exports.actualizarCupo = manejar(async ({ body, params }) => {
    const cedula = validarCedula(params.cedula);
    const cupo = validarMonto(body.cupoMensual, 'cupoMensual');

    return conTransaccion(cedula, async (db) => {
        const c = await db.query('SELECT cupo_mensual FROM colaboradores WHERE cedula = $1', [cedula]);
        if (c.rowCount === 0) throw new ErrorNegocio(404, 'El colaborador no existe');
        const anterior = c.rows[0].cupo_mensual;

        await db.query(
            'UPDATE colaboradores SET cupo_mensual = $2, fecha_actualizacion = now() WHERE cedula = $1',
            [cedula, cupo]
        );
        await db.query(
            'INSERT INTO cupo_historial (cedula, cupo_anterior, cupo_nuevo) VALUES ($1, $2, $3)',
            [cedula, anterior, cupo]
        );
        const saldo = await obtenerSaldo(db, cedula);
        return { status: 200, data: { cedula, cupoAnterior: anterior, cupoNuevo: cupo.toFixed(2), saldo } };
    });
});

// Endpoint 3: acreditar cupo (suma el cupo actual al saldo, como una recarga)
module.exports.acreditar = manejar(async ({ params }) => {
    const cedula = validarCedula(params.cedula);

    return conTransaccion(cedula, async (db) => {
        const c = await db.query('SELECT cupo_mensual FROM colaboradores WHERE cedula = $1', [cedula]);
        if (c.rowCount === 0) throw new ErrorNegocio(404, 'El colaborador no existe');
        const cupo = c.rows[0].cupo_mensual;

        await db.query(
            `INSERT INTO movimientos (cedula, tipo, origen, monto, fecha)
       VALUES ($1, 'ACREDITACION', 'Cupo', $2, (now() AT TIME ZONE 'America/Guayaquil')::date)`,
            [cedula, cupo]
        );
        const saldo = await obtenerSaldo(db, cedula);
        return { status: 200, data: { cedula, acreditado: cupo, saldo } };
    });
});