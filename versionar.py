"""
Numera automáticamente una versión nueva del ERP.

Uso (desde la carpeta «Aplicación con Claude», raíz del repositorio):
    python versionar.py parche "Qué se corrigió"
    python versionar.py menor  "Qué funcionalidad se agregó"
    python versionar.py mayor  "Qué cambió de forma incompatible"

Actualiza en un solo paso los tres sitios que deben coincidir:
  1. ERP.VERSION en Aplicación con Claude/assets/JS/app.js (se ve en pantalla).
  2. El ?v= de cada <link> y <script> de index.html (evita la caché vieja).
  3. La tabla «Versiones» de historial.md: completa el commit de la versión
     anterior y agrega la fila nueva.

Después se hace el commit con el mensaje «vX.Y.Z: resumen».
No toca archivos si la versión ya se subió y aún no se hizo commit.
"""
import datetime
import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent
APP = RAIZ
ARCH_APP = APP / "assets" / "JS" / "app.js"
ARCH_INDEX = APP / "index.html"
ARCH_HISTORIAL = APP / "historial.md"
PATRON_VERSION = re.compile(r"ERP\.VERSION = '(\d+)\.(\d+)\.(\d+)';")


def leer(ruta):
    # newline='' conserva los finales de línea tal como están en el archivo.
    with open(ruta, encoding="utf-8", newline="") as f:
        return f.read()


def escribir(ruta, texto):
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        f.write(texto)


def git(*args):
    r = subprocess.run(["git", *args], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
    return r.stdout.strip() if r.returncode == 0 else ""


def salir(mensaje):
    print(f"ERROR: {mensaje}")
    sys.exit(1)


def main():
    # La consola de Windows usa cp1252: sin esto, un acento o una flecha rompe la salida.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if len(sys.argv) < 3 or sys.argv[1] not in ("parche", "menor", "mayor") or not sys.argv[2].strip():
        salir('uso: python versionar.py parche|menor|mayor "resumen de los cambios"')
    tipo, resumen = sys.argv[1], " ".join(sys.argv[2:]).strip().replace("|", "/")

    app = leer(ARCH_APP)
    m = PATRON_VERSION.search(app)
    if not m:
        salir("no se encontró ERP.VERSION en app.js")
    actual = tuple(int(x) for x in m.groups())

    # Si app.js ya tiene una versión distinta a la del último commit, esa versión
    # está en curso: numerar otra vez saltaría un número.
    # La ruta vieja cubre los commits anteriores a que la app pasara a ser la raíz.
    en_commit = PATRON_VERSION.search(git("show", "HEAD:assets/JS/app.js")
                                      or git("show", "HEAD:Aplicación con Claude/assets/JS/app.js") or "")
    if en_commit and tuple(int(x) for x in en_commit.groups()) != actual:
        salir(f"la versión {'.'.join(map(str, actual))} ya está numerada y falta su commit")

    mayor, menor, parche = actual
    if tipo == "mayor":
        nueva = (mayor + 1, 0, 0)
    elif tipo == "menor":
        nueva = (mayor, menor + 1, 0)
    else:
        nueva = (mayor, menor, parche + 1)
    v_actual = ".".join(map(str, actual))
    v_nueva = ".".join(map(str, nueva))

    # 1. app.js
    escribir(ARCH_APP, PATRON_VERSION.sub(f"ERP.VERSION = '{v_nueva}';", app, count=1))

    # 2. index.html
    index = leer(ARCH_INDEX)
    index, n = re.subn(r'((?:href|src)="assets/(?:CSS|JS)/[^"?]+\.(?:css|js))(\?v=[^"]*)?"',
                       rf'\1?v={v_nueva}"', index)
    escribir(ARCH_INDEX, index)

    # 3. historial.md
    hist = leer(ARCH_HISTORIAL)
    fin = "\r\n" if "\r\n" in hist else "\n"
    commit_previo = git("log", "--format=%h", "-1", "--extended-regexp", f"--grep=^v{re.escape(v_actual)}:")
    hist = hist.replace("| *(esta versión)* |", f"| `{commit_previo}` |" if commit_previo else "| *(sin commit)* |", 1)
    separador = "| --- | --- | --- | --- |"
    if separador not in hist:
        salir("no se encontró la tabla de versiones en historial.md")
    fila = f"| {v_nueva} | {datetime.date.today().isoformat()} | *(esta versión)* | {resumen} |"
    hist = hist.replace(separador + fin, separador + fin + fila + fin, 1)
    escribir(ARCH_HISTORIAL, hist)

    print(f"Versión {v_actual} -> {v_nueva}")
    print(f"  app.js: ERP.VERSION = '{v_nueva}'")
    print(f"  index.html: {n} archivos con ?v={v_nueva}")
    print(f"  historial.md: commit de {v_actual} = {commit_previo or 'sin commit'}; fila {v_nueva} agregada")
    print(f'Mensaje de commit sugerido: "v{v_nueva}: {resumen[:60]}"')


if __name__ == "__main__":
    main()
