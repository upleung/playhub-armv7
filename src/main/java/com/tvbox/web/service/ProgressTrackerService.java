package com.tvbox.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class ProgressTrackerService {

    public static class ProgressInfo {
        private final int total;
        private volatile int completed;
        private volatile int failed;
        private volatile String currentSource;
        private volatile boolean done;
        private final List<JsonNode> results = new ArrayList<>();

        public ProgressInfo(int total) {
            this.total = total;
            this.completed = 0;
            this.failed = 0;
            this.currentSource = "";
            this.done = false;
        }

        public synchronized int getTotal() { return total; }
        public synchronized int getCompleted() { return completed; }
        public synchronized int getFailed() { return failed; }
        public synchronized String getCurrentSource() { return currentSource; }
        public synchronized boolean isDone() { return done; }
        public synchronized List<JsonNode> getResults() { return new ArrayList<>(results); }

        public synchronized void incrementCompleted() { this.completed++; }
        public synchronized void incrementFailed() { this.failed++; }
        public synchronized void setCurrentSource(String source) { this.currentSource = source; }
        public synchronized void setDone(boolean done) { this.done = done; }
        public synchronized void addResult(JsonNode result) { this.results.add(result); }
    }

    private final ConcurrentMap<String, ProgressInfo> progressMap = new ConcurrentHashMap<>();

    public String createProgress(int total) {
        String id = System.currentTimeMillis() + "-" + (int)(Math.random() * 1000);
        progressMap.put(id, new ProgressInfo(total));
        return id;
    }

    public ProgressInfo getProgress(String id) {
        return progressMap.get(id);
    }

    public void removeProgress(String id) {
        progressMap.remove(id);
    }
}
