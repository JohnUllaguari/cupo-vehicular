-- Colaboradores
CREATE SEQUENCE seq_colaboradores;
CREATE TABLE colaboradores (
    id                  BIGINT DEFAULT nextval('seq_colaboradores'),
    cedula              VARCHAR(20),
    cupo_mensual        DECIMAL(12,2),
    fecha_creacion      TIMESTAMP DEFAULT now(),
    fecha_actualizacion TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_colaboradores_cedula ON colaboradores (cedula);

-- Trazabilidad de cambios de cupo (incluye el cupo inicial al crear)
CREATE SEQUENCE seq_cupo_historial;
CREATE TABLE cupo_historial (
    id            BIGINT DEFAULT nextval('seq_cupo_historial'),
    cedula        VARCHAR(20),
    cupo_anterior DECIMAL(12,2),   -- NULL en la creación
    cupo_nuevo    DECIMAL(12,2),
    fecha_cambio  TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_cupo_historial_cedula ON cupo_historial (cedula);

-- Cuenta corriente: acreditaciones y gastos
CREATE SEQUENCE seq_movimientos;
CREATE TABLE movimientos (
    id                  BIGINT DEFAULT nextval('seq_movimientos'),
    cedula              VARCHAR(20),
    tipo                VARCHAR(15),   -- 'ACREDITACION' | 'GASTO'
    origen              VARCHAR(15),   -- 'Cupo' | 'Facturas' | 'GasClub'
    origen_id           INT,           -- ID en la tabla externa (NULL en acreditaciones)
    referencia          VARCHAR(30),   -- número de factura o código GasClub
    ruc_proveedor       VARCHAR(20),   -- solo facturas
    monto               DECIMAL(12,2), -- siempre positivo
    estado              VARCHAR(15),   -- 'Pendiente' | 'Aprobado' para facturas; NULL para otros movimientos
    fecha               DATE,          -- fecha del gasto o acreditación
    fecha_registro      TIMESTAMP DEFAULT now(),
    fecha_actualizacion TIMESTAMP
);
CREATE INDEX idx_movimientos_cedula ON movimientos (cedula);
CREATE INDEX idx_movimientos_origen ON movimientos (origen, origen_id);