/* ============================================================
   app.js — Arranque, acceso, layout y enrutamiento
   ============================================================ */

window.ERP = window.ERP || {};

/* Versión publicada. Al cambiarla, actualizar también el ?v= de index.html
   para que el navegador no reutilice los archivos anteriores. */
ERP.VERSION = '2.2.0';

/* ============================================================
   Configuración del sistema (solo administrador)
   ============================================================ */

ERP.configuracion = (() => {
    const U = ERP.util;
    const { el } = U;
    const ui = ERP.ui;
    const db = ERP.db;

    /**
     * Solo el administrador usa Configuración. El menú ya la oculta a los demás roles,
     * pero cada acción revalida el rol vigente: la pantalla pudo quedar abierta después
     * de que se le quitara el rol de administrador a esta sesión (aquí o en otra pestaña).
     */
    const autorizado = () => {
        const sesion = ERP.auth.sincronizarSesion();
        if (sesion && ERP.auth.puede('configuracion')) return true;
        if (!sesion) ui.toastWarn('Sesión cerrada', 'Su usuario ya no existe o fue desactivado. Ingrese de nuevo.');
        // El montaje abre el primer módulo permitido y explica el cambio de acceso.
        ERP.app.refrescar();
        return false;
    };

    /* ---------- Usuarios y accesos ---------- */

    /* La lista vive en Supabase, así que se pide por red. Se guarda en memoria
       para no repetir la consulta en cada repintado; las acciones la refrescan. */
    let cacheUsuarios = null;

    const refrescarUsuarios = async (pintar) => {
        const res = await ERP.nube.usuariosEmpresa();
        cacheUsuarios = res.ok ? res : { ok: false, error: res.error };
        pintar();
    };

    /** Correo, nombre y rol de quien tendrá acceso. La contraseña la pone la persona. */
    const abrirInvitacion = (pintar) => {
        if (!autorizado()) return;
        const campos = {
            email: ui.input({ tipo: 'email', placeholder: 'persona@empresa.com', autocomplete: 'off' }),
            nombre: ui.input({ placeholder: 'Nombre y apellido' }),
            rol: ui.select(ERP.auth.ROLES_EMPRESA.map((valor) => ({ valor, texto: ERP.auth.ROLES[valor].etiqueta })),
                { valor: 'auxiliar' })
        };
        const errores = el('div');

        const descripcionRol = el('span', { class: 'hint' });
        const actualizarDescripcion = () => {
            const rol = ERP.auth.ROLES[campos.rol.value];
            const modulos = ERP.auth.modulosDeRol(campos.rol.value).length;
            descripcionRol.textContent = rol ? `${rol.descripcion} Ve ${modulos} módulos, según Permisos por rol.` : '';
        };
        campos.rol.addEventListener('change', actualizarDescripcion);
        actualizarDescripcion();

        const campoRol = ui.campo('Rol', campos.rol);
        campoRol.appendChild(descripcionRol);

        const formulario = el('form', { class: 'stack' }, [
            el('p', {
                class: 'text-muted',
                text: 'La persona crea su propia contraseña al registrarse con este correo. Nadie más la conoce, tampoco el administrador.'
            }),
            errores,
            el('div', { class: 'grid-form' }, [
                ui.campo('Correo electrónico', campos.email, { clase: 'span-full' }),
                ui.campo('Nombre', campos.nombre),
                campoRol
            ])
        ]);

        const btnCancelar = el('button', { class: 'btn btn-secondary', text: 'Cancelar', attrs: { type: 'button' } });
        const btnInvitar = el('button', { class: 'btn', text: 'Dar acceso', attrs: { type: 'submit' } });
        formulario.appendChild(el('div', { class: 'row row-wrap' }, [btnInvitar]));
        btnInvitar.style.display = 'none';

        const ctrl = ui.modal({
            titulo: 'Dar acceso a una persona',
            subtitulo: 'Se habilita por su correo electrónico',
            contenido: formulario,
            acciones: [btnCancelar, el('button', {
                class: 'btn', text: 'Dar acceso', attrs: { type: 'button' },
                on: { click: () => formulario.requestSubmit(btnInvitar) }
            })]
        });
        btnCancelar.addEventListener('click', () => ctrl.cerrar());

        formulario.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            if (!autorizado()) return;
            U.clear(errores);
            const res = await ERP.nube.invitar({
                email: campos.email.value,
                nombre: campos.nombre.value,
                rol: campos.rol.value
            });
            if (!res.ok) {
                errores.appendChild(ui.banner('No se pudo dar el acceso', res.error, 'danger'));
                return;
            }
            ctrl.cerrar();
            const inv = res.invitacion || {};
            if (inv.estado === 'vinculada') {
                ui.toastOk('Acceso concedido', `${inv.email} ya tenía cuenta y entra como ${ERP.auth.etiquetaRol(campos.rol.value)}.`);
            } else {
                ui.toastOk('Invitación creada',
                    `${inv.email} podrá entrar en cuanto cree su cuenta con ese correo. La invitación vence en 30 días.`);
            }
            await refrescarUsuarios(pintar);
        });

        campos.email.focus();
    };

    /** Nombre, rol y estado de un usuario de la empresa. La contraseña no se toca desde aquí. */
    const abrirEdicionUsuario = (registro, pintar) => {
        if (!autorizado()) return;
        const actual = ERP.auth.usuario();
        const esPropio = Boolean(actual && actual.id === registro.id);

        const campos = {
            nombre: ui.input({ valor: registro.nombre }),
            rol: ui.select(ERP.auth.ROLES_EMPRESA.map((valor) => ({ valor, texto: ERP.auth.ROLES[valor].etiqueta })),
                { valor: registro.rol })
        };
        const activo = el('input', {
            attrs: { type: 'checkbox', id: 'usuario-activo' },
            props: { checked: registro.activo !== false }
        });
        const errores = el('div');

        const formulario = el('form', { class: 'stack' }, [
            errores,
            el('div', { class: 'grid-form' }, [
                ui.campo('Nombre', campos.nombre, { clase: 'span-full' }),
                ui.campo('Rol', campos.rol)
            ]),
            el('div', { class: 'row row-wrap' }, [
                activo,
                el('label', { text: 'Puede entrar al sistema', attrs: { for: 'usuario-activo' } })
            ]),
            el('p', {
                class: 'text-muted',
                text: `Correo: ${registro.email || '—'} · usuario: ${registro.usuario}. La contraseña la administra cada persona desde «¿Olvidó su contraseña?» en la pantalla de acceso.`
            })
        ]);

        const btnCancelar = el('button', { class: 'btn btn-secondary', text: 'Cancelar', attrs: { type: 'button' } });
        const btnGuardar = el('button', { class: 'btn', text: 'Guardar', attrs: { type: 'button' } });

        const ctrl = ui.modal({
            titulo: `Usuario ${registro.usuario}`,
            subtitulo: esPropio ? 'Es su propio usuario' : registro.email,
            contenido: formulario,
            acciones: [btnCancelar, btnGuardar]
        });
        btnCancelar.addEventListener('click', () => ctrl.cerrar());

        const guardar = async () => {
            if (!autorizado()) return;
            U.clear(errores);
            const res = await ERP.nube.actualizarPerfil({
                id: registro.id,
                nombre: campos.nombre.value,
                rol: campos.rol.value,
                activo: activo.checked
            });
            if (!res.ok) {
                errores.appendChild(ui.banner('No se pudo guardar', res.error, 'danger'));
                return;
            }
            ctrl.cerrar();
            ui.toastOk('Usuario actualizado', `${campos.nombre.value} · ${ERP.auth.etiquetaRol(campos.rol.value)}.`);
            await refrescarUsuarios(pintar);
            // Si se cambió a sí mismo, el montaje aplica el rol nuevo.
            if (esPropio) ERP.app.refrescar();
        };

        btnGuardar.addEventListener('click', guardar);
        formulario.addEventListener('submit', (evento) => { evento.preventDefault(); guardar(); });
    };

    /** Cambiar la propia contraseña: viaja a Supabase y no se guarda aquí. */
    const abrirCambioClave = () => {
        const campos = {
            nueva: ui.input({ tipo: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' }),
            confirmacion: ui.input({ tipo: 'password', autocomplete: 'new-password', placeholder: 'Repita la contraseña' })
        };
        const errores = el('div');

        const formulario = el('form', { class: 'stack' }, [
            errores,
            el('div', { class: 'grid-form' }, [
                ui.campo('Contraseña nueva', campos.nueva, { clase: 'span-full' }),
                ui.campo('Repita la contraseña', campos.confirmacion, { clase: 'span-full' })
            ])
        ]);

        const btnCancelar = el('button', { class: 'btn btn-secondary', text: 'Cancelar', attrs: { type: 'button' } });
        const btnGuardar = el('button', { class: 'btn', text: 'Cambiar contraseña', attrs: { type: 'button' } });

        const ctrl = ui.modal({
            titulo: 'Cambiar mi contraseña',
            ancho: 'estrecho',
            contenido: formulario,
            acciones: [btnCancelar, btnGuardar]
        });
        btnCancelar.addEventListener('click', () => ctrl.cerrar());

        const guardar = async () => {
            U.clear(errores);
            if (campos.nueva.value !== campos.confirmacion.value) {
                errores.appendChild(ui.banner('No coinciden', 'Las dos contraseñas deben ser iguales.', 'danger'));
                return;
            }
            const res = await ERP.auth.cambiarClave(campos.nueva.value);
            if (!res.ok) {
                errores.appendChild(ui.banner('No se pudo cambiar', res.error, 'danger'));
                return;
            }
            ctrl.cerrar();
            ui.toastOk('Contraseña cambiada', 'Úsela la próxima vez que entre.');
        };

        btnGuardar.addEventListener('click', guardar);
        formulario.addEventListener('submit', (evento) => { evento.preventDefault(); guardar(); });
        campos.nueva.focus();
    };

    const tarjetaUsuarios = () => {
        const cuerpo = el('div', { class: 'stack' });
        const nube = ERP.nube;

        const pintar = () => {
            U.clear(cuerpo);

            const btnInvitar = el('button', {
                class: 'btn', text: 'Dar acceso a una persona', attrs: { type: 'button' },
                on: { click: () => abrirInvitacion(pintar) }
            });
            const btnClave = el('button', {
                class: 'btn btn-secondary', text: 'Cambiar mi contraseña', attrs: { type: 'button' },
                on: { click: abrirCambioClave }
            });
            const btnRecargar = el('button', {
                class: 'btn btn-ghost', text: 'Actualizar lista', attrs: { type: 'button' },
                on: { click: () => refrescarUsuarios(pintar) }
            });

            U.appendAll(cuerpo, [
                el('p', {
                    class: 'text-muted',
                    text: 'Cada persona entra con su correo y su contraseña. Las contraseñas las guarda Supabase cifradas y no se pueden ver desde aquí ni desde ningún navegador.'
                })
            ]);

            if (!cacheUsuarios) {
                cuerpo.appendChild(ui.estadoCargando('Consultando los usuarios de la empresa…'));
                refrescarUsuarios(pintar);
                return;
            }
            if (!cacheUsuarios.ok) {
                U.appendAll(cuerpo, [
                    ui.banner('No se pudo consultar la lista', cacheUsuarios.error, 'warning'),
                    el('div', { class: 'row row-wrap' }, [btnRecargar])
                ]);
                return;
            }

            const actual = ERP.auth.usuario();
            const usuarios = cacheUsuarios.usuarios;

            /* Una tarjeta por persona. El árbol se arma con parent_id, que el
               servidor rellena con quien dio el alta. */
            const ficha = (u, esRaiz) => el('div', { class: `arbol-nodo${esRaiz ? ' es-raiz' : ''}${u.activo === false ? ' sin-acceso' : ''}` }, [
                el('div', { class: 'arbol-quien' }, [
                    el('span', { class: 'arbol-avatar', text: U.initials(u.nombre || u.usuario), attrs: { 'aria-hidden': 'true' } }),
                    el('div', { class: 'grow' }, [
                        el('div', { class: 'row' }, [
                            el('span', { class: 'strong', text: u.nombre }),
                            actual && actual.id === u.id ? ui.badge('Usted', 'neutral') : null,
                            u.activo === false ? ui.badge('Sin acceso', 'danger') : null
                        ]),
                        el('span', { class: 'arbol-correo', text: u.email || u.usuario })
                    ]),
                    ui.badge(ERP.auth.etiquetaRol(u.rol), u.rol === 'administrador' ? 'success' : 'info'),
                    el('span', { class: 'arbol-modulos', text: `${U.num(ERP.auth.modulosDeRol(u.rol).length)} módulos` }),
                    el('button', {
                        class: 'btn btn-ghost btn-sm', text: 'Editar',
                        attrs: { type: 'button', 'aria-label': `Editar el usuario ${u.usuario}` },
                        on: { click: () => abrirEdicionUsuario(u, pintar) }
                    })
                ])
            ]);

            const administradores = usuarios.filter((u) => u.rol === 'administrador');
            const operativos = usuarios.filter((u) => u.rol !== 'administrador');

            const arbol = el('div', { class: 'arbol' });
            administradores.forEach((jefe) => {
                const suyos = operativos.filter((u) => u.parentId === jefe.id);
                arbol.appendChild(el('div', { class: 'arbol-rama' }, [
                    ficha(jefe, true),
                    suyos.length ? el('div', { class: 'arbol-hijos' }, suyos.map((u) => ficha(u, false))) : null
                ]));
            });

            // Perfiles anteriores a esta versión no guardan de quién dependen.
            const sueltos = operativos.filter((u) => !administradores.some((a) => a.id === u.parentId));
            if (sueltos.length) {
                arbol.appendChild(el('div', { class: 'arbol-rama' }, [
                    el('p', { class: 'arbol-titulo', text: 'Sin jefe registrado' }),
                    el('div', { class: 'arbol-hijos' }, sueltos.map((u) => ficha(u, false)))
                ]));
            }
            if (!usuarios.length) arbol.appendChild(ui.estadoVacio('Todavía no hay usuarios', 'Dé acceso a la primera persona con su correo.'));

            cuerpo.appendChild(arbol);

            if (cacheUsuarios.invitaciones.length) {
                cuerpo.appendChild(el('h3', { text: 'Invitaciones pendientes' }));
                cuerpo.appendChild(el('div', { class: 'table-wrap' }, [
                    el('table', { class: 'data' }, [
                        el('thead', {}, [el('tr', {}, [
                            el('th', { text: 'Correo', attrs: { scope: 'col' } }),
                            el('th', { text: 'Nombre', attrs: { scope: 'col' } }),
                            el('th', { text: 'Rol', attrs: { scope: 'col' } }),
                            el('th', { text: 'Vence', attrs: { scope: 'col' } }),
                            el('th', { attrs: { scope: 'col' } }, [el('span', { class: 'visually-hidden', text: 'Acciones' })])
                        ])]),
                        el('tbody', {}, cacheUsuarios.invitaciones.map((i) => el('tr', {}, [
                            el('td', { text: i.email }),
                            el('td', { text: i.nombre }),
                            el('td', {}, [ui.badge(ERP.auth.etiquetaRol(i.rol), 'info')]),
                            el('td', { text: new Date(i.expiraEn).toLocaleDateString('es-CO') }),
                            el('td', { class: 'text-right' }, [el('button', {
                                class: 'btn btn-ghost btn-sm', text: 'Revocar',
                                attrs: { type: 'button', 'aria-label': `Revocar la invitación de ${i.email}` },
                                on: {
                                    click: async () => {
                                        if (!autorizado()) return;
                                        const ok = await ui.confirmar({
                                            titulo: 'Revocar la invitación',
                                            mensaje: `${i.email} ya no podrá entrar al registrarse.`,
                                            textoAceptar: 'Revocar',
                                            peligroso: true
                                        });
                                        if (!ok || !autorizado()) return;
                                        const res = await nube.revocarInvitacion(i.id);
                                        if (!res.ok) {
                                            ui.toastError('No se revocó', res.error);
                                            return;
                                        }
                                        ui.toastOk('Invitación revocada', i.email);
                                        await refrescarUsuarios(pintar);
                                    }
                                }
                            })])
                        ])))
                    ])
                ]));
            }

            cuerpo.appendChild(el('div', { class: 'row row-wrap' }, [btnInvitar, btnClave, btnRecargar]));
        };

        pintar();

        return ui.card('Usuarios y accesos', cuerpo, {
            subtitulo: 'Quién entra al sistema, con qué correo y con qué rol',
            pie: el('p', {
                class: 'text-muted',
                text: 'Las credenciales viven en Supabase Auth (auth.users), cifradas con bcrypt. La aplicación guarda en public.perfiles el correo, el nombre y el rol; nunca la contraseña.'
            })
        });
    };

    /* ---------- Permisos por rol ---------- */

    const tarjetaPermisos = () => {
        const { MODULOS, GRUPOS } = ERP.app;
        const roles = ERP.auth.ROLES_EMPRESA;
        const delegables = roles.filter((rol) => rol !== 'administrador');
        // La matriz reparte módulos de la organización: los de plataforma no
        // se delegan y ningún rol de empresa los ve.
        const claves = GRUPOS.flatMap((grupo) => Object.keys(MODULOS).filter(
            (clave) => MODULOS[clave].grupo === grupo && !ERP.auth.SOLO_PLATAFORMA.includes(clave)));

        // casillas[rol][modulo]: solo las editables; administrador y Configuración van fijas.
        const casillas = {};
        const errores = el('div');
        const resumen = el('p', { class: 'text-muted' });

        const seleccion = () => Object.fromEntries(delegables.map((rol) => [rol,
            Object.keys(casillas[rol] || {}).filter((clave) => casillas[rol][clave].checked)]));

        const actualizarResumen = () => {
            const actual = seleccion();
            resumen.textContent = delegables
                .map((rol) => `${ERP.auth.etiquetaRol(rol)}: ${actual[rol].length} módulos`)
                .join(' · ');
        };

        const filas = claves.map((clave) => {
            const soloAdmin = ERP.auth.SOLO_ADMINISTRADOR.includes(clave);
            return el('tr', {}, [
                el('td', {}, [
                    el('span', { class: 'strong', text: MODULOS[clave].etiqueta }),
                    soloAdmin ? el('span', { class: 'hint', text: ' · Solo administrador' }) : null
                ]),
                ...roles.map((rol) => {
                    const fija = rol === 'administrador' || soloAdmin;
                    const casilla = el('input', {
                        attrs: { type: 'checkbox', 'aria-label': `${MODULOS[clave].etiqueta} para ${ERP.auth.etiquetaRol(rol)}` },
                        props: { checked: ERP.auth.modulosDeRol(rol).includes(clave), disabled: fija }
                    });
                    if (!fija) {
                        casillas[rol] = casillas[rol] || {};
                        casillas[rol][clave] = casilla;
                        casilla.addEventListener('change', actualizarResumen);
                    }
                    return el('td', { class: rol === 'administrador' ? 'col-rol col-admin' : 'col-rol' }, [casilla]);
                })
            ]);
        });

        const btnGuardar = el('button', {
            class: 'btn', text: 'Guardar permisos', attrs: { type: 'button' },
            on: {
                click: () => {
                    if (!autorizado()) return;
                    U.clear(errores);
                    const res = ERP.auth.guardarPermisos(seleccion());
                    if (!res.ok) {
                        errores.appendChild(ui.banner('No se guardaron los permisos', res.error, 'danger'));
                        return;
                    }
                    ui.toastOk('Permisos guardados', `${delegables
                        .map((rol) => `${ERP.auth.etiquetaRol(rol)}: ${res.permisos[rol].length} módulos`)
                        .join(' · ')}. Las sesiones abiertas se actualizan al instante.`);
                }
            }
        });

        actualizarResumen();

        return ui.card('Permisos por rol', el('div', { class: 'stack' }, [
            errores,
            el('div', { class: 'table-wrap' }, [
                el('table', { class: 'data permisos-rol' }, [
                    el('thead', {}, [el('tr', {}, [
                        el('th', { text: 'Módulo', attrs: { scope: 'col' } }),
                        ...roles.map((rol) => el('th', { class: rol === 'administrador' ? 'col-rol col-admin' : 'col-rol', text: ERP.auth.etiquetaRol(rol), attrs: { scope: 'col' } }))
                    ])]),
                    el('tbody', {}, filas)
                ])
            ]),
            resumen,
            el('div', { class: 'row row-wrap' }, [btnGuardar])
        ]), {
            subtitulo: 'Marque qué módulos ve cada rol. El administrador los ve todos y Configuración es solo suya.'
        });
    };

    /* ---------- Nube: base de datos compartida en Supabase ---------- */

    /**
     * Enlaza este navegador con la base de datos del proyecto en Supabase.
     * Descargar trae los datos compartidos; subir publica los de este equipo.
     * El acceso a la nube es una cuenta de Supabase, distinta del usuario con
     * el que se entra a la aplicación: la nube la protege Supabase Auth con RLS.
     */
    const tarjetaNube = () => {
        const nube = ERP.nube;
        const cuerpo = el('div', { class: 'stack' });

        if (!nube || !nube.configurada()) {
            cuerpo.appendChild(ui.banner('La nube no está configurada',
                'Esta copia de la aplicación no trae los datos del proyecto de Supabase.', 'warning'));
            return ui.card('Nube (Supabase)', cuerpo, { subtitulo: 'Base de datos compartida entre equipos' });
        }

        const fechaNube = (valor) => {
            if (!valor) return 'nunca';
            const d = new Date(valor);
            return Number.isNaN(d.getTime()) ? 'nunca' : d.toLocaleString('es-CO');
        };

        const resumenDatos = (r) => [
            `${U.num(r.ventas || 0)} ventas`, `${U.num(r.compras || 0)} compras`,
            `${U.num(r.gastos || 0)} gastos`, `${U.num(r.productos || 0)} productos`,
            `${U.num(r.clientes !== undefined ? r.clientes : r.terceros || 0)} ${r.clientes !== undefined ? 'clientes' : 'terceros'}`
        ].join(', ');

        /* ---- Conectado y con empresa: sincronizar ---- */

        const panelSincronizacion = (perfil) => {
            const esAdmin = perfil.rol === 'administrador';

            const btnDescargar = el('button', {
                class: 'btn btn-secondary', text: '⤓ Descargar de la nube', attrs: { type: 'button' }
            });
            const btnSubir = el('button', {
                class: 'btn', text: '⤒ Subir a la nube', attrs: { type: 'button' },
                props: { disabled: !esAdmin }
            });

            btnDescargar.addEventListener('click', async () => {
                if (!autorizado()) return;
                const ok = await ui.confirmar({
                    titulo: 'Descargar los datos de la nube',
                    mensaje: 'Los datos de este navegador se reemplazan por los de la nube.',
                    detalle: 'No afecta a los usuarios ni a las contraseñas. Exporte un respaldo antes si tiene cambios sin subir.',
                    textoAceptar: 'Descargar y reemplazar',
                    peligroso: true
                });
                if (!ok || !autorizado()) return;
                const res = await nube.descargar();
                if (!res.ok) {
                    ui.toastError('No se descargaron los datos', res.error);
                    return;
                }
                ui.toastOk('Datos descargados', `${res.resumen.empresa}: ${resumenDatos(res.resumen)}.`);
                ERP.app.refrescar();
            });

            btnSubir.addEventListener('click', async () => {
                if (!autorizado()) return;
                const ok = await ui.confirmar({
                    titulo: 'Subir los datos a la nube',
                    mensaje: 'Los datos de la nube se reemplazan por los de este navegador.',
                    detalle: 'Si otro usuario subió cambios después de su última sincronización, la nube rechaza la subida y le pide descargar primero.',
                    textoAceptar: 'Subir y reemplazar',
                    peligroso: true
                });
                if (!ok || !autorizado()) return;
                const res = await nube.subir();
                if (!res.ok) {
                    ui.toastError('No se subieron los datos', res.error);
                    return;
                }
                ui.toastOk('Datos subidos', `Revisión ${res.rev}: ${resumenDatos(res.resumen)}.`);
                ERP.app.refrescar();
            });

            const auto = el('input', {
                attrs: { type: 'checkbox', id: 'nube-auto' },
                props: { checked: nube.auto(), disabled: !esAdmin }
            });
            auto.addEventListener('change', () => {
                if (!autorizado()) return;
                nube.activarAuto(auto.checked);
                ui.toastOk(auto.checked ? 'Subida automática activada' : 'Subida automática desactivada',
                    auto.checked
                        ? 'Cada cambio se envía a la nube unos segundos después de guardarlo.'
                        : 'Los cambios se envían solo cuando pulse «Subir a la nube».');
            });

            const btnSalir = el('button', {
                class: 'btn btn-ghost', text: 'Desconectar', attrs: { type: 'button' },
                on: {
                    click: async () => {
                        if (!autorizado()) return;
                        await nube.salir();
                        ui.toastOk('Sesión de la nube cerrada', 'Los datos de este navegador no cambiaron.');
                        ERP.app.refrescar();
                    }
                }
            });

            return el('div', { class: 'stack' }, [
                el('div', { class: 'row row-wrap' }, [
                    ui.badge('Conectado', 'success'),
                    el('span', { class: 'strong', text: perfil.empresa }),
                    ui.badge(ERP.auth.etiquetaRol(perfil.rol), 'info'),
                    el('span', { class: 'text-muted', text: nube.estado().email })
                ]),
                el('p', {
                    class: 'text-muted',
                    text: `Última sincronización: ${fechaNube(perfil.sincronizadoEn)} · revisión ${U.num(perfil.rev || 0)}.`
                }),
                esAdmin ? null : ui.banner('Su rol solo puede descargar',
                    'Reemplazar los datos compartidos está reservado al administrador.', 'info'),
                el('div', { class: 'row row-wrap' }, [
                    auto,
                    el('label', { text: 'Subir automáticamente los cambios de este equipo', attrs: { for: 'nube-auto' } })
                ]),
                el('div', { class: 'row row-wrap' }, [btnDescargar, btnSubir, btnSalir])
            ]);
        };

        const info = nube.estado();
        U.appendAll(cuerpo, [
            el('p', {
                class: 'text-muted',
                text: 'Guarda los datos de la empresa en PostgreSQL para verlos desde cualquier equipo. Los usuarios se gestionan aparte, en «Usuarios y accesos».'
            }),
            // Estando dentro siempre hay sesión; solo falta si caducó mientras trabajaba.
            info.conectado && info.perfil ? panelSincronizacion(info.perfil)
                : el('div', { class: 'stack' }, [
                    ui.banner('La sesión con la nube terminó',
                        'Guarde lo que esté haciendo y vuelva a entrar para sincronizar.', 'warning'),
                    el('div', { class: 'row row-wrap' }, [el('button', {
                        class: 'btn', text: 'Volver a entrar', attrs: { type: 'button' },
                        on: { click: async () => { await ERP.auth.cerrarSesion(); ERP.app.refrescar(); } }
                    })])
                ])
        ]);

        return ui.card('Nube (Supabase)', cuerpo, {
            subtitulo: 'Base de datos compartida: los mismos datos en cualquier equipo',
            pie: el('p', {
                class: 'text-muted',
                text: 'Subir y descargar reemplazan el conjunto completo dentro de una sola transacción: o entra todo, o no cambia nada.'
            })
        });
    };

    const vista = (contenedor) => {
        const cfg = db.config();

        const campos = {
            empresa: ui.input({ valor: cfg.empresa }),
            nit: ui.input({ valor: cfg.nit }),
            direccion: ui.input({ valor: cfg.direccion }),
            ciudad: ui.input({ valor: cfg.ciudad }),
            telefono: ui.input({ valor: cfg.telefono }),
            email: ui.input({ tipo: 'email', valor: cfg.email }),
            ivaPct: ui.input({ tipo: 'number', valor: cfg.ivaPct, numerico: true, min: 0, max: 100, step: 1 }),
            capitalInicial: ui.input({ tipo: 'number', valor: cfg.capitalInicial, numerico: true, min: 0, step: 1000000 }),
            salarioMinimo: ui.input({ tipo: 'number', valor: cfg.salarioMinimo, numerico: true, min: 0, step: 10000 }),
            auxilioTransporte: ui.input({ tipo: 'number', valor: cfg.auxilioTransporte, numerico: true, min: 0, step: 10000 }),
            topeAuxilioSmmlv: ui.input({ tipo: 'number', valor: cfg.topeAuxilioSmmlv, numerico: true, min: 0, step: 1 }),
            aporteSaludPct: ui.input({ tipo: 'number', valor: cfg.aporteSaludPct, numerico: true, min: 0, max: 100, step: 0.5 }),
            aportePensionPct: ui.input({ tipo: 'number', valor: cfg.aportePensionPct, numerico: true, min: 0, max: 100, step: 0.5 })
        };

        const guardar = () => {
            if (!autorizado()) return;
            const ivaPct = U.toNumber(campos.ivaPct.value);
            if (ivaPct < 0 || ivaPct > 100) {
                ui.toastError('IVA inválido', 'El porcentaje debe estar entre 0 y 100.');
                return;
            }
            if (!campos.empresa.value.trim()) {
                ui.toastError('Falta el nombre de la empresa', 'Es obligatorio para emitir facturas.');
                return;
            }

            db.updateConfig({
                empresa: campos.empresa.value.trim(),
                nit: campos.nit.value.trim(),
                direccion: campos.direccion.value.trim(),
                ciudad: campos.ciudad.value.trim(),
                telefono: campos.telefono.value.trim(),
                email: campos.email.value.trim(),
                ivaPct,
                capitalInicial: U.roundCop(campos.capitalInicial.value),
                salarioMinimo: U.roundCop(campos.salarioMinimo.value),
                auxilioTransporte: U.roundCop(campos.auxilioTransporte.value),
                topeAuxilioSmmlv: U.toNumber(campos.topeAuxilioSmmlv.value),
                aporteSaludPct: U.toNumber(campos.aporteSaludPct.value),
                aportePensionPct: U.toNumber(campos.aportePensionPct.value)
            });

            ui.toastOk('Configuración guardada', 'Los estados financieros se recalcularon con los nuevos parámetros.');
        };

        const btnGuardar = el('button', {
            class: 'btn', text: 'Guardar configuración', attrs: { type: 'button' },
            on: { click: guardar }
        });

        const exportarRespaldo = () => {
            if (!autorizado()) return;
            U.downloadBlob(
                new Blob([db.exportJSON()], { type: 'application/json' }),
                `respaldo-erp-${U.today()}.json`
            );
            ui.toastOk('Respaldo generado', 'Guarde el archivo en un lugar seguro.');
        };

        const btnExportar = el('button', {
            class: 'btn btn-secondary', text: '⤓ Exportar datos (JSON)', attrs: { type: 'button' },
            on: { click: exportarRespaldo }
        });

        /* Cada origen (archivo local, localhost, cada dirección de Vercel) guarda sus propios
           datos en el navegador: exportar e importar es la forma de llevarlos de uno a otro. */
        const abrirImportacion = (nombreArchivo, texto) => {
            const revision = db.validarRespaldo(texto);
            if (!revision.ok) {
                ui.toastError('Respaldo no válido', revision.error);
                return;
            }
            const r = revision.resumen;

            const entiendo = el('input', { attrs: { type: 'checkbox' } });
            const errores = el('div');
            const fila = (etiqueta, valor) => el('tr', {}, [
                el('td', { text: etiqueta }),
                el('td', { class: 'num', text: valor })
            ]);

            const contenido = el('div', { class: 'stack' }, [
                ui.banner('Se reemplazarán todos los datos actuales',
                    `La información guardada en este navegador se sustituye por la del archivo «${nombreArchivo}». Exporte los datos actuales antes si desea conservarlos.`,
                    'warning'),
                el('div', { class: 'table-wrap' }, [
                    el('table', { class: 'data' }, [el('tbody', {}, [
                        fila('Empresa', r.empresa || '—'),
                        fila('NIT', r.nit || '—'),
                        fila('Clientes', U.num(r.clientes)),
                        fila('Proveedores', U.num(r.proveedores)),
                        fila('Productos y servicios', U.num(r.productos)),
                        fila('Ventas', U.num(r.ventas)),
                        fila('Compras', U.num(r.compras)),
                        fila('Gastos', U.num(r.gastos)),
                        fila('Empleados', U.num(r.empleados))
                    ])])
                ]),
                el('div', { class: 'row row-wrap' }, [
                    el('button', {
                        class: 'btn btn-secondary', text: '⤓ Exportar los datos actuales antes', attrs: { type: 'button' },
                        on: { click: exportarRespaldo }
                    })
                ]),
                errores,
                el('label', { class: 'check' }, [
                    entiendo,
                    el('span', { text: 'Entiendo que los datos actuales de este navegador se reemplazan' })
                ])
            ]);

            const btnCancelar = el('button', { class: 'btn btn-secondary', text: 'Cancelar', attrs: { type: 'button' } });
            const btnReemplazar = el('button', {
                class: 'btn btn-danger', text: 'Reemplazar con el respaldo', attrs: { type: 'button' }, props: { disabled: true }
            });
            entiendo.addEventListener('change', () => { btnReemplazar.disabled = !entiendo.checked; });

            const ctrl = ui.modal({
                titulo: 'Importar respaldo',
                subtitulo: nombreArchivo,
                contenido,
                acciones: [btnCancelar, btnReemplazar]
            });
            btnCancelar.addEventListener('click', () => ctrl.cerrar());

            btnReemplazar.addEventListener('click', () => {
                U.clear(errores);
                if (!entiendo.checked) return;
                if (!autorizado()) {
                    ctrl.cerrar();
                    return;
                }
                const res = db.importarRespaldo(texto);
                if (!res.ok) {
                    errores.appendChild(ui.banner('No se importó el respaldo', res.error, 'danger'));
                    return;
                }
                ctrl.cerrar();
                ui.toastOk('Respaldo importado',
                    `${res.resumen.empresa}: ${U.num(res.resumen.ventas)} ventas, ${U.num(res.resumen.productos)} productos y ${U.num(res.resumen.clientes)} clientes.`);
                // El montaje resincroniza la sesión: si el usuario no está en el respaldo, vuelve al acceso.
                ERP.app.refrescar();
            });
        };

        const selectorRespaldo = el('input', {
            attrs: { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Archivo de respaldo' }
        });
        selectorRespaldo.addEventListener('change', async () => {
            const archivo = selectorRespaldo.files && selectorRespaldo.files[0];
            if (!archivo) return;
            try {
                if (!autorizado()) return;
                if (archivo.size > 10 * 1024 * 1024) {
                    ui.toastError('Archivo demasiado grande', 'El respaldo supera 10 MB; no parece un archivo de este sistema.');
                    return;
                }
                abrirImportacion(archivo.name, await archivo.text());
            } catch (error) {
                ui.toastError('No se pudo leer el archivo', 'Intente de nuevo o elija otro archivo.');
            } finally {
                // Permite volver a elegir el mismo archivo.
                selectorRespaldo.value = '';
            }
        });

        const btnImportar = el('button', {
            class: 'btn btn-secondary', text: '⤒ Importar respaldo (JSON)', attrs: { type: 'button' },
            on: { click: () => { if (autorizado()) selectorRespaldo.click(); } }
        });

        /* Borrado total para empezar con la empresa real. Se pide escribir una palabra
           porque, a diferencia de reiniciar la demostración, no deja nada que auditar. */
        const abrirEmpezarDeCero = () => {
            if (!autorizado()) return;

            const PALABRA = 'BORRAR';
            const campos = {
                empresa: ui.input({ placeholder: 'Razón social de su empresa' }),
                nit: ui.input({ placeholder: 'Ej. 900.123.456-7' }),
                capitalInicial: ui.input({ tipo: 'number', valor: 0, numerico: true, min: 0, step: 1000000 }),
                confirmacion: ui.input({ placeholder: PALABRA, autocomplete: 'off' })
            };
            const errores = el('div');

            const formulario = el('form', { class: 'stack' }, [
                ui.banner('Esta acción no se puede deshacer',
                    'Se borran clientes, proveedores, productos, compras, ventas, abonos, pagos, gastos, empleados, nóminas y presupuestos, incluidos los datos de demostración.',
                    'danger'),
                el('p', {
                    class: 'text-muted',
                    text: 'Se conservan los usuarios del sistema (viven en Supabase), los permisos por rol y los parámetros de IVA y nómina. Los consecutivos de facturas y compras vuelven a empezar en 1.'
                }),
                el('div', { class: 'row row-wrap' }, [
                    el('button', {
                        class: 'btn btn-secondary', text: '⤓ Exportar un respaldo antes', attrs: { type: 'button' },
                        on: { click: exportarRespaldo }
                    })
                ]),
                errores,
                el('div', { class: 'grid-form' }, [
                    ui.campo('Razón social', campos.empresa, { clase: 'span-full' }),
                    ui.campo('NIT', campos.nit, { ayuda: 'Opcional. Sirve para reconocer sus facturas en PDF.' }),
                    ui.campo('Capital inicial', campos.capitalInicial, { ayuda: 'Dinero con el que arranca la caja.' })
                ]),
                ui.campo(`Para confirmar, escriba ${PALABRA}`, campos.confirmacion)
            ]);

            const btnCancelar = el('button', { class: 'btn btn-secondary', text: 'Cancelar', attrs: { type: 'button' } });
            const btnBorrar = el('button', {
                class: 'btn btn-danger', text: 'Borrar todo y empezar', attrs: { type: 'button' }, props: { disabled: true }
            });

            const listo = () => campos.confirmacion.value.trim().toUpperCase() === PALABRA
                && campos.empresa.value.trim().length >= 3;
            [campos.empresa, campos.confirmacion].forEach((campo) => {
                campo.addEventListener('input', () => { btnBorrar.disabled = !listo(); });
            });

            const ctrl = ui.modal({
                titulo: 'Empezar desde cero',
                subtitulo: 'Borrar todos los datos para registrar su empresa',
                contenido: formulario,
                acciones: [btnCancelar, btnBorrar]
            });
            btnCancelar.addEventListener('click', () => ctrl.cerrar());

            const ejecutar = (event) => {
                if (event) event.preventDefault();
                U.clear(errores);
                if (!listo()) {
                    errores.appendChild(ui.banner('Falta confirmar',
                        `Escriba la razón social y la palabra ${PALABRA}.`, 'warning'));
                    return;
                }
                if (!autorizado()) {
                    ctrl.cerrar();
                    return;
                }
                const res = db.vaciar({
                    empresa: campos.empresa.value,
                    nit: campos.nit.value,
                    capitalInicial: campos.capitalInicial.value
                });
                if (!res.ok) {
                    errores.appendChild(ui.banner('No se borraron los datos', res.error, 'danger'));
                    return;
                }
                ctrl.cerrar();
                ui.toastOk('Sistema en blanco',
                    'Complete los datos de la empresa y empiece por clientes, proveedores, productos y empleados.');
            };

            formulario.addEventListener('submit', ejecutar);
            btnBorrar.addEventListener('click', ejecutar);
            campos.empresa.focus();
        };

        const btnVaciar = el('button', {
            class: 'btn btn-danger', text: 'Empezar desde cero', attrs: { type: 'button' },
            on: { click: abrirEmpezarDeCero }
        });

        /* Datos publicados con la aplicación: de dónde vienen los datos de este navegador
           y opción de reemplazarlos por los que trae la versión publicada. */
        const estadoDatos = db.estadoDatos();
        const origenTexto = {
            demo: 'Datos de demostración.',
            publicado: estadoDatos.meta.editado
                ? 'Datos publicados con la aplicación, con cambios hechos en este navegador.'
                : 'Datos publicados con la aplicación.',
            local: 'Datos propios de este navegador.'
        }[estadoDatos.meta.origen] || 'Datos propios de este navegador.';
        const pub = estadoDatos.publicacion;
        const alDia = pub && estadoDatos.meta.origen === 'publicado' && estadoDatos.meta.publicadoId === pub.id;

        const btnPublicados = pub ? el('button', {
            class: 'btn btn-secondary', text: '⟳ Cargar datos publicados', attrs: { type: 'button' },
            on: {
                click: async () => {
                    if (!autorizado()) return;
                    const ok = await ui.confirmar({
                        titulo: 'Cargar datos publicados',
                        mensaje: `¿Reemplazar los datos de este navegador por los publicados de ${pub.resumen.empresa}?`,
                        detalle: `Trae ${U.num(pub.resumen.clientes)} clientes, ${U.num(pub.resumen.productos)} productos y ${U.num(pub.resumen.ventas)} ventas. Se perderán los cambios hechos aquí: exporte un respaldo antes si desea conservarlos.`,
                        textoAceptar: 'Reemplazar',
                        peligroso: true
                    });
                    if (!ok || !autorizado()) return;
                    const res = db.cargarPublicados();
                    if (!res.ok) {
                        ui.toastError('No se cargaron los datos publicados', res.error);
                        return;
                    }
                    ui.toastOk('Datos publicados cargados', `${res.resumen.empresa}: ${U.num(res.resumen.ventas)} ventas.`);
                    ERP.app.refrescar();
                }
            }
        }) : null;

        const avisoPublicados = el('div', { class: 'stack-sm' }, [
            el('p', { class: 'strong', text: origenTexto }),
            pub ? el('p', {
                class: 'text-muted',
                text: `Esta versión trae datos publicados de ${pub.resumen.empresa} (${U.num(pub.resumen.clientes)} clientes, ${U.num(pub.resumen.productos)} productos, ${U.num(pub.resumen.ventas)} ventas)${pub.fecha ? `, publicados el ${pub.fecha}` : ''}.${alDia ? ' Este navegador ya los tiene.' : ''}`
            }) : null,
            pub && !alDia && estadoDatos.meta.origen === 'publicado'
                ? ui.banner('Hay datos publicados más recientes',
                    'Este navegador tiene cambios propios, por eso no se actualizó solo. Puede cargarlos con el botón «Cargar datos publicados».', 'warning')
                : null
        ]);

        const btnReiniciar = el('button', {
            class: 'btn btn-danger', text: 'Reiniciar datos de demostración', attrs: { type: 'button' },
            on: {
                click: async () => {
                    if (!autorizado()) return;
                    const ok = await ui.confirmar({
                        titulo: 'Reiniciar todos los datos',
                        mensaje: '¿Borrar toda la información y regenerar los datos de demostración?',
                        detalle: 'Se perderán clientes, facturas, compras, gastos y nóminas registrados. Exporte un respaldo antes si desea conservarlos.',
                        textoAceptar: 'Borrar y regenerar',
                        peligroso: true
                    });
                    if (!ok || !autorizado()) return;
                    db.reset();
                    ui.toastOk('Datos regenerados', 'La demostración volvió a su estado inicial.');
                }
            }
        });

        U.appendAll(contenedor, [
            el('div', { class: 'view-head' }, [
                el('div', { class: 'grow' }, [
                    el('h1', { text: 'Configuración' }),
                    el('p', { text: 'Datos de la empresa y parámetros de cálculo que alimentan facturas, impuestos y nómina.' })
                ])
            ]),

            ui.card('Datos de la empresa', el('div', { class: 'grid-form' }, [
                ui.campo('Razón social', campos.empresa, { clase: 'span-full' }),
                ui.campo('NIT', campos.nit),
                ui.campo('Teléfono', campos.telefono),
                ui.campo('Dirección', campos.direccion, { clase: 'span-full' }),
                ui.campo('Ciudad', campos.ciudad),
                ui.campo('Correo electrónico', campos.email)
            ]), { subtitulo: 'Aparecen en el encabezado de las facturas y reportes PDF' }),

            ui.card('Parámetros contables', el('div', { class: 'grid-form' }, [
                ui.campo('IVA (%)', campos.ivaPct, { ayuda: 'Se aplica solo a los ítems marcados como gravados.' }),
                ui.campo('Capital inicial', campos.capitalInicial, { ayuda: 'Saldo de caja con el que arranca el balance general.' })
            ])),

            ui.card('Parámetros de nómina', el('div', { class: 'stack' }, [
                el('div', { class: 'grid-form' }, [
                    ui.campo('Salario mínimo vigente', campos.salarioMinimo),
                    ui.campo('Auxilio de transporte', campos.auxilioTransporte),
                    ui.campo('Tope de auxilio (en SMMLV)', campos.topeAuxilioSmmlv),
                    ui.campo('Aporte a salud (%)', campos.aporteSaludPct),
                    ui.campo('Aporte a pensión (%)', campos.aportePensionPct)
                ]),
                ui.banner('Estos valores cambian cada año',
                    'El salario mínimo y el auxilio de transporte se fijan por decreto. Actualícelos en enero de cada año para que la liquidación de nómina siga siendo correcta.',
                    'warning')
            ])),

            tarjetaUsuarios(),

            tarjetaPermisos(),

            tarjetaNube(),

            ui.card('Datos y respaldo', el('div', { class: 'stack' }, [
                el('p', {
                    class: 'text-muted',
                    text: `La información se guarda en este navegador (localStorage): cada navegador y cada dirección —el archivo local o el sitio publicado— tiene sus propios datos. ${db.persistente ? 'La persistencia está activa.' : 'ATENCIÓN: el navegador bloqueó el almacenamiento; los cambios se perderán al recargar.'}`
                }),
                avisoPublicados,
                el('ul', { class: 'stack-sm text-muted' }, [
                    el('li', { text: 'Cargar datos publicados: reemplaza los datos de este navegador por los que se publicaron con la aplicación.' }),
                    el('li', { text: 'Exportar e importar respaldo: pasa sus datos de un navegador, equipo o dirección a otro. Importar reemplaza los datos de este navegador.' }),
                    el('li', { text: 'Reiniciar datos de demostración: vuelve a cargar la empresa ficticia para practicar.' }),
                    el('li', { text: 'Empezar desde cero: borra todo, incluida la demostración, para registrar su empresa real.' })
                ]),
                el('div', { class: 'row row-wrap' }, [btnPublicados, btnExportar, btnImportar, btnReiniciar, btnVaciar, selectorRespaldo])
            ])),

            el('div', { class: 'row row-wrap' }, [btnGuardar])
        ]);
    };

    return { vista };
})();

/* ============================================================
   Administración SaaS — solo el super administrador de la plataforma

   Gobierna organizaciones: las da de alta con su administrador, las
   suspende y las reactiva. No entra a los datos de ninguna: su sesión no
   tiene empresa, así que las políticas RLS de las tablas de operación no
   le abren una sola fila. Todo pasa por las funciones saas_* del
   servidor, que vuelven a comprobar el rol en cada llamada.
   ============================================================ */

ERP.plataforma = (() => {
    const U = ERP.util;
    const { el } = U;
    const ui = ERP.ui;

    /** El menú ya oculta el módulo, pero cada acción revalida el rol vigente. */
    const autorizado = () => {
        const sesion = ERP.auth.sincronizarSesion();
        if (sesion && ERP.auth.puede('plataforma')) return true;
        ERP.app.refrescar();
        return false;
    };

    let cache = null;

    const fecha = (valor) => {
        if (!valor) return '—';
        const d = new Date(valor);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
    };

    const recargar = async (pintar) => {
        const res = await ERP.nube.saasOrganizaciones();
        cache = res.ok ? res : { ok: false, error: res.error };
        pintar();
    };

    /* ---------- Alta de una organización con su administrador ---------- */

    const abrirAlta = (pintar) => {
        if (!autorizado()) return;

        const campos = {
            razonSocial: ui.input({ placeholder: 'Razón social de la organización' }),
            nit: ui.input({ placeholder: 'Ej. 900.123.456-7' }),
            email: ui.input({ tipo: 'email', placeholder: 'admin@organizacion.com', autocomplete: 'off' }),
            nombre: ui.input({ placeholder: 'Nombre y apellido' })
        };
        const errores = el('div');

        const formulario = el('form', { class: 'stack' }, [
            el('p', {
                class: 'text-muted',
                text: 'La organización nace vacía y aislada: sus datos no se cruzan con los de ninguna otra. El administrador que designe aquí gestionará a su propio equipo.'
            }),
            errores,
            el('div', { class: 'grid-form' }, [
                ui.campo('Razón social', campos.razonSocial, { clase: 'span-full' }),
                ui.campo('NIT', campos.nit, { ayuda: 'Opcional. Aparece en facturas y reportes.' })
            ]),
            el('h3', { text: 'Administrador de la organización' }),
            el('div', { class: 'grid-form' }, [
                ui.campo('Correo electrónico', campos.email, { clase: 'span-full' }),
                ui.campo('Nombre', campos.nombre)
            ]),
            el('p', {
                class: 'text-muted',
                text: 'La persona pone su propia contraseña al registrarse con ese correo. Si ya tiene cuenta y no pertenece a ninguna organización, entra de inmediato.'
            })
        ]);

        const btnCancelar = el('button', { class: 'btn btn-secondary', text: 'Cancelar', attrs: { type: 'button' } });
        const btnCrear = el('button', { class: 'btn', text: 'Crear organización', attrs: { type: 'button' } });

        const ctrl = ui.modal({
            titulo: 'Nueva organización',
            subtitulo: 'Alta de un inquilino y su administrador',
            contenido: formulario,
            acciones: [btnCancelar, btnCrear]
        });
        btnCancelar.addEventListener('click', () => ctrl.cerrar());

        const crear = async () => {
            if (!autorizado()) return;
            U.clear(errores);
            btnCrear.disabled = true;
            btnCrear.textContent = 'Creando…';
            const res = await ERP.nube.saasCrearOrganizacion({
                razonSocial: campos.razonSocial.value,
                nit: campos.nit.value,
                email: campos.email.value,
                nombre: campos.nombre.value
            });
            btnCrear.disabled = false;
            btnCrear.textContent = 'Crear organización';
            if (!res.ok) {
                errores.appendChild(ui.banner('No se creó la organización', res.error, 'danger'));
                return;
            }
            ctrl.cerrar();
            const org = res.organizacion || {};
            ui.toastOk('Organización creada', org.estado === 'vinculada'
                ? `${org.email} ya tenía cuenta y entra como administrador.`
                : `${org.email} entrará como administrador en cuanto cree su cuenta con ese correo.`);
            await recargar(pintar);
        };

        btnCrear.addEventListener('click', crear);
        formulario.addEventListener('submit', (evento) => { evento.preventDefault(); crear(); });
        campos.razonSocial.focus();
    };

    /* ---------- Ficha de cada organización ---------- */

    const tarjetaOrganizacion = (org, pintar) => {
        const activa = org.estado === 'activa';
        const d = org.datos || {};
        const u = org.usuarios || {};

        const dato = (etiqueta, valor) => el('div', { class: 'org-dato' }, [
            el('span', { class: 'org-dato-valor', text: U.num(valor || 0) }),
            el('span', { class: 'org-dato-label', text: etiqueta })
        ]);

        const btnEstado = el('button', {
            class: `btn btn-sm ${activa ? 'btn-secondary' : ''}`.trim(),
            text: activa ? 'Suspender' : 'Reactivar',
            attrs: { type: 'button' },
            on: {
                click: async () => {
                    if (!autorizado()) return;
                    const ok = await ui.confirmar({
                        titulo: activa ? `Suspender ${org.razonSocial}` : `Reactivar ${org.razonSocial}`,
                        mensaje: activa
                            ? 'Sus usuarios dejarán de entrar de inmediato.'
                            : 'Sus usuarios podrán volver a entrar.',
                        detalle: activa
                            ? 'No se borra nada: los datos quedan intactos y vuelven al reactivarla.'
                            : '',
                        textoAceptar: activa ? 'Suspender' : 'Reactivar',
                        peligroso: activa
                    });
                    if (!ok || !autorizado()) return;
                    const res = await ERP.nube.saasCambiarEstado(org.id, activa ? 'suspendida' : 'activa');
                    if (!res.ok) {
                        ui.toastError('No se pudo cambiar el estado', res.error);
                        return;
                    }
                    ui.toastOk(activa ? 'Organización suspendida' : 'Organización reactivada', org.razonSocial);
                    await recargar(pintar);
                }
            }
        });

        const admins = org.administradores || [];

        return el('article', { class: `org-card${activa ? '' : ' suspendida'}` }, [
            el('header', { class: 'org-head' }, [
                el('div', { class: 'grow' }, [
                    el('div', { class: 'row' }, [
                        el('h3', { text: org.razonSocial }),
                        ui.badge(activa ? 'Activa' : 'Suspendida', activa ? 'success' : 'danger')
                    ]),
                    el('span', { class: 'text-muted', text: `${org.nit || 'Sin NIT'} · desde ${fecha(org.creadaEn)}` })
                ]),
                btnEstado
            ]),
            el('div', { class: 'org-datos' }, [
                dato('usuarios', u.total),
                dato('ventas', d.ventas),
                dato('compras', d.compras),
                dato('gastos', d.gastos),
                dato('productos', d.productos),
                dato('terceros', d.terceros)
            ]),
            el('div', { class: 'org-admins' }, [
                el('span', { class: 'org-dato-label', text: admins.length === 1 ? 'Administrador' : 'Administradores' }),
                admins.length
                    ? el('ul', { class: 'stack-sm' }, admins.map((a) => el('li', {}, [
                        el('span', { class: 'strong', text: a.nombre }),
                        el('span', { class: 'text-muted', text: ` · ${a.email}` }),
                        a.activo === false ? ui.badge('Sin acceso', 'danger') : null,
                        el('span', { class: 'text-muted', text: ` · último acceso ${fecha(a.ultimoAcceso)}` })
                    ])))
                    : el('p', { class: 'text-muted', text: 'Todavía nadie ha aceptado la invitación.' }),
                org.invitacionesPendientes
                    ? ui.badge(`${U.num(org.invitacionesPendientes)} invitación(es) pendiente(s)`, 'warning')
                    : null
            ])
        ]);
    };

    /* ---------- Vista ---------- */

    const vista = (contenedor) => {
        if (!ERP.auth.puede('plataforma')) return;

        const lista = el('div', { class: 'stack' });

        const pintar = () => {
            U.clear(lista);

            if (!cache) {
                lista.appendChild(ui.estadoCargando('Consultando las organizaciones…'));
                recargar(pintar);
                return;
            }
            if (!cache.ok) {
                lista.appendChild(ui.banner('No se pudo consultar la plataforma', cache.error, 'warning'));
                lista.appendChild(el('div', { class: 'row row-wrap' }, [el('button', {
                    class: 'btn btn-secondary', text: 'Reintentar', attrs: { type: 'button' },
                    on: { click: () => recargar(pintar) }
                })]));
                return;
            }

            const r = cache.resumen || {};
            const indicador = (etiqueta, valor, contexto) => el('article', { class: 'kpi' }, [
                el('span', { class: 'kpi-label', text: etiqueta }),
                el('span', { class: 'kpi-value', text: U.num(valor || 0) }),
                contexto ? el('span', { class: 'kpi-context', text: contexto }) : null
            ]);
            lista.appendChild(el('div', { class: 'grid-kpi' }, [
                indicador('Organizaciones', r.organizaciones, 'inquilinos registrados'),
                indicador('Activas', r.activas, `${U.num((r.organizaciones || 0) - (r.activas || 0))} suspendidas`),
                indicador('Usuarios en total', r.usuarios, 'sin contar la plataforma')
            ]));

            const organizaciones = cache.organizaciones || [];
            if (!organizaciones.length) {
                lista.appendChild(ui.estadoVacio('Todavía no hay organizaciones',
                    'Cree la primera y designe a su administrador.'));
                return;
            }
            lista.appendChild(el('div', { class: 'org-grid' },
                organizaciones.map((org) => tarjetaOrganizacion(org, pintar))));
        };

        pintar();

        const btnNueva = el('button', {
            class: 'btn', text: 'Nueva organización', attrs: { type: 'button' },
            on: { click: () => abrirAlta(pintar) }
        });
        const btnRecargar = el('button', {
            class: 'btn btn-ghost', text: 'Actualizar', attrs: { type: 'button' },
            on: { click: () => recargar(pintar) }
        });

        U.appendAll(contenedor, [
            el('div', { class: 'view-head' }, [
                el('div', { class: 'grow' }, [
                    el('h1', { text: 'Administración SaaS' }),
                    el('p', { text: 'Organizaciones de la plataforma, sus administradores y su estado. Los datos de cada una son suyos: desde aquí no se abren.' })
                ]),
                el('div', { class: 'row row-wrap' }, [btnRecargar, btnNueva])
            ]),
            lista
        ]);
    };

    return { vista };
})();

/* ============================================================
   Aplicación
   ============================================================ */

ERP.app = (() => {
    const U = ERP.util;
    const { el } = U;
    const ui = ERP.ui;

    const TEMA_KEY = 'erp_finanzas_tema';

    const MODULOS = {
        dashboard: { etiqueta: 'Tablero ejecutivo', icono: 'space_dashboard', grupo: 'Operación', render: (c) => ERP.dashboard.vista(c) },
        ventas: { etiqueta: 'Ventas', icono: 'receipt_long', grupo: 'Operación', render: (c) => ERP.ventas.vista(c) },
        cartera: { etiqueta: 'Cartera y abonos', icono: 'account_balance_wallet', grupo: 'Operación', render: (c) => ERP.cartera.vista(c) },
        compras: { etiqueta: 'Compras', icono: 'shopping_cart', grupo: 'Operación', render: (c) => ERP.compras.vista(c) },
        gastos: { etiqueta: 'Gastos', icono: 'payments', grupo: 'Operación', render: (c) => ERP.gastos.vista(c) },
        inventario: { etiqueta: 'Inventario', icono: 'inventory_2', grupo: 'Operación', render: (c) => ERP.inventario.vista(c) },
        clientes: { etiqueta: 'Clientes', icono: 'groups', grupo: 'Terceros', render: (c) => ERP.contactos.vistaClientes(c) },
        proveedores: { etiqueta: 'Proveedores', icono: 'local_shipping', grupo: 'Terceros', render: (c) => ERP.contactos.vistaProveedores(c) },
        financieros: { etiqueta: 'Estados financieros', icono: 'monitoring', grupo: 'Análisis', render: (c) => ERP.estadosFinancieros.vista(c) },
        equilibrio: { etiqueta: 'Punto de equilibrio', icono: 'balance', grupo: 'Análisis', render: (c) => ERP.equilibrio.vista(c) },
        prestamos: { etiqueta: 'Simulador de préstamos', icono: 'calculate', grupo: 'Análisis', render: (c) => ERP.prestamos.vista(c) },
        nomina: { etiqueta: 'Nómina', icono: 'badge', grupo: 'Administración', render: (c) => ERP.nomina.vista(c) },
        configuracion: { etiqueta: 'Configuración', icono: 'settings', grupo: 'Administración', render: (c) => ERP.configuracion.vista(c) },
        plataforma: { etiqueta: 'Administración SaaS', icono: 'apartment', grupo: 'Plataforma', render: (c) => ERP.plataforma.vista(c) }
    };

    /** Orden en que se muestran los grupos del menú lateral. */
    const GRUPOS = ['Plataforma', 'Operación', 'Terceros', 'Análisis', 'Administración'];

    const estado = {
        // null = elegir al montar el primer módulo permitido para el rol.
        vista: null,
        colapsado: false,
        cajonAbierto: false
    };

    let raiz = null;

    /* ---------- Tema ---------- */

    const temaGuardado = () => {
        try {
            return window.localStorage.getItem(TEMA_KEY);
        } catch (error) {
            return null;
        }
    };

    const aplicarTema = (tema) => {
        document.documentElement.setAttribute('data-theme', tema);
        try {
            window.localStorage.setItem(TEMA_KEY, tema);
        } catch (error) {
            // Sin almacenamiento el tema simplemente no se recuerda.
        }
    };

    const temaActual = () => document.documentElement.getAttribute('data-theme') || 'light';

    /* ---------- Pantalla de acceso ---------- */

    /**
     * Quien entra lo hace con su correo y su contraseña, que verifica Supabase
     * Auth. La contraseña no se guarda en este navegador en ningún momento:
     * solo queda el testigo de sesión que devuelve el servidor.
     *
     * modo: entrar | registrar | recuperar | nueva-clave | empresa
     *   nueva-clave aparece al volver del enlace de recuperación que llega por
     *   correo: Supabase ya dio una sesión, solo falta poner la contraseña.
     *   empresa aparece cuando la cuenta es válida pero todavía no pertenece a
     *   ninguna empresa: se crea la propia o se espera a que un administrador
     *   dé acceso a ese correo.
     */
    const pantallaAcceso = (modo = 'entrar', aviso = null) => {
        U.clear(raiz);

        const errores = el('div');
        if (aviso) errores.appendChild(aviso);

        const enlace = (texto, destino) => el('button', {
            class: 'btn btn-ghost btn-sm', text: texto, attrs: { type: 'button' },
            on: { click: () => pantallaAcceso(destino) }
        });

        const ocupar = (boton, texto) => {
            boton.disabled = true;
            boton.dataset.previo = boton.textContent;
            boton.textContent = texto;
        };
        const liberar = (boton) => {
            boton.disabled = false;
            if (boton.dataset.previo) boton.textContent = boton.dataset.previo;
        };

        let formulario = null;
        let primerCampo = null;
        let pie = null;

        if (modo === 'registrar') {
            const campos = {
                nombre: ui.input({ autocomplete: 'name', placeholder: 'Nombre y apellido' }),
                email: ui.input({ tipo: 'email', autocomplete: 'email', placeholder: 'correo@empresa.com' }),
                clave: ui.input({ tipo: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' })
            };
            const btn = el('button', { class: 'btn', text: 'Crear cuenta', attrs: { type: 'submit' }, style: { width: '100%' } });

            formulario = el('form', { class: 'stack' }, [
                errores,
                ui.campo('Nombre', campos.nombre),
                ui.campo('Correo electrónico', campos.email),
                ui.campo('Contraseña', campos.clave, { ayuda: 'Se guarda cifrada en Supabase. No queda en este navegador.' }),
                ERP.nube.direccionDeRegreso() ? null : ui.banner('Abra la aplicación desde su dirección web',
                    'Al abrirla como archivo local, el enlace de confirmación no puede regresar aquí.', 'warning'),
                btn,
                el('div', { class: 'row row-wrap' }, [enlace('Ya tengo cuenta', 'entrar')])
            ]);

            formulario.addEventListener('submit', async (evento) => {
                evento.preventDefault();
                U.clear(errores);
                ocupar(btn, 'Creando la cuenta…');
                const res = await ERP.auth.registrar({
                    nombre: campos.nombre.value, email: campos.email.value, clave: campos.clave.value
                });
                campos.clave.value = '';
                liberar(btn);
                if (!res.ok) {
                    errores.appendChild(ui.banner('No se pudo crear la cuenta', res.error, 'danger'));
                    return;
                }
                if (res.confirmar) {
                    pantallaAcceso('entrar', ui.banner('Revise su correo',
                        `Enviamos un enlace a ${res.email} para confirmar la cuenta. Ábralo y vuelva a entrar aquí.`, 'info'));
                    return;
                }
                if (res.sinEmpresa) {
                    pantallaAcceso('empresa');
                    return;
                }
                entrarAlSistema(res.usuario);
            });
            primerCampo = campos.nombre;

        } else if (modo === 'recuperar') {
            const email = ui.input({ tipo: 'email', autocomplete: 'email', placeholder: 'correo@empresa.com' });
            const btn = el('button', { class: 'btn', text: 'Enviar enlace', attrs: { type: 'submit' }, style: { width: '100%' } });

            formulario = el('form', { class: 'stack' }, [
                errores,
                el('p', { class: 'text-muted', text: 'Le llegará un correo con un enlace para poner una contraseña nueva.' }),
                ui.campo('Correo electrónico', email),
                btn,
                el('div', { class: 'row row-wrap' }, [enlace('Volver', 'entrar')])
            ]);

            formulario.addEventListener('submit', async (evento) => {
                evento.preventDefault();
                U.clear(errores);
                ocupar(btn, 'Enviando…');
                const res = await ERP.auth.recuperar(email.value);
                liberar(btn);
                if (!res.ok) {
                    errores.appendChild(ui.banner('No se pudo enviar', res.error, 'danger'));
                    return;
                }
                pantallaAcceso('entrar', ui.banner('Correo enviado',
                    'Si ese correo tiene cuenta, recibirá el enlace en unos minutos. Revise también el correo no deseado.', 'info'));
            });
            primerCampo = email;

        } else if (modo === 'nueva-clave') {
            const campos = {
                clave: ui.input({ tipo: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' }),
                confirmacion: ui.input({ tipo: 'password', autocomplete: 'new-password', placeholder: 'Repita la contraseña' })
            };
            const btn = el('button', { class: 'btn', text: 'Guardar contraseña', attrs: { type: 'submit' }, style: { width: '100%' } });

            formulario = el('form', { class: 'stack' }, [
                ui.banner('Ponga su contraseña nueva',
                    'Abrió el enlace que le enviamos por correo. Escriba la contraseña con la que entrará de ahora en adelante.', 'info'),
                errores,
                ui.campo('Contraseña nueva', campos.clave),
                ui.campo('Repita la contraseña', campos.confirmacion),
                btn
            ]);

            formulario.addEventListener('submit', async (evento) => {
                evento.preventDefault();
                U.clear(errores);
                if (campos.clave.value !== campos.confirmacion.value) {
                    errores.appendChild(ui.banner('No coinciden', 'Las dos contraseñas deben ser iguales.', 'danger'));
                    return;
                }
                ocupar(btn, 'Guardando…');
                const res = await ERP.auth.cambiarClave(campos.clave.value);
                campos.clave.value = '';
                campos.confirmacion.value = '';
                liberar(btn);
                if (!res.ok) {
                    errores.appendChild(ui.banner('No se pudo guardar', res.error, 'danger'));
                    return;
                }
                const consulta = await ERP.nube.cargarPerfil();
                const usuario = ERP.auth.restaurarSesion();
                if (!consulta.ok) {
                    pantallaAcceso('entrar', ui.banner('Contraseña cambiada',
                        'Ya puede entrar con su contraseña nueva.', 'success'));
                    return;
                }
                if (!usuario) {
                    pantallaAcceso('empresa');
                    return;
                }
                entrarAlSistema(usuario);
            });
            primerCampo = campos.clave;

        } else if (modo === 'empresa') {
            const campos = {
                razonSocial: ui.input({ placeholder: 'Razón social de su empresa' }),
                nit: ui.input({ placeholder: 'Ej. 900.123.456-7' })
            };
            const btn = el('button', { class: 'btn', text: 'Crear la empresa', attrs: { type: 'submit' }, style: { width: '100%' } });

            formulario = el('form', { class: 'stack' }, [
                ui.banner('Su cuenta todavía no pertenece a ninguna empresa',
                    'Cree la suya y quedará como administrador. Si alguien le dio acceso a una empresa existente, pídale que revise el correo con el que lo habilitó.', 'info'),
                errores,
                ui.campo('Razón social', campos.razonSocial),
                ui.campo('NIT', campos.nit, { ayuda: 'Opcional. Aparece en las facturas y reportes.' }),
                btn,
                el('div', { class: 'row row-wrap' }, [el('button', {
                    class: 'btn btn-ghost btn-sm', text: 'Salir', attrs: { type: 'button' },
                    on: {
                        click: async () => {
                            await ERP.auth.cerrarSesion();
                            pantallaAcceso('entrar');
                        }
                    }
                })])
            ]);

            formulario.addEventListener('submit', async (evento) => {
                evento.preventDefault();
                U.clear(errores);
                ocupar(btn, 'Creando…');
                const res = await ERP.nube.crearEmpresa({
                    razonSocial: campos.razonSocial.value,
                    nit: campos.nit.value,
                    usuario: 'admin',
                    nombre: (ERP.nube.estado().perfil || {}).nombre || 'Administrador'
                });
                liberar(btn);
                if (!res.ok) {
                    errores.appendChild(ui.banner('No se creó la empresa', res.error, 'danger'));
                    return;
                }
                const usuario = ERP.auth.restaurarSesion();
                if (!usuario) {
                    errores.appendChild(ui.banner('Algo quedó a medias', 'La empresa se creó pero no fue posible abrir la sesión. Vuelva a entrar.', 'warning'));
                    return;
                }
                entrarAlSistema(usuario);
            });
            primerCampo = campos.razonSocial;

        } else {
            const email = ui.input({ tipo: 'email', autocomplete: 'username', placeholder: 'correo@empresa.com' });
            const clave = ui.input({ tipo: 'password', placeholder: '••••••••', autocomplete: 'current-password' });
            const btn = el('button', { class: 'btn', text: 'Ingresar', attrs: { type: 'submit' }, style: { width: '100%' } });

            formulario = el('form', { class: 'stack' }, [
                errores,
                ui.campo('Correo electrónico', email),
                ui.campo('Contraseña', clave),
                btn,
                el('div', { class: 'row row-wrap' }, [
                    enlace('Crear cuenta', 'registrar'),
                    enlace('¿Olvidó su contraseña?', 'recuperar')
                ])
            ]);

            formulario.addEventListener('submit', async (evento) => {
                evento.preventDefault();
                U.clear(errores);
                ocupar(btn, 'Verificando…');
                const res = await ERP.auth.iniciarSesion(email.value, clave.value);
                clave.value = '';
                liberar(btn);
                if (!res.ok) {
                    errores.appendChild(ui.banner('No fue posible ingresar', res.error, 'danger'));
                    clave.focus();
                    return;
                }
                if (res.sinEmpresa) {
                    pantallaAcceso('empresa');
                    return;
                }
                entrarAlSistema(res.usuario);
            });
            primerCampo = email;
            pie = el('p', {
                class: 'hint',
                text: 'Su contraseña se verifica en Supabase y no se guarda en este navegador.'
            });
        }

        raiz.appendChild(el('div', { class: 'login-screen' }, [
            el('main', { class: 'login-card' }, [
                el('div', { class: 'login-brand' }, [
                    el('img', { attrs: { src: 'assets/IMG/logo.svg', alt: '' } }),
                    el('div', {}, [
                        el('h1', { text: 'Gestión Financiera' }),
                        el('p', { text: ERP.db.config().empresa }),
                        el('p', { class: 'hint', text: `Versión ${ERP.VERSION}` })
                    ])
                ]),
                formulario,
                pie
            ])
        ]));

        if (primerCampo) primerCampo.focus();
    };

    /**
     * Entra al sistema y deja los datos de este navegador alineados con la
     * empresa de quien entra: si eran de otra empresa, se traen los suyos.
     */
    const entrarAlSistema = async (usuario) => {
        estado.vista = null;
        montarAplicacion();
        ui.toastOk(`Bienvenido, ${usuario.nombre}`,
            `${ERP.auth.etiquetaRol(usuario.rol)}${usuario.empresa ? ` · ${usuario.empresa}` : ''}`);

        // La plataforma no tiene datos propios: no hay nada que alinear.
        if (usuario.rol === 'super_administrador') return;

        const meta = ERP.db.estadoDatos().meta;
        const propios = meta.origen === 'local' || meta.editado;
        const otraEmpresa = Boolean(meta.empresaNube) && meta.empresaNube !== usuario.empresaId;

        if (otraEmpresa || (!meta.empresaNube && !propios)) {
            const res = await ERP.nube.descargar();
            if (res.ok) {
                ui.toastOk('Datos de su empresa', `${res.resumen.empresa}: ${U.num(res.resumen.ventas)} ventas.`);
                montarAplicacion();
            } else if (otraEmpresa) {
                ui.toastWarn('Los datos visibles son de otra empresa',
                    `No se pudieron traer los de ${usuario.empresa}: ${res.error}`);
            }
        } else if (!meta.empresaNube) {
            ui.toastInfo('Estos datos aún no están en la nube', ERP.auth.puede('configuracion')
                ? 'Súbalos desde Configuración → Nube para verlos en cualquier equipo.'
                : 'Pídale al administrador que los sincronice.');
        }
    };

    /* ---------- Layout ---------- */

    const construirSidebar = () => {
        const nav = el('nav', { class: 'sidebar-nav', attrs: { 'aria-label': 'Módulos del sistema' } });

        const bajoMinimo = ERP.db.productosBajoMinimo().length;
        const vencidas = ERP.db.all('ventas').filter(
            (v) => ERP.db.estadoVenta(v).clave === 'vencida').length;

        const permitidos = ERP.auth.modulosPermitidos();

        // El menú se arma por grupos, no por el orden de la lista de
        // permisos: así cada encabezado aparece una sola vez.
        GRUPOS.forEach((grupo) => {
            const claves = Object.keys(MODULOS).filter(
                (clave) => MODULOS[clave].grupo === grupo && permitidos.includes(clave));
            if (claves.length === 0) return;

            nav.appendChild(el('p', { class: 'nav-group-label', text: grupo }));

            claves.forEach((clave) => {
                const modulo = MODULOS[clave];
                const insignia = clave === 'inventario' && bajoMinimo ? bajoMinimo
                    : clave === 'cartera' && vencidas ? vencidas : null;

                nav.appendChild(el('button', {
                    class: 'nav-item',
                    attrs: {
                        type: 'button',
                        title: modulo.etiqueta,
                        'aria-current': estado.vista === clave ? 'page' : null
                    },
                    on: { click: () => irA(clave) }
                }, [
                    el('span', { class: 'nav-icon icono', text: modulo.icono, attrs: { 'aria-hidden': 'true' } }),
                    el('span', { class: 'nav-label', text: modulo.etiqueta }),
                    insignia ? el('span', { class: 'nav-badge', text: String(insignia) }) : null
                ]));
            });
        });

        return el('aside', { class: 'sidebar' }, [
            el('div', { class: 'sidebar-head' }, [
                el('img', { attrs: { src: 'assets/IMG/logo.svg', alt: '' } }),
                el('div', { class: 'sidebar-title' }, [
                    el('span', { text: 'ERP Financiero', style: { fontWeight: '700', fontSize: '0.9rem' } }),
                    el('span', {
                        text: ERP.auth.esSuper() ? 'Plataforma SaaS' : U.truncate(ERP.db.config().empresa, 26)
                    }),
                    el('span', { class: 'sidebar-version', text: `Versión ${ERP.VERSION}` })
                ])
            ]),
            nav
        ]);
    };

    const construirTopbar = () => {
        const usuario = ERP.auth.usuario();
        const modulo = MODULOS[estado.vista];

        const btnMenu = el('button', {
            class: 'icon-btn icono', text: 'menu',
            attrs: { type: 'button', 'aria-label': 'Mostrar u ocultar el menú lateral' },
            on: {
                click: () => {
                    const esMovil = window.matchMedia('(max-width: 860px)').matches;
                    if (esMovil) {
                        estado.cajonAbierto = !estado.cajonAbierto;
                    } else {
                        estado.colapsado = !estado.colapsado;
                    }
                    actualizarShell();
                }
            }
        });

        const btnTema = el('button', {
            class: 'icon-btn icono',
            text: temaActual() === 'dark' ? 'light_mode' : 'dark_mode',
            attrs: {
                type: 'button',
                'aria-label': temaActual() === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
            },
            on: {
                click: () => {
                    const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
                    aplicarTema(nuevo);
                    montarAplicacion();
                }
            }
        });

        const btnSalir = el('button', {
            class: 'icon-btn icono', text: 'logout',
            attrs: { type: 'button', 'aria-label': 'Cerrar sesión' },
            on: {
                click: async () => {
                    const ok = await ui.confirmar({
                        titulo: 'Cerrar sesión',
                        mensaje: '¿Desea salir del sistema?',
                        detalle: 'Los datos registrados quedan guardados en este navegador.',
                        textoAceptar: 'Cerrar sesión'
                    });
                    if (ok) {
                        await ERP.auth.cerrarSesion();
                        estado.vista = null;
                        pantallaAcceso();
                    }
                }
            }
        });

        return el('header', { class: 'topbar' }, [
            btnMenu,
            el('div', {}, [
                el('h1', { text: modulo ? modulo.etiqueta : 'Sistema' }),
                el('p', { class: 'topbar-sub', text: U.fmtDateLong(U.today()) })
            ]),
            el('div', { class: 'topbar-spacer' }),
            btnTema,
            el('div', { class: 'user-chip' }, [
                el('span', { class: 'avatar', text: U.initials(usuario.nombre) }),
                el('div', {}, [
                    el('p', { class: 'user-name', text: usuario.nombre }),
                    el('p', { class: 'user-role', text: ERP.auth.etiquetaRol(usuario.rol) })
                ])
            ]),
            btnSalir
        ]);
    };

    const actualizarShell = () => {
        const shell = document.querySelector('.app-shell');
        if (!shell) return;
        shell.classList.toggle('is-collapsed', estado.colapsado);
        shell.classList.toggle('is-drawer-open', estado.cajonAbierto);

        const scrim = document.querySelector('.scrim');
        if (estado.cajonAbierto && !scrim) {
            shell.appendChild(el('div', {
                class: 'scrim',
                on: { click: () => { estado.cajonAbierto = false; actualizarShell(); } }
            }));
        } else if (!estado.cajonAbierto && scrim) {
            scrim.remove();
        }
    };

    /** Tablero si el rol lo tiene; si no, el primer módulo permitido en el orden del menú. */
    const primerModuloPermitido = () => {
        const permitidos = ERP.auth.modulosPermitidos();
        if (permitidos.includes('dashboard')) return 'dashboard';
        const enMenu = GRUPOS.flatMap((grupo) => Object.keys(MODULOS).filter((clave) => MODULOS[clave].grupo === grupo));
        return enMenu.find((clave) => permitidos.includes(clave)) || null;
    };

    const irA = (clave) => {
        if (!ERP.auth.puede(clave)) {
            ui.toastError('Sin permiso', 'Su rol no tiene acceso a este módulo.');
            return;
        }
        estado.vista = clave;
        estado.cajonAbierto = false;
        montarAplicacion();
    };

    const pintarVista = (contenedor) => {
        U.clear(contenedor);
        const modulo = MODULOS[estado.vista];

        if (!modulo || !ERP.auth.puede(estado.vista)) {
            contenedor.appendChild(ui.estadoError('Módulo no disponible',
                'El módulo solicitado no existe o su rol no tiene acceso a él.'));
            return;
        }

        try {
            modulo.render(contenedor);
        } catch (error) {
            console.error(`Error al renderizar el módulo "${estado.vista}"`, error);
            U.clear(contenedor);
            contenedor.appendChild(ui.estadoError('No fue posible mostrar el módulo',
                'Ocurrió un error inesperado. Revise la consola del navegador para más detalle.'));
        }
    };

    const montarAplicacion = () => {
        // Los permisos se leen del registro vigente en cada montaje: si el rol cambió
        // (aquí o en otra pestaña), el menú deja de ofrecer lo que ya no corresponde.
        const rolAnterior = ERP.auth.usuario() ? ERP.auth.usuario().rol : null;
        const sesion = ERP.auth.sincronizarSesion();
        if (!sesion) {
            estado.vista = null;
            pantallaAcceso();
            if (rolAnterior) ui.toastWarn('Sesión cerrada', 'Su usuario ya no existe o fue desactivado. Ingrese de nuevo.');
            return;
        }
        if (!estado.vista || !ERP.auth.puede(estado.vista)) {
            // Perder la vista con la sesión abierta es un cambio de rol o de permisos: se avisa.
            // Al entrar (vista vacía) se abre el primer módulo permitido sin aviso.
            const anterior = MODULOS[estado.vista];
            estado.vista = primerModuloPermitido();
            if (anterior) {
                ui.toastInfo('Su acceso cambió',
                    `${anterior.etiqueta} ya no está disponible para el rol ${ERP.auth.etiquetaRol(sesion.rol)}.`);
            }
        }

        U.clear(raiz);

        const contenedorVista = el('div', { class: 'view' });

        const shell = el('div', { class: 'app-shell' }, [
            construirSidebar(),
            el('div', { class: 'main-area' }, [
                construirTopbar(),
                el('main', { class: 'view-scroll', attrs: { id: 'contenido', tabindex: '-1' } }, [contenedorVista])
            ])
        ]);

        raiz.appendChild(shell);
        actualizarShell();
        pintarVista(contenedorVista);
    };

    /* ---------- Arranque ---------- */

    const iniciar = () => {
        raiz = document.getElementById('app');
        if (!raiz) return;

        aplicarTema(temaGuardado()
            || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

        const carga = ERP.db.load();

        if (!carga.persistente) {
            ui.toastWarn('Almacenamiento no disponible',
                'El navegador bloqueó localStorage: los cambios no se conservarán al recargar la página.');
        }

        // Al cambiar los datos se repinta la vista activa para que
        // KPIs, gráficos y tablas nunca queden desincronizados.
        const repintar = U.debounce(() => {
            if (ERP.auth.usuario()) montarAplicacion();
        }, 90);
        U.bus.on('db:changed', repintar);

        // Otra pestaña guardó cambios (por ejemplo, el administrador cambió un rol):
        // se releen los datos para que permisos y cifras no queden desactualizados.
        window.addEventListener('storage', (event) => {
            if (event.key !== ERP.db.STORAGE_KEY || event.newValue === null) return;
            ERP.db.load();
            repintar();
        });

        U.bus.on('db:persist-error', () => {
            ui.toastError('No se pudo guardar', ERP.auth.puede('configuracion')
                ? 'El almacenamiento del navegador está lleno o bloqueado. Exporte un respaldo desde Configuración.'
                : 'El almacenamiento del navegador está lleno o bloqueado. Avise al administrador para que exporte un respaldo.');
        });

        // El menú lateral pasa de colapsable a cajón según el ancho.
        window.addEventListener('resize', U.debounce(() => {
            if (!window.matchMedia('(max-width: 860px)').matches && estado.cajonAbierto) {
                estado.cajonAbierto = false;
                actualizarShell();
            }
        }, 200));

        // Quien llega desde el enlace de un correo (confirmar la cuenta o
        // recuperar la contraseña) trae la sesión en la dirección. Se recoge
        // antes que nada y se limpia la barra de direcciones.
        const hayNube = Boolean(ERP.nube && ERP.nube.configurada());
        const enlace = hayNube ? ERP.nube.consumirEnlace() : null;
        const recuperando = Boolean(enlace && enlace.ok && enlace.tipo === 'recovery');

        // La sesión guardada abre la aplicación sin esperar a la red; enseguida
        // se revalida contra el servidor. Si allí el usuario ya no existe, fue
        // desactivado o la sesión caducó, se vuelve al acceso.
        if (enlace && !enlace.ok) {
            pantallaAcceso('entrar', ui.banner('El enlace del correo no sirvió', enlace.error, 'warning'));
        } else if (recuperando) {
            pantallaAcceso('nueva-clave');
        } else if (enlace && enlace.ok) {
            pantallaAcceso('entrar', ui.banner('Cuenta confirmada', 'Un momento, estamos abriendo su sesión…', 'info'));
        } else if (ERP.auth.restaurarSesion()) {
            montarAplicacion();
        } else {
            pantallaAcceso();
        }

        // El correo puede abrirse en una pestaña que ya tenía la aplicación: ahí
        // el navegador solo cambia la dirección, sin recargar.
        if (hayNube) {
            window.addEventListener('hashchange', () => {
                const tardio = ERP.nube.consumirEnlace();
                if (!tardio) return;
                if (!tardio.ok) {
                    pantallaAcceso('entrar', ui.banner('El enlace del correo no sirvió', tardio.error, 'warning'));
                    return;
                }
                if (tardio.tipo === 'recovery') {
                    pantallaAcceso('nueva-clave');
                    return;
                }
                ERP.nube.cargarPerfil().then(() => {
                    const usuario = ERP.auth.sincronizarSesion();
                    if (usuario) entrarAlSistema(usuario);
                    else pantallaAcceso('empresa');
                });
            });
        }

        if (hayNube) {
            ERP.nube.iniciar().then((res) => {
                // Con el enlace de recuperación, primero se pone la contraseña.
                if (recuperando || !res || !res.revalidado) return;
                const antes = Boolean(ERP.auth.usuario());
                const ahora = Boolean(ERP.auth.sincronizarSesion());
                if (ahora) {
                    montarAplicacion();
                } else if (enlace && enlace.ok) {
                    // Cuenta recién confirmada a la que nadie ha dado empresa.
                    pantallaAcceso('empresa');
                } else if (antes) {
                    pantallaAcceso('entrar', ui.banner('Su sesión terminó',
                        'El administrador cambió su acceso o la sesión caducó. Ingrese de nuevo.', 'warning'));
                }
            });
        }

        if (carga.publicados === 'actualizados') {
            window.setTimeout(() => ui.toastInfo('Datos actualizados',
                `Se cargaron los datos publicados más recientes de ${carga.publicacion.empresa}.`), 900);
        }
        if (carga.publicadosPendientes) {
            window.setTimeout(() => ui.toastWarn('Hay datos publicados más recientes',
                'Este navegador tiene cambios propios. Un administrador puede cargarlos desde Configuración → Datos y respaldo.'), 900);
        }

        if (carga.seeded) {
            window.setTimeout(() => ui.toastInfo('Datos de demostración cargados',
                'Puede auditar cada módulo de inmediato. El administrador puede reiniciarlos o exportarlos desde Configuración.'), 900);
        }
    };

    return { iniciar, irA, refrescar: montarAplicacion, MODULOS, GRUPOS, estado };
})();

document.addEventListener('DOMContentLoaded', ERP.app.iniciar);
