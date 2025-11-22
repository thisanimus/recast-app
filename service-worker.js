// service-worker.js
const CACHE_VERSION = 'v1.5';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const AUDIO_CACHE = `audio-${CACHE_VERSION}`;

// Add your local files here
const STATIC_FILES = [
	'./css/style.css',
	'./css/global/_typography.css',
	'./css/global/_code.css',
	'./css/global/_color-mode-auto.css',
	'./css/global/_forms.css',
	'./css/global/_table.css',
	'./css/global/_media.css',
	'./css/global/_range.css',
	'./css/global/_base.css',
	'./css/global/_dialog.css',
	'./css/global/_buttons.css',
	'./js/icons.js',
	'./js/onSwipe.js',
	'./js/db.js',
	'./js/index.js',
	'./js/podcast.js',
	'./js/utilities.js',
	'./js/shared.js',
	'./js/settings.js',
	'./img/default-episode-image.webp',
	'./img/screenshot.psd',
	'./img/screenshot-2.png',
	'./img/screenshot-3.png',
	'./img/screenshot-1.png',
	'./components/play-pause.css',
	'./components/router-nav.css',
	'./components/network-status.js',
	'./components/episode-player.css',
	'./components/router-nav.js',
	'./components/router-view.css',
	'./components/router-layout.css',
	'./components/episode-player.js',
	'./components/podcast-episode.css',
	'./components/router-view.js',
	'./components/router-layout.js',
	'./components/podcast-episode.js',
	'./components/play-pause.js',
	'./appicon/icon-192x192.png',
	'./appicon/icon.png',
	'./appicon/apple-touch-icon.png',
	'./appicon/icon.svg',
	'./appicon/icon.ico',
	'./appicon/icon-512x512-maskable.png',
	'./appicon/icon-512x512.png',
	'./appicon/icon-maskable.svg',
	'./views/podcast-single.css',
	'./views/podcast-search.js',
	'./views/podcast-index.css',
	'./views/podcast-index.js',
	'./views/podcast-single.js',
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

	// Handle audio - cache only when explicitly requested
	if (request.destination === 'audio') {
		event.respondWith(
			caches.open(AUDIO_CACHE).then((cache) => {
				return cache.match(request).then((response) => {
					return (
						response ||
						fetch(request).then((fetchResponse) => {
							// Optionally cache audio on first play
							/*
                    if (fetchResponse.ok) {
                        cache.put(request, fetchResponse.clone());
                    }
												*/
							return fetchResponse;
						})
					);
				});
			})
		);
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
					return fetch(audioUrl).then((response) => {
						const messagePort = event.ports[0];

						if (response.ok) {
							cache.put(audioUrl, response.clone());
							messagePort?.postMessage({
								success: true,
								url: audioUrl,
							});
						} else {
							messagePort?.postMessage({
								success: false,
								url: audioUrl,
								error: 'Fetch failed',
							});
						}
					});
				})
				.catch((error) => {
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

// Usage example:
// cacheAudio('/audio/song.mp3');
*/
