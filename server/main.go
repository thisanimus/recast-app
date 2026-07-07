// Command proxy is a small, high-concurrency CORS proxy.
//
// It exposes a single endpoint, GET /?url=<target>, that fetches <target>
// server-side and streams the response back with permissive CORS headers,
// letting a browser reach feeds and audio that would otherwise be blocked by
// the same-origin policy or missing Access-Control-* headers.
//
// Design goals:
//   - Concurrency: net/http serves each request on its own goroutine over a
//     single shared, tuned Transport (keep-alive pooling + HTTP/2). Bodies are
//     streamed, never buffered whole, so memory stays flat under load and large
//     audio files cost only one pooled 64KB buffer each.
//   - Robustness: browser-like request headers, transparent redirect following,
//     Range pass-through for audio seeking, and no total-request timeout that
//     would truncate long downloads.
//   - Safety: an SSRF guard rejects private/loopback/link-local targets (pinned
//     at dial time to defeat DNS rebinding), since this is a public endpoint.
package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// Presented upstream when the client sends no User-Agent. Some CDNs and feed
// hosts reject Go's default "Go-http-client/1.1", so we look like a browser.
const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
	"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// Client request headers we forward upstream. Everything else — notably Origin,
// Referer, Cookie and Sec-Fetch-* — is dropped: forwarding them is what trips
// anti-hotlink and bot rules, the opposite of what we want. Range and the
// conditional headers matter for audio seeking and cheap feed revalidation.
var forwardedRequestHeaders = []string{
	"Accept",
	"Accept-Language",
	"Accept-Encoding", // forwarded so Transport streams the body verbatim (no proxy-side gunzip); the browser decodes it
	"Range",
	"If-None-Match",
	"If-Modified-Since",
}

// Hop-by-hop headers must not be forwarded in either direction (RFC 7230 §6.1).
var hopByHopHeaders = map[string]struct{}{
	"connection":          {},
	"keep-alive":          {},
	"proxy-authenticate":  {},
	"proxy-authorization": {},
	"te":                  {},
	"trailer":             {},
	"transfer-encoding":   {},
	"upgrade":             {},
}

// allowPrivate disables the SSRF guard (set ALLOW_PRIVATE=1 for local dev).
var allowPrivate = os.Getenv("ALLOW_PRIVATE") == "1"

// One shared client for the whole process. The tuned Transport pools
// connections across all goroutines; a bounded ResponseHeaderTimeout caps
// time-to-first-byte without limiting how long a body may stream.
var client = &http.Client{
	Transport: &http.Transport{
		DialContext:           safeDialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          256,
		MaxIdleConnsPerHost:   16,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("stopped after 10 redirects")
		}
		return nil // redirects reuse the same Transport, so safeDialContext guards them too
	},
}

// bufPool backs io.CopyBuffer so steady-state streaming allocates nothing.
var bufPool = newBufferPool(64 * 1024)

func main() {
	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}

	srv := &http.Server{
		Addr:    addr,
		Handler: http.HandlerFunc(handleProxy),
		// Bound the header read (Slowloris protection) but leave ReadTimeout and
		// WriteTimeout at 0: large audio downloads legitimately take minutes, and
		// a write deadline would sever them mid-stream. Idle keep-alives are
		// reaped instead.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Graceful shutdown: stop accepting, let in-flight streams drain.
	go func() {
		log.Printf("CORS proxy listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func handleProxy(w http.ResponseWriter, r *http.Request) {
	setCORS(w, r)

	// Preflight: answer locally, never touch upstream.
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	target := r.URL.Query().Get("url")
	if target == "" {
		http.Error(w, "missing 'url' query parameter", http.StatusBadRequest)
		return
	}
	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		http.Error(w, "invalid target URL", http.StatusBadRequest)
		return
	}

	// Tie the upstream request to the client's context: if the browser cancels
	// (seeks away, closes the tab), the upstream fetch is cancelled too.
	upstream, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	applyRequestHeaders(upstream, r)

	resp, err := client.Do(upstream)
	if err != nil {
		// Client-cancelled requests are normal, not gateway failures.
		if errors.Is(err, context.Canceled) {
			return
		}
		http.Error(w, "upstream fetch failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	copyResponseHeaders(w, resp)
	w.WriteHeader(resp.StatusCode)

	buf := bufPool.get()
	defer bufPool.put(buf)
	io.CopyBuffer(w, resp.Body, buf) // streams; errors here mean the client hung up
}

// applyRequestHeaders builds a controlled, browser-like header set rather than
// blindly forwarding the client's, which keeps the app's Origin/Referer out of
// the upstream request.
func applyRequestHeaders(upstream, r *http.Request) {
	for _, h := range forwardedRequestHeaders {
		if v := r.Header.Get(h); v != "" {
			upstream.Header.Set(h, v)
		}
	}
	if upstream.Header.Get("User-Agent") == "" {
		upstream.Header.Set("User-Agent", defaultUserAgent)
	}
	if upstream.Header.Get("Accept") == "" {
		upstream.Header.Set("Accept", "*/*")
	}
}

// copyResponseHeaders forwards upstream headers minus hop-by-hop entries, and
// deliberately drops any upstream Access-Control-* so our own CORS headers
// (already set) win instead of a restrictive origin the target might send.
func copyResponseHeaders(w http.ResponseWriter, resp *http.Response) {
	dst := w.Header()
	for k, vv := range resp.Header {
		lk := strings.ToLower(k)
		if _, hop := hopByHopHeaders[lk]; hop {
			continue
		}
		if strings.HasPrefix(lk, "access-control-") {
			continue
		}
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

func setCORS(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
	// Echo requested headers so non-safelisted ones (e.g. Range on preflight)
	// are always permitted; fall back to a wildcard.
	if reqHeaders := r.Header.Get("Access-Control-Request-Headers"); reqHeaders != "" {
		h.Set("Access-Control-Allow-Headers", reqHeaders)
	} else {
		h.Set("Access-Control-Allow-Headers", "*")
	}
	// Expose the headers a media element and cache logic need to read.
	h.Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag, Last-Modified")
	h.Set("Access-Control-Max-Age", "86400")
}

// safeDialContext resolves the host, rejects any private/loopback/link-local
// address, and then dials the specific validated IP so a rebind between resolve
// and connect cannot slip through.
func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	if allowPrivate {
		return dialer.DialContext(ctx, network, addr)
	}

	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	var lastErr error
	for _, ip := range ips {
		if isDisallowedIP(ip.IP) {
			lastErr = errors.New("blocked address: " + ip.IP.String())
			continue
		}
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("no address resolved for " + host)
	}
	return nil, lastErr
}

func isDisallowedIP(ip net.IP) bool {
	return ip.IsLoopback() ||
		ip.IsPrivate() || // RFC 1918 + ULA
		ip.IsLinkLocalUnicast() || // 169.254.0.0/16 covers cloud metadata (169.254.169.254)
		ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified()
}
