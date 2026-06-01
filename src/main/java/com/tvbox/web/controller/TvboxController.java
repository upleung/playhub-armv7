package com.tvbox.web.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.tvbox.web.model.ConfigPayload;
import com.tvbox.web.model.SiteDefinition;
import com.tvbox.web.model.request.CategoryRequest;
import com.tvbox.web.model.request.LoadConfigRequest;
import com.tvbox.web.service.DiagLog;
import com.tvbox.web.service.ProgressTrackerService;
import com.tvbox.web.service.TvboxFacadeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
@Validated
public class TvboxController {

    private static final Logger log = LoggerFactory.getLogger(TvboxController.class);
    private final TvboxFacadeService facadeService;
    private final ProgressTrackerService progressTracker;

    public TvboxController(TvboxFacadeService facadeService, ProgressTrackerService progressTracker) {
        this.facadeService = facadeService;
        this.progressTracker = progressTracker;
    }

    @PostMapping("/config/load")
    public Map<String, Object> loadConfig(HttpSession session,
                                          @Valid @RequestBody LoadConfigRequest request) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "CTL config/load 入口  url=" + request.getUrl());
        String sessionId = session.getId();
        ConfigPayload payload = facadeService.load(sessionId, request.getUrl());
        DiagLog.step(log, "CTL config/load facadeService.load 返回", t0);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("ok", true);
        data.put("summary", facadeService.health(sessionId));
        data.put("config", stripConfig(payload));
        DiagLog.step(log, "CTL config/load stripConfig 完成, 即将返回", t0);
        return data;
    }

    private Map<String, Object> stripConfig(ConfigPayload payload) {
        Map<String, Object> slim = new LinkedHashMap<>();
        slim.put("spider", payload.getSpider());
        slim.put("wallpaper", payload.getWallpaper());
        slim.put("sites", payload.getSites() != null ? payload.getSites() : new ArrayList<>());
        slim.put("parses", payload.getParses() != null ? new ArrayList<>(payload.getParses().stream().limit(20).toList()) : new ArrayList<>());
        slim.put("flags", payload.getFlags() != null ? payload.getFlags() : new ArrayList<>());
        slim.put("liveCount", payload.getLives() != null ? payload.getLives().size() : 0);
        slim.put("ruleCount", payload.getRules() != null ? payload.getRules().size() : 0);
        return slim;
    }

    @GetMapping("/config")
    public Map<String, Object> getConfig(HttpSession session) {
        return stripConfig(facadeService.getConfig(session.getId()));
    }

    @GetMapping("/health")
    public Map<String, Object> health(HttpSession session) {
        return facadeService.health(session.getId());
    }

    @GetMapping("/source/{key}/home")
    public JsonNode home(HttpSession session,
                         @PathVariable String key,
                         @RequestParam(defaultValue = "true") boolean filter) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "CTL home 入口  key=" + key + " filter=" + filter);
        JsonNode result = facadeService.home(session.getId(), key, filter);
        DiagLog.step(log, "CTL home facadeService.home 返回, 即将序列化响应", t0);
        return result;
    }

    @PostMapping("/source/{key}/category")
    public JsonNode category(HttpSession session,
                             @PathVariable String key,
                             @RequestBody(required = false) CategoryRequest request) {
        long t0 = System.currentTimeMillis();
        CategoryRequest req = request == null ? new CategoryRequest() : request;
        DiagLog.step(log, "CTL category 入口  key=" + key + " tid=" + req.getTid());
        JsonNode result = facadeService.category(session.getId(), key, req.getTid(), req.getPg(), req.isFilter(), req.getExtend());
        DiagLog.step(log, "CTL category 返回", t0);
        return result;
    }

    @GetMapping("/source/{key}/detail")
    public JsonNode detail(HttpSession session,
                           @PathVariable String key,
                           @RequestParam String id) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "CTL detail 入口  key=" + key + " id=" + id);
        JsonNode result = facadeService.detail(session.getId(), key, id);
        DiagLog.step(log, "CTL detail 返回", t0);
        return result;
    }

    @GetMapping("/source/{key}/search")
    public JsonNode search(HttpSession session,
                           @PathVariable String key,
                           @RequestParam String wd,
                           @RequestParam(defaultValue = "false") boolean quick) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "CTL search 入口  key=" + key + " wd=" + wd);
        JsonNode result = facadeService.search(session.getId(), key, wd, quick);
        DiagLog.step(log, "CTL search 返回", t0);
        return result;
    }

    @GetMapping("/search/all")
    public JsonNode searchAll(HttpSession session,
                              @RequestParam String wd,
                              @RequestParam(defaultValue = "false") boolean quick) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "CTL searchAll 入口  wd=" + wd);

        String sessionId = session.getId();
        ConfigPayload payload = facadeService.getConfig(sessionId);
        java.util.List<SiteDefinition> searchable = payload.getSites().stream()
                .filter(s -> s != null && s.getSearchable() != 0)
                .toList();

        String progressId = progressTracker.createProgress(searchable.size());
        ProgressTrackerService.ProgressInfo progress = progressTracker.getProgress(progressId);

        // Process in background
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            facadeService.searchAllBackground(sessionId, wd, quick, progress);
            if (progress != null) progress.setDone(true);
            DiagLog.step(log, "CTL searchAll 后台完成 progressId=" + progressId);
        });

        com.fasterxml.jackson.databind.node.ObjectNode response = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        response.put("progressId", progressId);
        DiagLog.step(log, "CTL searchAll 返回 progressId=" + progressId, t0);
        return response;
    }

    @GetMapping("/source/{key}/play")
    public JsonNode play(HttpSession session,
                         @PathVariable String key,
                         @RequestParam String flag,
                         @RequestParam String id) {
        long t0 = System.currentTimeMillis();
        DiagLog.step(log, "CTL play 入口  key=" + key + " flag=" + flag);
        JsonNode result = facadeService.play(session.getId(), key, flag, id);
        DiagLog.step(log, "CTL play 返回", t0);
        return result;
    }

    @PostMapping("/batch/detail")
    public JsonNode batchDetail(HttpSession session,
                                @RequestBody JsonNode request) {
        DiagLog.step(log, "CTL batch/detail 入口");
        com.fasterxml.jackson.databind.node.ArrayNode items = (com.fasterxml.jackson.databind.node.ArrayNode) request.get("items");

        if (items == null || items.isEmpty()) {
            com.fasterxml.jackson.databind.node.ObjectNode response = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            response.putArray("results");
            return response;
        }

        String sessionId = session.getId();
        String progressId = progressTracker.createProgress(items.size());
        ProgressTrackerService.ProgressInfo progress = progressTracker.getProgress(progressId);

        // Process in background thread
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newFixedThreadPool(
                    Math.min(items.size(), 6));
            java.util.List<java.util.concurrent.CompletableFuture<JsonNode>> futures = new java.util.ArrayList<>();

            for (JsonNode item : items) {
                String key = item.has("key") ? item.get("key").asText() : "";
                String id = item.has("id") ? item.get("id").asText() : "";
                futures.add(java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                    if (progress != null) progress.setCurrentSource(key);
                    try {
                        JsonNode detail = facadeService.detail(sessionId, key, id);
                        com.fasterxml.jackson.databind.node.ObjectNode resultNode =
                                com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                        resultNode.put("key", key);
                        resultNode.put("id", id);
                        resultNode.set("detail", detail);
                        if (progress != null) {
                            progress.addResult(resultNode);
                            progress.incrementCompleted();
                        }
                        return resultNode;
                    } catch (Exception e) {
                        com.fasterxml.jackson.databind.node.ObjectNode errNode =
                                com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                        errNode.put("key", key);
                        errNode.put("id", id);
                        errNode.putNull("detail");
                        errNode.put("error", e.getMessage());
                        if (progress != null) {
                            progress.addResult(errNode);
                            progress.incrementCompleted();
                            progress.incrementFailed();
                        }
                        return errNode;
                    }
                }, executor));
            }

            // Wait for all to complete
            for (java.util.concurrent.CompletableFuture<JsonNode> f : futures) {
                try {
                    f.get(10, java.util.concurrent.TimeUnit.SECONDS);
                } catch (Exception ignored) {}
            }
            executor.shutdown();

            if (progress != null) {
                progress.setDone(true);
            }
            DiagLog.step(log, "CTL batch/detail 后台处理完成 progressId=" + progressId);
        });

        // Return progressId immediately
        com.fasterxml.jackson.databind.node.ObjectNode response = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        response.put("progressId", progressId);
        DiagLog.step(log, "CTL batch/detail 返回 progressId=" + progressId);
        return response;
    }

    @GetMapping("/progress/{id}")
    public JsonNode getProgress(@PathVariable String id) {
        ProgressTrackerService.ProgressInfo progress = progressTracker.getProgress(id);
        com.fasterxml.jackson.databind.node.ObjectNode result = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        if (progress == null) {
            result.put("found", false);
        } else {
            result.put("found", true);
            result.put("total", progress.getTotal());
            result.put("completed", progress.getCompleted());
            result.put("failed", progress.getFailed());
            result.put("currentSource", progress.getCurrentSource());
            result.put("done", progress.isDone());
            if (progress.isDone() && !progress.getResults().isEmpty()) {
                result.set("results", com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode().addAll(progress.getResults()));
                progressTracker.removeProgress(id);
            }
        }
        return result;
    }
}
