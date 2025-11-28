// service-worker.js
const CACHE_VERSION = 'v0.018';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const AUDIO_CACHE = `audio`;
const PROXY_PREFIX = 'https://proxy.thisanimus.com/?url=';

// Add your local files here
// generate this with find "$(pwd)" -type f
const STATIC_FILES = [
	'/index.html',
	'/manifest.json',
	'/assets/css/style.css',
	'/assets/css/global/_typography.css',
	'/assets/css/global/_color-mode-auto.css',
	'/assets/css/global/_forms.css',
	'/assets/css/global/_media.css',
	'/assets/css/global/_range.css',
	'/assets/css/global/_base.css',
	'/assets/css/global/_buttons.css',
	'/assets/js/icons.js',
	'/assets/js/onSwipe.js',
	'/assets/js/db.js',
	'/assets/js/index.js',
	'/assets/js/podcast.js',
	'/assets/js/utilities.js',
	'/assets/js/shared.js',
	'/assets/js/settings.js',
	'/assets/img/default-episode-image.webp',
	'/assets/img/screenshot.psd',
	'/assets/img/screenshot-2.png',
	'/assets/img/screenshot-3.png',
	'/assets/img/screenshot-1.png',
	'/assets/components/play-pause.css',
	'/assets/components/router-nav.css',
	'/assets/components/network-status.js',
	'/assets/components/download-button.css',
	'/assets/components/episode-player.css',
	'/assets/components/router-nav.js',
	'/assets/components/router-view.css',
	'/assets/components/router-layout.css',
	'/assets/components/episode-player.js',
	'/assets/components/podcast-episode.css',
	'/assets/components/router-view.js',
	'/assets/components/router-layout.js',
	'/assets/components/podcast-episode.js',
	'/assets/components/download-button.js',
	'/assets/components/play-pause.js',
	'/assets/appicon/icon-192x192.png',
	'/assets/appicon/icon.png',
	'/assets/appicon/apple-touch-icon.png',
	'/assets/appicon/icon.svg',
	'/assets/appicon/icon.ico',
	'/assets/appicon/icon-512x512-maskable.png',
	'/assets/appicon/icon-512x512.png',
	'/assets/appicon/icon-maskable.svg',
	'/assets/views/podcast-single.css',
	'/assets/views/podcast-search.js',
	'/assets/views/podcast-index.css',
	'/assets/views/podcast-index.js',
	'/assets/views/podcast-single.js',
];

self.addEventListener('install', (event) => {
	console.log('Service Worker installing...');

	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then((cache) => {
				console.log('Caching static files');
				return cache.addAll(STATIC_FILES);
			})
			.then(() => self.skipWaiting())
	);
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('Service Worker activating...');

	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames
						.filter((name) => {
							// Delete old versions of caches
							return (
								(name.startsWith('static-') && name !== STATIC_CACHE) ||
								(name.startsWith('images-') && name !== IMAGE_CACHE) ||
								(name.startsWith('audio') && name !== AUDIO_CACHE)
							);
						})
						.map((name) => caches.delete(name))
				);
			})
			.then(() => self.clients.claim())
	);
});

// ------------------------------------------------------------
// FETCH EVENT: Cache all remote images
// ------------------------------------------------------------

/**
 * Intercepts all fetch requests.
 * If the request is an image request to an http/https URL:
 *   → Try returning from cache
 *   → If not in cache, fetch from network and store it
 *
 * All other requests pass through untouched.
 */
self.addEventListener('fetch', (event) => {
	const request = event.request;

	// Only intercept http(s) requests
	if (!request.url.startsWith('http')) return;

	// Heuristics to check if it's an image request
	if (isImageRequest(request)) {
		event.respondWith(cacheImage(request));
	}
});

// ------------------------------------------------------------
// IMAGE HANDLING HELPERS
// ------------------------------------------------------------

/**
 * Cache-first strategy for images.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheImage(request) {
	const cache = await caches.open(IMAGE_CACHE);

	// Try to serve from cache
	const cached = await cache.match(request);
	if (cached) return cached;

	// Fetch from network
	try {
		const response = await fetch(request);

		// Only cache valid, opaque-safe responses
		if (response && response.ok) {
			cache.put(request, response.clone());
		}

		return response;
	} catch (err) {
		// Network failed – return placeholder or fallback?
		// For now, just fail through:
		return new Response('Network error', { status: 408 });
	}
}

/**
 * Determines if a fetch request is for an image.
 *
 * Checks:
 *   • request.destination === 'image'
 *   • OR URL ends with common image extensions
 *   • OR Accept header contains image/*
 *
 * @param {Request} request
 * @returns {boolean}
 */
function isImageRequest(request) {
	// Best indicator — browsers mark fetch destination
	if (request.destination === 'image') return true;

	const url = request.url.toLowerCase();

	// Common extensions
	const imgExt = /\.(png|jpg|jpeg|gif|webp|avif|svg|bmp|ico)$/;
	if (imgExt.test(url)) return true;

	// Check Accept header
	const accept = request.headers.get('Accept');
	if (accept && accept.includes('image/')) return true;

	return false;
}

// ------------------------------------------------------------
// MESSAGE HANDLER
// ------------------------------------------------------------
self.addEventListener('message', (event) => {
	const { type, url } = event.data || {};
	const port = event.ports[0];

	if (!type || !port) return;

	switch (type) {
		case 'CACHE_AUDIO':
			cacheAudioFile(url, port);
			break;

		case 'DELETE_AUDIO':
			deleteAudioFile(url, port);
			break;

		case 'CHECK_AUDIO':
			checkAudioFile(url, port);
			break;
	}
});

// ------------------------------------------------------------
// CACHE AUDIO (with fallback proxy)
// ------------------------------------------------------------
/**
 * @param {string} url
 * @param {MessagePort} port
 */
async function cacheAudioFile(url, port) {
	try {
		const cache = await caches.open(AUDIO_CACHE);
		let response;

		try {
			// Try direct fetch first
			response = await fetch(url);

			// If fetch succeeds but returns HTTP error, try proxy
			if (!response.ok) {
				console.log(`Direct fetch returned ${response.status}, trying proxy...`);
				const proxyUrl = PROXY_PREFIX + encodeURIComponent(url);
				response = await fetch(proxyUrl);
			}
		} catch (fetchError) {
			// CORS errors or network failures end up here
			console.log('Direct fetch failed (likely CORS), trying proxy...', fetchError.message);
			const proxyUrl = PROXY_PREFIX + url;
			response = await fetch(proxyUrl);
		}

		if (response && response.ok) {
			await cache.put(url, response.clone());
			port.postMessage({ type: 'CACHE_AUDIO_RESULT', ok: true, url });
		} else {
			port.postMessage({
				type: 'CACHE_AUDIO_RESULT',
				ok: false,
				url,
				error: `Fetch failed with status ${response?.status || 'unknown'}`,
			});
		}
	} catch (err) {
		// This catches errors from the proxy fetch or cache operations
		port.postMessage({ type: 'CACHE_AUDIO_RESULT', ok: false, url, error: err.message });
	}
}

/**
 * Deletes an audio file from the AUDIO_CACHE.
 * Sends a structured response back over the MessagePort.
 *
 * @param {string} url
 * @param {MessagePort} port
 */
async function deleteAudioFile(url, port) {
	try {
		const cache = await caches.open(AUDIO_CACHE);
		const deleted = await cache.delete(url);

		port.postMessage({
			type: 'DELETE_AUDIO_RESULT',
			ok: deleted,
			url,
		});
	} catch (err) {
		port.postMessage({
			type: 'DELETE_AUDIO_RESULT',
			ok: false,
			url,
			error: err.message,
		});
	}
}

/**
 * Deletes an audio file from the AUDIO_CACHE.
 * Sends a structured response back over the MessagePort.
 *
 * @param {string} url
 * @param {MessagePort} port
 */
async function checkAudioFile(url, port) {
	try {
		const cache = await caches.open(AUDIO_CACHE);
		const match = await cache.match(url);
		port.postMessage({
			type: 'CHECK_AUDIO_RESULT',
			ok: true,
			cached: !!match,
			url,
		});
	} catch (err) {
		port.postMessage({
			type: 'CHECK_AUDIO_RESULT',
			ok: false,
			error: err.message,
			url,
		});
	}
}
