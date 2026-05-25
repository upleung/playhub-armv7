package com.tvbox.web.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

import java.io.*;
import java.lang.reflect.Method;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.jar.*;

/**
 * Embedded spider bridge that auto-starts when bridge.port is configured.
 * Maps Guard spider names to non-Guard equivalents using a JVM-compatible spider JAR.
 *
 * Config in application.yml:
 *   bridge:
 *     port: 18081
 *     spider-jar-url: https://ghfast.top/.../spider.jar
 */
@Configuration
@ConditionalOnProperty("bridge.port")
public class BridgeServerConfig {

    private static final Logger log = LoggerFactory.getLogger(BridgeServerConfig.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Value("${bridge.port:0}")
    private int port;

    @Value("${bridge.spider-jar-url:https://ghfast.top/raw.githubusercontent.com/qist/tvbox/master/xiaosa/spider.jar}")
    private String jarUrl;

    @Value("${bridge.config-url:https://ghfast.top/raw.githubusercontent.com/qist/tvbox/master/xiaosa/api.json}")
    private String configUrl;

    @Value("${bridge.cache-dir:.cache/tvbox}")
    private String cacheDir;

    private HttpServer server;
    private final Map<String, URLClassLoader> classLoaders = new ConcurrentHashMap<>();
    private final Map<String, Object> spiderCache = new ConcurrentHashMap<>();
    private final Map<String, Path> dexConvertedCache = new ConcurrentHashMap<>();
    private final Map<String, String> siteExtConfigs = new ConcurrentHashMap<>(); // api → ext
    private Path jarPath;

    // Guard → non-Guard mapping table
    private static final Map<String, String> GUARD_MAP = new LinkedHashMap<>();
    static {
        GUARD_MAP.put("WoGGGuard", "Wogg");
        GUARD_MAP.put("YGPGuard", "YGP");
        GUARD_MAP.put("MusicGuard", "AppGet");
        GUARD_MAP.put("SeedhubGuard", "HunHePan");
        GUARD_MAP.put("S_zpsGuard", "PanSou");
        GUARD_MAP.put("T4Guard", "AppFox");
        GUARD_MAP.put("LibvioGuard", "AppGet");
        GUARD_MAP.put("NewCzGuard", "Czsapp");
        GUARD_MAP.put("JpysGuard", "Jpys");
        GUARD_MAP.put("YCyzGuard", "AppGet");
        GUARD_MAP.put("BttwooGuard", "AppGet");
        GUARD_MAP.put("AppTTGuard", "AppYsV2");
        GUARD_MAP.put("NmyswvGuard", "AppGet");
        GUARD_MAP.put("AppSxGuard", "AppGet");
        GUARD_MAP.put("AueteGuard", "AppGet");
        GUARD_MAP.put("JPJGuard", "JianPian");
        GUARD_MAP.put("SixVGuard", "New6v");
        GUARD_MAP.put("Dm84Guard", "XBPQ");
        GUARD_MAP.put("Anime1Guard", "AppGet");
        GUARD_MAP.put("Sir88Guard", "Kanqiu");
        GUARD_MAP.put("ZbzGuard", "Kanqiu");
        GUARD_MAP.put("KanqiuGuard", "Kanqiu");
        GUARD_MAP.put("BiliGuard", "Bili");
        GUARD_MAP.put("Tingshu275Guard", "TingShijie");
        GUARD_MAP.put("FirstAidGuard", "FirstAid");
        GUARD_MAP.put("KkSsGuard", "PanSou");
        GUARD_MAP.put("UuSsGuard", "PanSou");
        GUARD_MAP.put("MIPanSoGuard", "MiSou");
        GUARD_MAP.put("YpanSoGuard", "TianYiSou");
        GUARD_MAP.put("PushGuard", "Push");
        GUARD_MAP.put("XPathGuard", "XBPQ");
        GUARD_MAP.put("MyDriveGuard", "LocalFile");
        GUARD_MAP.put("DouDouGuard", "XBPQ");
    }

    @PostConstruct
    public void start() throws Exception {
        if (port <= 0) return;

        Path cachePath = Path.of(cacheDir);
        Files.createDirectories(cachePath.resolve("jars"));
        Files.createDirectories(cachePath.resolve("dex-jars"));

        // Pre-download JAR
        String hash = Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("MD5").digest(jarUrl.getBytes()));
        jarPath = cachePath.resolve("jars").resolve(hash + ".jar");
        if (!Files.exists(jarPath) || Files.size(jarPath) == 0) {
            log.info("[Bridge] Downloading spider JAR: {}", jarUrl);
            downloadFile(jarUrl, jarPath);
        }
        log.info("[Bridge] Spider JAR ready: {} ({} bytes)", jarPath, Files.size(jarPath));

        // Pre-load config 2 to get valid ext configs for mapped spiders
        try {
            log.info("[Bridge] Loading site configs from: {}", configUrl);
            HttpURLConnection conn = (HttpURLConnection) URI.create(configUrl).toURL().openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "okhttp/3.15");
            conn.connect();
            if (conn.getResponseCode() >= 200 && conn.getResponseCode() < 300) {
                byte[] cfgBytes = conn.getInputStream().readAllBytes();
                JsonNode cfg = MAPPER.readTree(cfgBytes);
                JsonNode sites = cfg.get("sites");
                if (sites != null && sites.isArray()) {
                    for (JsonNode s : sites) {
                        String api = s.has("api") ? s.get("api").asText() : "";
                        if (!api.isEmpty()) {
                            String ext = "";
                            if (s.has("ext") && !s.get("ext").isNull()) {
                                JsonNode en = s.get("ext");
                                ext = en.isTextual() ? en.asText() : en.toString();
                            }
                            siteExtConfigs.put(api, ext);
                        }
                    }
                }
                log.info("[Bridge] Loaded {} site ext configs", siteExtConfigs.size());
            }
        } catch (Exception e) {
            log.warn("[Bridge] Failed to load site configs: {}", e.getMessage());
        }

        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.createContext("/spider/", this::handleSpider);
        server.createContext("/health", this::handleHealth);
        server.start();
        log.info("[Bridge] Started embedded spider bridge on port {}", port);
    }

    @PreDestroy
    public void stop() {
        if (server != null) {
            server.stop(2);
            log.info("[Bridge] Stopped");
        }
    }

    private void handleHealth(HttpExchange ex) throws IOException {
        send(ex, 200, "{\"status\":\"ok\",\"jar\":\"" + jarUrl + "\"}");
    }

    private void handleSpider(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String action = path.substring(path.lastIndexOf('/') + 1);

        try {
            byte[] bodyBytes = ex.getRequestBody().readAllBytes();
            JsonNode req = MAPPER.readTree(bodyBytes);
            JsonNode siteNode = req.get("site");
            if (siteNode == null || !siteNode.isObject()) {
                send(ex, 400, "{\"error\":\"missing site\"}");
                return;
            }

            String api = siteNode.has("api") ? siteNode.get("api").asText() : "";
            String ext = "";
            if (siteNode.has("ext") && !siteNode.get("ext").isNull()) {
                JsonNode extNode = siteNode.get("ext");
                ext = extNode.isTextual() ? extNode.asText() : extNode.toString();
            }
            if (ext.isEmpty() && siteNode.has("extText") && !siteNode.get("extText").isNull()) {
                ext = siteNode.get("extText").asText();
            }

            String mappedApi = mapGuardApi(api);
            log.debug("[Bridge] {} api={} → {}", action, api, mappedApi);

            // If caller's ext is empty or encrypted, use bridge's pre-loaded ext
            if (ext == null || ext.isEmpty() || ext.length() < 3 || !ext.contains("{")) {
                // Try exact match first
                if (siteExtConfigs.containsKey(mappedApi)) {
                    ext = siteExtConfigs.get(mappedApi);
                    log.debug("[Bridge] Using pre-loaded ext for {}", mappedApi);
                } else {
                    // Fuzzy match: try to find a similar spider's ext
                    String baseName = mappedApi.startsWith("csp_") ? mappedApi.substring(4) : mappedApi;
                    for (var entry : siteExtConfigs.entrySet()) {
                        String key = entry.getKey().startsWith("csp_") ? entry.getKey().substring(4) : entry.getKey();
                        if (key.equalsIgnoreCase(baseName) || key.toLowerCase().contains(baseName.toLowerCase())) {
                            ext = entry.getValue();
                            log.debug("[Bridge] Fuzzy-matched ext: {} → {}", mappedApi, entry.getKey());
                            break;
                        }
                    }
                    // Last resort: use first non-empty ext
                    if ((ext == null || ext.isEmpty()) && !siteExtConfigs.isEmpty()) {
                        ext = siteExtConfigs.values().iterator().next();
                        log.debug("[Bridge] Using fallback ext for {}", mappedApi);
                    }
                }
            }

            String result = executeSpider(mappedApi, ext, action, req);
            send(ex, 200, result);
        } catch (Exception e) {
            log.error("[Bridge] Error processing {}: {}", action, e.getMessage(), e);
            String msg = e.getMessage();
            if (msg == null && e.getCause() != null) msg = e.getCause().toString();
            if (msg == null) msg = e.getClass().getName();
            send(ex, 500, "{\"error\":\"" + msg.replace("\"", "'") + "\"}");
        }
    }

    private String mapGuardApi(String api) {
        if (api == null || api.isEmpty()) return api;
        String name = api.startsWith("csp_") ? api.substring(4) : api;
        if (name.endsWith("Guard")) {
            String stripped = name.substring(0, name.length() - 5);
            String mapped = GUARD_MAP.getOrDefault(name, stripped);
            return "csp_" + mapped;
        }
        return api;
    }

    @SuppressWarnings("unchecked")
    private String executeSpider(String api, String ext, String action, JsonNode req) throws Exception {
        String baseName = api.startsWith("csp_") ? api.substring(4) : api;
        String className = "com.github.catvod.spider." + baseName;
        Object spider = getOrCreateSpider(className, baseName);
        if (spider == null) {
            return "{\"error\":\"spider not found: " + className + "\"}";
        }

        // Init spider — replicate JarSpiderService.instantiateSpider logic
        String effectiveExt = ext != null ? ext : "";
        // Parse ext to extract a plain URL if it's a JSON wrapper
        String plainUrl = extractPlainUrl(effectiveExt);
        if (plainUrl != null && !plainUrl.isEmpty()) {
            effectiveExt = plainUrl;
        }
        initSpiderBridge(spider, effectiveExt, plainUrl);
        // Initialize SpiderApi so spiders can build proxy URLs
        initSpiderApi(spider);

        String jsonResult;
        try {
        switch (action) {
            case "home": {
                boolean filter = req.has("filter") && req.get("filter").asBoolean();
                jsonResult = (String) spider.getClass().getMethod("homeContent", boolean.class).invoke(spider, filter);
                break;
            }
            case "homeVod": {
                jsonResult = (String) spider.getClass().getMethod("homeVideoContent").invoke(spider);
                break;
            }
            case "category": {
                String tid = getText(req, "tid", "1");
                String pg = getText(req, "pg", "1");
                boolean filter = req.has("filter") && req.get("filter").asBoolean();
                HashMap<String, String> extend = req.has("extend")
                        ? MAPPER.convertValue(req.get("extend"), HashMap.class) : new HashMap<>();
                if (extend == null) extend = new HashMap<>();
                jsonResult = (String) spider.getClass()
                        .getMethod("categoryContent", String.class, String.class, boolean.class, HashMap.class)
                        .invoke(spider, tid, pg, filter, extend);
                break;
            }
            case "detail": {
                String id = getText(req, "id", "");
                List<String> ids = new ArrayList<>();
                ids.add(id);
                jsonResult = (String) spider.getClass().getMethod("detailContent", List.class).invoke(spider, ids);
                break;
            }
            case "search": {
                String wd = getText(req, "wd", "");
                boolean quick = req.has("quick") && req.get("quick").asBoolean();
                jsonResult = (String) spider.getClass().getMethod("searchContent", String.class, boolean.class).invoke(spider, wd, quick);
                break;
            }
            case "play": {
                String flag = getText(req, "flag", "");
                String id = getText(req, "id", "");
                List<String> vipFlags = req.has("vipFlags")
                        ? MAPPER.convertValue(req.get("vipFlags"), List.class) : new ArrayList<>();
                if (vipFlags == null) vipFlags = new ArrayList<>();
                jsonResult = (String) spider.getClass().getMethod("playerContent", String.class, String.class, List.class)
                        .invoke(spider, flag, id, vipFlags);
                break;
            }
            default:
                return "{\"error\":\"unknown action: " + action + "\"}";
        }
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg == null && e.getCause() != null) msg = e.getCause().toString();
            if (msg == null) msg = e.getClass().getName();
            log.warn("[Bridge] Spider execution failed for {}: {}", baseName, msg);
            return "{\"error\":\"spider exec: " + (msg != null ? msg.replace("\"","'").substring(0, Math.min(msg.length(), 100)) : "unknown") + "\"}";
        }

        // Validate JSON
        try {
            MAPPER.readTree(jsonResult);
            return jsonResult;
        } catch (Exception e) {
            ObjectNode err = MAPPER.createObjectNode();
            err.put("raw", jsonResult);
            err.put("_bridge_raw", true);
            return MAPPER.writeValueAsString(err);
        }
    }

    private String getText(JsonNode node, String field, String defaultVal) {
        return node.has(field) && !node.get(field).isNull() ? node.get(field).asText() : defaultVal;
    }

    /**
     * If ext is a JSON object wrapping a simple URL (e.g. {"host":"http://..."} or {"url":"http://..."}),
     * extract the URL as a plain string. Some spiders expect plain URLs, not JSON.
     */
    private String extractPlainUrl(String ext) {
        if (ext == null || ext.isEmpty()) return null;
        try {
            JsonNode node = MAPPER.readTree(ext);
            // {"site": ["url1","url2"]} → url1
            if (node.has("site")) {
                JsonNode sn = node.get("site");
                if (sn.isArray() && sn.size() > 0) return sn.get(0).asText();
                if (sn.isTextual()) return sn.asText();
            }
            // {"host": "url"} → url
            if (node.has("host")) return node.get("host").asText();
            // {"url": "url"} → url
            if (node.has("url") && node.get("url").isTextual()) return node.get("url").asText();
        } catch (Exception ignored) {}
        return null;
    }

    /**
     * Initialize spider using the same logic as JarSpiderService.instantiateSpider.
     * Tries init(Context, String), init(Context), init(String), and field injection.
     */
    /**
     * Initialize SpiderApi so spiders can build proxy URLs (e.g. Bili spider).
     */
    private void initSpiderApi(Object spider) {
        try {
            for (Method m : spider.getClass().getMethods()) {
                if (!"initApi".equals(m.getName()) || m.getParameterCount() != 1) continue;
                try {
                    Class<?> pt = m.getParameterTypes()[0];
                    if (pt.isAssignableFrom(com.github.catvod.crawler.SpiderApi.class) || pt == Object.class) {
                        m.invoke(spider, new com.github.catvod.crawler.SpiderApi("http://127.0.0.1:18080/", "18080"));
                        return;
                    }
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}
    }

    private void initSpiderBridge(Object spider, String ext, String plainUrl) {
        // Replicate JarSpiderService's init strategy exactly
        Object ctx = new android.app.Activity();
        Object app = new android.app.Application();

        // 1. Try Spider.init(Context, String) via typed interface
        try {
            Class<?> spiderClass = Class.forName("com.github.catvod.crawler.Spider");
            if (spiderClass.isAssignableFrom(spider.getClass())) {
                try {
                    Method m = spider.getClass().getMethod("init", android.content.Context.class, String.class);
                    m.invoke(spider, ctx, ext != null ? ext : "");
                    return;
                } catch (NoSuchMethodException e) {
                    try {
                        Method m = spider.getClass().getMethod("init", android.content.Context.class, String.class);
                        m.invoke(spider, app, ext != null ? ext : "");
                        return;
                    } catch (NoSuchMethodException ignored) {}
                }
            }
        } catch (Exception ignored) {}

        // 2. If ext is a plain URL, try init(String)
        if (plainUrl != null && !plainUrl.isEmpty()) {
            try {
                Method m = spider.getClass().getMethod("init", String.class);
                m.invoke(spider, plainUrl);
                return;
            } catch (Exception ignored) {}
        }

        // 3. Try all init methods exhaustively
        for (Method m : spider.getClass().getMethods()) {
            if (!"init".equals(m.getName())) continue;
            Class<?>[] pts = m.getParameterTypes();
            if (pts.length == 2) {
                // Try (Context, String) with both context and app
                try { m.invoke(spider, ctx, ext != null ? ext : ""); return; } catch (Exception ignored) {}
                try { m.invoke(spider, app, ext != null ? ext : ""); return; } catch (Exception ignored) {}
                // Try (String, String) if plainUrl exists
                if (plainUrl != null) {
                    try { m.invoke(spider, plainUrl, ext != null ? ext : ""); return; } catch (Exception ignored) {}
                }
            } else if (pts.length == 1) {
                try { m.invoke(spider, ctx); return; } catch (Exception ignored) {}
                try { m.invoke(spider, app); return; } catch (Exception ignored) {}
                if (plainUrl != null) {
                    try { m.invoke(spider, plainUrl); return; } catch (Exception ignored) {}
                }
                try { m.invoke(spider, ext != null ? ext : ""); return; } catch (Exception ignored) {}
            }
        }

        // 4. Field injection — for spiders that store config in fields
        String[] fieldNames = {"ext", "mExt", "config", "mConfig", "api", "mApi", "url", "mUrl", "host", "mHost", "site", "sites", "baseUrl", "server", "domain"};
        for (String fn : fieldNames) {
            for (Class<?> c = spider.getClass(); c != null; c = c.getSuperclass()) {
                try {
                    java.lang.reflect.Field f = c.getDeclaredField(fn);
                    f.setAccessible(true);
                    if (f.getType() == String.class) {
                        String val = plainUrl != null ? plainUrl : ext;
                        if (val != null && !val.isEmpty()) {
                            f.set(spider, val);
                            return;
                        }
                    }
                } catch (Exception ignored) {}
            }
        }
    }

    private Object getOrCreateSpider(String className, String baseName) throws Exception {
        String cacheKey = baseName;
        Object cached = spiderCache.get(cacheKey);
        if (cached != null) return cached;

        URLClassLoader loader = classLoaders.computeIfAbsent(jarPath.toString(), k -> {
            try {
                Path loadPath = findBestJar(jarPath);
                log.info("[Bridge] Using JAR: {}", loadPath);
                return new URLClassLoader(new URL[]{loadPath.toUri().toURL()},
                        BridgeServerConfig.class.getClassLoader());
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        Class<?> spiderClass = null;
        // Try class name variants
        String[] candidates = {baseName,
                baseName.endsWith("Guard") ? baseName.substring(0, baseName.length() - 5) : baseName + "Guard"};
        for (String c : candidates) {
            try {
                spiderClass = loader.loadClass("com.github.catvod.spider." + c);
                break;
            } catch (ClassNotFoundException ignored) {}
        }

        // Also try case-insensitive
        if (spiderClass == null && baseName.length() > 1) {
            String lc = Character.toLowerCase(baseName.charAt(0)) + baseName.substring(1);
            try {
                spiderClass = loader.loadClass("com.github.catvod.spider." + lc);
            } catch (ClassNotFoundException ignored) {}
        }

        if (spiderClass == null) {
            log.warn("[Bridge] Spider class not found: {}", className);
            return null;
        }

        Object spider = spiderClass.getDeclaredConstructor().newInstance();
        spiderCache.put(cacheKey, spider);
        log.info("[Bridge] Created spider: {}", spiderClass.getSimpleName());
        return spider;
    }

    private void downloadFile(String url, Path dest) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);
        conn.setRequestProperty("User-Agent", "okhttp/3.15");
        conn.connect();
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new IOException("Download failed, status=" + code + " url=" + url);
        }
        Files.createDirectories(dest.getParent());
        try (InputStream in = conn.getInputStream()) {
            Files.copy(in, dest, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /**
     * Find the best JAR to use: prefer pre-converted dex-jars or runtime-jars
     * that already have usable .class files.
     */
    private Path findBestJar(Path rawJar) throws Exception {
        // Check if the raw JAR already has JVM-compatible .class files
        try (JarFile jf = new JarFile(rawJar.toFile())) {
            Enumeration<JarEntry> e = jf.entries();
            while (e.hasMoreElements()) {
                if (e.nextElement().getName().endsWith(".class")) return rawJar;
            }
        }

        // PREFER runtime-jars (already JVM-compatible rewritten by main app)
        Path runtimeDir = Path.of(cacheDir, "runtime-jars");
        if (Files.exists(runtimeDir)) {
            try (var ds = Files.newDirectoryStream(runtimeDir, "*.jar")) {
                Path best = null; long bestSize = 0;
                for (Path p : ds) {
                    long sz = Files.size(p);
                    if (sz > bestSize && sz > 50000) {
                        try (JarFile jf = new JarFile(p.toFile())) {
                            Enumeration<JarEntry> e2 = jf.entries();
                            while (e2.hasMoreElements()) {
                                if (e2.nextElement().getName().endsWith(".class")) {
                                    best = p; bestSize = sz; break;
                                }
                            }
                        }
                    }
                }
                if (best != null) {
                    log.info("[Bridge] Using runtime JAR: {}", best.getFileName());
                    return best;
                }
            }
        }

        // Look for pre-converted JARs in dex-jars directory
        Path dexDir = Path.of(cacheDir, "dex-jars");
        if (Files.exists(dexDir)) {
            try (var ds = Files.newDirectoryStream(dexDir, "*.jar")) {
                Path best = null;
                long bestSize = 0;
                for (Path p : ds) {
                    long size = Files.size(p);
                    // Pick the largest pre-converted JAR (most classes)
                    if (size > bestSize && size > 50000) {
                        // Verify it has class files
                        try (JarFile jf = new JarFile(p.toFile())) {
                            Enumeration<JarEntry> e2 = jf.entries();
                            while (e2.hasMoreElements()) {
                                if (e2.nextElement().getName().endsWith(".class")) {
                                    best = p;
                                    bestSize = size;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (best != null) return best;
            }
        }

        return rawJar;
    }

    private boolean isDexOnlyJar(Path p) throws Exception {
        try (JarFile jf = new JarFile(p.toFile())) {
            boolean hasDex = false, hasClass = false;
            Enumeration<JarEntry> e = jf.entries();
            while (e.hasMoreElements()) {
                String n = e.nextElement().getName();
                if (n.endsWith(".dex")) hasDex = true;
                if (n.endsWith(".class")) { hasClass = true; break; }
            }
            return hasDex && !hasClass;
        }
    }

    private Path ensureDexConverted(Path p) {
        return dexConvertedCache.computeIfAbsent(p.toString(), k -> {
            try {
                Path dexDir = Path.of(cacheDir, "dex-jars");
                Files.createDirectories(dexDir);
                String token = Base64.getUrlEncoder().withoutPadding().encodeToString(
                        MessageDigest.getInstance("MD5").digest((p.toString() + Files.getLastModifiedTime(p).toMillis()).getBytes()));
                Path out = dexDir.resolve(token + ".jar");
                if (Files.exists(out) && Files.size(out) > 0) return out;

                Path dexFile = Files.createTempFile("bridge-", ".dex");
                try (JarFile jf = new JarFile(p.toFile())) {
                    JarEntry je = jf.getJarEntry("classes.dex");
                    if (je == null) throw new IOException("classes.dex not found");
                    try (InputStream in = jf.getInputStream(je)) {
                        Files.copy(in, dexFile, StandardCopyOption.REPLACE_EXISTING);
                    }
                }

                String d2j = findDex2jar();
                ProcessBuilder pb = new ProcessBuilder(
                        isWindows() ? "cmd" : "sh", isWindows() ? "/c" : "-c",
                        d2j + " " + dexFile.toAbsolutePath() + " -o " + out.toAbsolutePath() + " --force");
                pb.redirectErrorStream(true);
                Process proc = pb.start();
                proc.waitFor(120, TimeUnit.SECONDS);
                Files.deleteIfExists(dexFile);

                if (!Files.exists(out) || Files.size(out) == 0) {
                    throw new IOException("dex2jar produced empty JAR");
                }
                return out;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }

    private String findDex2jar() {
        String[] tries = {"tools/dex-tools-v2.4/d2j-dex2jar.bat", "tools/dex-tools-v2.4/d2j-dex2jar.sh"};
        for (String t : tries) {
            Path tp = Path.of(t);
            if (Files.exists(tp)) return tp.toAbsolutePath().toString();
        }
        return isWindows() ? "d2j-dex2jar.bat" : "d2j-dex2jar.sh";
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    private void send(HttpExchange ex, int code, String json) throws IOException {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(code, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }
}
