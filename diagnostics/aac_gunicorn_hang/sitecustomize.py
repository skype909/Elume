"""Test-only stack dumper injected into the disposable Gunicorn process."""
import faulthandler
import signal
import sys

faulthandler.enable(file=sys.stderr, all_threads=True)
# Gunicorn owns SIGUSR1 (log reopen) and replaces that handler. A Linux realtime
# signal remains available for a bounded diagnostic of a pre-worker master stall.
faulthandler.register(signal.SIGRTMIN, file=sys.stderr, all_threads=True)
print("DIAGNOSTIC_STACK_SIGNAL:SIGRTMIN", file=sys.stderr, flush=True)
