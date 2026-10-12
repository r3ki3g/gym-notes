"""The stale-cache recovery button in index.html refetches a hardcoded module
list. A new module missing from it is silently skipped during recovery."""
import re, os, sys
listed = set(re.findall(r"'(js/[\w.]+\.js)'", open('index.html').read()))
actual = {f'js/{f}' for f in os.listdir('js') if f.endswith('.js')}
drift = (actual - listed) | (listed - actual)
if drift: print('MODLIST drift in index.html recovery list:', sorted(drift))
print('modlist: ' + ('ok' if not drift else 'FAILED')); sys.exit(1 if drift else 0)
