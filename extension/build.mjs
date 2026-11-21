import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Расширение всегда на десктопном Chrome: <input type=file> не даёт права записи,
// поэтому file picker нужен даже на тач-экранах.
const PATCHES = [
  [
    "const preferInput=!inApp&&(('ontouchstart' in window)||/Android|Mobile/i.test(navigator.userAgent||''));",
    "const preferInput=false;",
  ],
  [
    "}catch(e){\n      if(e&&e.name==='AbortError')return;",
    "}catch(e){\n      console.warn('[ext] picker:',e&&e.name,e&&e.message);\n      if(e&&e.name==='AbortError')return;",
  ],
];

function patchApp(code) {
  for (const [from, to] of PATCHES) {
    if (!code.includes(from)) throw new Error('не найден фрагмент: ' + from.slice(0, 60));
    code = code.replace(from, to);
  }
  return "console.info('[ext] FSA:', 'showOpenFilePicker' in window, 'showSaveFilePicker' in window);\n" + code;
}

const src = readFileSync(join(here, '..', 'index.html'), 'utf8');
const names = ['vendor/jszip.js', 'app.js'];

mkdirSync(join(here, 'vendor'), { recursive: true });

let i = 0;
let html = src.replace(/<script>([\s\S]*?)<\/script>/g, (_, body) => {
  const name = names[i++];
  if (!name) throw new Error('неожиданный inline <script> №' + i);
  let code = body;
  // MV3 CSP запрещает new Function; строка-обработчик в setImmediate не используется
  code = code.replace('e=new Function(""+e)', 'e=function(){throw new Error("CSP: string handler")}');
  if (name === 'app.js') code = patchApp(code);
  writeFileSync(join(here, name), code);
  return `<script src="${name}"></script>`;
});

if (i !== names.length) throw new Error(`найдено ${i} inline-скриптов, ожидалось ${names.length}`);
writeFileSync(join(here, 'index.html'), html);

mkdirSync(join(here, 'icons'), { recursive: true });
copyFileSync(join(here, '..', 'desktop', 'icon.png'), join(here, 'icons', 'icon128.png'));

console.log(`ok: ${(html.length / 1024).toFixed(0)} KB html, ${i} скриптов`);
