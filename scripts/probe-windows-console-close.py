"""PROBE: ¿alcanza el margen de Windows al cerrarse la consola?

Lanza el binario compilado en su PROPIA consola nueva y oculta, le postea
WM_CLOSE a esa ventana, y verifica que el registro terminó con su línea de cierre
declarando el modo `interrumpida` y que el proceso salió con 129.

El WM_CLOSE a una ventana de consola es la ruta real: el kernel lo convierte en
un CTRL_CLOSE_EVENT genuino contra cada proceso adjunto, que es exactamente lo
que Node eleva como SIGHUP. No es un primo (SIGBREAK) ni una simulación (llamar
al handler a mano): es el mismo evento que produce cerrar la X.

`HideWindow` demuestra que la ventana no necesita ser visible, así que esto corre
sin escritorio interactivo. La misma técnica que usa el test del runtime de Go
(`TestCtrlHandler`, src/runtime/signal_windows_test.go).

FALLA RUIDOSAMENTE en toda condición inconcluyente. Un probe que saltea cuando no
puede medir reporta «cubierto» sobre nada.

Uso:  python scripts/probe-windows-console-close.py [ruta-a-dist/cli.js]
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes as w
import json
import os
import sys
import tempfile
import time
from pathlib import Path

CIERRE = "Cierre del run: modo=interrumpida"
SENAL = "señal SIGHUP"
CODIGO_ESPERADO = 129  # 128 + SIGHUP

CREATE_NEW_CONSOLE = 0x00000010
CREATE_UNICODE_ENVIRONMENT = 0x00000400
STARTF_USESHOWWINDOW = 0x00000001
SW_HIDE = 0
WM_CLOSE = 0x0010
INFINITE = 0xFFFFFFFF
STILL_ACTIVE = 259


def fatal(por_que: str) -> None:
    print(f"PROBE INCONCLUYENTE: {por_que}", file=sys.stderr)
    sys.exit(1)


if sys.platform != "win32":
    fatal(f"sólo corre en Windows; este host es {sys.platform}")


class STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb", w.DWORD), ("lpReserved", w.LPWSTR), ("lpDesktop", w.LPWSTR),
        ("lpTitle", w.LPWSTR), ("dwX", w.DWORD), ("dwY", w.DWORD),
        ("dwXSize", w.DWORD), ("dwYSize", w.DWORD), ("dwXCountChars", w.DWORD),
        ("dwYCountChars", w.DWORD), ("dwFillAttribute", w.DWORD),
        ("dwFlags", w.DWORD), ("wShowWindow", w.WORD), ("cbReserved2", w.WORD),
        ("lpReserved2", ctypes.POINTER(ctypes.c_byte)),
        ("hStdInput", w.HANDLE), ("hStdOutput", w.HANDLE), ("hStdError", w.HANDLE),
    ]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [("hProcess", w.HANDLE), ("hThread", w.HANDLE),
                ("dwProcessId", w.DWORD), ("dwThreadId", w.DWORD)]


k32 = ctypes.WinDLL("kernel32", use_last_error=True)
u32 = ctypes.WinDLL("user32", use_last_error=True)

k32.CreateProcessW.argtypes = [
    w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, w.BOOL, w.DWORD,
    ctypes.c_void_p, w.LPCWSTR, ctypes.POINTER(STARTUPINFOW),
    ctypes.POINTER(PROCESS_INFORMATION),
]
k32.CreateProcessW.restype = w.BOOL
u32.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM), w.LPARAM]
u32.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
u32.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
u32.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]


def ventana_de_consola(pid: int) -> int | None:
    """El HWND de consola cuyo proceso RAÍZ adjunto es `pid`.

    `GetWindowThreadProcessId` está caseado para ConsoleWindowClass y devuelve el
    proceso raíz adjunto en vez de conhost. Como acá creamos la consola con el
    hijo como único proceso adjunto, ese raíz ES el hijo.
    """
    encontrado: list[int] = []

    @ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    def cb(hwnd: int, _lparam: int) -> int:
        clase = ctypes.create_unicode_buffer(64)
        u32.GetClassNameW(hwnd, clase, 64)
        if clase.value == "ConsoleWindowClass":
            duenio = w.DWORD()
            u32.GetWindowThreadProcessId(hwnd, ctypes.byref(duenio))
            if duenio.value == pid:
                encontrado.append(hwnd)
                return False
        return True

    u32.EnumWindows(cb, 0)
    return encontrado[0] if encontrado else None


def el_log(dir_log: Path) -> str | None:
    archivos = sorted(dir_log.glob("*.log"))
    if len(archivos) != 1:
        return None
    return archivos[0].read_text(encoding="utf-8", errors="replace")


def main() -> None:
    cli = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/cli.js").resolve()
    if not cli.is_file():
        fatal(f"no existe el binario compilado {cli}; corré `npm run build` antes")

    raiz = Path(tempfile.mkdtemp(prefix="probe-console-close-"))
    dir_log = raiz / "logs"
    dir_cfg = raiz / "config"
    dir_log.mkdir()
    dir_cfg.mkdir()
    # Todos los gestores deshabilitados y sin auto-chequeo: el probe mide la ruta
    # de salida, no actualiza nada ni sale a la red.
    (dir_cfg / "config.json").write_text(
        json.dumps({"selfCheck": False, "enabledManagers": {}}), encoding="utf-8"
    )

    entorno = dict(os.environ)
    entorno["TACUCHI_UPDATER_LOG_DIR"] = str(dir_log)
    entorno["TACUCHI_UPDATER_CONFIG_DIR"] = str(dir_cfg)
    bloque = "\0".join(f"{k}={v}" for k, v in entorno.items()) + "\0\0"

    si = STARTUPINFOW()
    si.cb = ctypes.sizeof(si)
    si.dwFlags = STARTF_USESHOWWINDOW
    si.wShowWindow = SW_HIDE  # oculta: no hace falta escritorio visible
    pi = PROCESS_INFORMATION()

    # Sin redirigir stdio: el hijo hereda los handles de SU consola nueva, así que
    # stdin ES un TTY y la app corre interactiva — se queda esperando una tecla en
    # vez de completar la corrida. Eso elimina la carrera y es además el escenario
    # real: alguien con la interfaz abierta que cierra la ventana.
    ok = k32.CreateProcessW(
        None, ctypes.create_unicode_buffer(f'"{sys.executable_node}" "{cli}"'),
        None, None, False,
        CREATE_NEW_CONSOLE | CREATE_UNICODE_ENVIRONMENT,
        ctypes.create_unicode_buffer(bloque), str(cli.parent.parent),
        ctypes.byref(si), ctypes.byref(pi),
    )
    if not ok:
        fatal(f"CreateProcessW falló con error {ctypes.get_last_error()}")

    pid = pi.dwProcessId
    print(f"hijo lanzado: pid={pid}, consola nueva y oculta")

    # 1. Esperar a que el registro exista y tenga su cabecera completa: prueba de
    #    que la app arrancó y abrió su sumidero.
    limite = time.monotonic() + 60
    while time.monotonic() < limite:
        texto = el_log(dir_log)
        if texto and "Platform:" in texto:
            break
        time.sleep(0.1)
    else:
        fatal("el registro no llegó a su línea `Platform:` en 60 s")

    # 2. Y que la corrida NO haya terminado sola: si ya hay cierre, no medimos nada.
    texto = el_log(dir_log) or ""
    if "Cierre del run:" in texto:
        fatal("la corrida se cerró sola antes del WM_CLOSE; no hay margen que medir")
    if k32.WaitForSingleObject(pi.hProcess, 0) == 0:
        fatal("el proceso terminó antes del WM_CLOSE; no hay margen que medir")

    # 3. La ventana de consola del hijo.
    hwnd = None
    limite = time.monotonic() + 20
    while time.monotonic() < limite:
        hwnd = ventana_de_consola(pid)
        if hwnd:
            break
        time.sleep(0.1)
    if not hwnd:
        fatal(
            "no se encontró ninguna ConsoleWindowClass del hijo. Es la condición "
            "que decide el camino: si el runner no da ventana de consola, hay que "
            "pasar al probe B (CreatePseudoConsole + ClosePseudoConsole, la ruta "
            "que Microsoft documenta como emisora de CTRL_CLOSE_EVENT)"
        )
    print(f"ventana de consola del hijo: hwnd={hwnd}")

    # 4. Cerrarla, que es lo que el kernel convierte en CTRL_CLOSE_EVENT.
    t0 = time.perf_counter()
    if not u32.PostMessageW(hwnd, WM_CLOSE, 0, 0):
        fatal(f"PostMessageW(WM_CLOSE) falló con error {ctypes.get_last_error()}")

    # 5. Cuánto tardó de verdad. ESTE es el número que el probe existe para medir.
    if k32.WaitForSingleObject(pi.hProcess, 30_000) != 0:
        fatal("el proceso no terminó en 30 s tras el WM_CLOSE")
    ms = (time.perf_counter() - t0) * 1000

    codigo = w.DWORD()
    k32.GetExitCodeProcess(pi.hProcess, ctypes.byref(codigo))

    texto = el_log(dir_log)
    if texto is None:
        fatal("el registro desapareció")
    lineas = [l for l in texto.splitlines() if l.strip()]

    problemas: list[str] = []
    if CIERRE not in (lineas[-1] if lineas else ""):
        problemas.append(f"la última línea no declara el cierre interrumpido: {lineas[-1] if lineas else '(vacío)'!r}")
    if SENAL not in (lineas[-1] if lineas else ""):
        problemas.append("el cierre no nombra la señal SIGHUP")
    if sum(1 for l in lineas if "Cierre del run:" in l) != 1:
        problemas.append("hay más de una línea de cierre")
    for cabecera in ("Logger iniciado", "Log: ", "PID: ", "Platform: "):
        if cabecera not in texto:
            problemas.append(f"se perdió una línea ya emitida: {cabecera!r}")
    if codigo.value != CODIGO_ESPERADO:
        problemas.append(f"salió con {codigo.value} y no con {CODIGO_ESPERADO}")

    print(json.dumps({
        "margen_usado_ms": round(ms, 1),
        "margen_del_sistema_ms": 5000,
        "codigo_de_salida": codigo.value,
        "lineas_del_registro": len(lineas),
        "ultima_linea": lineas[-1] if lineas else None,
    }, indent=2, ensure_ascii=False))

    if problemas:
        for p in problemas:
            print(f"  FALLA: {p}", file=sys.stderr)
        sys.exit(1)
    print(f"PROBE VERDE: el cierre sobrevivió al WM_CLOSE usando {ms:.1f} ms de los 5000 disponibles")


if __name__ == "__main__":
    # El node con el que corremos el hijo: el mismo que está en PATH.
    import shutil
    nodo = shutil.which("node")
    if not nodo:
        fatal("no hay `node` en PATH")
    sys.executable_node = nodo  # type: ignore[attr-defined]
    main()
