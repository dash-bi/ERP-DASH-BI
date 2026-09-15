/* ============================================================
   dashboard.js — Tablero ejecutivo
   Los filtros son la pieza central: KPIs, gráficos y tablas
   se alimentan siempre del MISMO conjunto de datos filtrado.
   ============================================================ */

window.ERP = window.ERP || {};

ERP.dashboard = (() => {
    const U = ERP.util;
    const { el } = U;
    const ui = ERP.ui;
    const db = ERP.db;
    const fin = ERP.finanzas;

    const estado = {
        rango: 'mes',
        desde: U.startOfMonth(U.today()),
        hasta: U.today(),
        categoria: '',
        productoId: ''
    };

    const RANGOS = [
        { valor: 'hoy', texto: 'Hoy' },
        { valor: 'semana', texto: 'Esta semana' },
        { valor: 'mes', texto: 'Mes actual' },
        { valor: 'trimestre', texto: 'Últimos 3 meses' },
        { valor: 'ano', texto: 'Año en curso' },
        { valor: 'personalizado', texto: 'Rango personalizado' }
    ];

    const aplicarRango = (clave) => {
        const hoy = U.today();
        estado.rango = clave;
        if (clave === 'hoy') { estado.desde = hoy; estado.hasta = hoy; }
        if (clave === 'semana') { estado.desde = U.startOfWeek(hoy); estado.hasta = hoy; }
        if (clave === 'mes') { estado.desde = U.startOfMonth(hoy); estado.hasta = hoy; }
        if (clave === 'trimestre') { estado.desde = U.startOfMonth(U.addMonths(hoy, -2)); estado.hasta = hoy; }
        if (clave === 'ano') { estado.desde = `${hoy.slice(0, 4)}-01-01`; estado.hasta = hoy; }
    };

    /* ============================================================
       Selección de datos: una sola función alimenta todo el tablero
       ============================================================ */

    const coincideItem = (item) => {
        if (!estado.categoria && !estado.productoId) return true;
        const producto = db.productoPorId(item.productoId);
        if (!producto) return false;
        if (estado.productoId && producto.id !== estado.productoId) return false;
        if (estado.categoria && producto.categoria !== estado.categoria) return false;
        return true;
    };

    const netoItem = (item) => {
        const bruto = U.toNumber(item.cantidad) * U.toNumber(item.valorUnitario);
        return bruto - bruto * (U.toNumber(item.descuentoPct) / 100);
    };

    const datosFiltrados = (desde, hasta) => {
        const ventas = db.all('ventas').filter(
            (v) => !v.anulada && v.fecha >= desde && v.fecha <= hasta);

        let ingresos = 0;
        let costoVentas = 0;
        let unidades = 0;
        const facturas = new Set();

        ventas.forEach((venta) => {
            venta.items.filter(coincideItem).forEach((item) => {
                ingresos += netoItem(item);
                costoVentas += U.toNumber(item.cantidad) * U.toNumber(item.costoUnitario);
                unidades += U.toNumber(item.cantidad);
                facturas.add(venta.id);
            });
        });

        // Los gastos no se pueden repartir por categoría de producto:
        // cuando hay filtro de producto se informa explícitamente.
        const gastos = db.all('gastos').filter((g) => g.fecha >= desde && g.fecha <= hasta);

        return {
            ventas: ventas.filter((v) => facturas.has(v.id)),
            ingresos: U.roundCop(ingresos),
            costoVentas: U.roundCop(costoVentas),
            utilidadBruta: U.roundCop(ingresos - costoVentas),
            unidades,
            numeroFacturas: facturas.size,
            gastos: U.sum(gastos, (g) => g.valor),
            listaGastos: gastos
        };
    };

    /**
     * Serie del periodo: diaria si el rango es corto, mensual si es largo.
     * Devuelve las medidas que alimentan los gráficos y las minigráficas.
     */
    const construirSerie = (desde, hasta) => {
        const vacia = { etiquetas: [], ingresos: [], gastos: [], utilidad: [], resultado: [], caja: [] };
        const agregar = (acumulado, etiqueta, corte, tramo) => {
            acumulado.etiquetas.push(etiqueta);
            acumulado.ingresos.push(tramo.ingresos);
            acumulado.gastos.push(tramo.gastos);
            acumulado.utilidad.push(tramo.utilidadBruta);
            acumulado.resultado.push(U.roundCop(tramo.utilidadBruta - tramo.gastos));
            acumulado.caja.push(fin.saldoCaja(corte));
        };

        const dias = U.daysBetween(desde, hasta);

        if (dias <= 62) {
            const serie = { ...vacia, granularidad: 'diaria' };
            let cursor = desde;
            let guardia = 0;
            while (cursor <= hasta && guardia < 200) {
                agregar(serie, U.fmtDate(cursor).slice(0, 6), cursor, datosFiltrados(cursor, cursor));
                cursor = U.addDays(cursor, 1);
                guardia += 1;
            }
            return serie;
        }

        const serie = { ...vacia, granularidad: 'mensual' };
        U.periodRange(desde, hasta).forEach((periodo) => {
            const inicio = `${periodo}-01` < desde ? desde : `${periodo}-01`;
            const finMes = U.endOfMonth(`${periodo}-01`);
            const corte = finMes > hasta ? hasta : finMes;
            agregar(serie, U.fmtPeriod(periodo), corte, datosFiltrados(inicio, corte));
        });
        return serie;
    };

    /* ============================================================
       Comparación contra el periodo anterior equivalente
       ============================================================ */

    /** Mismo número de días, inmediatamente antes del rango actual. */
    const rangoAnterior = (desde, hasta) => {
        const dias = U.daysBetween(desde, hasta) + 1;
        return { desde: U.addDays(desde, -dias), hasta: U.addDays(desde, -1) };
    };

    const variacion = (actual, previo) => {
        const delta = U.roundCop(actual - previo);
        if (delta === 0 && U.toNumber(previo) === 0) return null;
        return {
            delta,
            pct: previo ? (delta / Math.abs(previo)) * 100 : null,
            signo: delta > 0 ? 1 : delta < 0 ? -1 : 0
        };
    };

    /* ============================================================
       Tarjetas de indicadores
       ============================================================ */

    const FLECHA = { '1': '▲', '-1': '▼', '0': '=' };

    /**
     * Indicador principal: cifra grande, variación contra el periodo anterior
     * y tendencia. favorable indica qué dirección es buena para el negocio.
     */
    const kpiPrincipal = (opts) => {
        const nodos = [
            el('p', { class: 'kpi-label', text: opts.etiqueta }),
            el('p', { class: 'kpi-value', text: opts.valor })
        ];

        if (opts.comparacion) {
            const c = opts.comparacion;
            const favorable = opts.favorable === 'baja' ? -1 : 1;
            const tono = c.signo === 0 ? 'neutro' : c.signo === favorable ? 'pos' : 'neg';
            const cuanto = c.pct === null ? U.money(Math.abs(c.delta))
                : `${U.money(Math.abs(c.delta))} · ${U.pct(Math.abs(c.pct))}`;
            nodos.push(el('p', { class: `kpi-delta ${tono}` }, [
                el('span', { text: FLECHA[String(c.signo)], attrs: { 'aria-hidden': 'true' } }),
                el('span', { text: cuanto }),
                el('span', {
                    class: 'kpi-delta-ref',
                    text: c.signo === 0 ? 'igual que el periodo anterior'
                        : c.signo > 0 ? 'más que el periodo anterior' : 'menos que el periodo anterior'
                })
            ]));
        }

        if (opts.contexto) nodos.push(el('p', { class: 'kpi-context', text: opts.contexto }));
        if (opts.serie && opts.serie.length > 1) {
            nodos.push(ERP.charts.chispa({ datos: opts.serie, color: opts.color }));
        }

        return el('article', {
            class: 'kpi kpi-hero',
            style: opts.color ? { '--kpi-accent': opts.color } : {}
        }, nodos);
    };

    /** Indicador secundario: compacto, para lo que se consulta de vez en cuando. */
    const kpiMini = (etiqueta, valor, contexto, color) => el('article', {
        class: 'kpi kpi-mini',
        style: color ? { '--kpi-accent': color } : {}
    }, [
        el('p', { class: 'kpi-label', text: etiqueta }),
        el('p', { class: 'kpi-value', text: valor }),
        contexto ? el('p', { class: 'kpi-context', text: contexto }) : null
    ]);

    /* ============================================================
       Vista
       ============================================================ */

    const vista = (contenedor) => {
        const zonaContenido = el('div', { class: 'stack' });

        const inpDesde = ui.input({ tipo: 'date', valor: estado.desde });
        const inpHasta = ui.input({ tipo: 'date', valor: estado.hasta });

        const selRango = ui.select(RANGOS, { valor: estado.rango });
        const selCategoria = ui.select(ERP.inventario.categorias(), {
            placeholder: 'Todas las categorías', valor: estado.categoria
        });
        const selProducto = ui.select([], { placeholder: 'Todos los productos' });

        const campoDesde = ui.campo('Desde', inpDesde);
        const campoHasta = ui.campo('Hasta', inpHasta);

        const refrescarProductos = () => {
            const lista = db.productos()
                .filter((p) => !estado.categoria || p.categoria === estado.categoria)
                .map((p) => ({ valor: p.id, texto: `${p.sku} — ${U.truncate(p.nombre, 34)}` }));
            U.clear(selProducto);
            selProducto.appendChild(el('option', { text: 'Todos los productos', attrs: { value: '' } }));
            lista.forEach((op) => selProducto.appendChild(
                el('option', { text: op.texto, attrs: { value: op.valor } })));
            selProducto.value = estado.productoId;
        };

        const alternarPersonalizado = () => {
            const personalizado = estado.rango === 'personalizado';
            campoDesde.classList.toggle('is-hidden', !personalizado);
            campoHasta.classList.toggle('is-hidden', !personalizado);
        };

        selRango.addEventListener('change', (event) => {
            aplicarRango(event.target.value);
            inpDesde.value = estado.desde;
            inpHasta.value = estado.hasta;
            alternarPersonalizado();
            pintar();
        });

        inpDesde.addEventListener('change', (event) => {
            estado.desde = event.target.value;
            estado.rango = 'personalizado';
            selRango.value = 'personalizado';
            alternarPersonalizado();
            pintar();
        });

        inpHasta.addEventListener('change', (event) => {
            estado.hasta = event.target.value;
            estado.rango = 'personalizado';
            selRango.value = 'personalizado';
            alternarPersonalizado();
            pintar();
        });

        selCategoria.addEventListener('change', (event) => {
            estado.categoria = event.target.value;
            estado.productoId = '';
            refrescarProductos();
            pintar();
        });

        selProducto.addEventListener('change', (event) => {
            estado.productoId = event.target.value;
            pintar();
        });

        const btnLimpiar = el('button', {
            class: 'btn btn-secondary btn-sm', text: 'Limpiar filtros', attrs: { type: 'button' },
            on: {
                click: () => {
                    estado.categoria = '';
                    estado.productoId = '';
                    aplicarRango('mes');
                    selRango.value = 'mes';
                    selCategoria.value = '';
                    inpDesde.value = estado.desde;
                    inpHasta.value = estado.hasta;
                    refrescarProductos();
                    alternarPersonalizado();
                    pintar();
                }
            }
        });

        const pintar = () => {
            U.clear(zonaContenido);

            if (estado.desde > estado.hasta) {
                zonaContenido.appendChild(ui.estadoError('Rango de fechas inválido',
                    'La fecha inicial es posterior a la final. Corrija el rango para ver la información.'));
                return;
            }

            const datos = datosFiltrados(estado.desde, estado.hasta);
            const serie = construirSerie(estado.desde, estado.hasta);
            const previo = rangoAnterior(estado.desde, estado.hasta);
            const datosPrevios = datosFiltrados(previo.desde, previo.hasta);
            const hayFiltroProducto = Boolean(estado.categoria || estado.productoId);

            const pendientes = db.all('ventas').filter((v) => !v.anulada && U.toNumber(v.saldo) > 0);
            const carteraTotal = U.sum(pendientes, (v) => v.saldo);
            const antiguedad = fin.carteraPorAntiguedad(estado.hasta);
            const vencidas = pendientes.filter((v) => v.fechaVencimiento < U.today());
            const inventarioValor = fin.inventarioFisico();
            const bajoMinimo = db.productosBajoMinimo();
            const cajaActual = fin.saldoCaja(estado.hasta);
            const cajaPrevia = fin.saldoCaja(previo.hasta);

            const ranking = fin.productosMasVendidos(estado.desde, estado.hasta, 8, estado.categoria)
                .filter((p) => !estado.productoId || p.nombre === db.nombreProducto(estado.productoId));

            const gastosPorCategoria = [...U.groupBy(datos.listaGastos, 'categoria').entries()]
                .map(([categoria, lista]) => ({ etiqueta: categoria, valor: U.sum(lista, (g) => g.valor) }))
                .sort((a, b) => b.valor - a.valor);

            const resultado = U.roundCop(datos.utilidadBruta - datos.gastos);
            const resultadoPrevio = U.roundCop(datosPrevios.utilidadBruta - datosPrevios.gastos);
            const margen = (U.safeDiv(datos.utilidadBruta, datos.ingresos) || 0) * 100;
            const ticket = datos.numeroFacturas ? datos.ingresos / datos.numeroFacturas : 0;
            const sinMovimientos = datos.numeroFacturas === 0 && datos.listaGastos.length === 0;

            /* --- Estado de filtros activos --- */
            const chips = [];
            chips.push(ui.badge(`${U.fmtDate(estado.desde)} → ${U.fmtDate(estado.hasta)}`, 'info'));
            if (estado.categoria) chips.push(ui.badge(`Categoría: ${estado.categoria}`, 'info'));
            if (estado.productoId) chips.push(ui.badge(`Producto: ${U.truncate(db.nombreProducto(estado.productoId), 28)}`, 'info'));
            chips.push(ui.badge(`${datos.numeroFacturas} facturas`, 'neutral'));

            /* --- Periodo sin movimientos: se explica, no se llena de ceros --- */
            const panelVacio = () => ui.estadoVacio(
                'No hay movimientos en este periodo',
                `Entre el ${U.fmtDate(estado.desde)} y el ${U.fmtDate(estado.hasta)} no se registraron ventas ni gastos${hayFiltroProducto ? ' con los filtros seleccionados' : ''}. Amplíe el rango de fechas o registre la operación del periodo.`,
                el('div', { class: 'row row-wrap', style: { justifyContent: 'center' } }, [
                    el('button', {
                        class: 'btn btn-secondary', text: 'Ver el año en curso', attrs: { type: 'button' },
                        on: {
                            click: () => {
                                aplicarRango('ano');
                                selRango.value = 'ano';
                                inpDesde.value = estado.desde;
                                inpHasta.value = estado.hasta;
                                alternarPersonalizado();
                                pintar();
                            }
                        }
                    }),
                    ERP.auth.puede('ventas') ? el('button', {
                        class: 'btn', text: 'Registrar una venta', attrs: { type: 'button' },
                        on: { click: () => ERP.app.irA('ventas') }
                    }) : null
                ]));

            U.appendAll(zonaContenido, [
                el('div', { class: 'filter-status' }, [
                    el('span', { class: 'strong', text: 'Filtros activos:' }),
                    ...chips
                ]),

                hayFiltroProducto
                    ? ui.banner('Alcance del filtro de producto',
                        'Los ingresos, el costo de ventas y la utilidad bruta corresponden solo a los ítems filtrados. Los gastos operativos no son atribuibles a un producto, por lo que se muestran completos del periodo.',
                        'info')
                    : null,

                // Cuatro cifras que mandan, con su tendencia y su variación.
                el('div', { class: 'kpi-hero-grid' }, [
                    kpiPrincipal({
                        etiqueta: 'Ingresos', valor: U.money(datos.ingresos),
                        contexto: `${datos.numeroFacturas} facturas · ${U.num(datos.unidades)} unidades`,
                        comparacion: variacion(datos.ingresos, datosPrevios.ingresos),
                        color: 'var(--c1)', serie: serie.ingresos
                    }),
                    kpiPrincipal({
                        etiqueta: 'Utilidad bruta', valor: U.money(datos.utilidadBruta),
                        contexto: `Margen ${U.pct(margen)} sobre los ingresos`,
                        comparacion: variacion(datos.utilidadBruta, datosPrevios.utilidadBruta),
                        color: 'var(--c2)', serie: serie.utilidad
                    }),
                    kpiPrincipal({
                        etiqueta: 'Resultado del periodo', valor: U.money(resultado),
                        contexto: resultado >= 0 ? 'Utilidad después de gastos' : 'Pérdida después de gastos',
                        comparacion: variacion(resultado, resultadoPrevio),
                        color: resultado >= 0 ? 'var(--c2)' : 'var(--c6)', serie: serie.resultado
                    }),
                    kpiPrincipal({
                        etiqueta: 'Saldo en caja', valor: U.money(cajaActual),
                        contexto: `Al ${U.fmtDate(estado.hasta)}`,
                        comparacion: variacion(cajaActual, cajaPrevia),
                        color: 'var(--c5)', serie: serie.caja
                    })
                ]),

                sinMovimientos ? null : el('div', { class: 'kpi-mini-grid' }, [
                    kpiMini('Costo de ventas', U.money(datos.costoVentas), 'Congelado en cada venta', 'var(--c6)'),
                    kpiMini('Gastos operativos', U.money(datos.gastos), `${datos.listaGastos.length} registros del periodo`, 'var(--c3)'),
                    kpiMini('Ticket promedio', U.money(ticket), 'Ingreso medio por factura', 'var(--c7)'),
                    kpiMini('Cuentas por cobrar', U.money(carteraTotal), `${pendientes.length} facturas con saldo`, 'var(--c4)'),
                    kpiMini('Cartera vencida', U.money(antiguedad.vencida),
                        `${vencidas.length} facturas fuera de plazo`, antiguedad.vencida > 0 ? 'var(--c6)' : 'var(--c2)'),
                    kpiMini('Valor del inventario', U.money(inventarioValor),
                        bajoMinimo.length ? `${bajoMinimo.length} ítems por reponer` : 'Existencias en nivel adecuado', 'var(--c5)')
                ]),

                bajoMinimo.length
                    ? ui.banner('Reposición de inventario',
                        `${bajoMinimo.length} ${bajoMinimo.length === 1 ? 'ítem está' : 'ítems están'} en o por debajo del mínimo. Revise el módulo de inventario.`,
                        'warning')
                    : null,

                sinMovimientos
                    ? ui.card('Periodo sin movimientos', panelVacio(), { sinRelleno: true })
                    : el('div', { class: 'dash-grid' }, [
                        el('div', { class: 'span-8' }, [
                            ui.card('Ventas contra gastos',
                                ERP.charts.lineas({
                                    etiquetas: serie.etiquetas,
                                    series: [
                                        { nombre: 'Ventas', datos: serie.ingresos, color: 'var(--c1)' },
                                        { nombre: 'Gastos', datos: serie.gastos, color: 'var(--c6)' }
                                    ]
                                }),
                                { subtitulo: `Agrupación ${serie.granularidad}` })
                        ]),
                        el('div', { class: 'span-4' }, [
                            ui.card('Cartera por antigüedad',
                                ERP.charts.barras({
                                    items: antiguedad.tramos.map((t) => ({
                                        etiqueta: t.etiqueta,
                                        valor: t.valor,
                                        detalle: { etiqueta: 'Facturas', valor: U.num(t.facturas) }
                                    })),
                                    nombreSerie: 'Saldo'
                                }),
                                { subtitulo: `Saldo abierto al ${U.fmtDate(estado.hasta)}` })
                        ]),
                        el('div', { class: 'span-7' }, [
                            ui.card('Productos más vendidos',
                                ERP.charts.barras({
                                    items: ranking.map((p) => ({
                                        etiqueta: p.nombre,
                                        valor: p.ingresos,
                                        detalle: { etiqueta: 'Unidades', valor: U.num(p.unidades) }
                                    })),
                                    nombreSerie: 'Ingresos'
                                }),
                                { subtitulo: 'Por ingresos generados en el periodo' })
                        ]),
                        el('div', { class: 'span-5' }, [
                            ui.card('Distribución de gastos',
                                ERP.charts.dona({ items: gastosPorCategoria, titulo: 'Gastos del periodo' }),
                                { subtitulo: 'Participación de cada categoría' })
                        ]),
                        el('div', { class: 'span-12' }, [
                            ui.card('Detalle de productos vendidos',
                                ranking.length
                                    ? ui.tabla(ranking, [
                                        { clave: 'nombre', titulo: 'Producto', ajustar: true },
                                        { clave: 'categoria', titulo: 'Categoría' },
                                        { clave: 'unidades', titulo: 'Unidades', tipo: 'numero' },
                                        { clave: 'ingresos', titulo: 'Ingresos', tipo: 'moneda' },
                                        { clave: 'costo', titulo: 'Costo', tipo: 'moneda' },
                                        { clave: 'utilidad', titulo: 'Utilidad bruta', tipo: 'moneda' },
                                        {
                                            clave: 'margen', titulo: 'Margen', tipo: 'nodo',
                                            valor: (p) => (U.safeDiv(p.utilidad, p.ingresos) || 0) * 100,
                                            render: (p) => {
                                                const m = (U.safeDiv(p.utilidad, p.ingresos) || 0) * 100;
                                                return el('span', { class: `num ${m < 15 ? 'neg' : 'pos'}`, text: U.pct(m) });
                                            }
                                        }
                                    ], {
                                        buscador: false,
                                        porPagina: 8,
                                        totales: (l) => ({
                                            nombre: `${l.length} productos`,
                                            unidades: U.sum(l, (p) => p.unidades),
                                            ingresos: U.sum(l, (p) => p.ingresos),
                                            costo: U.sum(l, (p) => p.costo),
                                            utilidad: U.sum(l, (p) => p.utilidad)
                                        })
                                    }).nodo
                                    : ui.estadoVacio('Sin ventas en el periodo',
                                        'No hay facturas que cumplan los filtros seleccionados. Amplíe el rango de fechas o quite el filtro de producto.'),
                                { sinRelleno: true })
                        ])
                    ])
            ]);
        };

        U.appendAll(contenedor, [
            el('div', { class: 'view-head' }, [
                el('div', { class: 'grow' }, [
                    el('h1', { text: 'Tablero ejecutivo' }),
                    el('p', { text: 'Indicadores, gráficos y detalle alimentados por los mismos filtros.' })
                ])
            ]),
            el('div', { class: 'filters dash-filtros' }, [
                ui.campo('Rango de fechas', selRango),
                campoDesde,
                campoHasta,
                ui.campo('Categoría', selCategoria),
                ui.campo('Producto', selProducto),
                el('div', { style: { paddingBottom: '1px' } }, [btnLimpiar])
            ]),
            zonaContenido
        ]);

        refrescarProductos();
        alternarPersonalizado();
        pintar();
    };

    return { vista, estado };
})();
