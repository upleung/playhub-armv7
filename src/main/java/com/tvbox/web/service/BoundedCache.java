package com.tvbox.web.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.function.BiConsumer;

/**
 * Thread-safe bounded LRU cache with eviction callback.
 */
final class BoundedCache<K, V> {
    private final int maxSize;
    private final LinkedHashMap<K, V> map;
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    private final BiConsumer<K, V> evictionHook;

    BoundedCache(int maxSize) {
        this(maxSize, null);
    }

    BoundedCache(int maxSize, BiConsumer<K, V> evictionHook) {
        this.maxSize = Math.max(1, maxSize);
        this.evictionHook = evictionHook;
        this.map = new LinkedHashMap<>(this.maxSize, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                if (size() <= BoundedCache.this.maxSize) {
                    return false;
                }
                if (BoundedCache.this.evictionHook != null && eldest != null) {
                    try {
                        BoundedCache.this.evictionHook.accept(eldest.getKey(), eldest.getValue());
                    } catch (Exception ignore) {
                    }
                }
                return true;
            }
        };
    }

    V get(K key) {
        lock.readLock().lock();
        try {
            return map.get(key);
        } finally {
            lock.readLock().unlock();
        }
    }

    V getOrDefault(K key, V defaultValue) {
        lock.readLock().lock();
        try {
            return map.getOrDefault(key, defaultValue);
        } finally {
            lock.readLock().unlock();
        }
    }

    V computeIfAbsent(K key, java.util.function.Function<? super K, ? extends V> mappingFunction) {
        lock.writeLock().lock();
        try {
            V existing = map.get(key);
            if (existing != null) {
                return existing;
            }
            V value = mappingFunction.apply(key);
            if (value != null) {
                map.put(key, value);
            }
            return value;
        } finally {
            lock.writeLock().unlock();
        }
    }

    V put(K key, V value) {
        lock.writeLock().lock();
        try {
            return map.put(key, value);
        } finally {
            lock.writeLock().unlock();
        }
    }

    int size() {
        lock.readLock().lock();
        try {
            return map.size();
        } finally {
            lock.readLock().unlock();
        }
    }

    void clear() {
        lock.writeLock().lock();
        try {
            if (evictionHook != null) {
                for (Map.Entry<K, V> entry : map.entrySet()) {
                    try {
                        evictionHook.accept(entry.getKey(), entry.getValue());
                    } catch (Exception ignore) {
                    }
                }
            }
            map.clear();
        } finally {
            lock.writeLock().unlock();
        }
    }
}
