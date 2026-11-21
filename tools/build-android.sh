#!/usr/bin/env bash
# Сборка APK напрямую инструментами SDK (без Gradle).
# Версия берётся из AndroidManifest.xml; остальные файлы должны с ней совпадать.
set -euo pipefail
cd "$(dirname "$0")/.."

SDK="${ANDROID_SDK:-$HOME/android-sdk}"
BT="${BUILD_TOOLS:-$SDK/build-tools/34.0.0}"
AJ="${ANDROID_JAR:-$SDK/platforms/android-34/android.jar}"
SRC=android/app/src/main
MANIFEST=$SRC/AndroidManifest.xml
OUT=build

attr() { sed -n "s/.*android:$1=\"\([^\"]*\)\".*/\1/p" "$MANIFEST" | head -1; }
VNAME=$(attr versionName)
VCODE=$(attr versionCode)
PKG=$(sed -n 's/.* package="\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)
PKGPATH=${PKG//./\/}

[ -n "$VNAME" ] && [ -n "$VCODE" ] && [ -n "$PKG" ] || { echo "не читается манифест" >&2; exit 1; }

json_ver() { python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$1"; }
for f in desktop/package.json extension/manifest.json; do
  v=$(json_ver "$f")
  [ "$v" = "$VNAME" ] || { echo "версия в $f ($v) ≠ $VNAME" >&2; exit 1; }
done

[ -x "$BT/aapt2" ] || { echo "нет aapt2 в $BT" >&2; exit 1; }
if git rev-parse --git-dir >/dev/null 2>&1 && ! git rev-parse -q --verify "refs/tags/v$VNAME" >/dev/null; then
  echo "внимание: нет тега v$VNAME — сборка не будет соответствовать релизу" >&2
fi

rm -rf "$OUT"
mkdir -p "$OUT/dex" "$OUT/gen" "$OUT/obj"

"$BT/aapt2" compile --dir "$SRC/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$AJ" --manifest "$MANIFEST" \
  -R "$OUT/res.zip" --java "$OUT/gen" --auto-add-overlay -A "$SRC/assets"
javac -encoding UTF-8 --release 8 -classpath "$AJ" -d "$OUT/obj" \
  "$OUT/gen/$PKGPATH/R.java" "$SRC/java/$PKGPATH/MainActivity.java"
"$BT/d8" --lib "$AJ" --min-api 21 --output "$OUT/dex" $(find "$OUT/obj" -name '*.class')
(cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

APK="$OUT/docx-editor-$VNAME-android.apk"
if [ -n "${KEYSTORE:-}" ]; then
  PASS=()
  if [ -n "${KEYSTORE_PASS:-}" ]; then
    PASS=(--ks-pass env:KEYSTORE_PASS --key-pass env:KEYSTORE_PASS)
  fi
  "$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "${KEY_ALIAS:-docxeditor}" \
    ${PASS[@]+"${PASS[@]}"} --out "$APK" "$OUT/aligned.apk"
else
  echo "KEYSTORE не задан — APK не подписан, установить нельзя" >&2
  cp "$OUT/aligned.apk" "$APK"
fi
echo "$APK"
