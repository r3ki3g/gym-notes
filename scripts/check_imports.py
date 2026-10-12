"""Every import must resolve to a real export.

Two passes, because they catch different bugs:
  named      import { x } from './mod'   -- x must be exported by mod
  namespace  import * as S ... S.foo     -- a runtime property lookup the named
             pass cannot see. This is what let S.daysAgoKey ship undefined.
"""
import re, os, glob, sys
ex = {os.path.basename(f): set(re.findall(
        r'export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)', open(f).read()))
      for f in glob.glob('js/*.js')}
bad = 0
for f in glob.glob('js/*.js'):
    src = open(f).read(); b = os.path.basename(f)
    for names, mod in re.findall(r"import\s*\{([^}]*)\}\s*from\s*'\./([\w.]+)'", src, re.S):
        for n in [x.strip().split(' as ')[0].strip() for x in names.split(',') if x.strip()]:
            if n not in ex.get(mod, set()):
                print(f'IMPORT: {b} wants {n} from {mod}'); bad = 1
    for alias, mod in re.findall(r"import\s*\*\s*as\s*(\w+)\s*from\s*'\./([\w.]+)'", src):
        for u in sorted(set(re.findall(rf'\b{alias}\.(\w+)', src))):
            if u not in ex.get(mod, set()):
                print(f'NAMESPACE: {b} uses {alias}.{u}, missing from {mod}'); bad = 1
print('imports: ' + ('ok' if not bad else 'FAILED')); sys.exit(bad)
