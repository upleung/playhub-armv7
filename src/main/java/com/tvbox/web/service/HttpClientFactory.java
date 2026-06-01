package com.tvbox.web.service;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.http.HttpClient;
import java.security.cert.X509Certificate;
import java.time.Duration;

/**
 * Shared HttpClient factory that creates clients trusting all TLS certificates.
 * Many TVBox config sources use free/short-lived CAs that may not be in the
 * JVM's default cacerts trust store, causing SSLHandshakeException on some servers.
 */
public final class HttpClientFactory {

    private static final SSLContext TRUST_ALL_SSL = createTrustAllSslContext();

    private HttpClientFactory() {
    }

    public static SSLContext sslContext() {
        return TRUST_ALL_SSL;
    }

    public static HttpClient create(int connectTimeoutSeconds) {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(connectTimeoutSeconds))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .sslContext(TRUST_ALL_SSL)
                .build();
    }

    private static SSLContext createTrustAllSslContext() {
        try {
            TrustManager[] trustAll = new TrustManager[]{
                    new X509TrustManager() {
                        public X509Certificate[] getAcceptedIssuers() {
                            return new X509Certificate[0];
                        }

                        public void checkClientTrusted(X509Certificate[] certs, String authType) {
                        }

                        public void checkServerTrusted(X509Certificate[] certs, String authType) {
                        }
                    }
            };
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, trustAll, null);
            return ctx;
        } catch (Exception ex) {
            // Fallback: return default SSLContext if custom init fails
            try {
                return SSLContext.getDefault();
            } catch (Exception e) {
                throw new IllegalStateException("Failed to initialize SSLContext", e);
            }
        }
    }
}
