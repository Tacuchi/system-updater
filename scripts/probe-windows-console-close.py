"""PROBE: ¿sobrevive el cierre del registro al cierre de la consola en Windows?

Lanza el binario compilado en su PROPIA consola nueva y oculta, le postea
WM_CLOSE a esa ventana, y verifica que el registro terminó con su línea de cierre
declarando el modo `interrumpida` y que el proceso salió con 129.

El WM_CLOSE sobre una ventana de consola es la ruta REAL, verificada en la fuente
de conhost: `Window::_CloseWindow` → `CloseConsoleProcessState` →
`HandleCtrlEvent(CTRL_CLOSE_EVENT)`, el mismo camino que la X del título. libuv
mapea ese evento a SIGHUP y después deja el hilo del handler en `Sleep(INFINITE)`
— ese es el margen que este probe cronometra. No hay alternativa:
`GenerateConsoleCtrlEvent` sólo emite CTRL_C y CTRL_BREAK.

`PostMessageW` y no `SendMessageW` a propósito: SendMessage bloquearía al probe
dentro de la ventana de tiempo que quiere medir e invalidaría el cronómetro.

**NO redirigir stdout/stderr de este hijo para depurar.** Sin
STARTF_USESTDHANDLES el hijo recibe el buffer de entrada de su consola nueva
(documentado en STARTUPINFOW y en «Creation of a Console»), así que stdin es un
TTY y la app entra en modo interactivo. Con un pipe, `src/cli.tsx` la convierte en
una corrida NO interactiva — o sea `updater --yes` contra los gestores del
runner, y con `sudoMode` verdadero porque `fsutil` de System32 deja pasar la
detección de elevación. Para diagnosticar, leé el registro, que es el punto.

El archivo tiene DOS mitades a propósito:

  * `veredicto()` es PURA y sin reloj — recibe el texto del registro y el código
    de salida y devuelve los problemas. Se prueba con `--self-test` en cualquier
    sistema, así que la lógica que decide verde o rojo está cubierta en las tres
    patas de la matriz y no sólo en Windows.
  * el resto habla con la API de Windows y sólo corre ahí.

Códigos de salida:
  0  verde
  1  el producto falló — el registro perdió su cierre, o salió con otro código
  2  INCONCLUYENTE — no se pudo medir. NO es evidencia sobre el producto.

Uso:
  python scripts/probe-windows-console-close.py --self-test   # en cualquier SO
  python scripts/probe-windows-console-close.py [dist/cli.js] # sólo Windows
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import NoReturn

CIERRE_ESPERADO = "Cierre del run: modo=interrumpida"
SENAL_ESPERADA = "señal SIGHUP"
CIERRE_COMPLETO = f"{CIERRE_ESPERADO} ({SENAL_ESPERADA})"
CODIGO_ESPERADO = 129  # 128 + SIGHUP
MARGEN_POR_OMISION_MS = 5000  # SPI_GETHUNGAPPTIMEOUT, default documentado
CABECERAS = ("Logger iniciado", "Log: ", "PID: ", "Platform: ")

# Los 27 descriptores, para el kill-switch por config. Es un cinturón sobre el
# PATH recortado: deshabilitar por config apaga el escaneo Y la actualización, y
# no depende de que stdin sea un TTY.
DESCRIPTORES = [
    'angular', 'apt', 'asdf', 'brew', 'bun', 'cargo', 'choco', 'composer', 'conda',
    'dnf', 'flatpak', 'flutter', 'gem', 'go-lang', 'mas', 'mise', 'npm', 'pacman',
    'pip', 'pipx', 'pnpm', 'rustup', 'scoop', 'snap', 'softwareupdate', 'winget', 'yarn',
]


# ---------------------------------------------------------------- mitad pura --


def veredicto(texto_del_log: str, codigo_de_salida: int) -> list[str]:
    """Los problemas que hacen fallar al probe. Vacío = verde.

    Pura, sin reloj y sin dependencias del sistema: es lo que `--self-test`
    ejercita en las tres patas de la matriz.
    """
    problemas: list[str] = []
    # splitlines() y no split("\n"): consume \r\n como UN terminador, así que un
    # registro con CRLF no deja un \r colgando que rompa los endswith.
    lineas = [l for l in texto_del_log.splitlines() if l.strip()]
    ultima = lineas[-1] if lineas else ""

    # Lo que deja Windows si mata el proceso a mitad de la escritura: media línea
    # y ningún salto. Es el modo de falla que este probe existe para cazar, y con
    # comparaciones de subcadena pasaba como verde.
    if texto_del_log and not texto_del_log.endswith("\n"):
        problemas.append("el registro no termina en salto de línea: la última escritura quedó cortada")

    cierres = [l for l in lineas if "Cierre del run:" in l]
    if len(cierres) == 0:
        problemas.append("el registro no tiene ninguna línea de cierre: quedó trunco")
    elif len(cierres) > 1:
        problemas.append(f"hay {len(cierres)} líneas de cierre y tiene que haber una")

    if CIERRE_ESPERADO not in ultima:
        problemas.append(f"la última línea no declara el cierre interrumpido: {ultima!r}")
    elif SENAL_ESPERADA not in ultima:
        problemas.append(f"el cierre no nombra la señal SIGHUP: {ultima!r}")
    elif not ultima.endswith(CIERRE_COMPLETO):
        problemas.append(f"la línea de cierre quedó cortada o tiene cola: {ultima!r}")

    for cabecera in CABECERAS:
        if cabecera not in texto_del_log:
            problemas.append(f"se perdió una línea ya emitida: {cabecera!r}")

    if codigo_de_salida != CODIGO_ESPERADO:
        problemas.append(f"salió con {codigo_de_salida} y no con {CODIGO_ESPERADO}")

    return problemas


def _l(ts: str, msg: str) -> str:
    return f"2026-01-01 00:00:{ts} [INFO ] SystemUpdater - {msg}\n"


CABECERA_OK = (
    _l("00", "Logger iniciado — @tacuchi/updater")
    + _l("00", "Log: C:\\tmp\\a.log")
    + _l("00", "PID: 4242 | UID: N/A | SUDO_USER: N/A")
    + _l("01", "Platform: win32 | Node: v20.11.0")
)
CIERRE_OK = _l("02", CIERRE_COMPLETO)
# Sin cabecera de PID: se borra la línea ENTERA, con su prefijo y su salto, que es
# la única forma que `writeRaw` puede producir.
CABECERA_SIN_PID = (
    _l("00", "Logger iniciado — @tacuchi/updater")
    + _l("00", "Log: C:\\tmp\\a.log")
    + _l("01", "Platform: win32 | Node: v20.11.0")
)

# (nombre, texto, código, subcadenas esperadas, total de problemas)
CASOS = [
    ("verde", CABECERA_OK + CIERRE_OK, 129, [], 0),
    ("registro trunco, sin cierre", CABECERA_OK, 129, ["trunco", "no declara el cierre"], 2),
    (
        "cierre de otro modo",
        CABECERA_OK + _l("02", "Cierre del run: modo=completa"),
        129,
        ["no declara el cierre interrumpido"],
        1,
    ),
    (
        "cierre que no nombra la señal",
        CABECERA_OK + _l("02", CIERRE_ESPERADO),
        129,
        ["no nombra la señal"],
        1,
    ),
    (
        "algo escrito DESPUÉS del cierre",
        CABECERA_OK + CIERRE_OK + _l("03", "tarde"),
        129,
        ["no declara el cierre interrumpido"],
        1,
    ),
    ("dos cierres", CABECERA_OK + CIERRE_OK + CIERRE_OK, 129, ["líneas de cierre"], 1),
    (
        "se perdió una línea ya emitida",
        CABECERA_SIN_PID + CIERRE_OK,
        129,
        ["se perdió una línea ya emitida"],
        1,
    ),
    ("código de salida equivocado", CABECERA_OK + CIERRE_OK, 0, ["salió con 0"], 1),
    (
        "registro vacío",
        "",
        129,
        ["trunco", "no declara el cierre", "se perdió"],
        6,
    ),
    # Los tres que faltaban, y el primero es el que este probe existe para cazar.
    (
        "escritura CORTADA a mitad del cierre",
        CABECERA_OK + "2026-01-01 00:00:02 [INFO ] SystemUpdater - Cierre del run: modo=interrumpida (señal SIGHUP",
        129,
        # DOS detecciones independientes del mismo defecto: no termina en salto de
        # línea Y la línea de cierre está cortada. Verificado, no supuesto.
        ["cortada", "no termina en salto"],
        2,
    ),
    (
        "el mismo registro con CRLF sigue verde",
        (CABECERA_OK + CIERRE_OK).replace("\n", "\r\n"),
        129,
        [],
        0,
    ),
    (
        "SIGTERM en vez de cierre de consola",
        CABECERA_OK + _l("02", "Cierre del run: modo=interrumpida (señal SIGTERM)"),
        143,
        ["no nombra la señal", "salió con 143"],
        2,
    ),
]


def self_test() -> int:
    """Ejercita `veredicto()` contra los casos verdes y los rojos.

    Además del color, clava el CONTEO de problemas: sin eso `veredicto` puede
    empezar a inventar diagnósticos de más y el self-test seguiría verde.
    """
    fallos = 0
    for nombre, texto, codigo, esperados, total in CASOS:
        problemas = veredicto(texto, codigo)
        malo = False
        faltantes = [e for e in esperados if not any(e in p for p in problemas)]
        if faltantes:
            print(f"  FALLA [{nombre}]: no detectó {faltantes}; dijo {problemas}")
            malo = True
        if not esperados and problemas:
            print(f"  FALLA [{nombre}]: esperaba verde y dio {problemas}")
            malo = True
        if len(problemas) != total:
            print(f"  FALLA [{nombre}]: esperaba {total} problema/s y dio {len(problemas)}: {problemas}")
            malo = True
        if malo:
            fallos += 1
        else:
            print(f"  ok [{nombre}]: {len(problemas)} problema/s" if problemas else f"  ok [{nombre}]: verde")
    print(f"self-test: {len(CASOS) - fallos}/{len(CASOS)} casos")
    return 1 if fallos else 0


# ----------------------------------------------------------- mitad de Windows --

INCONCLUYENTE = 2


def fatal(por_que: str) -> NoReturn:
    print(f"PROBE INCONCLUYENTE: {por_que}", file=sys.stderr)
    sys.exit(INCONCLUYENTE)


def correr_en_windows(cli: Path, raiz: Path) -> int:
    import ctypes
    import ctypes.wintypes as w
    import winreg

    CREATE_NEW_CONSOLE = 0x00000010
    CREATE_UNICODE_ENVIRONMENT = 0x00000400
    STARTF_USESHOWWINDOW = 0x00000001
    SW_HIDE = 0
    WM_CLOSE = 0x0010
    WAIT_OBJECT_0 = 0x0
    WAIT_TIMEOUT = 0x102
    WAIT_FAILED = 0xFFFFFFFF
    SPI_GETHUNGAPPTIMEOUT = 0x0078
    CONHOST_CLASICO = "{B23D10C0-E52E-411E-9D5B-C09FDF709C7D}"

    class STARTUPINFOW(ctypes.Structure):
        _fields_ = [
            ("cb", w.DWORD), ("lpReserved", w.LPWSTR), ("lpDesktop", w.LPWSTR),
            ("lpTitle", w.LPWSTR), ("dwX", w.DWORD), ("dwY", w.DWORD),
            ("dwXSize", w.DWORD), ("dwYSize", w.DWORD), ("dwXCountChars", w.DWORD),
            ("dwYCountChars", w.DWORD), ("dwFillAttribute", w.DWORD),
            ("dwFlags", w.DWORD), ("wShowWindow", w.WORD), ("cbReserved2", w.WORD),
            ("lpReserved2", ctypes.POINTER(ctypes.c_ubyte)),
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
    k32.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
    k32.WaitForSingleObject.restype = w.DWORD
    k32.GetExitCodeProcess.argtypes = [w.HANDLE, ctypes.POINTER(w.DWORD)]
    k32.GetExitCodeProcess.restype = w.BOOL
    k32.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
    k32.TerminateProcess.restype = w.BOOL
    k32.CloseHandle.argtypes = [w.HANDLE]
    k32.CloseHandle.restype = w.BOOL
    ENUMPROC = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    u32.EnumWindows.argtypes = [ENUMPROC, w.LPARAM]
    u32.EnumWindows.restype = w.BOOL
    u32.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
    u32.GetClassNameW.restype = ctypes.c_int
    u32.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
    u32.GetWindowThreadProcessId.restype = w.DWORD
    u32.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
    u32.PostMessageW.restype = w.BOOL
    u32.SystemParametersInfoW.argtypes = [w.UINT, w.UINT, ctypes.c_void_p, w.UINT]
    u32.SystemParametersInfoW.restype = w.BOOL

    def margen_del_sistema() -> int:
        """El margen REAL de esta máquina, no el default. HungAppTimeout es editable."""
        v = ctypes.c_int(0)
        if u32.SystemParametersInfoW(SPI_GETHUNGAPPTIMEOUT, 0, ctypes.byref(v), 0) and v.value > 0:
            return int(v.value)
        return MARGEN_POR_OMISION_MS

    def fijar_conhost_clasico() -> dict:
        """Quitarle la moneda al aire al descubrimiento de la ventana.

        En Windows 11 22H2+ y en Server 2025 el host por omisión puede ser Windows
        Terminal: entonces conhost hace handoff, corre `--headless` y NO registra
        ninguna ConsoleWindowClass — crea una `PseudoConsoleWindow` cuyo wndproc
        no maneja WM_CLOSE. Fijar el host clásico para este usuario hace la
        corrida determinista; el `finally` repone lo que había.
        """
        previo: dict = {}
        try:
            clave = winreg.CreateKeyEx(
                winreg.HKEY_CURRENT_USER, r"Console\%%Startup", 0,
                winreg.KEY_READ | winreg.KEY_WRITE,
            )
        except OSError as e:
            print(f"AVISO: no se pudo fijar el host de consola ({e}); sigue la moneda al aire", file=sys.stderr)
            return {}
        with clave:
            for nombre in ("DelegationConsole", "DelegationTerminal"):
                try:
                    previo[nombre] = winreg.QueryValueEx(clave, nombre)[0]
                except FileNotFoundError:
                    previo[nombre] = None
                try:
                    winreg.SetValueEx(clave, nombre, 0, winreg.REG_SZ, CONHOST_CLASICO)
                except OSError as e:
                    print(f"AVISO: no se pudo escribir {nombre} ({e})", file=sys.stderr)
        print(f"host de consola fijado al conhost clásico (previo: {previo})")
        return previo

    def reponer_conhost(previo: dict) -> None:
        if not previo:
            return
        try:
            with winreg.CreateKeyEx(
                winreg.HKEY_CURRENT_USER, r"Console\%%Startup", 0,
                winreg.KEY_READ | winreg.KEY_WRITE,
            ) as clave:
                for nombre, valor in previo.items():
                    if valor is None:
                        try:
                            winreg.DeleteValue(clave, nombre)
                        except FileNotFoundError:
                            pass
                    else:
                        winreg.SetValueEx(clave, nombre, 0, winreg.REG_SZ, valor)
        except OSError as e:
            print(f"AVISO: no se pudo reponer el host de consola ({e})", file=sys.stderr)

    def ventanas_del_pid(pid: int) -> tuple[list, list]:
        """Las ventanas de consola del pid: (clásicas, pseudo).

        Que `GetWindowThreadProcessId` devuelva el proceso RAÍZ adjunto en vez de
        conhost NO está documentado en ninguna línea de su página: es un
        enmascaramiento que conhost le pide a win32k (`Window::SetOwner()` →
        `SetConsoleWindowOwner`), y lo RECALCULA cada vez que un proceso se
        desadjunta. La propiedad que sí lo hace seguro acá: cuando no hay raíz,
        conhost cae a su PROPIO pid, que nunca iguala al del hijo — el probe puede
        no encontrar la ventana, pero no puede encontrar la equivocada.
        """
        clasicas: list = []
        pseudo: list = []

        @ENUMPROC
        def cb(hwnd, _lparam):
            clase = ctypes.create_unicode_buffer(64)
            if u32.GetClassNameW(hwnd, clase, 64) <= 0:
                return True
            if clase.value not in ("ConsoleWindowClass", "PseudoConsoleWindow"):
                return True
            duenio = w.DWORD()
            u32.GetWindowThreadProcessId(hwnd, ctypes.byref(duenio))
            if duenio.value != pid:
                return True
            (clasicas if clase.value == "ConsoleWindowClass" else pseudo).append(hwnd)
            return True

        ctypes.set_last_error(0)
        ok = u32.EnumWindows(cb, 0)
        if not ok and not clasicas and not pseudo:
            err = ctypes.get_last_error()
            if err:
                fatal(
                    f"EnumWindows falló con error {err}: la enumeración no llegó a correr "
                    "entera. Esto NO es evidencia de que el runner no dé ventana de consola; "
                    "revisá la estación de ventanas y el escritorio antes de considerar el probe B"
                )
        return clasicas, pseudo

    nodo = shutil.which("node")
    if not nodo:
        fatal("no hay `node` en PATH")

    dir_log = raiz / "logs"
    dir_cfg = raiz / "config"
    sin_gestores = raiz / "sin-gestores"
    for d in (dir_log, dir_cfg, sin_gestores):
        d.mkdir()
    # Kill-switch positivo: todos los gestores deshabilitados por config, que
    # apaga escaneo Y actualización sin depender de que stdin sea un TTY.
    (dir_cfg / "config.json").write_text(
        json.dumps({"selfCheck": False, "enabledManagers": {i: False for i in DESCRIPTORES}}),
        encoding="utf-8",
    )

    def el_log(estricto: bool = False) -> str | None:
        archivos = sorted(dir_log.glob("*.log"))
        if len(archivos) > 1:
            fatal(f"hay {len(archivos)} registros en {dir_log}: no se puede saber cuál mide el probe")
        if not archivos:
            return None
        return archivos[0].read_text(encoding="utf-8", errors="strict" if estricto else "replace")

    # PATH sin gestores: la detección no encuentra nada, así que el probe no
    # actualiza ni escanea nada real y arranca rápido. System32 queda porque
    # Windows lo necesita para sí mismo — y NO es inerte: deja pasar `fsutil`, así
    # que la detección de elevación funciona y la app corre con sudoMode. Por eso
    # el kill-switch de arriba es un cinturón y no un adorno.
    system32 = str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32")
    entorno = {
        k: os.environ[k]
        for k in ("SystemRoot", "SystemDrive", "WINDIR", "TEMP", "TMP", "USERPROFILE",
                  "PATHEXT", "COMSPEC", "NUMBER_OF_PROCESSORS", "APPDATA", "LOCALAPPDATA")
        if k in os.environ
    }
    entorno["PATH"] = f"{sin_gestores};{system32}"
    entorno["TACUCHI_UPDATER_LOG_DIR"] = str(dir_log)
    entorno["TACUCHI_UPDATER_CONFIG_DIR"] = str(dir_cfg)
    bloque = "\0".join(f"{k}={v}" for k, v in entorno.items()) + "\0\0"

    si = STARTUPINFOW()
    si.cb = ctypes.sizeof(si)
    si.dwFlags = STARTF_USESHOWWINDOW
    si.wShowWindow = SW_HIDE  # la ventana EXISTE y queda oculta; el escritorio sí hace falta
    pi = PROCESS_INFORMATION()

    previo_conhost = fijar_conhost_clasico()
    lanzado = False
    try:
        ok = k32.CreateProcessW(
            None, ctypes.create_unicode_buffer(f'"{nodo}" "{cli}"'),
            None, None, False,
            CREATE_NEW_CONSOLE | CREATE_UNICODE_ENVIRONMENT,
            ctypes.create_unicode_buffer(bloque),
            str(Path(__file__).resolve().parent.parent),
            ctypes.byref(si), ctypes.byref(pi),
        )
        if not ok:
            fatal(f"CreateProcessW falló con error {ctypes.get_last_error()}")
        lanzado = True
        pid = int(pi.dwProcessId)
        print(f"hijo lanzado: pid={pid}, consola nueva y oculta")

        def vive() -> bool:
            r = k32.WaitForSingleObject(pi.hProcess, 0)
            if r == WAIT_FAILED:
                fatal(f"WaitForSingleObject falló con error {ctypes.get_last_error()}")
            return r == WAIT_TIMEOUT

        def murio_temprano(donde: str) -> NoReturn:
            codigo = w.DWORD()
            k32.GetExitCodeProcess(pi.hProcess, ctypes.byref(codigo))
            texto = el_log() or ""
            fatal(
                f"el hijo murió {donde} con código {codigo.value}; el registro tiene "
                f"{len(texto)} bytes. Su salida fue a la consola oculta: mirá el registro"
            )

        # 1. El registro existe y tiene su cabecera: la app arrancó y abrió su sumidero.
        limite = time.monotonic() + 60
        while time.monotonic() < limite:
            if not vive():
                murio_temprano("durante el arranque")
            texto = el_log()
            if texto and "Platform:" in texto:
                break
            time.sleep(0.1)
        else:
            fatal("el registro no llegó a su línea `Platform:` en 60 s")

        # 2. Y la corrida NO terminó sola: si ya hay cierre, no hay margen que medir.
        #    Además: ningún gestor pudo detectarse, o el probe está midiendo otro
        #    escenario del que documenta.
        texto = el_log() or ""
        if "Cierre del run:" in texto:
            fatal("la corrida se cerró sola antes del WM_CLOSE; no hay margen que medir")
        disponibles = [l for l in texto.splitlines() if ": detect cmd=" in l and "→ disponible" in l]
        if disponibles:
            fatal(
                "se detectó al menos un gestor, así que el aislamiento del probe no se "
                f"sostiene y el verde se emitiría sobre otro escenario: {disponibles[0]!r}"
            )
        if "Selección:" in texto:
            fatal("apareció una línea de Selección: la app NO está interactiva y podría actualizar el runner")

        # 3. La ventana de consola del hijo.
        clasicas: list = []
        pseudo: list = []
        limite = time.monotonic() + 20
        while time.monotonic() < limite:
            if not vive():
                fatal("la corrida terminó sola mientras buscábamos su ventana; no hay margen que medir")
            clasicas, pseudo = ventanas_del_pid(pid)
            if clasicas:
                break
            time.sleep(0.1)
        if not clasicas:
            if pseudo:
                fatal(
                    "defterm/ConPTY activo: la consola clásica no existe en esta máquina y el "
                    "pin del registro no tomó efecto. Hay una PseudoConsoleWindow del hijo, pero "
                    "su wndproc NO maneja WM_CLOSE, así que postearle el mensaje no produciría "
                    "ningún CTRL_CLOSE_EVENT. Verificá DelegationConsole/DelegationTerminal en "
                    r"HKCU\Console\%%Startup, o pasá al probe B (CreatePseudoConsole + ClosePseudoConsole)"
                )
            fatal(
                "no se encontró ninguna ventana de consola del hijo, ni clásica ni pseudo. Es la "
                "condición que decide el camino: si el runner no da ventana de consola, hay que "
                "pasar al probe B (CreatePseudoConsole + ClosePseudoConsole, la ruta que Microsoft "
                "documenta como emisora de CTRL_CLOSE_EVENT)"
            )
        hwnd = clasicas[0]
        print(f"ventana de consola del hijo: hwnd={hwnd}")

        # 4. Cerrarla: eso es lo que el kernel convierte en CTRL_CLOSE_EVENT.
        margen = margen_del_sistema()
        if not vive():
            fatal("la corrida terminó sola justo antes del WM_CLOSE; no hay margen que medir")
        t0 = time.perf_counter()
        if not u32.PostMessageW(hwnd, WM_CLOSE, 0, 0):
            err = ctypes.get_last_error()
            extra = " (error 5 = UIPI: el probe corre con menos integridad que el hijo)" if err == 5 else ""
            fatal(f"PostMessageW(WM_CLOSE) falló con error {err}{extra}")

        # 5. Cuánto tardó. ESTE es el número que el probe existe para medir.
        r = k32.WaitForSingleObject(pi.hProcess, margen + 2000)
        if r == WAIT_FAILED:
            fatal(f"WaitForSingleObject falló con error {ctypes.get_last_error()}")
        if r != WAIT_OBJECT_0:
            fatal(f"el proceso no terminó en {margen + 2000} ms tras el WM_CLOSE")
        ms = (time.perf_counter() - t0) * 1000

        codigo = w.DWORD()
        if not k32.GetExitCodeProcess(pi.hProcess, ctypes.byref(codigo)):
            fatal(f"GetExitCodeProcess falló con error {ctypes.get_last_error()}")

        texto = el_log(estricto=True)
        if texto is None:
            fatal("el registro desapareció")
        utiles = [l for l in texto.splitlines() if l.strip()]

        problemas = veredicto(texto, int(codigo.value))
        # El gate del margen vive acá y no en `veredicto`, para que la mitad pura
        # siga sin reloj. Referencia medida en una corrida real: ~235 ms.
        if ms > margen:
            problemas.append(f"el cierre consumió {ms:.0f} ms y el margen del sistema es {margen}")
        elif ms > margen * 0.5:
            print(
                f"AVISO: el cierre consumió {ms:.0f} ms de los {margen} disponibles: menos de la "
                "mitad de colchón", file=sys.stderr,
            )

        print(json.dumps({
            "escenario": "reposo (sin motor en vuelo)",
            "margen_usado_ms": round(ms, 1),
            "margen_del_sistema_ms": margen,
            "codigo_de_salida": int(codigo.value),
            "lineas_del_registro": len(utiles),
            "ultima_linea": utiles[-1] if utiles else None,
        }, indent=2, ensure_ascii=False))

        if problemas:
            for p in problemas:
                print(f"  FALLA: {p}", file=sys.stderr)
            return 1
        print(
            f"PROBE VERDE: el cierre sobrevivió al WM_CLOSE usando {ms:.1f} ms de los {margen} "
            "disponibles, con la corrida EN REPOSO (el camino con el motor en vuelo no se mide acá)"
        )
        return 0
    finally:
        if lanzado:
            if k32.WaitForSingleObject(pi.hProcess, 0) != WAIT_OBJECT_0:
                if not k32.TerminateProcess(pi.hProcess, 1):
                    print(
                        f"AVISO: TerminateProcess falló con error {ctypes.get_last_error()}; "
                        f"queda vivo el pid {int(pi.dwProcessId)}", file=sys.stderr,
                    )
                else:
                    k32.WaitForSingleObject(pi.hProcess, 5000)  # es asíncrono
            k32.CloseHandle(pi.hThread)
            k32.CloseHandle(pi.hProcess)
        reponer_conhost(previo_conhost)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
        sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
    except (AttributeError, OSError):
        pass  # un U+FFFD reventaría el print del JSON en cp1252 y en cp437

    args = sys.argv[1:]
    if "--self-test" in args:
        print("self-test de la lógica de veredicto (corre en cualquier sistema):")
        return self_test()

    if sys.platform != "win32":
        fatal(
            f"la mitad de Windows sólo corre en Windows; este host es {sys.platform}. "
            "Usá --self-test para ejercitar la lógica de veredicto acá"
        )

    ruta = Path(args[0] if args else "dist/cli.js").resolve()
    if not ruta.is_file():
        fatal(f"no existe el binario compilado {ruta}; corré `npm run build` antes")
    # El temporal se crea envolviendo TODO, así que ningún fatal lo filtra.
    with tempfile.TemporaryDirectory(prefix="probe-console-close-") as raiz_str:
        raiz = Path(raiz_str)
        try:
            return correr_en_windows(ruta, raiz)
        finally:
            for intento in range(3):
                try:
                    shutil.rmtree(raiz)
                    break
                except OSError as e:
                    if intento == 2:
                        print(f"AVISO: no se pudo borrar {raiz}: {e}", file=sys.stderr)
                    else:
                        time.sleep(0.2)


if __name__ == "__main__":
    sys.exit(main())
