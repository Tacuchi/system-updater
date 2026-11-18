"""Run only a synthetic Ink app and a child reading /dev/tty; never sudo."""
import os
import pty
import select
import subprocess
import tempfile
import time
import termios
from pathlib import Path

master, slave = pty.openpty()
def mode():
    flags = termios.tcgetattr(master)[3]
    return {'canonical': bool(flags & termios.ICANON), 'echo': bool(flags & termios.ECHO)}
initial_mode = mode()
with tempfile.TemporaryDirectory(prefix='updater-input-') as directory:
    output = str(Path(directory) / 'bytes.txt')
    command = [os.environ.get('NODE_BINARY', 'node'), str(Path(__file__).with_suffix('.mjs')), output]
    def controlling_terminal():
        import fcntl
        import termios
        os.setsid()
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
    child = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, preexec_fn=controlling_terminal)
    os.close(slave)
    screen = b''
    deadline = time.monotonic() + 5
    sent = False
    prompt_mode = None
    while child.poll() is None and time.monotonic() < deadline:
        if select.select([master], [], [], .05)[0]:
            try:
                screen += os.read(master, 4096)
            except OSError:
                break
        if b'Password:' in screen and not sent:
            prompt_mode = mode()
            os.write(master, b'q\x1babc123\r')
            sent = True
    if child.poll() is None:
        child.kill()
    child.wait()
    final_mode = mode()
    os.close(master)
    print({'initial': initial_mode, 'prompt': prompt_mode, 'final': final_mode})
    print('synthetic_bytes_sent=' + str(sent))
    print(Path(output).read_text() if Path(output).exists() else 'no receiver recorded')
    if not sent or child.returncode != 0:
        raise SystemExit(1)
