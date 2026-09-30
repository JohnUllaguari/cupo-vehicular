# Cupo vehicular de colaboradores

Servicio (AWS Lambda ejecutada en local con Serverless) que lleva el saldo de cada colaborador a partir de dos fuentes de gasto: facturas y GasClub.

**Stack:** Node.js 18+, PostgreSQL 16 (Docker), Serverless Framework v3 + serverless-offline.

## Estructura

```
cupo-vehicular/
├── docker-compose.yml        PostgreSQL 16
├── sql/
│   ├── 01_tablas_dadas.sql   SGR_FACTURAS, SGR_GASCLUB_GASTOS y datos de ejemplo
│   └── 02_tablas_propias.sql colaboradores, cupo_historial, movimientos
├── src/
│   ├── db.js                 pool de conexiones
│   ├── lib/                  http, validaciones, transacciones y saldo
│   └── handlers/             colaboradores, facturas, sincronizacion, health
├── pruebas/escenario.ps1     escenario completo de prueba (PowerShell)
├── serverless.yml
└── README.md
```

## Requisitos

- Node.js 18 o superior
- Docker con Docker Compose

## Ejecutar

```bash
npm install
docker compose up -d          # crea la base y ejecuta los scripts de sql/ (solo la primera vez)
npx serverless offline        # deja esta terminal abierta
```

La API queda en `http://localhost:3000/dev`. Comprobación rápida: `GET /dev/health`.

Para reiniciar la base desde cero:

```bash
docker compose down -v
docker compose up -d
```

Conexión a la base (por defecto): host `localhost`, puerto `5432`, base `cupo_vehicular`, usuario `cupo`, contraseña `cupo123`. Se pueden cambiar con las variables de entorno `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.

Consultar la base:

```bash
docker exec -it cupo-db psql -U cupo -d cupo_vehicular
```

## Endpoints

| # | Método y ruta | Body | Descripción |
|---|---|---|---|
| 1 | `POST /colaboradores` | `{"cedula":"0912345678","cupoMensual":200}` | Crea el colaborador (409 si ya existe) |
| 2 | `PUT /colaboradores/{cedula}/cupo` | `{"cupoMensual":250}` | Cambia el cupo y guarda historial; no toca el saldo |
| 3 | `POST /colaboradores/{cedula}/acreditar` | — | Suma el cupo vigente al saldo |
| 4 | `POST /facturas` | `{"cedula":"...","numeroFactura":"...","rucProveedor":"...","total":50}` | Registra la factura como Pendiente si hay saldo suficiente |
| 5 | `POST /sincronizar/facturas` | — | Alinea `movimientos` con `SGR_FACTURAS` |
| 6 | `POST /sincronizar/gasclub` | — | Importa los consumos de `SGR_GASCLUB_GASTOS` |

Códigos de error: `400` datos inválidos, `404` colaborador inexistente, `409` duplicado, `422` saldo insuficiente.

## Probar

### Escenario automático (PowerShell)

Con `serverless offline` corriendo:

```powershell
.\pruebas\escenario.ps1
```

El script recrea la base y ejecuta el escenario completo, imprimiendo el resultado esperado antes de cada paso. Saldos finales esperados: `0912345678 = -81.00` y `0923456789 = 92.75`.

### Escenario manual

1. Crear colaboradores, actualizar cupo y acreditar (endpoints 1, 2 y 3).
2. Insertar a mano consumos en `SGR_GASCLUB_GASTOS`, llamar a `POST /sincronizar/gasclub` y revisar `movimientos` y el saldo.
3. Registrar una factura con el endpoint 4, aprobarla a mano y sincronizar:

```sql
UPDATE sgr_facturas SET estado = 'Aprobado' WHERE id = 11;
```

```bash
curl -X POST http://localhost:3000/dev/sincronizar/facturas
```

Saldo por colaborador:

```sql
SELECT cedula,
       SUM(CASE WHEN tipo = 'ACREDITACION' THEN monto ELSE -monto END) AS saldo
FROM movimientos GROUP BY cedula ORDER BY cedula;
```

En PowerShell usa `curl.exe` (con la extensión) o `Invoke-RestMethod`, porque `curl` es un alias de otro comando.

## Decisiones principales

El detalle está en el documento de diseño. En resumen: el saldo se calcula (acreditaciones − gastos), cada gasto guarda `origen` y `origen_id` para que las sincronizaciones sean idempotentes, la factura descuenta saldo desde que está Pendiente, y sin restricciones en la base la integridad se garantiza con transacciones y bloqueos por cédula.