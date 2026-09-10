"""Test-only stack dumper injected into the disposable Gunicorn process."""
import faulthandler
import signal
import sys

faulthandler.enable(file=sys.stderr, all_threads=True)
faulthandler.register(signal.SIGUSR1, file=sys.stderr, all_threads=True)
