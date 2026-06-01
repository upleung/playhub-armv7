package com.github.catvod.spider;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Application;
import android.content.Context;
import android.widget.EditText;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class Init {

    public static String C = "";
    public static int E4 = 0;
    public static String G9 = "";
    public static Boolean K = Boolean.FALSE;
    public static String OA = "";
    public static int V = 0;
    public static String d = "";
    public static String dt = "";
    public static String i = "";
    public static String v = "";
    public static String xo = "";

    private static final Init INSTANCE = new Init();
    private static final Application APPLICATION = new Application();
    private static final Activity ACTIVITY = new Activity();
    private static final EditText EDIT_TEXT = new EditText();
    private static final Map<String, Boolean> KEYWORDS = new ConcurrentHashMap<>();
    private static final int EXECUTOR_THREADS = Math.max(2, Integer.getInteger("tvbox.init.executorThreads", 2));
    private static final int MAX_PENDING_TASKS = Math.max(64, Integer.getInteger("tvbox.init.maxPendingTasks", 256));
    private static final AtomicInteger PENDING_TASKS = new AtomicInteger();
    private static final ScheduledThreadPoolExecutor EXECUTOR = new ScheduledThreadPoolExecutor(EXECUTOR_THREADS, r -> {
        Thread thread = new Thread(r, "tvbox-init");
        thread.setDaemon(true);
        return thread;
    });

    static {
        EXECUTOR.setRemoveOnCancelPolicy(true);
        EXECUTOR.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
        EXECUTOR.setContinueExistingPeriodicTasksAfterShutdownPolicy(false);
    }

    public static void a() throws IOException {
    }

    public static void checkPermission() {
    }

    static EditText C() {
        return EDIT_TEXT;
    }

    public static AlertDialog N0() {
        return new AlertDialog();
    }

    static void OA() {
    }

    public static Application context() {
        return APPLICATION;
    }

    static void dt(String value) {
        d = value == null ? "" : value;
    }

    public static String d(File file) {
        return file == null ? "" : file.getAbsolutePath();
    }

    public static void e(InputStream inputStream, String path) throws IOException {
        if (inputStream == null || path == null || path.isBlank()) {
            return;
        }
        File target = new File(path);
        File parent = target.getParentFile();
        if (parent != null) {
            Files.createDirectories(parent.toPath());
        }
        try (OutputStream outputStream = Files.newOutputStream(target.toPath())) {
            inputStream.transferTo(outputStream);
        }
    }

    public static Init get() {
        return INSTANCE;
    }

    public static Activity getActivity() {
        return ACTIVITY;
    }

    public static Activity getConfigActivity() {
        return ACTIVITY;
    }

    public static Map<String, Boolean> getKeywordsMap() {
        return KEYWORDS;
    }

    public static InputStream i(String path) throws IOException {
        if (path == null || path.isBlank()) {
            return InputStream.nullInputStream();
        }
        File file = new File(path);
        if (!file.exists()) {
            return InputStream.nullInputStream();
        }
        return Files.newInputStream(file.toPath());
    }

    public static void init(Context context) {
    }

    public static void interceptActivityStart() {
    }

    public static void lj() {
    }

    public static void post(Runnable runnable) {
        submitAsync(runnable, 0);
    }

    public static void execute(Runnable runnable) {
        post(runnable);
    }

    public static void replaceCloudDiskNames() {
    }

    public static void run(Runnable runnable) {
        if (runnable != null) {
            runnable.run();
        }
    }

    public static void run(Runnable runnable, int delayMillis) {
        submitAsync(runnable, Math.max(0, delayMillis));
    }

    public static com.github.catvod.crawler.Spider getSpider(String name) {
        System.err.println("[Init.getSpider] called with name=" + name);
        return new HttpSpider(name);
    }

    public static com.github.catvod.crawler.Spider getSpider(String name, String ext) {
        System.err.println("[Init.getSpider] called with name=" + name + " ext=" + (ext != null ? ext.substring(0, Math.min(ext.length(), 60)) : "null"));
        return new HttpSpider(name, ext);
    }

    public static com.github.catvod.crawler.Spider getSpider(String name, String ext, String jar) {
        System.err.println("[Init.getSpider] called with name=" + name + " ext=" + (ext != null ? ext.substring(0, Math.min(ext.length(), 60)) : "null") + " jar=" + jar);
        return new HttpSpider(name, ext);
    }

    /**
     * Minimal HTTP spider that makes direct API requests.
     * URL is set via init(ext) or the constructor — the Guard spider
     * calls getSpider(className) first, then init(ctx, apiUrl) later.
     */
    private static class HttpSpider extends com.github.catvod.crawler.Spider {
        private volatile String apiUrl;
        private final java.net.http.HttpClient client;

        HttpSpider(String url) {
            // url might be a class name (from getSpider) — init() will set the real URL
            this.apiUrl = (url != null && (url.startsWith("http://") || url.startsWith("https://"))) ? url : "";
            this.client = java.net.http.HttpClient.newBuilder()
                    .connectTimeout(java.time.Duration.ofSeconds(10))
                    .followRedirects(java.net.http.HttpClient.Redirect.NORMAL)
                    .sslContext(com.tvbox.web.service.HttpClientFactory.sslContext())
                    .build();
        }

        HttpSpider(String url, String ext) {
            this(url);
            if (ext != null && (ext.startsWith("http://") || ext.startsWith("https://"))) {
                this.apiUrl = ext;
            }
        }

        @Override
        public void init(android.content.Context context) {
            super.init(context);
        }

        @Override
        public void init(android.content.Context context, String ext) {
            super.init(context, ext);
            // Guard spiders pass the real API URL via ext
            if (ext != null && (ext.startsWith("http://") || ext.startsWith("https://"))) {
                this.apiUrl = ext;
                System.err.println("[HttpSpider] URL updated via init: " + ext.substring(0, Math.min(ext.length(), 80)));
            }
        }

        private boolean hasUrl() {
            return apiUrl != null && !apiUrl.isEmpty()
                    && (apiUrl.startsWith("http://") || apiUrl.startsWith("https://"));
        }

        private String httpGet(String baseUrl, java.util.Map<String, String> params) {
            if (!hasUrl() && baseUrl != null && (baseUrl.startsWith("http://") || baseUrl.startsWith("https://"))) {
                apiUrl = baseUrl;
            }
            if (!hasUrl()) return "{}";
            try {
                StringBuilder sb = new StringBuilder(apiUrl);
                if (params != null && !params.isEmpty()) {
                    sb.append(apiUrl.contains("?") ? "&" : "?");
                    for (var e : params.entrySet()) {
                        if (e.getValue() == null) continue;
                        sb.append(e.getKey()).append("=")
                          .append(java.net.URLEncoder.encode(e.getValue(), "UTF-8")).append("&");
                    }
                }
                var req = java.net.http.HttpRequest.newBuilder(java.net.URI.create(sb.toString()))
                        .header("User-Agent", "okhttp/3.15")
                        .timeout(java.time.Duration.ofSeconds(20))
                        .GET().build();
                var resp = client.send(req, java.net.http.HttpResponse.BodyHandlers.ofString());
                if (resp.statusCode() >= 200 && resp.statusCode() < 300) {
                    return resp.body();
                }
                return "{}";
            } catch (Exception e) {
                return "{}";
            }
        }

        @Override
        public String homeContent(boolean filter) {
            var params = new java.util.HashMap<String, String>();
            return httpGet(apiUrl, params);
        }

        @Override
        public String homeVideoContent() {
            var params = new java.util.HashMap<String, String>();
            params.put("ac", "videolist");
            return httpGet(apiUrl, params);
        }

        @Override
        public String categoryContent(String tid, String pg, boolean filter, java.util.HashMap<String, String> extend) {
            var params = new java.util.LinkedHashMap<String, String>();
            params.put("ac", "detail");
            params.put("t", tid != null ? tid : "");
            params.put("pg", pg != null ? pg : "1");
            if (extend != null) params.putAll(extend);
            return httpGet(apiUrl, params);
        }

        @Override
        public String detailContent(java.util.List<String> ids) {
            var params = new java.util.LinkedHashMap<String, String>();
            params.put("ac", "detail");
            params.put("ids", ids != null && !ids.isEmpty() ? String.join(",", ids) : "");
            return httpGet(apiUrl, params);
        }

        @Override
        public String searchContent(String key, boolean quick) {
            var params = new java.util.LinkedHashMap<String, String>();
            params.put("ac", "detail");
            params.put("wd", key != null ? key : "");
            if (quick) params.put("quick", "1");
            return httpGet(apiUrl, params);
        }

        @Override
        public String playerContent(String flag, String id, java.util.List<String> vipFlags) {
            var params = new java.util.LinkedHashMap<String, String>();
            params.put("ac", "detail");
            params.put("play", id != null ? id : "");
            if (flag != null && !flag.isEmpty()) params.put("flag", flag);
            return httpGet(apiUrl, params);
        }
    }

    public static void startFloatBall() {
    }

    public static void startGoProxy(Context context) {
    }

    public static void show(String message) {
    }

    public static void write(File file, InputStream inputStream) throws IOException {
        if (file == null || inputStream == null) {
            return;
        }
        File parent = file.getParentFile();
        if (parent != null) {
            Files.createDirectories(parent.toPath());
        }
        try (OutputStream outputStream = Files.newOutputStream(file.toPath())) {
            inputStream.transferTo(outputStream);
        }
    }

    private static void submitAsync(Runnable runnable, long delayMillis) {
        if (runnable == null) {
            return;
        }
        if (!tryReserveSlot()) {
            return;
        }
        Runnable guarded = () -> {
            try {
                runnable.run();
            } finally {
                PENDING_TASKS.decrementAndGet();
            }
        };
        try {
            if (delayMillis > 0) {
                EXECUTOR.schedule(guarded, delayMillis, TimeUnit.MILLISECONDS);
            } else {
                EXECUTOR.execute(guarded);
            }
        } catch (RejectedExecutionException ex) {
            PENDING_TASKS.decrementAndGet();
        }
    }

    private static boolean tryReserveSlot() {
        while (true) {
            int current = PENDING_TASKS.get();
            if (current >= MAX_PENDING_TASKS) {
                return false;
            }
            if (PENDING_TASKS.compareAndSet(current, current + 1)) {
                return true;
            }
        }
    }
}
