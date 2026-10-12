#!/bin/bash
# Pre-push gate: behaviour, syntax, imports, module list, CSS, assets.
# `npm run check`. Lives in the repo because a scratch copy kept being wiped.
cd "$(dirname "$0")/.." || exit 1
fail=0
npm test >/dev/null 2>&1 && echo "tests:   ok" || { echo "tests:   FAILED"; npm test 2>&1 | grep FAIL; fail=1; }
syn=0; for f in js/*.js; do node --check "$f" 2>/dev/null || { echo "SYNTAX: $f"; syn=1; fail=1; }; done
[ $syn -eq 0 ] && echo "syntax:  ok"
python3 scripts/check_imports.py || fail=1
python3 scripts/check_modlist.py || fail=1
python3 scripts/check_css.py || fail=1
port=8899
python3 serve.py $port >/dev/null 2>&1 &
srv=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 0.3; done
aerr=0
for f in / /styles.css /sounds/notify.mp3 $(cd js && for j in *.js; do echo "/js/$j"; done); do
  [ "$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port$f")" = "200" ] || { echo "ASSET: $f"; aerr=1; fail=1; }
done
kill $srv 2>/dev/null; wait $srv 2>/dev/null
[ $aerr -eq 0 ] && echo "assets:  ok"
echo "---"; [ $fail -eq 0 ] && echo PASS || echo FAIL
exit $fail
