"""
Publica los datos de la empresa junto con la aplicación.

Uso (desde la carpeta «Aplicación con Claude», raíz del repositorio):
    python publicar_datos.py "C:/Users/.../Downloads/respaldo-erp-AAAA-MM-DD.json"
    python publicar_datos.py respaldo.json --tipo menor
    python publicar_datos.py respaldo.json --sin-version

Pasos:
  1. En la copia donde trabaja, Configuración → Datos y respaldo → Exportar datos (JSON).
  2. Ejecutar este script con ese archivo.
  3. Hacer commit y push: Vercel publica la versión y los navegadores que tenían
     los datos publicados anteriores sin cambios propios se actualizan solos.

ATENCIÓN: el repositorio y el sitio son públicos. Todo lo que contiene el
respaldo (clientes, ventas, usuarios con sus contraseñas cifradas) queda visible.
"""
import datetime
import hashlib
import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent
DESTINO = RAIZ / "assets" / "JS" / "datos-publicados.js"
FORMATO = 2
ROLES = {"administrador", "contador", "vendedor"}


def salir(mensaje):
    print(f"ERROR: {mensaje}")
    sys.exit(1)


def id_actual():
    if not DESTINO.exists():
        return None
    texto = DESTINO.read_text(encoding="utf-8")
    marca = '"id":"'
    i = texto.find(marca)
    return texto[i + len(marca):texto.find('"', i + len(marca))] if i >= 0 else None


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        salir('uso: python publicar_datos.py "ruta/al/respaldo.json" [--tipo parche|menor|mayor] [--sin-version]')
    tipo = "parche"
    if "--tipo" in sys.argv:
        tipo = sys.argv[sys.argv.index("--tipo") + 1]
        if tipo not in ("parche", "menor", "mayor"):
            salir("--tipo debe ser parche, menor o mayor")

    origen = pathlib.Path(args[0])
    if not origen.exists():
        salir(f"no existe el archivo {origen}")
    try:
        datos = json.loads(origen.read_text(encoding="utf-8"))
    except Exception as error:
        salir(f"el archivo no es un JSON válido ({error})")

    # Las mismas comprobaciones que hace la aplicación al importar un respaldo.
    if not isinstance(datos, dict) or not isinstance(datos.get("usuarios"), list) \
            or not isinstance(datos.get("ventas"), list) or not isinstance(datos.get("config"), dict):
        salir("el archivo no es un respaldo de este sistema")
    if datos.get("version") != FORMATO:
        salir(f"el respaldo tiene el formato {datos.get('version')} y el sistema usa el {FORMATO}")
    if any(not isinstance(u, dict) or not u.get("id") or not isinstance(u.get("usuario"), str)
           or not isinstance(u.get("clave"), str) or u.get("rol") not in ROLES for u in datos["usuarios"]):
        salir("el respaldo tiene usuarios incompletos o con un rol desconocido")
    if not any(u.get("rol") == "administrador" and u.get("activo") is not False for u in datos["usuarios"]):
        salir("el respaldo no tiene un administrador activo")

    # meta describe el navegador que exportó, no los datos: cada navegador arma el suyo.
    datos.pop("meta", None)
    contenido = json.dumps(datos, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    ident = hashlib.sha1(contenido.encode("utf-8")).hexdigest()[:12]
    if ident == id_actual():
        print(f"Los datos de {origen.name} ya están publicados (id {ident}). No hay nada que cambiar.")
        return

    c = datos["config"]
    resumen = {
        "empresa": c.get("empresa", ""),
        "clientes": sum(1 for t in datos.get("terceros", []) if t.get("tipo") == "cliente"),
        "productos": len(datos.get("productos", [])),
        "ventas": sum(1 for v in datos.get("ventas", []) if not v.get("anulada")),
        "compras": len(datos.get("compras", [])),
    }
    fecha = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    envoltorio = json.dumps({"id": ident, "fecha": fecha, "archivo": origen.name}, ensure_ascii=False,
                            separators=(",", ":"))[:-1]
    DESTINO.write_text(
        "/* Generado por publicar_datos.py: datos de la empresa publicados con esta versión.\n"
        "   ATENCIÓN: el repositorio y el sitio son públicos; este contenido es visible para cualquiera.\n"
        "   No editar a mano: exportar un respaldo y volver a ejecutar el script. */\n"
        "window.ERP = window.ERP || {};\n"
        f"ERP.DATOS_PUBLICADOS = {envoltorio},\"datos\":{contenido}}};\n",
        encoding="utf-8", newline="\n")

    print(f"Datos publicados: {resumen['empresa']} · {resumen['clientes']} clientes · "
          f"{resumen['productos']} productos · {resumen['ventas']} ventas · {resumen['compras']} compras")
    print(f"  archivo: {DESTINO.relative_to(RAIZ)} ({DESTINO.stat().st_size} bytes, id {ident})")

    if "--sin-version" in sys.argv:
        return
    texto = (f"**Datos publicados:** {resumen['empresa']} ({resumen['clientes']} clientes, "
             f"{resumen['productos']} productos, {resumen['ventas']} ventas, {resumen['compras']} compras), "
             f"desde el respaldo `{origen.name}`.")
    subprocess.run([sys.executable, str(RAIZ / "versionar.py"), tipo, texto], check=True)


if __name__ == "__main__":
    main()
