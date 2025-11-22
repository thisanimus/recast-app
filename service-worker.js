// service-worker.js
const CACHE_VERSION = 'v0.005';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const IMAGE_CACHE = `images`;
const AUDIO_CACHE = `audio`;

// Add your local files here
const STATIC_FILES = [
	'/index.html',
	'/manifest.json',
	'/assets/css/style.css',
	'/assets/css/global/_typography.css',
	'/assets/css/global/_code.css',
	'/assets/css/global/_color-mode-auto.css',
	'/assets/css/global/_forms.css',
	'/assets/css/global/_table.css',
	'/assets/css/global/_media.css',
	'/assets/css/global/_range.css',
	'/assets/css/global/_base.css',
	'/assets/css/global/_dialog.css',
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
	'/assets/components/episode-player.css',
	'/assets/components/router-nav.js',
	'/assets/components/router-view.css',
	'/assets/components/router-layout.css',
	'/assets/components/episode-player.js',
	'/assets/components/podcast-episode.css',
	'/assets/components/router-view.js',
	'/assets/components/router-layout.js',
	'/assets/components/podcast-episode.js',
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

// Install event - cache static files
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
								(name.startsWith('audio-') && name !== AUDIO_CACHE)
							);
						})
						.map((name) => caches.delete(name))
				);
			})
			.then(() => self.clients.claim())
	);
});

// Helper function to handle range requests from cached audio
async function createRangeResponse(cachedResponse, request) {
	try {
		const data = await cachedResponse.arrayBuffer();
		const range = request.headers.get('range');

		if (!range) {
			return cachedResponse;
		}

		const parts = range.replace(/bytes=/, '').split('-');
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : data.byteLength - 1;
		const chunk = data.slice(start, end + 1);

		const contentType = cachedResponse.headers.get('content-type') || 'audio/mpeg';

		return new Response(chunk, {
			status: 206,
			statusText: 'Partial Content',
			headers: {
				'Content-Range': `bytes ${start}-${end}/${data.byteLength}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': chunk.byteLength.toString(),
				'Content-Type': contentType,
			},
		});
	} catch (error) {
		console.error('Error creating range response:', error);
		return cachedResponse;
	}
}

// Helper function to handle audio requests
async function handleAudioRequest(request) {
	const cache = await caches.open(AUDIO_CACHE);

	// Try to match the request URL (ignore range headers for cache lookup)
	const cachedResponse = await cache.match(request.url);

	if (cachedResponse) {
		console.log('Serving audio from cache:', request.url);
		// Handle range requests from cache
		if (request.headers.get('range')) {
			return createRangeResponse(cachedResponse, request);
		}
		return cachedResponse;
	}

	// Not in cache, fetch from network
	console.log('Fetching audio from network:', request.url);
	try {
		const response = await fetch(request);

		// Cache successful responses (but only if it's a full response, not a range)
		if (response.ok && response.status === 200) {
			cache.put(request.url, response.clone());
		}

		return response;
	} catch (error) {
		console.error('Audio fetch failed:', error);
		throw error;
	}
}

// Fetch event - serve from cache, cache images on access
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Handle static files (HTML, CSS, JS)
	if (
		STATIC_FILES.includes(url.pathname) ||
		request.destination === 'style' ||
		request.destination === 'script' ||
		request.destination === 'document'
	) {
		event.respondWith(
			caches
				.match(request)
				.then((response) => {
					return (
						response ||
						fetch(request).then((fetchResponse) => {
							// Cache new static files
							return caches.open(STATIC_CACHE).then((cache) => {
								cache.put(request, fetchResponse.clone());
								return fetchResponse;
							});
						})
					);
				})
				.catch(() => {
					// Offline fallback for HTML pages
					if (request.destination === 'document') {
						return caches.match('/index.html');
					}
				})
		);
		return;
	}

	// Handle images - cache on first access
	if (request.destination === 'image') {
		event.respondWith(
			caches
				.open(IMAGE_CACHE)
				.then((cache) => {
					return cache.match(request).then((response) => {
						if (response) {
							return response;
						}

						// Fetch and cache image
						return fetch(request).then((fetchResponse) => {
							// Only cache successful responses
							if (fetchResponse.ok) {
								cache.put(request, fetchResponse.clone());
							}
							return fetchResponse;
						});
					});
				})
				.catch(() => {
					// Could return a placeholder image here
					console.log('Image fetch failed:', request.url);
				})
		);
		return;
	}

	// Handle audio with range request support
	if (request.destination === 'audio') {
		event.respondWith(handleAudioRequest(request));
		return;
	}

	// Default: fetch without caching
	event.respondWith(fetch(request));
});

// Message handler for on-demand audio caching
self.addEventListener('message', (event) => {
	if (event.data.type === 'CACHE_AUDIO') {
		const audioUrl = event.data.url;

		event.waitUntil(
			caches
				.open(AUDIO_CACHE)
				.then((cache) => {
					// Fetch the full audio file (no range header)
					return fetch(audioUrl).then((response) => {
						const messagePort = event.ports[0];

						if (response.ok && response.status === 200) {
							cache.put(audioUrl, response.clone());
							messagePort?.postMessage({
								success: true,
								url: audioUrl,
							});
						} else {
							messagePort?.postMessage({
								success: false,
								url: audioUrl,
								error: `Fetch failed with status ${response.status}`,
							});
						}
					});
				})
				.catch((error) => {
					console.error('Cache audio error:', error);
					event.ports[0]?.postMessage({
						success: false,
						url: audioUrl,
						error: error.message,
					});
				})
		);
	}

	if (event.data.type === 'CLEAR_CACHE') {
		const cacheName = event.data.cacheName;
		event.waitUntil(
			caches.delete(cacheName).then(() => {
				event.ports[0].postMessage({ success: true });
			})
		);
	}

	if (event.data.type === 'CHECK_CACHED') {
		const audioUrl = event.data.url;
		event.waitUntil(
			caches.open(AUDIO_CACHE).then((cache) => {
				return cache.match(audioUrl).then((response) => {
					event.ports[0]?.postMessage({
						url: audioUrl,
						cached: !!response,
					});
				});
			})
		);
	}
});

// Helper function to cache audio from your main script:
/*
// In your main JavaScript file:

// Register the service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(reg => console.log('Service Worker registered', reg))
    .catch(err => console.log('Service Worker registration failed', err));
}

// Function to cache audio on demand
async function cacheAudio(audioUrl) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const messageChannel = new MessageChannel();
    
    return new Promise((resolve, reject) => {
      messageChannel.port1.onmessage = (event) => {
        if (event.data.success) {
          console.log('Audio cached:', event.data.url);
          resolve(event.data);
        } else {
          console.error('Audio caching failed:', event.data.error);
          reject(event.data);
        }
      };
      
      navigator.serviceWorker.controller.postMessage(
        { type: 'CACHE_AUDIO', url: audioUrl },
        [messageChannel.port2]
      );
    });
  }
}

// Function to check if audio is cached
async function isAudioCached(audioUrl) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const messageChannel = new MessageChannel();
    
    return new Promise((resolve) => {
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data.cached);
      };
      
      navigator.serviceWorker.controller.postMessage(
        { type: 'CHECK_CACHED', url: audioUrl },
        [messageChannel.port2]
      );
    });
  }
  return false;
}

// Usage example:
// await cacheAudio('https://example.com/podcast/episode.mp3');
// const isCached = await isAudioCached('https://example.com/podcast/episode.mp3');
*/
