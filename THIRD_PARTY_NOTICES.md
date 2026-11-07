# Сторонние компоненты

Проект распространяется по GPL-3.0-or-later. Ниже — всё, что в него входит извне, с лицензиями и указаниями на изменения.

## Приложение (`index.html`)

| Компонент | Версия | Лицензия | Правообладатель |
|---|---|---|---|
| JSZip | 3.10.1 | MIT **или** GPL-3.0 (двойная) | Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso |
| nspell | 2.x (собран в один файл) | MIT | Titus Wormer |
| is-buffer (входит в nspell) | 2.0.x | MIT | Feross Aboukhadijeh |

Тексты лицензий MIT приведены в шапках соответствующих скриптов внутри `index.html`; полный текст MIT — в [licenses/Electron-MIT.txt](licenses/Electron-MIT.txt) (текст идентичен, отличается только строка копирайта).

## Словарь проверки орфографии

**Russian Spelling Dictionary (RusSpell) 1.0.9** — 575 484 записи.
© 2026 Valery Ledovskoy. Лицензия **MPL-2.0**, полный текст — [licenses/MPL-2.0.txt](licenses/MPL-2.0.txt).
Источник: <https://github.com/Goudron/ru-spelling-dictionary>.

Изменение: исходные файлы `ru_RU.aff` / `ru_RU.dic` распространяются в кодировке KOI8-R; для встроенного движка на JavaScript они сконвертированы в UTF-8 (директива `SET UTF-8`) и упакованы как `ru.aff` / `ru.dic` в ZIP-архив внутри `index.html`. Файлы словаря остаются под MPL-2.0; изменение помечено здесь и в комментарии внутри `index.html`.

## Оболочки

| Компонент | Версия | Лицензия | Примечание |
|---|---|---|---|
| Electron | 45.2.3 | MIT | текст — [licenses/Electron-MIT.txt](licenses/Electron-MIT.txt) |
| Chromium | в составе Electron | BSD-3-Clause и другие | полный список — `LICENSES.chromium.html` в поставке |
| FFmpeg (libffmpeg) | в составе Electron | LGPL-2.1+ | поставляется вместе с Electron |
| 7-Zip SFX-модуль (`7zS.sfx`) | 9.20 | LGPL-2.1+ | только в Windows-сборке, © Igor Pavlov |
| AppImage runtime | — | MIT | только в Linux-сборке |

## Шрифты и изображения

Иконки приложения нарисованы для проекта. Сторонних шрифтов и изображений нет; интерфейс использует системные шрифты.

## Что нужно при распространении сборок

- Приложить `LICENSE` (GPL-3.0) и этот файл к каждой сборке — они уже лежат рядом с исполняемыми файлами в архивах.
- Для Linux/Windows сохранять `LICENSES.chromium.html` и `LICENSE` из состава Electron.
- Для словаря — сохранять текст MPL-2.0 и уведомление об изменении кодировки.
