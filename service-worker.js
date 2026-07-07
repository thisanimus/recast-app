// Add your local files here
import { AUDIO_CACHE, IMAGE_CACHE, PROXY_PREFIX } from './assets/js/shared.js';
import { proxyFetch } from './assets/js/utilities.js';

const APP_VERSION = 'v0.028';
const STATIC_CACHE = `static-${APP_VERSION}`;
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
	'/assets/js/index.js',
	'/assets/js/podcast.js',
	'/assets/js/utilities.js',
	'/assets/js/shared.js',
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
	'/assets/data/db.js',
	'/assets/data/settings.js',
	'/assets/views/view-settings.js',
	'/assets/views/view-index.js',
	'/assets/views/view-add.js',
	'/assets/views/view-single.js',
	'/assets/views/view-single.css',
	'/assets/views/view-index.css',
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
			.then(() => self.skipWaiting()),
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
								(name.startsWith('images') && name !== IMAGE_CACHE) ||
								(name.startsWith('audio') && name !== AUDIO_CACHE)
							);
						})
						.map((name) => caches.delete(name)),
				);
			})
			.then(() => self.clients.claim()),
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

	// Let requests to the proxy pass straight through. proxyFetch() (used in
	// cacheImage) hits PROXY_PREFIX, and those URLs end in the encoded image
	// URL (e.g. ".jpg"), which would otherwise re-trigger isImageRequest and
	// re-enter cacheImage, double-caching under a second key.
	if (request.url.startsWith(PROXY_PREFIX)) return;

	// Heuristics to check if it's an image request
	if (isImageRequest(request)) {
		event.respondWith(cacheImage(request));
		return;
	}

	// Audio: serve a manually-cached copy if one exists, otherwise go to
	// network. Never populate the cache here — only files explicitly
	// downloaded via CACHE_AUDIO should ever live in AUDIO_CACHE.
	if (isAudioRequest(request)) {
		event.respondWith(audioCacheFirst(request));
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

	// Fetch from network via proxyFetch: it tries a direct CORS fetch first
	// and falls back to the CORS-enabled proxy for cross-origin image hosts.
	// This yields real (non-opaque) responses so response.ok is meaningful
	// and the image can be stored under its original URL.
	try {
		const response = await proxyFetch(request.url);

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
// AUDIO HANDLING HELPERS
// ------------------------------------------------------------

/**
 * Cache-first, no-populate strategy for audio.
 *
 * Returns the manually-downloaded copy from AUDIO_CACHE when present,
 * otherwise falls through to the network. Unlike cacheImage(), this
 * never writes to the cache — only CACHE_AUDIO downloads populate it.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function audioCacheFirst(request) {
	const cache = await caches.open(AUDIO_CACHE);

	// Files are stored under the original URL (see cacheAudioFile), so
	// match by URL and ignore the Range header a media element may send.
	const cached = await cache.match(request, { ignoreVary: true });
	if (cached) return cached;

	return fetch(request);
}

/**
 * Determines if a fetch request is for audio.
 *
 * Checks:
 *   • request.destination === 'audio'
 *   • OR URL ends with a common audio extension
 *
 * @param {Request} request
 * @returns {boolean}
 */
function isAudioRequest(request) {
	// Best indicator — browsers mark <audio> fetches with this destination
	if (request.destination === 'audio') return true;

	const url = request.url.toLowerCase().split('?')[0];
	return /\.(mp3|m4a|m4b|aac|ogg|oga|opus|wav|flac|weba)$/.test(url);
}
