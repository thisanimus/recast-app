package main

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func main() {
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Follow up to 10 redirects
			if len(via) >= 10 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Extract target URL from query parameter
		targetURL := r.URL.Query().Get("url")
		if targetURL == "" {
			http.Error(w, "Missing 'url' query parameter", http.StatusBadRequest)
			return
		}

		// Validate URL
		parsed, err := url.Parse(targetURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			http.Error(w, "Invalid URL", http.StatusBadRequest)
			return
		}

		// Create new request
		proxyReq, err := http.NewRequest(r.Method, targetURL, r.Body)
		if err != nil {
			http.Error(w, "Failed to create request", http.StatusInternalServerError)
			return
		}

		// Copy relevant headers (skip Host and connection-related headers)
		for k, v := range r.Header {
			if !isHopByHopHeader(k) && k != "Host" {
				proxyReq.Header[k] = v
			}
		}

		// Make request
		resp, err := client.Do(proxyReq)
		if err != nil {
			http.Error(w, "Failed to fetch URL: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		w.Header().Set("Access-Control-Expose-Headers", "*")

		// Handle preflight
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Copy response headers (skip hop-by-hop headers)
		for k, v := range resp.Header {
			if !isHopByHopHeader(k) {
				w.Header()[k] = v
			}
		}

		// Write status and body
		w.WriteHeader(resp.StatusCode)
		
		// Stream response with larger buffer for better performance
		buf := make([]byte, 128*1024) // 128KB buffer
		io.CopyBuffer(w, resp.Body, buf)
		
		// Flush to ensure data is sent immediately
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
	})

	log.Println("CORS proxy listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func isHopByHopHeader(header string) bool {
	hopByHop := []string{
		"Connection",
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Te",
		"Trailers",
		"Transfer-Encoding",
		"Upgrade",
	}
	header = strings.ToLower(header)
	for _, h := range hopByHop {
		if strings.ToLower(h) == header {
			return true
		}
	}
	return false
}