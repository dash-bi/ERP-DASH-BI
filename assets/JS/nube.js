/* ============================================================
   nube.js — Conexión con Supabase (base de datos compartida)

   La aplicación sigue trabajando sobre localStorage, que es propio de
   cada navegador y de cada dirección. Este módulo la conecta con
   PostgreSQL para que esos mismos datos estén en cualquier equipo:

     descargar  la nube reemplaza los datos de este navegador
     subir      este navegador reemplaza los datos de la nube

   Se habla directamente con la API de Supabase (fetch): sin librerías
   externas ni CDN, así la aplicación abre igual sin conexión y sigue el
   mismo estilo del resto del sistema.

   También es la puerta de entrada: quien usa la aplicación se registra y
   entra con su correo y su contraseña, que Supabase Auth verifica en el
   servidor y guarda cifradas con bcrypt. Este navegador solo conserva el
   testigo de sesión, que caduca y se puede revocar; ninguna contraseña,
   ni siquiera cifrada, se guarda aquí.

   Del lado del servidor trabajan las funciones de supabase/003_conexion_app.sql
   y 006_registro_usuarios.sql: mi_perfil, crear_empresa, descargar_snapshot,
   subir_snapshot, invitar_usuario, revocar_invitacion, actualizar_perfil y
   usuarios_empresa. Cada una revisa empresa, rol y permisos; Row Level
   Security hace el resto.
   ============================================================ */

window.ERP = window.ERP || {};

ERP.nube = (() => {
    const U = ERP.util;
    const db = ERP.db;

    /* Proyecto «ERP Financiero» en Supabase.
       La clave publicable está pensada para vivir en el navegador: por sí sola
       no abre ningún dato, porque cada tabla exige una sesión iniciada y filtra
       por empresa con RLS. La clave secreta (service_role) nunca va aquí. */
    const PROYECTO = {
        url: 'https://nxilhcgjjzluywfinicd.supabase.co',
        clave: 'sb_publishable_7CrrBdP6DmO0gbjI6jO8KA_veo_kXdP'
    };

    const SESION_KEY = 'erp_nube_sesion_v1';
    const PERFIL_KEY = 'erp_nube_perfil_v1';
    const PREFS_KEY = 'erp_nube_prefs_v1';
    const ESPERA_MS = 45000;
    const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const MARGEN_TOKEN_S = 90;   // se renueva el acceso antes de que caduque

    /* Estado en memoria. Se rellena al cargar el archivo con lo guardado en
       este navegador, para que la aplicación sepa quién entra sin esperar a la
       red. Lo guardado es el testigo de sesión y el perfil, nunca la contraseña. */
    let sesion = null;      // { acceso, refresco, expira, email, usuarioId }
    let perfil = null;      // { id, usuario, nombre, email, rol, empresa, empresaId, rev }
    let ocupado = '';       // etiqueta de la operación en curso
    let ultimoError = '';

    /* ---------- Almacenamiento local de la sesión ---------- */

    const leerLocal = (clave) => {
        try {
            const crudo = window.localStorage.getItem(clave);
            return crudo ? JSON.parse(crudo) : null;
        } catch (error) {
            return null;
        }
    };

    const guardarLocal = (clave, valor) => {
        try {
            if (valor === null) window.localStorage.removeItem(clave);
            else window.localStorage.setItem(clave, JSON.stringify(valor));
            return true;
        } catch (error) {
            return false;
        }
    };

    const prefs = () => ({ auto: false, ...(leerLocal(PREFS_KEY) || {}) });

    const guardarPrefs = (cambios) => {
        guardarLocal(PREFS_KEY, { ...prefs(), ...cambios });
        avisar();
    };

    const avisar = () => U.bus.emit('nube:estado', estado());

    const fallo = (mensaje) => {
        ultimoError = mensaje;
        return { ok: false, error: mensaje };
    };

    /* ---------- Llamadas a la API ---------- */

    /** Traduce los tropiezos de red a un mensaje que el usuario pueda entender. */
    const enviar = async (ruta, opciones) => {
        const control = new AbortController();
        const reloj = window.setTimeout(() => control.abort(), ESPERA_MS);
        try {
            const respuesta = await window.fetch(`${PROYECTO.url}${ruta}`, { ...opciones, signal: control.signal });
            let cuerpo = null;
            const texto = await respuesta.text();
            if (texto) {
                try {
                    cuerpo = JSON.parse(texto);
                } catch (error) {
                    cuerpo = { message: texto };
                }
            }
            return { red: true, estado: respuesta.status, cuerpo };
        } catch (error) {
            const mensaje = error && error.name === 'AbortError'
                ? 'Supabase tardó demasiado en responder. Intente de nuevo.'
                : 'No hay conexión con Supabase. Revise su conexión a internet.';
            return { red: false, estado: 0, cuerpo: { message: mensaje } };
        } finally {
            window.clearTimeout(reloj);
        }
    };

    const mensajeDe = (respuesta, porDefecto) => {
        const c = respuesta.cuerpo || {};
        return String(c.message || c.error_description || c.msg || c.error || porDefecto);
    };

    /* ---------- Sesión de Supabase Auth ---------- */

    const recordarSesion = (datos, email) => {
        sesion = {
            acceso: datos.access_token,
            refresco: datos.refresh_token,
            expira: Date.now() + (Number(datos.expires_in) || 3600) * 1000,
            email: email || (datos.user && datos.user.email) || (sesion && sesion.email) || '',
            usuarioId: (datos.user && datos.user.id) || (sesion && sesion.usuarioId) || ''
        };
        guardarLocal(SESION_KEY, sesion);
    };

    const olvidarSesion = () => {
        sesion = null;
        perfil = null;
        guardarLocal(SESION_KEY, null);
        guardarLocal(PERFIL_KEY, null);
    };

    /** El perfil guardado permite entrar sin conexión mientras la sesión siga viva. */
    const recordarPerfil = (valor) => {
        perfil = valor || null;
        guardarLocal(PERFIL_KEY, perfil);
    };

    const renovar = async () => {
        if (!sesion || !sesion.refresco) return fallo('La sesión de Supabase caducó. Conéctese de nuevo.');
        const respuesta = await enviar('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { apikey: PROYECTO.clave, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: sesion.refresco })
        });
        if (respuesta.estado !== 200) {
            olvidarSesion();
            avisar();
            return fallo(respuesta.red
                ? 'La sesión de Supabase caducó. Conéctese de nuevo.'
                : mensajeDe(respuesta, 'No fue posible renovar la sesión.'));
        }
        recordarSesion(respuesta.cuerpo, sesion.email);
        return { ok: true, token: sesion.acceso };
    };

    const tokenValido = async () => {
        if (!sesion) return fallo('Conéctese a Supabase para sincronizar.');
        if (Date.now() > sesion.expira - MARGEN_TOKEN_S * 1000) return renovar();
        return { ok: true, token: sesion.acceso };
    };

    /** Llama a una función del servidor. Reintenta una vez si el token acaba de caducar. */
    const rpc = async (funcion, argumentos = {}) => {
        const credencial = await tokenValido();
        if (!credencial.ok) return credencial;

        const llamar = (token) => enviar(`/rest/v1/rpc/${funcion}`, {
            method: 'POST',
            headers: {
                apikey: PROYECTO.clave,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(argumentos)
        });

        let respuesta = await llamar(credencial.token);
        if (respuesta.estado === 401) {
            const renovado = await renovar();
            if (!renovado.ok) return renovado;
            respuesta = await llamar(renovado.token);
        }
        if (respuesta.estado === 401 || respuesta.estado === 403) {
            return fallo(mensajeDe(respuesta, 'Su usuario no tiene permiso para esta operación.'));
        }
        if (respuesta.estado < 200 || respuesta.estado >= 300) {
            return fallo(mensajeDe(respuesta, 'Supabase rechazó la operación.'));
        }
        return { ok: true, datos: respuesta.cuerpo };
    };

    /* ---------- Operaciones públicas ---------- */

    const configurada = () => Boolean(PROYECTO.url && PROYECTO.clave);

    const conectado = () => Boolean(sesion && sesion.acceso);

    const estado = () => ({
        configurada: configurada(),
        conectado: conectado(),
        email: sesion ? sesion.email : '',
        perfil: perfil ? { ...perfil } : null,
        auto: prefs().auto,
        ocupado,
        error: ultimoError
    });

    const conOcupado = async (etiqueta, tarea) => {
        if (ocupado) return fallo('Hay otra sincronización en curso. Espere a que termine.');
        ocupado = etiqueta;
        ultimoError = '';
        avisar();
        try {
            return await tarea();
        } finally {
            ocupado = '';
            avisar();
        }
    };

    /** Inicia sesión en Supabase Auth con el correo y la contraseña del usuario. */
    const entrar = (email, clave) => conOcupado('entrando', async () => {
        const correo = String(email || '').trim();
        if (!correo || !clave) return fallo('Escriba el correo y la contraseña de su cuenta de Supabase.');

        const respuesta = await enviar('/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { apikey: PROYECTO.clave, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: correo, password: clave })
        });
        if (respuesta.estado === 400) return fallo('Correo o contraseña incorrectos.');
        if (respuesta.estado !== 200) return fallo(mensajeDe(respuesta, 'No fue posible conectarse a Supabase.'));

        recordarSesion(respuesta.cuerpo, correo);
        const consulta = await cargarPerfil();
        avisar();
        return consulta.ok ? { ok: true, perfil } : consulta;
    });

    /**
     * Crea la cuenta con correo y contraseña. La contraseña viaja una sola vez
     * a Supabase, que la cifra; no se guarda en ningún punto del navegador.
     * Si el proyecto exige confirmar el correo, no hay sesión hasta que la
     * persona abra el enlace que recibe.
     */
    const registrarse = (datos = {}) => conOcupado('registrando', async () => {
        const correo = String(datos.email || '').trim();
        const clave = String(datos.clave || '');
        const nombre = String(datos.nombre || '').trim();
        if (!CORREO.test(correo)) return fallo('Escriba un correo electrónico válido.');
        if (clave.length < 8) return fallo('La contraseña debe tener al menos 8 caracteres.');
        if (nombre.length < 3) return fallo('Escriba su nombre completo.');

        const respuesta = await enviar('/auth/v1/signup', {
            method: 'POST',
            headers: { apikey: PROYECTO.clave, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: correo, password: clave, data: { nombre } })
        });
        if (respuesta.estado === 422 || respuesta.estado === 400) {
            const texto = mensajeDe(respuesta, '');
            if (/already registered|already exists/i.test(texto)) {
                return fallo('Ya existe una cuenta con ese correo. Entre con su contraseña o recupérela.');
            }
            if (/password/i.test(texto)) return fallo('La contraseña es demasiado débil. Use al menos 8 caracteres.');
            return fallo(texto || 'No fue posible crear la cuenta.');
        }
        if (respuesta.estado < 200 || respuesta.estado >= 300) {
            return fallo(mensajeDe(respuesta, 'No fue posible crear la cuenta.'));
        }

        const cuerpo = respuesta.cuerpo || {};
        if (!cuerpo.access_token) {
            // El proyecto pide confirmar el correo antes de dar la primera sesión.
            return { ok: true, confirmar: true, email: correo };
        }
        recordarSesion(cuerpo, correo);
        const consulta = await cargarPerfil();
        avisar();
        return consulta.ok ? { ok: true, confirmar: false, perfil } : consulta;
    });

    /** Envía el correo con el enlace para poner una contraseña nueva. */
    const recuperar = (email) => conOcupado('recuperando', async () => {
        const correo = String(email || '').trim();
        if (!CORREO.test(correo)) return fallo('Escriba un correo electrónico válido.');
        const respuesta = await enviar('/auth/v1/recover', {
            method: 'POST',
            headers: { apikey: PROYECTO.clave, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: correo })
        });
        // Se responde igual exista o no la cuenta: no se revela quién está registrado.
        if (!respuesta.red) return fallo(mensajeDe(respuesta, 'No fue posible enviar el correo.'));
        return { ok: true };
    });

    /** Cambia la contraseña de quien tiene la sesión abierta. */
    const cambiarClave = (nueva) => conOcupado('cambiando', async () => {
        const clave = String(nueva || '');
        if (clave.length < 8) return fallo('La contraseña debe tener al menos 8 caracteres.');
        const credencial = await tokenValido();
        if (!credencial.ok) return credencial;
        const respuesta = await enviar('/auth/v1/user', {
            method: 'PUT',
            headers: {
                apikey: PROYECTO.clave,
                Authorization: `Bearer ${credencial.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: clave })
        });
        if (respuesta.estado < 200 || respuesta.estado >= 300) {
            return fallo(mensajeDe(respuesta, 'No fue posible cambiar la contraseña.'));
        }
        return { ok: true };
    });

    const salir = async () => {
        if (sesion) {
            await enviar('/auth/v1/logout', {
                method: 'POST',
                headers: { apikey: PROYECTO.clave, Authorization: `Bearer ${sesion.acceso}`, 'Content-Type': 'application/json' }
            });
        }
        olvidarSesion();
        avisar();
        return { ok: true };
    };

    /** Empresa, rol y revisión del usuario conectado. Sin perfil todavía, devuelve null. */
    const cargarPerfil = async () => {
        const res = await rpc('mi_perfil');
        // Un fallo de red no cierra la sesión: se sigue con el perfil guardado.
        if (!res.ok) return res;
        recordarPerfil(res.datos || null);
        avisar();
        return { ok: true, perfil };
    };

    /** Primera vez: crea la empresa en la nube y deja a este usuario como administrador. */
    const crearEmpresa = (datos = {}) => conOcupado('creando', async () => {
        const res = await rpc('crear_empresa', {
            razon_social: String(datos.razonSocial || '').trim(),
            nit: String(datos.nit || '').trim(),
            usuario: String(datos.usuario || 'admin').trim(),
            nombre: String(datos.nombre || 'Administrador').trim()
        });
        if (!res.ok) return res;
        recordarPerfil(res.datos || null);
        return { ok: true, perfil };
    });

    /**
     * Baja los datos de la nube y reemplaza los de este navegador.
     * Los usuarios no viajan en la instantánea: viven en public.perfiles y se
     * gestionan en Configuración → Usuarios y accesos.
     */
    const descargar = () => conOcupado('descargando', async () => {
        const res = await rpc('descargar_snapshot');
        if (!res.ok) return res;

        const remoto = res.datos;
        if (!remoto || typeof remoto !== 'object') return fallo('La nube no devolvió datos legibles.');

        const nube = remoto.nube || {};
        const paquete = { ...remoto };
        delete paquete.nube;

        const aplicado = db.importarRespaldo(JSON.stringify(paquete));
        if (!aplicado.ok) return fallo(`Los datos de la nube no se pudieron aplicar: ${aplicado.error}`);

        db.marcarNube(nube.empresaId || (perfil && perfil.empresaId) || null);
        if (perfil) recordarPerfil({ ...perfil, rev: nube.rev, sincronizadoEn: nube.sincronizadoEn });
        return { ok: true, resumen: aplicado.resumen, rev: nube.rev };
    });

    /**
     * Sube los datos de este navegador y reemplaza los de la nube.
     * rev_base evita pisar el trabajo de otro usuario: si la nube cambió desde
     * la última vez que este equipo la vio, el servidor rechaza la subida.
     */
    const subir = (opciones = {}) => conOcupado('subiendo', async () => {
        const datos = JSON.parse(db.exportJSON());
        delete datos.meta;

        const base = opciones.forzar ? null : (perfil ? perfil.rev : null);
        const res = await rpc('subir_snapshot', { payload: datos, rev_base: base === undefined ? null : base });
        if (!res.ok) return res;

        const info = res.datos || {};
        db.marcarNube(perfil ? perfil.empresaId : null);
        if (perfil) recordarPerfil({ ...perfil, rev: info.rev, sincronizadoEn: info.sincronizadoEn });
        return { ok: true, resumen: info.resumen, rev: info.rev };
    });

    /* ---------- Usuarios de la empresa ---------- */

    /** Usuarios con acceso e invitaciones pendientes. */
    const usuariosEmpresa = async () => {
        const res = await rpc('usuarios_empresa');
        if (!res.ok) return res;
        const datos = res.datos || {};
        return { ok: true, usuarios: datos.usuarios || [], invitaciones: datos.invitaciones || [] };
    };

    /** Habilita a una persona por su correo. El servidor exige rol de administrador. */
    const invitar = (datos = {}) => conOcupado('invitando', async () => {
        const res = await rpc('invitar_usuario', {
            p_email: String(datos.email || '').trim(),
            p_rol: datos.rol,
            p_usuario: String(datos.usuario || '').trim() || null,
            p_nombre: String(datos.nombre || '').trim()
        });
        return res.ok ? { ok: true, invitacion: res.datos || {} } : res;
    });

    const revocarInvitacion = (id) => conOcupado('revocando', async () => {
        const res = await rpc('revocar_invitacion', { p_id: id });
        return res.ok ? { ok: true } : res;
    });

    /** Cambia nombre, rol o estado de un usuario de la empresa. */
    const actualizarPerfil = (datos = {}) => conOcupado('guardando', async () => {
        const res = await rpc('actualizar_perfil', {
            p_id: datos.id,
            p_nombre: datos.nombre === undefined ? null : String(datos.nombre || '').trim(),
            p_rol: datos.rol === undefined ? null : datos.rol,
            p_activo: datos.activo === undefined ? null : Boolean(datos.activo)
        });
        if (!res.ok) return res;
        // Si se cambió a sí mismo, el perfil guardado deja de reflejar la realidad.
        if (perfil && perfil.id === datos.id) await cargarPerfil();
        return { ok: true };
    });

    /* ---------- Subida automática ---------- */

    const puedeSubirSolo = () => prefs().auto && conectado() && perfil && perfil.rol === 'administrador' && !ocupado;

    const subirSolo = U.debounce(async () => {
        if (!puedeSubirSolo()) return;
        const res = await subir();
        if (!res.ok && ERP.ui) {
            // No se insiste: el usuario ve el estado en Configuración y decide.
            ERP.ui.toastWarn('La nube no recibió los cambios', res.error);
        }
    }, 4000);

    /* Reemplazos completos de los datos locales: no se propagan solos. Descargar
       ya deja ambos lados iguales, y cargar la demostración, reiniciarla o
       empezar de cero borrarían el trabajo de los demás sin avisar. Para llevar
       cualquiera de esos cambios a la nube hay que pulsar «Subir». */
    const MOTIVOS_SIN_AUTO = ['importar', 'publicados', 'reset', 'vaciar'];

    U.bus.on('db:changed', (evento) => {
        if (evento && MOTIVOS_SIN_AUTO.includes(evento.motivo)) return;
        subirSolo();
    });

    /* ---------- Arranque ---------- */

    /* Se lee al cargar el archivo: la pantalla de acceso ya sabe si hay sesión. */
    sesion = leerLocal(SESION_KEY);
    if (!sesion || !sesion.refresco) {
        sesion = null;
        perfil = null;
    } else {
        perfil = leerLocal(PERFIL_KEY);
    }

    /**
     * Revalida contra el servidor la sesión guardada. Se llama al arrancar, sin
     * bloquear: si el servidor dice que el usuario ya no existe o fue
     * desactivado, el perfil se vacía y la aplicación vuelve al acceso; si solo
     * falla la red, se sigue trabajando con lo guardado.
     */
    const iniciar = async () => {
        if (!sesion) return { ok: true, conectado: false, revalidado: false };
        const consulta = await cargarPerfil();
        avisar();
        return { ok: consulta.ok, conectado: conectado(), revalidado: consulta.ok, perfil };
    };

    return {
        PROYECTO_URL: PROYECTO.url,
        configurada, conectado, estado, iniciar,
        entrar, registrarse, recuperar, cambiarClave, salir,
        cargarPerfil, crearEmpresa,
        perfilGuardado: () => (sesion && perfil ? { ...perfil } : null),
        usuariosEmpresa, invitar, revocarInvitacion, actualizarPerfil,
        descargar, subir,
        auto: () => prefs().auto,
        activarAuto: (valor) => guardarPrefs({ auto: Boolean(valor) })
    };
})();
