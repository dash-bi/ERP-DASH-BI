/* ============================================================
   auth.js — Identidad, roles y permisos por módulo

   Quién entra lo decide Supabase Auth: el correo y la contraseña se
   verifican en el servidor, que guarda la contraseña cifrada con bcrypt
   en auth.users. Este navegador nunca guarda contraseñas, ni en claro ni
   cifradas; solo el testigo de sesión, que caduca y se puede revocar.

   Qué ve cada quien lo decide el rol de su perfil (public.perfiles) junto
   con los permisos por rol que el administrador guarda en Configuración.
   La lista de módulos se recalcula en cada montaje: quitar un permiso o
   desactivar a alguien surte efecto sin volver a entrar.

   La jerarquía tiene tres niveles:

     Plataforma     super_administrador   gobierna organizaciones, no entra
                                          a los datos de ninguna
     Organización   administrador         su empresa completa
     Operación      contador · vendedor · auxiliar

   Esto es solo lo que se dibuja. Lo que de verdad se puede tocar lo decide
   el servidor (privado.puede_modulo y las políticas RLS): las dos listas
   tienen que cambiar juntas.
   ============================================================ */

window.ERP = window.ERP || {};

ERP.auth = (() => {
    const U = ERP.util;

    let usuarioActual = null;

    const ROLES = {
        super_administrador: {
            etiqueta: 'Super administrador',
            descripcion: 'Gobierna la plataforma: da de alta organizaciones y sus administradores.',
            nivel: 0
        },
        administrador: {
            etiqueta: 'Administrador',
            descripcion: 'Acceso total a su organización, incluida la configuración.',
            nivel: 1
        },
        contador: {
            etiqueta: 'Contador',
            descripcion: 'Operación contable y financiera.',
            nivel: 2
        },
        vendedor: {
            etiqueta: 'Vendedor',
            descripcion: 'Operación comercial.',
            nivel: 2
        },
        auxiliar: {
            etiqueta: 'Auxiliar',
            descripcion: 'Apoyo operativo: inventario, compras, gastos y cartera.',
            nivel: 2
        }
    };

    /** Roles que un administrador puede repartir dentro de su organización. */
    const ROLES_EMPRESA = ['administrador', 'contador', 'vendedor', 'auxiliar'];

    /**
     * Módulos por defecto de cada rol, usados mientras el administrador no guarde
     * otra selección en Configuración. La lista del administrador es la lista
     * completa de módulos: un módulo que no esté en ella no lo ve nadie.
     */
    const PERMISOS = {
        super_administrador: ['plataforma'],
        administrador: ['dashboard', 'clientes', 'proveedores', 'inventario', 'compras', 'gastos',
            'ventas', 'cartera', 'financieros', 'equilibrio', 'prestamos', 'nomina', 'configuracion'],
        contador: ['dashboard', 'clientes', 'proveedores', 'inventario', 'compras', 'gastos',
            'ventas', 'cartera', 'financieros', 'equilibrio', 'prestamos', 'nomina'],
        vendedor: ['dashboard', 'clientes', 'inventario', 'ventas', 'cartera'],
        // Apoyo operativo: mueve inventario, compras, gastos y cartera.
        // Sin ventas, sin estados financieros y sin configuración.
        auxiliar: ['dashboard', 'clientes', 'proveedores', 'inventario', 'compras', 'gastos', 'cartera']
    };

    /** Módulos que nunca se delegan a otro rol. */
    const SOLO_ADMINISTRADOR = ['configuracion'];

    /** Módulos de plataforma: ningún rol de organización los ve. */
    const SOLO_PLATAFORMA = ['plataforma'];

    /**
     * Módulos vigentes de un rol. El administrador los tiene todos; los demás roles
     * ven la selección guardada en Configuración o, si no existe, la de PERMISOS.
     * Se filtra contra la lista completa para ignorar claves desconocidas y para
     * que un dato alterado no pueda abrir Configuración a otro rol.
     */
    const modulosDeRol = (rol) => {
        // La plataforma es un mundo aparte: no ve ningún módulo de operación.
        if (rol === 'super_administrador') return [...PERMISOS.super_administrador];
        const todos = PERMISOS.administrador;
        if (rol === 'administrador') return todos;
        if (!ROLES[rol]) return [];
        const guardados = (ERP.db.config().permisosRol || {})[rol];
        const base = Array.isArray(guardados) ? guardados : PERMISOS[rol];
        return todos.filter((clave) => base.includes(clave)
            && !SOLO_ADMINISTRADOR.includes(clave) && !SOLO_PLATAFORMA.includes(clave));
    };

    const puede = (modulo) => {
        if (!usuarioActual) return false;
        return modulosDeRol(usuarioActual.rol).includes(modulo);
    };

    const modulosPermitidos = () => (usuarioActual ? modulosDeRol(usuarioActual.rol) : []);

    /**
     * Guarda los módulos de cada rol distinto del administrador.
     * permisos: { contador: ['ventas', ...], vendedor: [...] }
     */
    const guardarPermisos = (permisos) => {
        if (!usuarioActual || usuarioActual.rol !== 'administrador') {
            return { ok: false, error: 'Solo el administrador puede cambiar los permisos.' };
        }
        const todos = PERMISOS.administrador;
        const limpio = {};
        for (const rol of ROLES_EMPRESA.filter((r) => r !== 'administrador')) {
            const lista = Array.isArray(permisos[rol]) ? permisos[rol] : [];
            const modulos = todos.filter((clave) => lista.includes(clave) && !SOLO_ADMINISTRADOR.includes(clave));
            if (modulos.length === 0) {
                return { ok: false, error: `El rol ${ROLES[rol].etiqueta} debe tener al menos un módulo.` };
            }
            limpio[rol] = modulos;
        }
        ERP.db.updateConfig({ permisosRol: limpio });
        return { ok: true, permisos: limpio };
    };

    const usuario = () => usuarioActual;

    const etiquetaRol = (rol) => (ROLES[rol] ? ROLES[rol].etiqueta : rol);

    /* ---------- Identidad ---------- */

    /** Traduce el perfil de la nube a la sesión que usa el resto de la aplicación. */
    const desdePerfil = (perfil) => {
        if (!perfil || !perfil.rol || perfil.activo === false) return null;
        // Una organización suspendida deja fuera a todos sus usuarios: es la
        // misma regla que aplica el servidor en privado.empresa_actual().
        if (perfil.rol !== 'super_administrador' && perfil.estadoEmpresa === 'suspendida') return null;
        return {
            id: perfil.id,
            usuario: perfil.usuario,
            nombre: perfil.nombre,
            email: perfil.email || '',
            rol: perfil.rol,
            esSuper: perfil.rol === 'super_administrador',
            empresa: perfil.empresa || '',
            empresaId: perfil.empresaId || '',
            estadoEmpresa: perfil.estadoEmpresa || ''
        };
    };

    const perfilVigente = () => (ERP.nube ? ERP.nube.perfilGuardado() : null);

    /**
     * Entra con correo y contraseña. Devuelve `sinEmpresa` cuando la cuenta es
     * válida pero todavía no pertenece a ninguna empresa: hay que crearla o
     * pedirle al administrador que la habilite.
     */
    const iniciarSesion = async (email, clave) => {
        if (!ERP.nube || !ERP.nube.configurada()) {
            return { ok: false, error: 'Esta copia de la aplicación no tiene configurada la conexión con Supabase.' };
        }
        const res = await ERP.nube.entrar(email, clave);
        if (!res.ok) return res;

        const perfil = perfilVigente();
        if (!perfil) return { ok: true, sinEmpresa: true };
        if (perfil.activo === false) {
            await ERP.nube.salir();
            return { ok: false, error: 'Su usuario está desactivado. Contacte al administrador.' };
        }
        if (perfil.rol !== 'super_administrador' && perfil.estadoEmpresa === 'suspendida') {
            await ERP.nube.salir();
            return { ok: false, error: `La organización ${perfil.empresa} está suspendida. Contacte al administrador de la plataforma.` };
        }

        usuarioActual = desdePerfil(perfil);
        U.bus.emit('auth:login', usuarioActual);
        return { ok: true, usuario: usuarioActual };
    };

    /** Crea la cuenta. Si el proyecto exige confirmar el correo, aún no hay sesión. */
    const registrar = async (datos) => {
        if (!ERP.nube || !ERP.nube.configurada()) {
            return { ok: false, error: 'Esta copia de la aplicación no tiene configurada la conexión con Supabase.' };
        }
        const res = await ERP.nube.registrarse(datos);
        if (!res.ok || res.confirmar) return res;
        usuarioActual = desdePerfil(perfilVigente());
        if (usuarioActual) U.bus.emit('auth:login', usuarioActual);
        return { ok: true, confirmar: false, usuario: usuarioActual, sinEmpresa: !usuarioActual };
    };

    const recuperar = (email) => ERP.nube.recuperar(email);

    const cambiarClave = (nueva) => ERP.nube.cambiarClave(nueva);

    const cerrarSesion = async () => {
        usuarioActual = null;
        if (ERP.nube) await ERP.nube.salir();
        U.bus.emit('auth:logout', null);
    };

    /** Retoma la sesión guardada en este navegador. No necesita red. */
    const restaurarSesion = () => {
        usuarioActual = desdePerfil(perfilVigente());
        return usuarioActual;
    };

    /**
     * Relee el perfil vigente. Si el administrador cambió el rol, quitó el acceso
     * o la sesión caducó (aquí o en otra pestaña), la aplicación lo nota en el
     * siguiente montaje y en cada acción sensible.
     */
    const sincronizarSesion = () => {
        const vigente = desdePerfil(perfilVigente());
        if (!vigente) {
            usuarioActual = null;
            return null;
        }
        usuarioActual = vigente;
        return usuarioActual;
    };

    const esSuper = () => Boolean(usuarioActual && usuarioActual.rol === 'super_administrador');

    return {
        ROLES, ROLES_EMPRESA, PERMISOS, SOLO_ADMINISTRADOR, SOLO_PLATAFORMA, esSuper,
        iniciarSesion, registrar, recuperar, cambiarClave,
        cerrarSesion, restaurarSesion, sincronizarSesion,
        usuario, puede, modulosPermitidos, modulosDeRol, guardarPermisos, etiquetaRol
    };
})();
