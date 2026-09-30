const { manejar, ErrorNegocio } = require('../lib/http');
const { validarCedula, validarTextoFactura, validarRuc, validarTotal } = require('../lib/validaciones');
const { conTransaccion, obtenerSaldo } = require('../lib/tx');

const aCentavos = (v) => Math.round(Number(v) * 100);

// Endpoint 4: registrar factura
module.exports.registrar = manejar(async ({ body }) => {
    const cedula = validarCedula(body.cedula);
    const numeroFactura = validarTextoFactura(body.numeroFactura, 'numeroFactura');
    const ruc = validarRuc(body.rucProveedor);
    const total = validarTotal(body.total);

    return conTransaccion(cedula, async (db) => {
        // 1. El colaborador debe existir
        const c = await db.query('SELECT 1 FROM colaboradores WHERE cedula = $1', [cedula]);
        if (c.rowCount === 0) throw new ErrorNegocio(404, 'El colaborador no existe');

        // 2. La factura no debe estar ya registrada (número + RUC)
        const dup = await db.query(
            'SELECT 1 FROM sgr_facturas WHERE numero_factura = $1 AND ruc_proveedor = $2',
            [numeroFactura, ruc]
        );
        if (dup.rowCount > 0) throw new ErrorNegocio(409, 'La factura ya está registrada');

        // 3. El total no puede superar el saldo disponible
        const saldo = await obtenerSaldo(db, cedula);
        if (aCentavos(total) > aCentavos(saldo)) {
            throw new ErrorNegocio(422, `Saldo insuficiente: disponible ${saldo}, factura ${total.toFixed(2)}`);
        }

        // 4. ID nuevo para SGR_FACTURAS (bloqueo global para que no se repita)
        await db.query("SELECT pg_advisory_xact_lock(hashtext('sgr_facturas_id'))");
        const idr = await db.query('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM sgr_facturas');
        const id = idr.rows[0].id;

        // 5. Insertar en SGR_FACTURAS y en movimientos, ambas como Pendiente
        await db.query(
            `INSERT INTO sgr_facturas (id, cedula, numero_factura, ruc_proveedor, total, fecha, estado)
       VALUES ($1, $2, $3, $4, $5, (now() AT TIME ZONE 'America/Guayaquil')::date, 'Pendiente')`,
            [id, cedula, numeroFactura, ruc, total]
        );
        await db.query(
            `INSERT INTO movimientos (cedula, tipo, origen, origen_id, referencia, ruc_proveedor, monto, estado, fecha)
       VALUES ($1, 'GASTO', 'Facturas', $2, $3, $4, $5, 'Pendiente', (now() AT TIME ZONE 'America/Guayaquil')::date)`,
            [cedula, id, numeroFactura, ruc, total]
        );

        const saldoNuevo = await obtenerSaldo(db, cedula);
        return {
            status: 201,
            data: { id, cedula, numeroFactura, rucProveedor: ruc, total: total.toFixed(2), estado: 'Pendiente', saldo: saldoNuevo },
        };
    });
});