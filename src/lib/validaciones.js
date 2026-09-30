const { ErrorNegocio } = require('./http');

const validarCedula = (cedula) => {
    if (typeof cedula !== 'string' || !/^\d{10}$/.test(cedula)) {
        throw new ErrorNegocio(400, 'La cédula debe ser un texto de 10 dígitos');
    }
    return cedula;
};

const validarMonto = (valor, campo) => {
    const centavos = typeof valor === 'number' ? valor * 100 : NaN;
    if (!Number.isFinite(centavos) || valor < 0 || Math.abs(centavos - Math.round(centavos)) > 1e-6) {
        throw new ErrorNegocio(400, `${campo} debe ser un número >= 0 con máximo 2 decimales`);
    }
    return valor;
};
const validarTextoFactura = (valor, campo) => {
    if (typeof valor !== 'string' || valor.trim() === '' || valor.trim().length > 30) {
        throw new ErrorNegocio(400, `${campo} es obligatorio (texto de máximo 30 caracteres)`);
    }
    return valor.trim();
};

const validarRuc = (ruc) => {
    if (typeof ruc !== 'string' || !/^\d{13}$/.test(ruc)) {
        throw new ErrorNegocio(400, 'El RUC debe ser un texto de 13 dígitos');
    }
    return ruc;
};

const validarTotal = (total) => {
    validarMonto(total, 'total');
    if (total <= 0) throw new ErrorNegocio(400, 'total debe ser mayor a 0');
    return total;
};


module.exports = { validarCedula, validarMonto, validarTextoFactura, validarRuc, validarTotal };