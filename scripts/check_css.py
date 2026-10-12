"""CSS sanity. Each check was written after a bug the previous ones missed:
  braces  -- trivial
  dupes   -- a rule pasted twice is perfectly balanced; a stale .side-pick won
             by cascade order and made a fix appear not to apply
  mixed   -- `input:focus,select,textarea:focus` gave every select a permanent
             outline for days. Balanced, not duplicated, completely wrong.
"""
import re, sys
from collections import Counter
src = open('styles.css').read()
if src.count('{') != src.count('}'):
    print(f"css:     UNBALANCED {src.count('{')}/{src.count('}')}"); sys.exit(1)
selectors, depth, buf, media, i = [], 0, '', [], 0
while i < len(src):
    if src.startswith('/*', i): i = src.index('*/', i) + 2; continue
    c = src[i]
    if c == '{':
        sel = ' '.join(buf.split())
        (media.append(sel) if sel.startswith('@') else selectors.append(('/'.join(media), sel)))
        depth += 1; buf = ''
    elif c == '}':
        depth -= 1
        if media and depth == len(media) - 1: media.pop()
        buf = ''
    else: buf += c
    i += 1
fail = False
dupes = [s for s, n in Counter(selectors).items() if n > 1]
if dupes:
    print('css:     DUPLICATE SELECTORS')
    for scope, sel in dupes: print(f'         {sel}' + (f'  (in {scope})' if scope else ''))
    fail = True
PSEUDO = re.compile(r':(focus|hover|active|focus-visible|checked|disabled)\b')
for _, sel in selectors:
    parts = [p.strip() for p in sel.split(',') if p.strip()]
    if len(parts) < 2: continue
    wp = [p for p in parts if PSEUDO.search(p)]
    if wp and len(wp) != len(parts):
        print('css:     MIXED PSEUDO-CLASS LIST (a dropped :focus/:hover?)')
        print(f'         {sel}')
        print(f'         unconditional: {[p for p in parts if not PSEUDO.search(p)]}'); fail = True
if fail: sys.exit(1)
print(f'css:     ok  ({len(selectors)} rules; no dupes, no mixed pseudo lists)')
