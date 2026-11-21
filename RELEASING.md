# Выпуск версии

Порядок, при котором релиз, тег и исходники совпадают. Нарушение этого порядка
уже случилось один раз: APK 1.3.19 собран из версии 1.3.4.

## 1. Поднять версию в одном коммите

Источник истины — `android/app/src/main/AndroidManifest.xml`
(`android:versionName` и `android:versionCode`). Дубли синхронизируются с ним:

| Файл | Что менять |
|---|---|
| `android/app/src/main/AndroidManifest.xml` | `versionName`, `versionCode` |
| `desktop/package.json` | `version` = `versionName` |
| `extension/manifest.json` | `version` = `versionName` |
| `fastlane/metadata/android/*/changelogs/<versionCode>.txt` | что нового |

`tools/build-android.sh` откажется собирать, если версии в этих файлах расходятся.

## 2. Собрать и проверить APK

```bash
tools/build-android.sh
unzip -p build/docx-editor-1.3.20-android.apk AndroidManifest.xml \
  | strings -el | grep -E '^1\.[0-9]+'   # должно совпасть с versionName
```

## 3. Закоммитить и поставить тег

```bash
git add -A && git commit -m "1.3.20: <что изменилось>"
git tag -a v1.3.20 -m "1.3.20"     # тег строго вида v<versionName>
git push origin main
git push origin v1.3.20
```

Тег обязан указывать на коммит, в котором уже стоит эта версия. Иначе F-Droid
соберёт из тега другую сборку, а пользователи не получат обновление.

## 4. Опубликовать релиз

Имена файлов одинаковые во всех версиях:

```
docx-editor-<version>-android.apk
docx-editor-<version>-win-x64.exe
docx-editor-<version>-x86_64.AppImage
SHA256SUMS.txt
```

Название релиза — `<version> — <короткое описание>`.

## 5. F-Droid

После тега: обновить блок `Builds` в `metadata/<applicationId>.yml` ветки
`fdroiddata` (versionName, versionCode, commit) или дождаться автообновления.

## Ошибочный тег v1.3.19

Тег `v1.3.19` указывает на коммит с версией 1.3.4, а собранный APK — на 1.3.19.
Правильное состояние: тег переносится на коммит, где версия 1.3.19 (его нужно
восстановить) либо тег удаляется, а 1.3.19 помечается как «собрано без тега».

Удаление тега на сервере — необратимая операция, выполнять только осознанно:

```bash
git tag -d v1.3.19
git push origin :refs/tags/v1.3.19
```

## Application ID

Сейчас `com.example.docxeditor`. Сменить его можно только до массового
распространения: Android не обновляет приложение с другим `applicationId`,
пользователям придётся переустанавливать APK вручную.

Если решение принято раньше, чем выйдет следующая версия:

```bash
NEW=io.github.caravadgo.docxeditor; OLD=com.example.docxeditor
git mv android/app/src/main/java/${OLD//.//} android/app/src/main/java/${NEW//.//}
grep -rl "$OLD" android | xargs sed -i "s/$OLD/$NEW/g"
tools/build-android.sh          # берёт package из манифеста, пути не хардкодит
```
