/* ============================================================
   copiloto.js — Asistente del sistema

   Resuelve dudas usando ÚNICAMENTE lo que hay en esta aplicación:
   los datos de la empresa (ERP.db), los cálculos contables del sistema
   (ERP.finanzas, ERP.equilibrio, ERP.prestamos) y la guía de sus propios
   módulos. No consulta internet, no usa modelos de lenguaje y no tiene
   conocimiento general del mundo: si una pregunta se sale del sistema,
   lo dice y ofrece los temas que sí puede responder.

   Tres reglas que se cumplen por construcción:

     1. SOLO LEE. Este archivo no llama a ninguna función que escriba
        (insert, update, remove, registrar*, editar*, vaciar, reset…).
        Lo único que puede hacer además de responder es abrir un módulo,
        que es navegar, no modificar.
     2. NO INVENTA. Cada cifra sale de las mismas funciones que alimentan
        el tablero y los estados financieros, así que el copiloto y las
        pantallas no pueden contradecirse.
     3. RESPETA EL ROL. Cada tema declara el módulo del que depende y se
        comprueba con ERP.auth.puede(). A un vendedor no se le responden
        márgenes ni nómina, igual que no ve esos módulos.

   La forma está tomada del copiloto de referencia que hay en
   .design/ (erp-financiero---copiloto-inteligente): cajón lateral,
   preguntas sugeridas por rol y respuestas con acciones al final. Lo que
   cambia es el motor: allí un modelo de lenguaje con una clave de API en
   un servidor; aquí, el propio sistema respondiendo sobre sus datos.
   ============================================================ */

window.ERP = window.ERP || {};

ERP.copiloto = (() => {
    const U = ERP.util;
    const { el } = U;
    const ui = ERP.ui;

    /* La conversación vive en memoria: sobrevive a los repintados y se
       pierde al recargar. No se guarda nada en el navegador. */
    let conversacion = [];
    let abierto = false;
    let cajon = null;
    let historial = null;
    let campo = null;

    const norm = (texto) => U.normalize(String(texto || '')).trim();

    const contiene = (texto, palabras) => palabras.some((p) => texto.includes(p));

    /* ---------- Periodo consultado ---------- */

    /** Lee el periodo de la pregunta. Sin pista, el mes en curso. */
    const rangoDe = (texto) => {
        const hoy = U.today();
        if (contiene(texto, ['hoy', 'el dia de hoy'])) {
            return { desde: hoy, hasta: hoy, etiqueta: 'hoy' };
        }
        if (contiene(texto, ['semana'])) {
            return { desde: U.startOfWeek(hoy), hasta: hoy, etiqueta: 'esta semana' };
        }
        if (contiene(texto, ['ano', 'anio', 'year'])) {
            return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy, etiqueta: `este año (${hoy.slice(0, 4)})` };
        }
        if (contiene(texto, ['historico', 'siempre', 'todo el tiempo', 'en total'])) {
            return { desde: null, hasta: null, etiqueta: 'toda la operación registrada' };
        }
        return { desde: U.startOfMonth(hoy), hasta: hoy, etiqueta: 'este mes' };
    };

    /* ---------- Piezas de respuesta (DOM, sin innerHTML) ---------- */

    const parrafo = (texto) => el('p', { text: texto });

    const nota = (texto) => el('p', { class: 'text-muted copi-nota', text: texto });

    const lista = (elementos) => el('ul', { class: 'copi-lista' },
        elementos.map((x) => el('li', { text: x })));

    /** Pares etiqueta/valor: es como el copiloto muestra las cifras. */
    const cifras = (pares) => el('div', { class: 'copi-cifras' },
        pares.filter(Boolean).map(([etiqueta, valor]) => el('div', { class: 'copi-cifra' }, [
            el('span', { class: 'copi-cifra-label', text: etiqueta }),
            el('span', { class: 'copi-cifra-valor', text: valor })
        ])));

    const tabla = (cabeceras, filas) => el('div', { class: 'table-wrap' }, [
        el('table', { class: 'data' }, [
            el('thead', {}, [el('tr', {}, cabeceras.map((c, i) => el('th', {
                class: i ? 'num' : '', text: c, attrs: { scope: 'col' }
            })))]),
            el('tbody', {}, filas.map((fila) => el('tr', {}, fila.map((celda, i) => el('td', {
                class: i ? 'num' : '', text: celda
            })))))
        ])
    ]);

    /** Botones que abren un módulo. Navegar no es modificar. */
    const acciones = (claves) => {
        const permitidas = claves.filter((clave) => ERP.auth.puede(clave) && ERP.app.MODULOS[clave]);
        if (!permitidas.length) return null;
        return el('div', { class: 'copi-acciones' }, permitidas.map((clave) => el('button', {
            class: 'btn btn-secondary btn-sm',
            text: `Abrir ${ERP.app.MODULOS[clave].etiqueta}`,
            attrs: { type: 'button' },
            on: {
                click: () => {
                    cerrar();
                    ERP.app.irA(clave);
                }
            }
        })));
    };

    /* ---------- Temas ----------
       modulo: el permiso que hace falta para consultarlo. null = todos.  */

    const TEMAS = [

        {
            clave: 'ayuda',
            modulo: null,
            palabras: ['hola', 'buenas', 'ayuda', 'que puedes', 'que sabes', 'para que sirves', 'opciones', 'temas'],
            responder: () => {
                const disponibles = TEMAS
                    .filter((t) => t.ejemplo && (!t.modulo || ERP.auth.puede(t.modulo)))
                    .map((t) => t.ejemplo);
                return [
                    parrafo('Respondo sobre los datos y los módulos de este sistema. Puede preguntarme, por ejemplo:'),
                    lista(disponibles),
                    nota('Solo leo: no registro ni cambio nada, y no respondo sobre temas ajenos a la aplicación.')
                ];
            }
        },

        {
            clave: 'ventas',
            modulo: 'ventas',
            ejemplo: '¿Cuánto he vendido este mes?',
            palabras: ['venta', 'vendido', 'vendi', 'ingreso', 'facturacion', 'facturado'],
            responder: (ctx) => {
                const pyg = ERP.finanzas.estadoResultados(ctx.rango.desde, ctx.rango.hasta);
                const top = ERP.finanzas.productosMasVendidos(ctx.rango.desde, ctx.rango.hasta, 5);
                const ticket = pyg.numeroFacturas ? pyg.ingresos / pyg.numeroFacturas : 0;
                const bloques = [
                    parrafo(`Ventas de ${ctx.rango.etiqueta}:`),
                    cifras([
                        ['Ingresos', U.money(pyg.ingresos)],
                        ['Facturas', U.num(pyg.numeroFacturas)],
                        ['Ticket promedio', U.money(ticket)],
                        ERP.auth.puede('financieros') ? ['Utilidad bruta', U.money(pyg.utilidadBruta)] : null
                    ])
                ];
                if (top.length) {
                    bloques.push(parrafo('Lo que más salió:'));
                    bloques.push(tabla(['Producto', 'Unidades', 'Ingresos'],
                        top.map((p) => [p.nombre, U.num(p.unidades, 2), U.money(p.ingresos)])));
                }
                bloques.push(acciones(['ventas', 'dashboard']));
                return bloques;
            }
        },

        {
            clave: 'utilidad',
            modulo: 'financieros',
            ejemplo: '¿Cuál es mi utilidad y mi margen?',
            palabras: ['utilidad', 'margen', 'ganancia', 'rentabilidad', 'p&g', 'pyg', 'resultado', 'perdida'],
            responder: (ctx) => {
                const pyg = ERP.finanzas.estadoResultados(ctx.rango.desde, ctx.rango.hasta);
                const ind = ERP.finanzas.indicadores(ctx.rango.desde, ctx.rango.hasta);
                return [
                    parrafo(`Estado de resultados de ${ctx.rango.etiqueta}:`),
                    cifras([
                        ['Ingresos', U.money(pyg.ingresos)],
                        ['Costo de ventas', U.money(pyg.costoVentas)],
                        ['Utilidad bruta', U.money(pyg.utilidadBruta)],
                        ['Margen bruto', U.pct((pyg.margenBruto || 0) * 100)],
                        ['Gastos', U.money(pyg.gastosTotales)],
                        ['Utilidad neta', U.money(pyg.utilidadNeta)],
                        ['Margen neto', U.pct((pyg.margenNeto || 0) * 100)],
                        ['Razón corriente', U.num(ind.razonCorriente || 0, 2)]
                    ]),
                    nota('Utilidad bruta = ingresos − costo de ventas. Utilidad neta = utilidad bruta − gastos. El costo sale del costo unitario congelado en cada factura.'),
                    acciones(['financieros', 'dashboard'])
                ];
            }
        },

        {
            clave: 'gastos',
            modulo: 'gastos',
            ejemplo: '¿En qué se me van los gastos?',
            palabras: ['gasto', 'egreso', 'costo fijo', 'gaste'],
            responder: (ctx) => {
                const pyg = ERP.finanzas.estadoResultados(ctx.rango.desde, ctx.rango.hasta);
                const porCategoria = Object.entries(pyg.porCategoria || {})
                    .sort((a, b) => b[1] - a[1]).slice(0, 8);
                const bloques = [
                    parrafo(`Gastos de ${ctx.rango.etiqueta}: ${U.money(pyg.gastosTotales)}.`)
                ];
                if (porCategoria.length) {
                    bloques.push(tabla(['Categoría', 'Valor', 'Peso'],
                        porCategoria.map(([cat, valor]) => [
                            cat, U.money(valor),
                            U.pct(U.safeDiv(valor, pyg.gastosTotales) * 100 || 0)
                        ])));
                } else {
                    bloques.push(nota('No hay gastos registrados en ese periodo.'));
                }
                bloques.push(acciones(['gastos', 'financieros']));
                return bloques;
            }
        },

        {
            clave: 'cartera',
            modulo: 'cartera',
            ejemplo: '¿Quién me debe y cuánto está vencido?',
            palabras: ['cartera', 'cobrar', 'deben', 'debe', 'vencid', 'cxc', 'mora', 'abono'],
            responder: () => {
                const hoy = U.today();
                const ant = ERP.finanzas.carteraPorAntiguedad(hoy);
                const pendientes = ERP.db.all('ventas')
                    .filter((v) => !v.anulada && U.round2(v.saldo) > 0);
                const porCliente = new Map();
                pendientes.forEach((v) => {
                    const actual = porCliente.get(v.clienteId) || 0;
                    porCliente.set(v.clienteId, actual + U.toNumber(v.saldo));
                });
                const top = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

                const bloques = [
                    parrafo('Cartera al día de hoy:'),
                    cifras([
                        ['Por cobrar', U.money(ant.total)],
                        ['Vencida', U.money(ant.vencida)],
                        ['Facturas pendientes', U.num(pendientes.length)]
                    ]),
                    tabla(['Antigüedad', 'Valor'], (ant.tramos || []).map((t) => [t.etiqueta, U.money(t.valor)]))
                ];
                if (top.length) {
                    bloques.push(parrafo('Quiénes concentran el saldo:'));
                    bloques.push(tabla(['Cliente', 'Saldo'],
                        top.map(([id, saldo]) => [ERP.db.nombreTercero(id), U.money(saldo)])));
                }
                bloques.push(acciones(['cartera', 'clientes']));
                return bloques;
            }
        },

        {
            clave: 'proveedores',
            modulo: 'compras',
            ejemplo: '¿Cuánto les debo a mis proveedores?',
            palabras: ['pagar', 'proveedor', 'cxp', 'debo', 'compras a credito'],
            responder: () => {
                const cxp = ERP.finanzas.cuentasPorPagar(U.today());
                const pendientes = ERP.db.all('compras').filter((c) => U.round2(c.saldo) > 0);
                const porProveedor = new Map();
                pendientes.forEach((c) => {
                    porProveedor.set(c.proveedorId, (porProveedor.get(c.proveedorId) || 0) + U.toNumber(c.saldo));
                });
                const top = [...porProveedor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
                const bloques = [
                    parrafo('Cuentas por pagar al día de hoy:'),
                    cifras([
                        ['Por pagar', U.money(cxp)],
                        ['Facturas pendientes', U.num(pendientes.length)]
                    ])
                ];
                if (top.length) {
                    bloques.push(tabla(['Proveedor', 'Saldo'],
                        top.map(([id, saldo]) => [ERP.db.nombreTercero(id), U.money(saldo)])));
                }
                bloques.push(acciones(['compras', 'proveedores']));
                return bloques;
            }
        },

        {
            clave: 'inventario',
            modulo: 'inventario',
            ejemplo: '¿Qué productos están por debajo del mínimo?',
            palabras: ['inventario', 'stock', 'existencia', 'minimo', 'agotad', 'producto', 'sku', 'bodega'],
            responder: () => {
                const productos = ERP.db.productos();
                const bajos = ERP.db.productosBajoMinimo();
                const valor = ERP.finanzas.inventarioContable(U.today());
                const bloques = [
                    parrafo('Inventario al día de hoy:'),
                    cifras([
                        ['Valor al costo', U.money(valor)],
                        ['Referencias activas', U.num(productos.length)],
                        ['Bajo el mínimo', U.num(bajos.length)]
                    ])
                ];
                if (bajos.length) {
                    bloques.push(parrafo('Lo que hay que reponer:'));
                    bloques.push(tabla(['Producto', 'Existencias', 'Mínimo'],
                        bajos.slice(0, 10).map((p) => [
                            `${p.sku} · ${p.nombre}`, U.num(p.stock, 2), U.num(p.stockMinimo, 2)
                        ])));
                } else {
                    bloques.push(nota('Ningún producto está por debajo de su mínimo.'));
                }
                bloques.push(acciones(['inventario', 'compras']));
                return bloques;
            }
        },

        {
            clave: 'caja',
            modulo: 'financieros',
            ejemplo: '¿Cuánto tengo en caja?',
            palabras: ['caja', 'efectivo', 'banco', 'flujo', 'liquidez', 'disponible'],
            responder: (ctx) => {
                const saldo = ERP.finanzas.saldoCaja(U.today());
                const flujo = ERP.finanzas.flujoCaja(ctx.rango.desde, ctx.rango.hasta);
                return [
                    parrafo(`Caja y bancos: ${U.money(saldo)}.`),
                    parrafo(`Movimiento de ${ctx.rango.etiqueta}:`),
                    cifras([
                        ['Entradas', U.money(flujo.entradas)],
                        ['Salidas', U.money(flujo.salidas)],
                        ['Neto', U.money(flujo.neto)]
                    ]),
                    nota('Entran las ventas de contado y los abonos cobrados; salen las compras de contado, los pagos a proveedores y los gastos pagados. Lo facturado a crédito no entra hasta que se cobra.'),
                    acciones(['financieros', 'cartera'])
                ];
            }
        },

        {
            clave: 'equilibrio',
            modulo: 'equilibrio',
            ejemplo: '¿Cuál es mi punto de equilibrio?',
            palabras: ['equilibrio', 'punto de equilibrio', 'break even', 'cuanto debo vender'],
            responder: () => {
                const base = ERP.equilibrio.sugerirDesdeDatos();
                const res = ERP.equilibrio.calcular(base.costosFijos, base.precio, base.costoVariable);
                const bloques = [
                    parrafo('Punto de equilibrio con los datos registrados:'),
                    cifras([
                        ['Costos fijos al mes', U.money(base.costosFijos)],
                        ['Precio promedio', U.money(base.precio)],
                        ['Costo variable unitario', U.money(base.costoVariable)],
                        ['Margen unitario', U.money(res.margenUnitario)]
                    ])
                ];
                bloques.push(res.viable
                    ? cifras([
                        ['Unidades a vender', U.num(res.unidades, 2)],
                        ['Ingresos necesarios', U.money(res.ingresos)]
                    ])
                    : nota('Con estos valores no hay punto de equilibrio: el precio promedio no supera el costo variable unitario.'));
                bloques.push(nota('Fórmula: costos fijos ÷ (precio promedio − costo variable unitario).'));
                bloques.push(acciones(['equilibrio']));
                return bloques;
            }
        },

        {
            clave: 'prestamos',
            modulo: 'prestamos',
            ejemplo: '¿Cuánto sería la cuota de un préstamo?',
            palabras: ['prestamo', 'credito bancario', 'cuota', 'amortizacion', 'interes', 'financiacion'],
            responder: (ctx) => {
                const numeros = (ctx.texto.match(/[\d.,]+/g) || [])
                    .map((n) => U.toNumber(n.replace(/\./g, '').replace(',', '.')))
                    .filter((n) => Number.isFinite(n) && n > 0);
                const monto = numeros.find((n) => n >= 100000);
                const plazo = numeros.find((n) => n >= 2 && n <= 360);
                const tasa = numeros.find((n) => n > 0 && n < 100 && n !== plazo);

                if (!monto || !plazo || tasa === undefined) {
                    return [
                        parrafo('Puedo calcularlo si me da los tres datos en la misma pregunta: monto, plazo en meses y tasa mensual.'),
                        nota('Por ejemplo: «cuota de un préstamo de 30.000.000 a 12 meses al 1,8 %».'),
                        acciones(['prestamos'])
                    ];
                }

                // El simulador trabaja la tasa en tanto por uno.
                const tabla1 = ERP.prestamos.amortizacionFrancesa(monto, tasa / 100, plazo);
                const cuota = tabla1.length ? tabla1[0].cuota : 0;
                const interesTotal = U.sum(tabla1, (f) => f.interes);
                return [
                    parrafo(`Préstamo de ${U.money(monto)} a ${U.num(plazo)} meses con tasa mensual de ${U.pct(tasa, 2)}:`),
                    cifras([
                        ['Cuota fija (sistema francés)', U.money(cuota)],
                        ['Intereses totales', U.money(interesTotal)],
                        ['Total a pagar', U.money(monto + interesTotal)]
                    ]),
                    nota('El simulador muestra la tabla completa y también el sistema alemán, con abono constante a capital.'),
                    acciones(['prestamos'])
                ];
            }
        },

        {
            clave: 'nomina',
            modulo: 'nomina',
            ejemplo: '¿Cómo se liquida la nómina?',
            palabras: ['nomina', 'salario', 'sueldo', 'empleado', 'prestacion', 'auxilio', 'cesantia', 'prima'],
            responder: () => {
                const cfg = ERP.db.config();
                const empleados = ERP.db.all('empleados').filter((e) => e.activo !== false);
                const nominas = ERP.db.all('nominas');
                const ultimo = nominas.length
                    ? nominas.reduce((a, b) => (a.periodo > b.periodo ? a : b)).periodo : null;
                const delPeriodo = ultimo ? nominas.filter((n) => n.periodo === ultimo) : [];
                return [
                    parrafo('Parámetros vigentes de nómina:'),
                    cifras([
                        ['Salario mínimo', U.money(cfg.salarioMinimo)],
                        ['Auxilio de transporte', U.money(cfg.auxilioTransporte)],
                        ['Tope del auxilio', `${U.num(cfg.topeAuxilioSmmlv)} SMMLV`],
                        ['Salud (empleado)', U.pct(cfg.aporteSaludPct)],
                        ['Pensión (empleado)', U.pct(cfg.aportePensionPct)],
                        ['Empleados activos', U.num(empleados.length)]
                    ]),
                    ultimo ? parrafo(`Última liquidación: ${U.fmtPeriod(ultimo)}, ${U.num(delPeriodo.length)} empleado(s), neto ${U.money(U.sum(delPeriodo, (n) => n.neto))}.`) : null,
                    nota('Devengado = salario proporcional + extras + auxilio. Deducciones = salud + pensión sobre el salario. El auxilio solo aplica hasta el tope de SMMLV configurado.'),
                    acciones(['nomina'])
                ];
            }
        },

        {
            clave: 'cliente',
            modulo: 'clientes',
            ejemplo: '¿Cuál es el saldo del cliente …?',
            palabras: ['cliente', 'saldo de', 'cupo', 'limite de credito'],
            responder: (ctx) => {
                const terceros = ERP.db.clientes();
                const encontrado = terceros.find((t) => ctx.texto.includes(norm(t.nombre)))
                    || terceros.find((t) => t.documento && ctx.texto.includes(norm(t.documento)))
                    || terceros.find((t) => norm(t.nombre).split(' ').some((p) => p.length > 4 && ctx.texto.includes(p)));

                if (!encontrado) {
                    return [
                        parrafo('Dígame el nombre del cliente tal como está registrado y le doy su saldo, su cupo y sus facturas pendientes.'),
                        terceros.length ? nota(`Hay ${U.num(terceros.length)} clientes registrados. Por ejemplo: «saldo de ${terceros[0].nombre}».`) : null,
                        acciones(['clientes', 'cartera'])
                    ];
                }
                const saldo = ERP.db.saldoCliente(encontrado.id);
                const cupo = ERP.db.cupoDisponible(encontrado.id);
                const facturas = ERP.db.all('ventas')
                    .filter((v) => v.clienteId === encontrado.id && !v.anulada && U.round2(v.saldo) > 0)
                    .sort((a, b) => a.fecha.localeCompare(b.fecha));
                const bloques = [
                    parrafo(`${encontrado.nombre} (${encontrado.tipoDoc} ${encontrado.documento}):`),
                    cifras([
                        ['Saldo pendiente', U.money(saldo)],
                        ['Límite de crédito', U.money(encontrado.limiteCredito)],
                        ['Cupo disponible', U.money(cupo)]
                    ])
                ];
                if (facturas.length) {
                    bloques.push(tabla(['Factura', 'Vence', 'Saldo'],
                        facturas.slice(0, 8).map((v) => [
                            v.numero, U.fmtDate(v.fechaVencimiento || v.fecha), U.money(v.saldo)
                        ])));
                }
                bloques.push(acciones(['clientes', 'cartera']));
                return bloques;
            }
        },

        {
            clave: 'factura',
            modulo: 'ventas',
            ejemplo: '¿Cómo va la factura FV-0001?',
            palabras: ['factura fv', 'fv-', 'numero de factura'],
            responder: (ctx) => {
                const buscado = (ctx.texto.match(/fv[-\s]?0*(\d+)/) || [])[1];
                const ventas = ERP.db.all('ventas');
                const venta = buscado
                    ? ventas.find((v) => norm(v.numero).replace(/[^0-9]/g, '') === String(Number(buscado)).padStart(4, '0')
                        || norm(v.numero) === `fv-${buscado.padStart(4, '0')}`)
                    : null;
                if (!venta) {
                    return [
                        parrafo('No encontré esa factura. Escriba el número completo, por ejemplo «FV-0012».'),
                        acciones(['ventas'])
                    ];
                }
                const estado = ERP.db.estadoVenta(venta);
                const abonos = ERP.db.abonosDeVenta(venta.id);
                return [
                    parrafo(`Factura ${venta.numero}, del ${U.fmtDate(venta.fecha)}:`),
                    cifras([
                        ['Cliente', ERP.db.nombreTercero(venta.clienteId)],
                        ['Estado', estado.texto],
                        ['Total', U.money(venta.total)],
                        ['Saldo', U.money(venta.saldo)],
                        ['Condición', venta.condicion === 'credito' ? `Crédito a ${U.num(venta.diasCredito)} días` : 'Contado'],
                        ['Abonos', U.num(abonos.length)]
                    ]),
                    acciones(['ventas', 'cartera'])
                ];
            }
        },

        {
            clave: 'procedimiento',
            modulo: null,
            // Se revisa antes que los temas de datos: «cómo registro una venta»
            // es una pregunta de procedimiento, no de cuánto se vendió.
            prioritario: true,
            ejemplo: '¿Cómo registro una venta?',
            palabras: ['como registro', 'como hago', 'como creo', 'donde registro', 'como se registra', 'pasos para', 'como anulo', 'como importo', 'como exporto', 'respaldo'],
            responder: (ctx) => {
                const GUIAS = [
                    {
                        modulo: 'ventas', palabras: ['venta', 'factura', 'facturar'],
                        titulo: 'Registrar una venta',
                        pasos: [
                            'Ventas → Nueva venta.',
                            'Elija el cliente y la condición: contado o crédito con sus días.',
                            'Agregue las líneas con producto, cantidad y precio; el IVA se calcula según lo que esté marcado como gravado.',
                            'Al guardar, el sistema descuenta existencias y, si es a crédito, abre la cuenta por cobrar.'
                        ]
                    },
                    {
                        modulo: 'compras', palabras: ['compra', 'proveedor'],
                        titulo: 'Registrar una compra',
                        pasos: [
                            'Compras → Nueva compra.',
                            'Elija el proveedor y la condición de pago.',
                            'Agregue las líneas con producto, cantidad y costo.',
                            'Al guardar, suben las existencias y se recalcula el costo promedio ponderado.'
                        ]
                    },
                    {
                        modulo: 'cartera', palabras: ['abono', 'cobro', 'pago de cliente'],
                        titulo: 'Registrar un abono',
                        pasos: [
                            'Cartera y abonos → busque la factura pendiente.',
                            'Registre el abono con su fecha, valor y medio de pago.',
                            'El saldo de la factura y el del cliente bajan al instante.'
                        ]
                    },
                    {
                        modulo: 'gastos', palabras: ['gasto'],
                        titulo: 'Registrar un gasto',
                        pasos: [
                            'Gastos → Nuevo gasto.',
                            'Elija la categoría, la fecha y el valor, y marque si ya está pagado.',
                            'Los gastos pagados salen del flujo de caja; todos afectan la utilidad del periodo.'
                        ]
                    },
                    {
                        modulo: 'configuracion', palabras: ['respaldo', 'exportar', 'importar', 'copia'],
                        titulo: 'Respaldar o mover los datos',
                        pasos: [
                            'Configuración → Datos y respaldo.',
                            'Exportar datos (JSON) guarda una copia completa.',
                            'Importar respaldo reemplaza los datos de este navegador.',
                            'Con la nube, Subir y Descargar hacen lo mismo entre equipos.'
                        ]
                    }
                ];
                const guia = GUIAS.find((g) => contiene(ctx.texto, g.palabras) && ERP.auth.puede(g.modulo));
                if (!guia) {
                    const posibles = GUIAS.filter((g) => ERP.auth.puede(g.modulo)).map((g) => g.titulo);
                    return [
                        parrafo('¿Sobre cuál de estos procedimientos?'),
                        lista(posibles)
                    ];
                }
                return [
                    parrafo(`${guia.titulo}:`),
                    el('ol', { class: 'copi-lista' }, guia.pasos.map((p) => el('li', { text: p }))),
                    acciones([guia.modulo])
                ];
            }
        },

        {
            clave: 'permisos',
            modulo: null,
            ejemplo: '¿Qué puedo ver con mi rol?',
            palabras: ['permiso', 'mi rol', 'que puedo ver', 'acceso', 'no me aparece', 'no veo'],
            responder: () => {
                const usuario = ERP.auth.usuario();
                const modulos = ERP.auth.modulosPermitidos()
                    .map((clave) => (ERP.app.MODULOS[clave] || {}).etiqueta)
                    .filter(Boolean);
                return [
                    parrafo(`Entró como ${usuario.nombre} con el rol ${ERP.auth.etiquetaRol(usuario.rol)}${usuario.empresa ? ` en ${usuario.empresa}` : ''}.`),
                    parrafo(`Con ese rol ve ${U.num(modulos.length)} módulos:`),
                    lista(modulos),
                    nota('El administrador de su empresa decide esta lista en Configuración → Permisos por rol. Yo respondo solo sobre lo que usted tiene habilitado.')
                ];
            }
        },

        {
            clave: 'sistema',
            modulo: null,
            ejemplo: '¿Dónde se guardan mis datos?',
            palabras: ['version', 'empresa', 'donde se guardan', 'nube', 'sincroniz', 'copia de seguridad', 'supabase'],
            responder: () => {
                const cfg = ERP.db.config();
                const estado = ERP.nube && ERP.nube.estado ? ERP.nube.estado() : {};
                const perfil = estado.perfil || {};
                return [
                    cifras([
                        ['Empresa', cfg.empresa],
                        ['NIT', cfg.nit || '—'],
                        ['Versión', ERP.VERSION],
                        ['IVA', U.pct(cfg.ivaPct)],
                        ['Sincronización', perfil.rev ? `revisión ${U.num(perfil.rev)}` : 'aún sin subir']
                    ]),
                    parrafo('Los datos se guardan en este navegador y se sincronizan con la base compartida del sistema. Su contraseña no se guarda aquí: la verifica el servidor.'),
                    acciones(['configuracion'])
                ];
            }
        }
    ];

    /* ---------- Motor ---------- */

    const responder = (pregunta) => {
        const texto = norm(pregunta);
        if (!texto) return [parrafo('Escriba su pregunta y la reviso contra los datos del sistema.')];

        const ctx = { texto, rango: rangoDe(texto) };
        const tema = TEMAS.find((t) => t.prioritario && contiene(texto, t.palabras))
            || TEMAS.find((t) => contiene(texto, t.palabras));

        if (!tema) {
            const sugerencias = TEMAS
                .filter((t) => t.ejemplo && (!t.modulo || ERP.auth.puede(t.modulo)))
                .slice(0, 6).map((t) => t.ejemplo);
            return [
                parrafo('Esa pregunta no la puedo resolver: solo respondo con la información que hay en esta aplicación.'),
                parrafo('Puedo ayudarle con, por ejemplo:'),
                lista(sugerencias)
            ];
        }

        // El rol manda: si no ve el módulo, tampoco se le responde por aquí.
        if (tema.modulo && !ERP.auth.puede(tema.modulo)) {
            const etiqueta = (ERP.app.MODULOS[tema.modulo] || {}).etiqueta || tema.modulo;
            return [
                parrafo(`Esa consulta pertenece a ${etiqueta}, que su rol de ${ERP.auth.etiquetaRol(ERP.auth.usuario().rol)} no tiene habilitado.`),
                nota('Si necesita ese acceso, pídaselo al administrador de su empresa.')
            ];
        }

        try {
            return tema.responder(ctx).filter(Boolean);
        } catch (error) {
            console.error('El copiloto no pudo responder', error);
            return [parrafo('No pude calcular esa respuesta con los datos actuales. Intente con otra pregunta o revise el módulo directamente.')];
        }
    };

    /* ---------- Interfaz ---------- */

    const burbuja = (quien, contenido) => {
        const caja = el('div', { class: `copi-msg copi-${quien}` });
        if (quien === 'copiloto') {
            caja.appendChild(el('span', { class: 'copi-firma', text: 'Copiloto' }));
        }
        U.appendAll(caja, Array.isArray(contenido) ? contenido : [parrafo(contenido)]);
        return caja;
    };

    const pintarConversacion = () => {
        if (!historial) return;
        U.clear(historial);
        conversacion.forEach((m) => {
            historial.appendChild(burbuja(m.quien, m.quien === 'usuario' ? m.texto : responder(m.texto)));
        });
        historial.scrollTop = historial.scrollHeight;
    };

    const preguntar = (texto) => {
        const limpio = String(texto || '').trim();
        if (!limpio) return;
        conversacion.push({ quien: 'usuario', texto: limpio });
        conversacion.push({ quien: 'copiloto', texto: limpio });
        pintarConversacion();
        if (campo) campo.value = '';
    };

    const sugerencias = () => TEMAS
        .filter((t) => t.ejemplo && (!t.modulo || ERP.auth.puede(t.modulo)))
        .slice(0, 5)
        .map((t) => el('button', {
            class: 'copi-chip', text: t.ejemplo, attrs: { type: 'button' },
            on: { click: () => preguntar(t.ejemplo) }
        }));

    const cerrar = () => {
        abierto = false;
        if (cajon) cajon.classList.remove('abierto');
    };

    const alternar = () => {
        abierto = !abierto;
        if (!cajon) return;
        cajon.classList.toggle('abierto', abierto);
        if (abierto && campo) campo.focus();
    };

    /** Construye el lanzador y el cajón dentro del shell de la aplicación. */
    const montar = (raiz) => {
        historial = el('div', { class: 'copi-historial', attrs: { role: 'log', 'aria-live': 'polite' } });
        campo = ui.input({ placeholder: 'Pregunte sobre sus datos o sus módulos…' });

        const formulario = el('form', { class: 'copi-entrada' }, [
            campo,
            el('button', { class: 'btn btn-sm', text: 'Enviar', attrs: { type: 'submit' } })
        ]);
        formulario.addEventListener('submit', (evento) => {
            evento.preventDefault();
            preguntar(campo.value);
        });

        cajon = el('section', {
            class: 'copi-cajon',
            attrs: { 'aria-label': 'Copiloto del sistema' }
        }, [
            el('header', { class: 'copi-cabecera' }, [
                el('div', { class: 'grow' }, [
                    el('strong', { text: 'Copiloto' }),
                    el('span', { class: 'copi-sub', text: 'Responde con los datos de este sistema' })
                ]),
                el('button', {
                    class: 'btn btn-ghost btn-sm', text: 'Limpiar', attrs: { type: 'button' },
                    on: {
                        click: () => {
                            conversacion = [];
                            pintarConversacion();
                            if (campo) campo.focus();
                        }
                    }
                }),
                el('button', {
                    class: 'btn btn-ghost btn-sm', text: '✕',
                    attrs: { type: 'button', 'aria-label': 'Cerrar el copiloto' },
                    on: { click: cerrar }
                })
            ]),
            historial,
            el('div', { class: 'copi-chips' }, sugerencias()),
            formulario
        ]);

        cajon.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') cerrar();
        });

        const lanzador = el('button', {
            class: 'copi-lanzador',
            attrs: { type: 'button', 'aria-label': 'Abrir el copiloto', title: 'Copiloto' },
            on: { click: alternar }
        }, [el('span', { class: 'icono', text: 'forum', attrs: { 'aria-hidden': 'true' } })]);

        raiz.appendChild(cajon);
        raiz.appendChild(lanzador);

        if (!conversacion.length) {
            const usuario = ERP.auth.usuario();
            conversacion.push({
                quien: 'copiloto',
                texto: `__bienvenida__${usuario ? usuario.nombre : ''}`
            });
        }
        pintarConversacion();
        cajon.classList.toggle('abierto', abierto);
    };

    /* La bienvenida se arma como cualquier otra respuesta. */
    TEMAS.unshift({
        clave: 'bienvenida',
        modulo: null,
        palabras: ['__bienvenida__'],
        responder: () => {
            // El nombre se toma de la sesión, no del texto: ahí ya viene normalizado.
            const usuario = ERP.auth.usuario();
            const saludo = usuario && usuario.nombre ? `Hola, ${usuario.nombre.split(' ')[0]}. ` : 'Hola. ';
            return [
                parrafo(`${saludo}Resuelvo dudas sobre este sistema: sus cifras, sus documentos y cómo se usa cada módulo. Pruebe con una de las preguntas de abajo o escriba la suya.`),
                nota('Solo leo los datos: no registro ni modifico nada. Tampoco respondo sobre temas ajenos a la aplicación.')
            ];
        }
    });

    return { montar, preguntar, responder, cerrar };
})();
