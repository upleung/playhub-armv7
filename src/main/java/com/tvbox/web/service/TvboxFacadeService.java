package com.tvbox.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.tvbox.web.model.ConfigPayload;
import com.tvbox.web.model.SiteDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class TvboxFacadeService {

    private static final Logger log = LoggerFactory.getLogger(TvboxFacadeService.class);
    private static final Pattern PLAY_URL_PREFIX_PATTERN = Pattern.compile("^[^,，]{1,30}[,，](.+)$");
    private static final long PLAY_CACHE_TTL = 86400000L; // 1 day

    private final ConfigService configService;
    private final HttpSourceService httpSourceService;
    private final JarSpiderService jarSpiderService;
    private final BoundedCache<String, CachedPlayResult> playCache = new BoundedCache<>(512);

    private static class CachedPlayResult {
        final JsonNode result;
        final long timestamp;

        CachedPlayResult(JsonNode result) {
            this.result = result;
            this.timestamp = System.currentTimeMillis();
        }

        boolean isExpired() {
            return System.currentTimeMillis() - timestamp > PLAY_CACHE_TTL;
        }
    }

    public TvboxFacadeService(ConfigService configService,
                              HttpSourceService httpSourceService,
                              JarSpiderService jarSpiderService) {
        this.configService = configService;
        this.httpSourceService = httpSourceService;
        this.jarSpiderService = jarSpiderService;
    }

    public ConfigPayload load(String url) {
        return load(null, url);
    }

    public ConfigPayload load(String sessionId, String url) {
        return configService.loadConfig(sessionId, url);
    }

    public ConfigPayload getConfig() {
        return getConfig(null);
    }

    public ConfigPayload getConfig(String sessionId) {
        ConfigPayload payload = configService.getPayload(sessionId);
        if (payload == null) {
            throw new IllegalStateException("尚未加载配置，请先输入配置 URL");
        }
        return payload;
    }

    public SiteDefinition getSite(String key) {
        return getSite(null, key);
    }

    public SiteDefinition getSite(String sessionId, String key) {
        return configService.getSite(sessionId, key)
                .or(() -> getConfig(sessionId).getSites().stream()
                        .filter(site -> key.equals(site.getUid())
                                || key.equals(site.getKey())
                                || key.equals(site.getApi())
                                || key.equals(site.getName())
                                || key.equalsIgnoreCase(site.getApi()))
                        .findFirst())
                .orElseThrow(() -> new IllegalArgumentException("找不到站点: " + key));
    }

    public JsonNode home(String key, boolean filter) {
        return home(null, key, filter);
    }

    public JsonNode home(String sessionId, String key, boolean filter) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "FAC home 开始  key=" + key);
        SiteDefinition site = getSite(sessionId, key);
        DiagLog.step(log, "FAC home getSite完成  type=" + site.getType() + " api=" + site.getApi(), t0);
        if (site.getType() == 3) {
            DiagLog.step(log, "FAC home 走JAR爬虫路径", t0);
            JsonNode home;
            try {
                home = jarSpiderService.home(sessionId, site, filter);
                DiagLog.step(log, "FAC home jarSpiderService.home 返回", t0);
            } catch (Throwable ex) {
                home = JsonNodeFactory.instance.objectNode();
                DiagLog.step(log, "FAC home jarSpiderService.home 异常: " + ex.getMessage(), t0);
                // Guard spider NPE fallback: try HTTP direct
                if (hasApiUrl(site)) {
                    DiagLog.step(log, "FAC home JAR失败, 尝试HTTP直连回退", t0);
                    try {
                        JsonNode httpHome = httpSourceService.request(site, new LinkedHashMap<>());
                        if (isHomeUsable(httpHome)) {
                            DiagLog.step(log, "FAC home HTTP回退成功", t0);
                            return httpHome;
                        }
                    } catch (Throwable ignore) {
                    }
                }
            }
            if (isHomeUsable(home)) {
                DiagLog.step(log, "FAC home JAR结果可用, 直接返回", t0);
                return home;
            }
            DiagLog.step(log, "FAC home JAR结果不可用, 走category兜底", t0);
            ObjectNode fallbackHome = JsonNodeFactory.instance.objectNode();
            fallbackHome.set("class", defaultClasses());
            for (String tid : List.of("1", "2", "3", "4", "5", "6")) {
                try {
                    JsonNode category = jarSpiderService.category(sessionId, site, tid, "1", true, Map.of());
                    List<JsonNode> list = extractList(category);
                    if (!list.isEmpty()) {
                        ArrayNode arr = JsonNodeFactory.instance.arrayNode();
                        for (JsonNode item : list) {
                            arr.add(item);
                        }
                        fallbackHome.set("list", arr);
                        DiagLog.step(log, "FAC home category兜底成功 tid=" + tid, t0);
                        return fallbackHome;
                    }
                } catch (Throwable ignore) {
                }
            }
            // Final HTTP fallback for category too
            if (hasApiUrl(site)) {
                for (String tid : List.of("1", "2", "3", "4")) {
                    try {
                        Map<String, String> params = new LinkedHashMap<>();
                        params.put("ac", "videolist");
                        params.put("t", tid);
                        params.put("pg", "1");
                        JsonNode cat = httpSourceService.request(site, params);
                        List<JsonNode> list = extractList(cat);
                        if (!list.isEmpty()) {
                            ArrayNode arr = JsonNodeFactory.instance.arrayNode();
                            for (JsonNode item : list) arr.add(item);
                            fallbackHome.set("list", arr);
                            DiagLog.step(log, "FAC home HTTP category回退成功 tid=" + tid, t0);
                            return fallbackHome;
                        }
                    } catch (Throwable ignore) {}
                }
            }
            fallbackHome.set("list", JsonNodeFactory.instance.arrayNode());
            DiagLog.step(log, "FAC home 所有回退失败, 返回空", t0);
            return fallbackHome;
        }
        if (site.getType() == 4) {
            DiagLog.step(log, "FAC home 走HTTP type=4路径", t0);
            return httpSourceService.request(site, mapOf("ac", "detail", "filter", String.valueOf(filter)));
        }
        DiagLog.step(log, "FAC home 走HTTP默认路径", t0);
        return httpSourceService.request(site, new LinkedHashMap<>());
    }

    private boolean hasApiUrl(SiteDefinition site) {
        return StringUtils.hasText(site.getApi())
                && (site.getApi().startsWith("http://") || site.getApi().startsWith("https://"));
    }

    public JsonNode category(String key, String tid, String pg, boolean filter, Map<String, String> extend) {
        return category(null, key, tid, pg, filter, extend);
    }

    public JsonNode category(String sessionId, String key, String tid, String pg, boolean filter, Map<String, String> extend) {
        SiteDefinition site = getSite(sessionId, key);
        log.info("[CATEGORY] key={} type={} api={} tid={} pg={} filter={}", key, site.getType(), site.getApi(), tid, pg, filter);
        if (site.getType() == 3) {
            return jarSpiderService.category(sessionId, site, tid, pg, filter, extend);
        }
        Map<String, String> params = new LinkedHashMap<>();
        params.put("ac", site.getType() == 0 ? "videolist" : "detail");
        params.put("t", tid);
        params.put("pg", StringUtils.hasText(pg) ? pg : "1");
        if (extend != null) {
            params.putAll(extend);
        }
        log.info("[CATEGORY] HTTP request params={}", params);
        JsonNode result = httpSourceService.request(site, params);
        log.info("[CATEGORY] response keys={}", result.isObject() ? ((com.fasterxml.jackson.databind.node.ObjectNode) result).fieldNames() : "not-object");
        return result;
    }

    public JsonNode detail(String key, String id) {
        return detail(null, key, id);
    }

    public JsonNode detail(String sessionId, String key, String id) {
        SiteDefinition site = getSite(sessionId, key);
        if (site.getType() == 3) {
            return jarSpiderService.detail(sessionId, site, id);
        }
        return httpSourceService.request(site, mapOf("ac", site.getType() == 0 ? "videolist" : "detail", "ids", id));
    }

    public JsonNode search(String key, String wd, boolean quick) {
        return search(null, key, wd, quick);
    }

    public JsonNode search(String sessionId, String key, String wd, boolean quick) {
        SiteDefinition site = getSite(sessionId, key);
        if (site.getType() == 3) {
            return jarSpiderService.search(sessionId, site, wd, quick);
        }
        Map<String, String> params = new LinkedHashMap<>();
        params.put("wd", wd);
        params.put("ac", "detail");
        if (site.getType() == 4) {
            params.put("quick", String.valueOf(quick));
        }
        return httpSourceService.request(site, params);
    }

    public JsonNode searchAll(String wd, boolean quick) {
        return searchAll(null, wd, quick);
    }

    public void searchAllBackground(String sessionId, String wd, boolean quick,
                                     ProgressTrackerService.ProgressInfo progress) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "FAC searchAllBackground 多线程入口 wd=" + wd);
        ConfigPayload payload = getConfig(sessionId);

        List<SiteDefinition> searchable = payload.getSites().stream()
                .filter(s -> s != null && s.getSearchable() != 0)
                .toList();

        if (searchable.isEmpty()) {
            if (progress != null) progress.setDone(true);
            return;
        }

        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newFixedThreadPool(
                Math.min(searchable.size(), 6));
        JsonNodeFactory factory = JsonNodeFactory.instance;

        java.util.List<java.util.concurrent.CompletableFuture<Void>> futures = new java.util.ArrayList<>();

        for (SiteDefinition site : searchable) {
            futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                if (progress != null) progress.setCurrentSource(site.getName());
                try {
                    JsonNode response = search(sessionId, site.getUid(), wd, quick);
                    List<JsonNode> items = extractList(response);
                    synchronized (progress) {
                        for (JsonNode item : items) {
                            ObjectNode row = (item != null && item.isObject())
                                    ? ((ObjectNode) item).deepCopy()
                                    : factory.objectNode();
                            if (!item.isObject()) row.set("raw", item);
                            row.put("source_uid", site.getUid());
                            row.put("source_key", site.getApi());
                            row.put("source_name", site.getName());
                            row.put("source_type", site.getType());
                            progress.addResult(row);
                        }
                        progress.incrementCompleted();
                    }
                } catch (Throwable ex) {
                    synchronized (progress) {
                        ObjectNode err = factory.objectNode();
                        err.put("source_uid", site.getUid());
                        err.put("source_name", site.getName());
                        err.put("error", ex.getMessage() == null ? "unknown" : ex.getMessage());
                        progress.addResult(err);
                        progress.incrementCompleted();
                        progress.incrementFailed();
                    }
                }
            }, executor));
        }

        for (java.util.concurrent.CompletableFuture<Void> f : futures) {
            try {
                f.get(8, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                // timeout, skip
            }
        }
        executor.shutdown();

        int total = progress != null ? progress.getResults().size() : 0;
        DiagLog.step(log, "FAC searchAllBackground 完成 totalResults=" + total, t0);
    }

    public JsonNode searchAll(String sessionId, String wd, boolean quick) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "FAC searchAll 多线程入口 wd=" + wd);
        ConfigPayload payload = getConfig(sessionId);
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        ArrayNode list = root.putArray("list");
        ArrayNode errors = root.putArray("errors");

        List<SiteDefinition> searchable = payload.getSites().stream()
                .filter(s -> s != null && s.getSearchable() != 0)
                .toList();

        if (searchable.isEmpty()) {
            root.put("searched", 0);
            root.put("hits", 0);
            root.put("failed", 0);
            return root;
        }

        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newFixedThreadPool(
                Math.min(searchable.size(), 6));

        JsonNodeFactory factory = JsonNodeFactory.instance;
        java.util.List<java.util.concurrent.CompletableFuture<Void>> futures = new java.util.ArrayList<>();

        for (SiteDefinition site : searchable) {
            futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    JsonNode response = search(sessionId, site.getUid(), wd, quick);
                    List<JsonNode> items = extractList(response);
                    synchronized (list) {
                        for (JsonNode item : items) {
                            ObjectNode row = (item != null && item.isObject())
                                    ? ((ObjectNode) item).deepCopy()
                                    : factory.objectNode();
                            if (!item.isObject()) row.set("raw", item);
                            row.put("source_uid", site.getUid());
                            row.put("source_key", site.getApi());
                            row.put("source_name", site.getName());
                            row.put("source_type", site.getType());
                            list.add(row);
                        }
                    }
                } catch (Throwable ex) {
                    synchronized (errors) {
                        ObjectNode err = factory.objectNode();
                        err.put("source_uid", site.getUid());
                        err.put("source_key", site.getApi());
                        err.put("source_name", site.getName());
                        err.put("error", ex.getMessage() == null ? "unknown" : ex.getMessage());
                        errors.add(err);
                    }
                }
            }, executor));
        }

        for (java.util.concurrent.CompletableFuture<Void> f : futures) {
            try {
                f.get(8, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                // timeout, skip
            }
        }
        executor.shutdown();

        root.put("searched", searchable.size());
        root.put("hits", list.size());
        root.put("failed", errors.size());
        DiagLog.step(log, "FAC searchAll 完成 hits=" + list.size() + " failed=" + errors.size(), t0);
        return root;
    }

    public JsonNode play(String key, String flag, String id) {
        return play(null, key, flag, id);
    }

    public JsonNode play(String sessionId, String key, String flag, String id) {
        String cacheKey = key + "::" + flag + "::" + id;
        CachedPlayResult cached = playCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            log.info("[PLAY] cache hit for key={} flag={} id={}", key, flag, id);
            return cached.result;
        }

        SiteDefinition site = getSite(sessionId, key);
        String normalizedId = sanitizePlayableUrl(id);
        JsonNode result;
        if (site.getType() == 3) {
            List<String> vipFlags = getConfig(sessionId).getFlags();
            result = jarSpiderService.play(sessionId, site, flag, normalizedId, vipFlags);
        } else {
            JsonNode response = httpSourceService.request(site, mapOf("play", normalizedId, "flag", flag));
            ObjectNode node;
            if (response.isObject()) {
                node = (ObjectNode) response;
            } else {
                node = JsonNodeFactory.instance.objectNode();
                node.set("data", response);
            }
            if (!node.has("flag")) node.put("flag", flag);
            if (!node.has("key")) node.put("key", normalizedId);
            if (!node.has("url")) node.put("url", normalizedId);
            if (!node.has("parse")) node.put("parse", 1);
            if (!node.has("playUrl")) node.put("playUrl", site.getPlayUrl() == null ? "" : site.getPlayUrl());
            if (node.has("url") && node.get("url").isTextual()) {
                node.put("url", sanitizePlayableUrl(node.get("url").asText()));
            }
            result = node;
        }

        playCache.put(cacheKey, new CachedPlayResult(result));
        return result;
    }

    public Map<String, Object> health() {
        return health(null);
    }

    public Map<String, Object> health(String sessionId) {
        return configService.summary(sessionId);
    }

    private Map<String, String> mapOf(String... values) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < values.length - 1; i += 2) {
            map.put(values[i], values[i + 1]);
        }
        return map;
    }

    private List<JsonNode> extractList(JsonNode data) {
        if (data == null) {
            return List.of();
        }
        if (data.has("list") && data.get("list").isArray()) {
            return java.util.stream.StreamSupport.stream(data.get("list").spliterator(), false).toList();
        }
        if (data.has("data") && data.get("data").has("list") && data.get("data").get("list").isArray()) {
            return java.util.stream.StreamSupport.stream(data.get("data").get("list").spliterator(), false).toList();
        }
        if (data.has("videoList") && data.get("videoList").isArray()) {
            return java.util.stream.StreamSupport.stream(data.get("videoList").spliterator(), false).toList();
        }
        return List.of();
    }

    private boolean isHomeUsable(JsonNode node) {
        if (node == null || !node.isObject()) {
            return false;
        }
        boolean hasClass = node.has("class") && node.get("class").isArray() && node.get("class").size() > 0;
        boolean hasList = node.has("list") && node.get("list").isArray() && node.get("list").size() > 0;
        return hasClass || hasList;
    }

    private ArrayNode defaultClasses() {
        ArrayNode arr = JsonNodeFactory.instance.arrayNode();
        arr.add(classNode("1", "电影"));
        arr.add(classNode("2", "剧集"));
        arr.add(classNode("3", "综艺"));
        arr.add(classNode("4", "动漫"));
        return arr;
    }

    private ObjectNode classNode(String id, String name) {
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        node.put("type_id", id);
        node.put("type_name", name);
        return node;
    }

    private String sanitizePlayableUrl(String input) {
        if (!StringUtils.hasText(input)) {
            return input;
        }
        String url = input.trim();

        // Direct URL — return as-is
        if (startsWithPlayableScheme(url) && url.contains("/")) {
            return url;
        }

        // Split by TVBox separator characters and find the URL part
        String[] separators = {"@", ",", "，", "#", "|", ";", "~"};
        for (String sep : separators) {
            if (!url.contains(sep)) continue;
            String[] parts = url.split(Pattern.quote(sep));
            for (String part : parts) {
                String trimmed = part.trim();
                if (!trimmed.isEmpty() && startsWithPlayableScheme(trimmed) && trimmed.contains("/")) {
                    return trimmed;
                }
            }
        }

        return url;
    }

    private boolean startsWithPlayableScheme(String text) {
        String lower = text.toLowerCase();
        return lower.startsWith("http://")
                || lower.startsWith("https://")
                || lower.startsWith("rtmp://")
                || lower.startsWith("rtsp://")
                || lower.startsWith("ftp://")
                || lower.startsWith("magnet:")
                || lower.startsWith("thunder:")
                || lower.startsWith("ed2k://")
                || lower.startsWith("//");
    }
}
