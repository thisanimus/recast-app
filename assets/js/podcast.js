/**
 * @typedef {import('./db.js').Podcast} Podcast
 * @typedef {import('./db.js').Episode} Episode
 */

import { Db } from './db.js';
import { parseDuration, proxyFetch } from './utilities.js';

/**
 * Fetches and parses a podcast RSS feed, with automatic fallback to proxy for CORS issues.
 *
 * @param {string} feedUrl - The URL of the podcast RSS feed to fetch
 * @returns {Promise<{podcast: Podcast, episodes: Episode[]}>} An object containing the podcast metadata and array of episodes
 * @throws {Error} If both direct and proxy fetch fail, or if the RSS feed is invalid
 *
 */

export const fetchPodcast = async (feedUrl) => {
	const response = await proxyFetch(feedUrl);
	const xmlText = await response.text();

	if (!xmlText || !xmlText.trim()) {
		throw new Error('Empty response from server');
	}

	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

	// Check for XML parser errors
	const parserError = xmlDoc.querySelector('parsererror');
	if (parserError) {
		throw new Error('Invalid XML: ' + parserError.textContent);
	}

	const channel = xmlDoc.querySelector('channel');
	if (!channel) throw new Error('Invalid RSS feed: no <channel> element found.');

	const text = (ctx, ...selectors) => {
		for (const sel of selectors) {
			const el = ctx.querySelector(sel);
			if (el && el.textContent.trim()) {
				const value = el.textContent.trim();

				// Check if it looks like a number
				const num = Number(value);
				// Return number if valid (not NaN) and the string was purely numeric
				if (!isNaN(num) && value !== '' && /^-?\d+\.?\d*$/.test(value)) {
					return num;
				}
				return value;
			}
		}
		return null;
	};

	const attr = (ctx, selector, attrName) => ctx.querySelector(selector)?.getAttribute(attrName) || null;

	const resolveImage = (ctx) =>
		attr(ctx, 'image', 'href') ||
		text(ctx, 'image > url') ||
		attr(ctx, 'thumbnail', 'url') ||
		attr(ctx, 'content', 'url') ||
		'';

	const podcast = {
		title: text(channel, 'title'),
		link: text(channel, 'link'),
		feedUrl,
		description: text(channel, 'description'),
		summary: text(channel, 'summary'),
		pubDate: text(channel, 'pubDate', 'lastBuildDate'),
		image: resolveImage(channel),
		author: text(channel, 'author', 'managingEditor'),
		category:
			text(channel, 'category') || channel.querySelector('category')?.getAttribute('text') || text(channel, 'category'),
		explicit: (text(channel, 'explicit') || 'no').toLowerCase().startsWith('y'),
		subtitle: text(channel, 'subtitle'),
	};

	const episodes = Array.from(channel.querySelectorAll('item')).map((item) => {
		const durationRaw = text(item, 'duration');
		const duration = parseDuration(durationRaw);

		return {
			title: text(item, 'title'),
			podcast: feedUrl,
			link: text(item, 'link'),
			description: text(item, 'description', 'summary'),
			subtitle: text(item, 'subtitle'),
			pubDate: text(item, 'pubDate'),
			guid: text(item, 'guid') || attr(item, 'guid', 'isPermaLink'),
			image: resolveImage(item),
			audio: attr(item, 'enclosure', 'url') || attr(item, 'content', 'url'),
			type: text(item, 'episodeType'),
			season: text(item, 'season'),
			episode: text(item, 'episode'),
			filesize: attr(item, 'enclosure', 'length') || 0,
			duration,
			progress: 0,
			downloaded: false,
			archived: false,
		};
	});
	console.log(episodes);
	return { podcast, episodes };
};

/**
 * Retrieves the RSS feed URL for a podcast from an iTunes/Apple Podcasts URL.
 *
 * @param {string} url - The iTunes/Apple Podcasts URL containing the podcast ID (e.g., "https://podcasts.apple.com/us/podcast/podcast-name/id123456789")
 * @returns {Promise<string|null>} The RSS feed URL if found, or null if the podcast ID cannot be extracted or the podcast is not found
 */
export const getFeedUrlFromItunes = async (url) => {
	// Extract podcast ID from URL
	const match = url.match(/id(\d+)/);
	if (!match) return null;

	const podcastId = match[1];
	const apiUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`;

	const response = await proxyFetch(apiUrl);
	const data = await response.json();

	return data.results[0]?.feedUrl;
};

/**
 * Adds a podcast and its episodes to the database from an RSS feed URL.
 * Fetches the podcast metadata and episodes, then upserts them into the database.
 *
 * @param {string} feedUrl - The RSS feed URL of the podcast to add
 * @returns {Promise<void>}
 */
export const addPodcastFromFeedUrl = async (feedUrl) => {
	const { podcast, episodes } = await fetchPodcast(feedUrl);

	if (podcast && episodes) {
		Db.podcasts.upsert(podcast);
		Db.episodes.upsert(episodes);
	}
};

/**
 * Refreshes all podcasts in the database by fetching the latest data from their RSS feeds.
 * Updates both podcast metadata and episodes for all subscribed podcasts.
 *
 * @returns {Promise<void>}
 */
export const refreshAll = async () => {
	const podcasts = await Db.podcasts.readAll();

	const promiseArray = [];
	for (const podcast of podcasts) {
		promiseArray.push(fetchPodcast(podcast.feedUrl));
	}
	const result = await Promise.all(promiseArray);

	result.forEach((p) => {
		Db.podcasts.upsert(p.podcast);
		Db.episodes.upsert(p.episodes);
	});
};

/**
 * Requests the service worker to cache an audio file.
 * Returns a Promise that resolves when the file is cached.
 * Uses a MessageChannel to ensure responses are scoped to this request.
 *
 * @param {string} url - The audio URL to delete
 * @param {string} guid - The guid of the episode to update
 * @returns {Promise<void>}
 * @throws {Error} If there is no active service worker or if saving to the cache fails
 */
export const cacheAudio = (url, guid) => {
	return new Promise((resolve, reject) => {
		if (!navigator.serviceWorker.controller) {
			return reject(new Error('No active service worker'));
		}

		const channel = new MessageChannel();

		channel.port1.onmessage = (event) => {
			const data = event.data;
			if (data.type === 'CACHE_AUDIO_RESULT' && data.url === url) {
				if (data.ok) {
					// update the db
					Db.episodes.updateProp(guid, 'downloaded', true);
					resolve(data.url);
				} else {
					reject(new Error(data.error || 'Failed to cache audio'));
				}
			}
		};

		navigator.serviceWorker.controller.postMessage(
			{ type: 'CACHE_AUDIO', url },
			[channel.port2] // transfer port2 to the SW
		);
	});
};

/**
 * Requests the service worker to delete an audio file from cache.
 * Always clears the DB record whether or not the file exists in cache.
 *
 * @param {string} url - The audio URL to delete
 * @param {string} guid - The guid of the episode to update
 * @returns {Promise<void>}
 * @throws {Error} If there is no active service worker
 */
export const deleteAudio = (url, guid) => {
	return new Promise((resolve, reject) => {
		if (!navigator.serviceWorker.controller) {
			return reject(new Error('No active service worker'));
		}
		const channel = new MessageChannel();
		channel.port1.onmessage = (event) => {
			const data = event.data;
			if (data.type !== 'DELETE_AUDIO_RESULT' || data.url !== url) {
				return;
			}
			// update the db
			Db.episodes.updateProp(guid, 'downloaded', false);
			if (data.ok) {
				// Cache delete succeeded
				resolve(data.url);
			} else {
				// Cache delete failed (likely not found)
				console.warn(`deleteAudio: SW reported error, treating as success: ${data.error}`);
				resolve(data.url);
			}
		};
		navigator.serviceWorker.controller.postMessage({ type: 'DELETE_AUDIO', url }, [channel.port2]);
	});
};

/**
 * Requests the service worker to check if an audio file exists in the cache.
 * Returns a Promise that resolves when we have confirmed the cached file's status.
 *
 * @param {string} url - The audio URL to delete
 * @param {string} guid - The guid of the episode to update
 * @returns {Promise<void>}
 * @throws {Error} If there is no active service worker
 */
export function checkAudio(url, guid) {
	return new Promise((resolve, reject) => {
		if (!navigator.serviceWorker?.controller) {
			reject(new Error('No active service worker'));
			return;
		}

		const channel = new MessageChannel();

		channel.port1.onmessage = (event) => {
			const msg = event.data;

			if (msg.type !== 'CHECK_AUDIO_RESULT') return;

			if (msg.ok) {
				Db.episodes.updateProp(guid, 'downloaded', msg.cached);
				resolve(msg.cached); // boolean
			} else {
				reject(new Error(msg.error || 'Unknown error'));
			}
		};

		navigator.serviceWorker.controller.postMessage(
			{
				type: 'CHECK_AUDIO',
				url,
			},
			[channel.port2]
		);
	});
}

/**
 * Sets the media information displayed on the device's lock screen and media controls.
 * Uses the Media Session API to display podcast episode metadata and artwork.
 *
 * @param {Object} params - The media metadata parameters
 * @param {string} params.title - The episode title
 * @param {string} params.artist - The artist or host name
 * @param {string} params.podcast - The podcast name (displayed as album)
 * @param {string} params.image - The URL of the podcast artwork image
 * @param {number} params.w - The width of the artwork image in pixels
 * @param {number} params.h - The height of the artwork image in pixels
 * @param {string} params.mime - The MIME type of the image (e.g., "image/jpeg", "image/png")
 * @returns {void}
 *
 */
export const setLockscreenMedia = ({ title, artist, podcast, image, w, h, mime }) => {
	if ('mediaSession' in navigator) {
		navigator.mediaSession.metadata = new MediaMetadata({
			title: title,
			artist: artist,
			album: podcast,
			artwork: [
				{
					src: image,
					sizes: `${w}x${h}`,
					type: mime,
				},
			],
		});
	}
};
