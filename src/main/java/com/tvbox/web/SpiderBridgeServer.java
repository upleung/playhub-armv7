package com.tvbox.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import org.springframework.asm.ClassReader;
import org.springframework.asm.ClassWriter;
import org.springframework.asm.ClassVisitor;
import org.springframework.asm.Opcodes;

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
 * Standalone spider bridge server.
 * Maps config-1 Guard spider names to config-2 compatible spiders,
 * loading from the xiaosa spider JAR.
 *
 * Usage: java -cp playhub.jar com.tvbox.web.SpiderBridgeServer [port] [jar-url]
 *   Default port: 18081
 *   Default JAR: xiaosa spider.jar from GitHub
 */
public class SpiderBridgeServer {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String JAR_CACHE_DIR = ".cache/bridge/jars";
    private static final String DEX_CACHE_DIR = ".cache/bridge/dex-jars";

    // Guard → non-Guard mapping for config 1 sources
    private static final Map<String, String> GUARD_MAP = new HashMap<>();
    static {
        // Direct mappings: Guard → non-Guard spider class
        GUARD_MAP.put("WoGGGuard", "Wogg");
        GUARD_MAP.put("YGPGuard", "YGP");
        GUARD_MAP.put("MusicGuard", "YinYueTai");  // music → fallback
        GUARD_MAP.put("SeedhubGuard", "HunHePan");  // seed search → mixed pan search
        GUARD_MAP.put("S_zpsGuard", "PanSou");  // pan search
        GUARD_MAP.put("T4Guard", "AppFox");  // cloud stream
        GUARD_MAP.put("LibvioGuard", "AppGet");  // app stream
        GUARD_MAP.put("NewCzGuard", "Czsapp");  // factory stream
        GUARD_MAP.put("JpysGuard", "Jpys");  // gold brand
        GUARD_MAP.put("YCyzGuard", "AppGet");  // original → app
        GUARD_MAP.put("BttwooGuard", "AppGet");  // bittorrent → app
        GUARD_MAP.put("AppTTGuard", "AppYsV2");  // hot broadcast
        GUARD_MAP.put("NmyswvGuard", "AppGet");  // sticky rice
        GUARD_MAP.put("AppSxGuard", "AppGet");  // various APP sources
        GUARD_MAP.put("AueteGuard", "AppGet");  // auto
        GUARD_MAP.put("JPJGuard", "JianPian");  // jianpian
        GUARD_MAP.put("SixVGuard", "New6v");  // 6v magnetic
        GUARD_MAP.put("Dm84Guard", "XBPQ");  // anime bus → hiker
        GUARD_MAP.put("Anime1Guard", "AppGet");  // anime1 → app
        GUARD_MAP.put("Sir88Guard", "Kanqiu");  // football
        GUARD_MAP.put("ZbzGuard", "Kanqiu");  // football
        GUARD_MAP.put("KanqiuGuard", "Kanqiu");  // football
        GUARD_MAP.put("BiliGuard", "Bili");  // bilibili
        GUARD_MAP.put("Tingshu275Guard", "TingShijie");  // audiobook
        GUARD_MAP.put("FirstAidGuard", "FirstAid");  // first aid
        GUARD_MAP.put("KkSsGuard", "PanSou");  // search
        GUARD_MAP.put("UuSsGuard", "PanSou");  // search
        GUARD_MAP.put("MIPanSoGuard", "MiSou");  // search
        GUARD_MAP.put("YpanSoGuard", "TianYiSou");  // search
        GUARD_MAP.put("PushGuard", "Push");  // push
        GUARD_MAP.put("XPathGuard", "XBPQ");  // xpath → hiker
    }

    private final int port;
    private final String jarUrl;
    private final Map<String, URLClassLoader> classLoaders = new ConcurrentHashMap<>();
    private final Map<String, Object> spiderCache = new ConcurrentHashMap<>();
    private final Map<String, Path> dexConvertedCache = new ConcurrentHashMap<>();

    public SpiderBridgeServer(int port, String jarUrl) {
        this.port = port;
        this.jarUrl = jarUrl;
    }

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 18081;
        String jarUrl = args.length > 1 ? args[1]
                : "https://ghfast.top/raw.githubusercontent.com/qist/tvbox/master/xiaosa/spider.jar";
        new SpiderBridgeServer(port, jarUrl).start();
    }

    public void start() throws Exception {
        Path jarDir = Path.of(JAR_CACHE_DIR);
        Files.createDirectories(jarDir);
        Path dexDir = Path.of(DEX_CACHE_DIR);
        Files.createDirectories(dexDir);

        // Pre-download the spider JAR
        Path jarPath = downloadJar(jarUrl);
        System.out.println("[Bridge] Spider JAR ready: " + jarPath + " (" + Files.size(jarPath) + " bytes)");

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.createContext("/spider/", this::handleSpider);
        server.createContext("/health", this::handleHealth);
        server.start();
        System.out.println("[Bridge] Started on port " + port);
    }

    private void handleHealth(HttpExchange ex) throws IOException {
        sendJson(ex, 200, "{\"status\":\"ok\"}");
    }

    private void handleSpider(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String action = path.substring(path.lastIndexOf('/') + 1);

        try {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonNode req = MAPPER.readTree(body);
            JsonNode site = req.get("site");

            String api = site != null ? site.get("api").asText() : "";
            String ext = site != null && site.has("ext") ? site.get("ext").asText() : "";

            // Map Guard → non-Guard
            String mappedApi = mapGuardApi(api);
            System.out.println("[Bridge] " + action + " api=" + api + " → " + mappedApi);

            String result = executeSpider(mappedApi, ext, action, req);
            sendJson(ex, 200, result);
        } catch (Exception e) {
            System.err.println("[Bridge] Error: " + e.getMessage());
            sendJson(ex, 500, "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
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

    private String executeSpider(String api, String ext, String action, JsonNode req) throws Exception {
        String className = "com.github.catvod.spider." + api.replace("csp_", "");
        Object spider = getOrCreateSpider(className);
        if (spider == null) {
            return "{\"error\":\"spider not found: " + className + "\"}";
        }

        // Init spider with ext data
        try {
            Method initMethod = spider.getClass().getMethod("init", Object.class, String.class);
            initMethod.invoke(spider, null, ext != null ? ext : "");
        } catch (NoSuchMethodException e) {
            try {
                Method initMethod = spider.getClass().getMethod("init", Object.class);
                initMethod.invoke(spider, (Object) null);
            } catch (NoSuchMethodException ignored) {}
        }

        String jsonResult;
        switch (action) {
            case "home": {
                boolean filter = req.has("filter") && req.get("filter").asBoolean();
                jsonResult = (String) spider.getClass().getMethod("homeContent", boolean.class).invoke(spider, filter);
                break;
            }
            case "category": {
                String tid = req.has("tid") ? req.get("tid").asText() : "1";
                String pg = req.has("pg") ? req.get("pg").asText() : "1";
                boolean filter = req.has("filter") && req.get("filter").asBoolean();
                @SuppressWarnings("unchecked")
                HashMap<String, String> extend = MAPPER.convertValue(req.get("extend"), HashMap.class);
                if (extend == null) extend = new HashMap<>();
                jsonResult = (String) spider.getClass()
                        .getMethod("categoryContent", String.class, String.class, boolean.class, HashMap.class)
                        .invoke(spider, tid, pg, filter, extend);
                break;
            }
            case "detail": {
                String id = req.has("id") ? req.get("id").asText() : "";
                List<String> ids = new ArrayList<>();
                ids.add(id);
                jsonResult = (String) spider.getClass().getMethod("detailContent", List.class).invoke(spider, ids);
                break;
            }
            case "search": {
                String wd = req.has("wd") ? req.get("wd").asText() : "";
                boolean quick = req.has("quick") && req.get("quick").asBoolean();
                jsonResult = (String) spider.getClass().getMethod("searchContent", String.class, boolean.class).invoke(spider, wd, quick);
                break;
            }
            case "play": {
                String flag = req.has("flag") ? req.get("flag").asText() : "";
                String id = req.has("id") ? req.get("id").asText() : "";
                @SuppressWarnings("unchecked")
                List<String> vipFlags = req.has("vipFlags") ? MAPPER.convertValue(req.get("vipFlags"), List.class) : new ArrayList<>();
                if (vipFlags == null) vipFlags = new ArrayList<>();
                jsonResult = (String) spider.getClass().getMethod("playerContent", String.class, String.class, List.class)
                        .invoke(spider, flag, id, vipFlags);
                break;
            }
            default:
                return "{\"error\":\"unknown action: " + action + "\"}";
        }

        // Parse to JSON to validate, then return
        try {
            MAPPER.readTree(jsonResult);
            return jsonResult;
        } catch (Exception e) {
            ObjectNode err = JsonNodeFactory.instance.objectNode();
            err.put("raw", jsonResult);
            err.put("error", "response is not valid JSON: " + e.getMessage());
            return MAPPER.writeValueAsString(err);
        }
    }

    private Object getOrCreateSpider(String className) throws Exception {
        Object cached = spiderCache.get(className);
        if (cached != null) return cached;

        Path jarPath = downloadJar(jarUrl);
        URLClassLoader loader = classLoaders.computeIfAbsent(jarPath.toString(), k -> {
            try {
                Path loadPath = jarPath;
                if (isDexOnlyJar(jarPath)) {
                    loadPath = ensureDexConverted(jarPath);
                }
                return new URLClassLoader(new URL[]{loadPath.toUri().toURL()},
                        Thread.currentThread().getContextClassLoader());
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        System.out.println("[Bridge] Loading class: " + className);
        Class<?> spiderClass;
        try {
            spiderClass = loader.loadClass(className);
        } catch (ClassNotFoundException e) {
            // Try alternative class names
            String baseName = className.substring(className.lastIndexOf('.') + 1);
            String[] candidates = buildCandidates(baseName);
            spiderClass = null;
            for (String c : candidates) {
                try {
                    spiderClass = loader.loadClass("com.github.catvod.spider." + c);
                    System.out.println("[Bridge] Found alternative: " + c);
                    break;
                } catch (ClassNotFoundException ignored) {}
            }
            if (spiderClass == null) {
                System.err.println("[Bridge] Class not found: " + className + ", tried " + Arrays.toString(candidates));
                return null;
            }
        }

        Object spider = spiderClass.getDeclaredConstructor().newInstance();
        spiderCache.put(className, spider);
        return spider;
    }

    private String[] buildCandidates(String baseName) {
        List<String> names = new ArrayList<>();
        names.add(baseName);
        if (baseName.endsWith("Guard")) {
            String stripped = baseName.substring(0, baseName.length() - 5);
            if (!stripped.isEmpty()) {
                names.add(stripped);
                if (stripped.length() > 1 && Character.isUpperCase(stripped.charAt(0))) {
                    names.add(Character.toLowerCase(stripped.charAt(0)) + stripped.substring(1));
                }
            }
        }
        names.add(baseName + "Guard");
        return names.toArray(new String[0]);
    }

    private Path downloadJar(String url) throws Exception {
        String hash = md5(url);
        Path jarDir = Path.of(JAR_CACHE_DIR);
        Files.createDirectories(jarDir);
        Path jarPath = jarDir.resolve(hash + ".jar");

        if (Files.exists(jarPath) && Files.size(jarPath) > 0) {
            return jarPath;
        }

        System.out.println("[Bridge] Downloading JAR: " + url);
        HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);
        conn.setRequestProperty("User-Agent", "okhttp/3.15");
        conn.connect();

        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            // Try relative resolution
            String fallbackUrl = url;
            if (url.startsWith("./")) {
                fallbackUrl = "https://ghfast.top/raw.githubusercontent.com/qist/tvbox/master/xiaosa/" + url.substring(2);
                System.out.println("[Bridge] Trying fallback: " + fallbackUrl);
                conn = (HttpURLConnection) URI.create(fallbackUrl).toURL().openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(60000);
                conn.setRequestProperty("User-Agent", "okhttp/3.15");
                conn.connect();
                code = conn.getResponseCode();
            }
            if (code < 200 || code >= 300) {
                throw new IOException("JAR download failed, status=" + code);
            }
        }

        try (InputStream in = conn.getInputStream()) {
            byte[] data = in.readAllBytes();
            Files.write(jarPath, data);
            System.out.println("[Bridge] Downloaded: " + data.length + " bytes");
        }
        return jarPath;
    }

    private boolean isDexOnlyJar(Path jarPath) throws Exception {
        try (JarFile jf = new JarFile(jarPath.toFile())) {
            boolean hasDex = false, hasClass = false;
            Enumeration<JarEntry> entries = jf.entries();
            while (entries.hasMoreElements()) {
                String name = entries.nextElement().getName();
                if (name.endsWith(".dex")) hasDex = true;
                if (name.endsWith(".class")) { hasClass = true; break; }
            }
            return hasDex && !hasClass;
        }
    }

    private Path ensureDexConverted(Path jarPath) throws Exception {
        return dexConvertedCache.computeIfAbsent(jarPath.toString(), k -> {
            try {
                Path dexDir = Path.of(DEX_CACHE_DIR);
                Files.createDirectories(dexDir);
                String token = md5(jarPath.toString() + Files.getLastModifiedTime(jarPath).toMillis());
                Path outputJar = dexDir.resolve(token + ".jar");
                if (Files.exists(outputJar) && Files.size(outputJar) > 0) return outputJar;

                // Extract classes.dex
                Path dexFile = Files.createTempFile("bridge-dex-", ".dex");
                try (JarFile jf = new JarFile(jarPath.toFile())) {
                    JarEntry dexEntry = jf.getJarEntry("classes.dex");
                    if (dexEntry == null) throw new IOException("classes.dex not found");
                    try (InputStream in = jf.getInputStream(dexEntry)) {
                        Files.copy(in, dexFile, StandardCopyOption.REPLACE_EXISTING);
                    }
                }

                // Run dex2jar
                String dex2jarCmd = findDex2jar();
                ProcessBuilder pb = new ProcessBuilder(
                        isWindows() ? "cmd" : "sh",
                        isWindows() ? "/c" : "-c",
                        dex2jarCmd + " " + dexFile.toAbsolutePath() + " -o " + outputJar.toAbsolutePath() + " --force"
                );
                pb.redirectErrorStream(true);
                Process p = pb.start();
                String output = new String(p.getInputStream().readAllBytes());
                p.waitFor(60, TimeUnit.SECONDS);
                Files.deleteIfExists(dexFile);

                if (!Files.exists(outputJar) || Files.size(outputJar) == 0) {
                    throw new IOException("dex2jar produced empty output: " + output);
                }
                return outputJar;
            } catch (Exception e) {
                throw new RuntimeException("dex2jar failed: " + e.getMessage(), e);
            }
        });
    }

    private String findDex2jar() {
        // Try common locations
        String[] candidates = {
            "tools/dex-tools-v2.4/d2j-dex2jar.bat",
            "tools/dex-tools-v2.4/d2j-dex2jar.sh",
            "../tools/dex-tools-v2.4/d2j-dex2jar.bat",
            "../tools/dex-tools-v2.4/d2j-dex2jar.sh",
        };
        for (String c : candidates) {
            if (Files.exists(Path.of(c))) {
                return Path.of(c).toAbsolutePath().toString();
            }
        }
        return isWindows() ? "d2j-dex2jar.bat" : "d2j-dex2jar.sh";
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    private static String md5(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            return Integer.toHexString(input.hashCode());
        }
    }

    private static String escapeJson(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private void sendJson(HttpExchange ex, int code, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}
