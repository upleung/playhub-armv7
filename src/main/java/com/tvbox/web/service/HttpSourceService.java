package com.tvbox.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.tvbox.web.model.SiteDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

@Service
public class HttpSourceService {

    private static final Logger log = LoggerFactory.getLogger(HttpSourceService.class);
    private static final int MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public HttpSourceService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClientFactory.create(10);
    }

    public JsonNode request(SiteDefinition site, Map<String, String> params) {
        long t0 = System.currentTimeMillis();
        if (!StringUtils.hasText(site.getApi())) {
            throw new IllegalArgumentException("站点 api 为空");
        }
        URI uri = buildUri(site.getApi(), params);
        log.info("[HTTP] request uri={}", uri);
        byte[] body = doGet(uri);
        log.info("[HTTP] response bodySize={}", body != null ? body.length : 0);
        if (body != null && body.length > 0 && body.length < 500) {
            log.info("[HTTP] response body={}", new String(body, StandardCharsets.UTF_8));
        }
        try {
            JsonNode result = objectMapper.readTree(body);
            DiagLog.step(log, "HTTP readTree 完成", t0);
            return result;
        } catch (Exception ex) {
            ObjectNode node = objectMapper.createObjectNode();
            String text = body == null || body.length == 0 ? "" : new String(body, StandardCharsets.UTF_8);
            node.put("raw", text);
            node.put("format", text.startsWith("<") ? "xml" : "text");
            DiagLog.step(log, "HTTP readTree 异常(非JSON), 返回raw包装", t0);
            return node;
        }
    }

    private URI buildUri(String api, Map<String, String> params) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(api);
        if (params != null) {
            params.forEach((k, v) -> {
                if (StringUtils.hasText(k) && v != null) {
                    builder.queryParam(k, v);
                }
            });
        }
        return builder.build().encode().toUri();
    }

    private byte[] doGet(URI uri) {
        try {
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .header("User-Agent", "okhttp/3.15")
                    .header("Accept", "application/json,text/plain,*/*")
                    .timeout(Duration.ofSeconds(20))
                    .GET()
                    .build();
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                byte[] body = response.body();
                if (body != null && body.length > MAX_RESPONSE_BYTES) {
                    throw new IllegalStateException("远端响应过大: " + body.length + " bytes (max " + MAX_RESPONSE_BYTES + ")");
                }
                return body == null ? new byte[0] : body;
            }
            throw new IllegalStateException("远端请求失败, status=" + response.statusCode());
        } catch (Exception ex) {
            throw new IllegalStateException("远端请求失败: " + ex.getMessage(), ex);
        }
    }
}
