const respuesta = (statusCode, data) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

// Error "esperado" con su código HTTP (400, 404, 409...)
class ErrorNegocio extends Error {
    constructor(statusCode, mensaje) {
        super(mensaje);
        this.statusCode = statusCode;
    }
}

// Envuelve un handler: parsea el body, captura errores y arma la respuesta
const manejar = (fn) => async (event) => {
    let body = {};
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch {
        return respuesta(400, { error: 'El body no es un JSON válido' });
    }
    try {
        const { status, data } = await fn({ body, params: event.pathParameters || {} });
        return respuesta(status, data);
    } catch (e) {
        if (e instanceof ErrorNegocio) return respuesta(e.statusCode, { error: e.message });
        console.error(e);
        return respuesta(500, { error: 'Error interno' });
    }
};

module.exports = { respuesta, ErrorNegocio, manejar };