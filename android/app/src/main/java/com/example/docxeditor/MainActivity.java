package com.example.docxeditor;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final int REQ_OPEN = 1001;
    private static final int REQ_SAVE = 1002;

    private static final String[] MIME_TYPES = {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/markdown",
            "application/x-fictionbook+xml",
            "application/xml"
    };

    private WebView webView;

    // Текущий открытый файл — для «Сохранить в текущий»
    private Uri currentUri;
    private String currentName = "";
    // Выбранный для «Сохранить как» файл
    private Uri saveAsUri;
    // Входящий файл («Открыть с помощью»), ждущий загрузки страницы
    private Uri pendingIncomingUri;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        // Скрыть системные скроллбары WebView (остаются только кастомные #sb/#th/#gp редактора)
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file://") || url.startsWith("about:") || url.startsWith("data:")) {
                    return false;
                }
                try {
                    Intent i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                    startActivity(Intent.createChooser(i, "Открыть в приложении"));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (pendingIncomingUri != null) {
                    Uri uri = pendingIncomingUri;
                    pendingIncomingUri = null;
                    loadExternalIntoJs(uri);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
        });

        // Нативный мост: JS вызывает AndroidFilePicker.post(JSON) через window.webkit...
        webView.addJavascriptInterface(new Bridge(), "AndroidFilePicker");

        webView.clearCache(true);

        setContentView(webView);
        loadEditor();
        openIncoming();
    }

    private void loadEditor() {
        String html;
        try (InputStream in = getAssets().open("docx-editor.html")) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
            }
            html = buf.toString("UTF-8");
        } catch (Exception e) {
            html = "<html><body><h3>Ошибка загрузки редактора</h3><p>"
                    + e.getMessage() + "</p></body></html>";
        }
        // JS-преамбула: прокидываем window.webkit.messageHandlers.native на AndroidFilePicker.
        // Крупные b64 шлём чанками (beginSave + saveChunk* + commitSave), чтобы не резался хвост.
        // Открытие больших файлов с натива тоже передаём чанками через window.__openChunk / nativeOpened.
        final String bridgeJs =
                "<script>\n" +
                "(function(){\n" +
                "  if(!window.AndroidFilePicker) return;\n" +
                // Глобальный перехватчик JS-ошибок: показывает текст вместо «тишины» (отладка).
                "  if(!window.__errHooked){window.__errHooked=1;\n" +
                "    window.addEventListener('error',function(e){try{alert('Ошибка JS: '+ (e&&e.message?e.message:e))}catch(_){}});\n" +
                "    window.addEventListener('unhandledrejection',function(e){try{alert('Ошибка JS (promise): '+ (e&&e.reason&&e.reason.message?e.reason.message:e.reason))}catch(_){}});\n" +
                "  }\n" +
                "  var webkit = window.webkit || (window.webkit = {});\n" +
                "  window.__openBuf=''; window.__openParts=0; window.__openName='';\n" +
                "  window.__openChunk=function(part){ window.__openBuf+=part; };\n" +
                "  window.__openEnd=function(name){ var b=window.__openBuf; window.__openBuf='';\n" +
                "    try{ if(window.nativeOpened) window.nativeOpened(name, b); }catch(e){} };\n" +
                "  webkit.messageHandlers = webkit.messageHandlers || {};\n" +
                "  function post1(o){ window.AndroidFilePicker.post(JSON.stringify(o)); }\n" +
                "  function postBig(base, b64){\n" +
                "    var CH=240*1024; // ~240КБ на запрос\n" +
                "    var isNew = (base.cmd==='saveNew') || !!base['new'];\n" +
                "    post1({cmd:'beginSave', 'new': isNew, name: base.name||'', bytes: b64.length});\n" +
                "    for(var i=0;i<b64.length;i+=CH){ post1({cmd:'saveChunk', part: b64.slice(i,i+CH)}); }\n" +
                "    post1({cmd:'commitSave'});\n" +
                "  }\n" +
                "  webkit.messageHandlers.native = {\n" +
                "    postMessage: function(m){\n" +
                "      if((m.cmd==='saveCurrent'||m.cmd==='saveNew') && m.b64 && m.b64.length>100000){\n" +
                "        postBig(m, m.b64);\n" +
                "      } else {\n" +
                "        post1(m);\n" +
                "      }\n" +
                "    }\n" +
                "  };\n" +
                "})();\n" +
                "</script>\n";
        // Вставляем перед </head>
        if (html.contains("</head>")) {
            html = html.replaceFirst("</head>", bridgeJs + "</head>");
        } else {
            html = bridgeJs + html;
        }
        webView.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
    }

    /* Обработка «Открыть с помощью» */
    private void openIncoming() {
        Intent intent = getIntent();
        if (intent == null) return;
        Uri uri = intent.getData();
        String action = intent.getAction();
        if (uri == null || !(Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action))) {
            return;
        }
        pendingIncomingUri = uri;
    }

    private void loadExternalIntoJs(Uri uri) {
        try {
            getContentResolver().takePersistableUriPermission(uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignored) {
        }
        currentUri = uri;
        currentName = displayName(uri);
        try {
            byte[] b = readUri(uri);
            notifyOpen(currentName, Base64.encodeToString(b, Base64.NO_WRAP));
        } catch (Exception e) {
            evaluate("window.nativeOpened&&window.nativeOpened('','');");
        }
    }

    /* Потоковый приёмник чанков сохранения: чанки пишутся в temp-файл, а не в память.
       Это решает проблему порчи больших файлов (нет давления на память WebView, нет недописанных b64). */
    private static final int CHUNK_SIZE = 240 * 1024; // ~240КБ по 8 Base64 на вершину (безопасно для bridge)
    private String pendName = "";      // имя для «Сохранить как»
    private boolean pendIsNew = false; // true = «Сохранить как», false = «в текущий»
    private long pendBytes = 0, pendGot = 0;
    private int pendVersion = 0;         // счётчик поколений temp-файла (защита от stale-колбэков)
    private File pendTempFile = null;    // потоковый водящий приёмник чанков
    private FileOutputStream pendOut = null;    // открытый дескриптор temp-файла
    private ByteArrayOutputStream pendingBuf = null; // fallback (если нельзя открыть файл)

    /* Мост, вызываемый из JS через window.webkit.messageHandlers.native.postMessage({...})
       Контракт нового движка (docx-editor-21.html):
         {cmd:'open'}                          — выбрать файл и открыть
         {cmd:'saveCurrent', b64:'...'}        — сохранить в текущий (b64 одним полем)
         {cmd:'saveNew', name:'...', b64:'...'}— сохранить как новый (диалог + потоковая запись) */
    private class Bridge {
        @JavascriptInterface
        public void post(final String json) {
            runOnUiThread(() -> {
                try {
                    JSONObject o = new JSONObject(json);
                    String cmd = o.optString("cmd");
                    if ("open".equals(cmd)) {
                        openDocDialog();
                    } else if ("saveCurrent".equals(cmd)) {
                        // { cmd:'saveCurrent', b64:'...' }
                        receiveChunkedB64(false, "", o.optString("b64"));
                        finishSave();
                    } else if ("saveNew".equals(cmd)) {
                        // { cmd:'saveNew', name:'...', b64:'...' }
                        pendName = o.optString("name", "document.docx");
                        receiveChunkedB64(true, pendName, o.optString("b64"));
                        finishSave();
                    } else if ("beginSave".equals(cmd)) {
                        // резерв: чанковый режим (beginSave/saveChunk/commitSave)
                        boolean isNew = o.optBoolean("new");
                        pendIsNew = isNew;
                        pendName = o.optString("name", "");
                        Long nb = o.isNull("bytes") ? 0L : o.optLong("bytes");
                        openTempAccumulator((nb == null ? 0 : nb));
                    } else if ("saveChunk".equals(cmd)) {
                        appendChunk(o.optString("part"));
                    } else if ("commitSave".equals(cmd)) {
                        finishSave();
                    }
                } catch (Exception ignored) {
                }
            });
        }
    }

    /* Принять b64 (возможно очень длинный) и немедленно сбросить в temp-файл */
    private void receiveChunkedB64(final boolean isNew, final String name, final String b64) {
        pendIsNew = isNew;
        pendName = name;
        if (b64 == null || b64.isEmpty()) {
            openTempAccumulator(0);
            return;
        }
        // декодируем порциями по 240КБ символов, потоково в файл — не держим весь b64 в памяти
        try {
            openTempAccumulator(b64.length());
            int CH = CHUNK_SIZE;
            for (int i = 0; i < b64.length(); i += CH) {
                String part = b64.substring(i, Math.min(i + CH, b64.length()));
                appendChunk(part);
            }
        } catch (Exception e) {
            notifySaved("Ошибка приёма данных: " + e.getMessage());
        }
    }

    /* Открыть (или переоткрыть) temp-файл-приёмник для потокового накопления чанков */
    private void openTempAccumulator(long expectedBytes) {
        pendVersion++;
        pendingBuf = null; // нет накопления b64 в памяти
        pendBytes = expectedBytes;
        pendGot = 0;
        try {
            if (pendTempFile == null) {
                pendTempFile = new File(getCacheDir(), "save_tmp_" + System.currentTimeMillis() + ".bin");
            }
            if (pendOut != null) { pendOut.flush(); pendOut.close(); }
            pendOut = new FileOutputStream(pendTempFile, false);
            // FileOutputStream достаточно: чанки дозаписываются, в конце — fsync()
        } catch (Exception e) {
            notifySaved("Не удалось открыть файл для сохранения: " + e.getMessage());
        }
    }

    /* Дописать очередной base64-чанк, декодируя на лету */
    private void appendChunk(String part) {
        if (part == null || part.isEmpty()) return;
        try {
            byte[] d = Base64.decode(part, Base64.DEFAULT);
            pendGot += part.length();
            if (pendOut != null) {
                synchronized (pendOut) {
                    pendOut.write(d);
                }
            } else {
                // fallback: если поток не открылся — в память
                if (pendingBuf == null) pendingBuf = new java.io.ByteArrayOutputStream();
                pendingBuf.write(d);
            }
        } catch (Exception e) {
            notifySaved("Ошибка декодирования чанка: " + e.getMessage());
        }
    }

    private void finishSave() {
        try {
            if (pendOut != null) {
                synchronized (pendOut) {
                    pendOut.flush();
                    pendOut.getFD().sync();   // fsync — гарантия целостности на диск
                    pendOut.close();
                }
                pendOut = null;
            } else if (pendingBuf != null) {
                // fallback: если дескриптор не открылся, пришлось накапливать в памяти — теперь сбросим на диск
                writePendingToFile();
            }
            if (pendIsNew) {
                // «Сохранить как»: диалог, потом в onActivityResult прочитаем temp-файл
                commitNewDialog();
            } else {
                commitCurrent();
            }
        } catch (Exception e) {
            notifySaved("Не удалось завершить сохранение: " + e.getMessage());
        }
    }

    private void writePendingToFile() throws java.io.IOException {
        try {
            if (pendTempFile == null) {
                pendTempFile = new File(getCacheDir(), "save_tmp_" + System.currentTimeMillis() + ".bin");
            }
            if (pendingBuf != null) {
                FileOutputStream fo = new FileOutputStream(pendTempFile, false);
                try {
                    pendingBuf.writeTo(fo);
                    fo.getFD().sync();
                } finally {
                    fo.close();
                }
                pendingBuf = null;
            }
        } catch (Exception e) {
            throw new java.io.IOException(e);
        }
    }

    private void openDocDialog() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "text/plain",
                "text/markdown",
                "application/x-fictionbook+xml",
                "application/xml"
        });
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, REQ_OPEN);
    }

    private void commitCurrent() {
        if (currentUri == null) {
            notifySaved("Нет открытого файла, сохраните как новый");
            return;
        }
        try {
            long n = writeUri(currentUri);
            notifySaved("Сохранено в текущий файл (" + n + " б)");
        } catch (Exception e) {
            notifySaved("Не удалось записать: " + e.getMessage());
        }
    }

    /* Открыть диалог «Сохранить как»; данные останутся в temp-файле, запишем в onActivityResult */
    private void commitNewDialog() {
        String name = (pendName == null || pendName.isEmpty()) ? "document.docx" : pendName;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(intent, REQ_SAVE);
    }

    /* Потоковая запись temp-файла в uri через SAF; возвращает количество байт */
    private long writeUri(Uri uri) throws Exception {
        OutputStream out = getContentResolver().openOutputStream(uri, "w");
        if (out == null) throw new Exception("нельзя открыть файл на запись");
        try {
            return copy(new FileInputStream(pendTempFile), out);
        } finally {
            out.flush();
            out.close();
        }
    }

    private static long copy(InputStream in, OutputStream out) throws java.io.IOException {
        byte[] buf = new byte[64 * 1024];
        long total = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
            total += n;
        }
        return total;
    }

    private byte[] readUri(Uri uri) throws Exception {
        InputStream in = getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("нельзя открыть файл");
        try {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
            }
            return buf.toByteArray();
        } finally {
            in.close();
        }
    }

    private String displayName(Uri uri) {
        String name = "file.docx";
        try (android.database.Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String v = c.getString(idx);
                    if (v != null && !v.isEmpty()) name = v;
                }
            }
        } catch (Exception ignored) {
        }
        return name;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == REQ_SAVE) {
                pendTempFile = null;
                pendingBuf = null;
                notifySaved("Сохранение отменено");
            }
            return;
        }
        Uri uri = data.getData();

        if (requestCode == REQ_OPEN) {
            String name = displayName(uri);
            try {
                getContentResolver().takePersistableUriPermission(uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception ignored) {
            }
            currentUri = uri;
            currentName = name;
            try {
                byte[] b = readUri(uri);
                notifyOpen(name, Base64.encodeToString(b, Base64.NO_WRAP));
            } catch (Exception e) {
                evaluate("window.nativeOpened&&window.nativeOpened('','');");
            }
        } else if (requestCode == REQ_SAVE) {
            saveAsUri = uri;
            try {
                long n = writeUri(uri);
                currentUri = uri;
                currentName = displayName(uri);
                notifySaved("Сохранено: " + currentName + " (" + n + " б)", currentName);
            } catch (Exception e) {
                notifySaved("Не удалось записать: " + e.getMessage());
            }
        }
    }

    /* Передаём открытый файл в JS как nativeOpened(name, b64).
   Крупные b64 шлём чанками, чтобы не резался хвост (как при сохранении). */
    private void notifyOpen(final String name, final String b64) {
        runOnUiThread(() -> {
            int CH = 240 * 1024;
            if (b64 != null && b64.length() > CH) {
                // сначала подготовим приёмник
                evaluate("window.__openBuf='';window.__openParts=0;");
                for (int i = 0; i < b64.length(); i += CH) {
                    String part = b64.substring(i, Math.min(i + CH, b64.length()));
                    evaluate("window.__openChunk&&window.__openChunk(" + q(part) + ");");
                }
                evaluate("window.__openEnd&&window.__openEnd(" + q(name) + ");");
            } else {
                evaluate("window.nativeOpened&&window.nativeOpened(" + q(name) + "," + q(b64) + ");");
            }
        });
    }

    /* Передаём результат сохранения в JS как nativeSaved(msg, name) */
    private void notifySaved(final String msg, final String name) {
        runOnUiThread(() -> evaluate(
                "window.nativeSaved&&window.nativeSaved(" + q(msg) + "," + q(name) + ");"));
    }

    private void notifySaved(final String msg) {
        notifySaved(msg, null);
    }

    private void evaluate(String js) {
        if (webView == null) return;
        webView.postDelayed(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        }, 60);
    }

    private static String q(String s) {
        if (s == null) return "''";
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
                .replace("\r", "").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029") + "'";
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}