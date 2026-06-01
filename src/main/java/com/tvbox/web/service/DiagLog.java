package com.tvbox.web.service;

import org.slf4j.Logger;

/**
 * Diagnostic memory-tracking logger for identifying memory spike sources.
 */
public final class DiagLog {
    private DiagLog() {}

    public static void step(Logger log, String label) {
        Runtime rt = Runtime.getRuntime();
        long used = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
        long heap = rt.totalMemory() / (1024 * 1024);
        long max = rt.maxMemory() / (1024 * 1024);
        log.debug("[DIAG] {} | heapUsed={}MB heapCommitted={}MB heapMax={}MB", label, used, heap, max);
    }

    public static void step(Logger log, String label, long startMs) {
        Runtime rt = Runtime.getRuntime();
        long used = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
        long heap = rt.totalMemory() / (1024 * 1024);
        long max = rt.maxMemory() / (1024 * 1024);
        long elapsed = System.currentTimeMillis() - startMs;
        log.debug("[DIAG] {} | elapsed={}ms heapUsed={}MB heapCommitted={}MB heapMax={}MB",
                label, elapsed, used, heap, max);
    }
}
