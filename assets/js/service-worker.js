// service-worker.js

// Configuration
const PROXY_URL = 'https://proxy.thisanimus.com';
const CACHE_NAME = 'image-proxy-cache-v1';

// Install event - set up the service worker
self.addEventListener('install', (event) => {
	console.log('Service Worker: Installing...');
	self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('Service Worker: Activating...');
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
		})
	);
	return self.clients.claim();
});

// Fetch event - intercept and proxy image requests
self.addEventListener('fetch', (event) => {
	const request = event.request;

	console.log('here');

	// Check if this is an image request
	if (isImageRequest(request)) {
		event.respondWith(handleImageRequest(request));
	} else {
		// Pass through non-image requests
		event.respondWith(fetch(request));
	}
});

// Check if the request is for an image
function isImageRequest(request) {
	const url = new URL(request.url);
	const accept = request.headers.get('Accept') || '';

	// Check by Accept header
	if (accept.includes('image/')) {
		return true;
	}

	// Check by file extension
	const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
	return imageExtensions.some((ext) => url.pathname.toLowerCase().endsWith(ext));
}

// Handle image requests with proxy
async function handleImageRequest(request) {
	const url = new URL(request.url);

	// Skip if already going through proxy
	if (url.href.startsWith(PROXY_URL)) {
		return fetch(request);
	}

	// Create proxied URL
	const proxiedUrl = PROXY_URL + encodeURIComponent(url.href);

	console.log(`Proxying image: ${url.href} -> ${proxiedUrl}`);

	// Try cache first
	const cache = await caches.open(CACHE_NAME);
	const cachedResponse = await cache.match(proxiedUrl);

	if (cachedResponse) {
		console.log('Serving from cache:', proxiedUrl);
		return cachedResponse;
	}

	// Fetch through proxy
	try {
		const response = await fetch(proxiedUrl, {
			method: request.method,
			headers: request.headers,
			mode: 'cors',
			credentials: 'omit',
		});

		// Cache successful responses
		if (response.ok) {
			cache.put(proxiedUrl, response.clone());
		}

		return response;
	} catch (error) {
		console.error('Proxy fetch failed:', error);

		// Fallback to original URL if proxy fails
		return fetch(request);
	}
}

// Message handler for controlling the service worker
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'CLEAR_CACHE') {
		event.waitUntil(
			caches.delete(CACHE_NAME).then(() => {
				console.log('Cache cleared');
				event.ports[0].postMessage({ success: true });
			})
		);
	}
});
