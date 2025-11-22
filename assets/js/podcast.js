/**
 * @typedef {import('./db.js').Podcast} Podcast
 * @typedef {import('./db.js').Episode} Episode
 */

export async function fetchPodcast(feedUrl) {
	try {
		const response = await fetch('https://proxy.thisanimus.com/?url=' + feedUrl);
		if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

		const xmlText = await response.text();
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

		const channel = xmlDoc.querySelector('channel');
		if (!channel) throw new Error('Invalid RSS feed: no <channel> element found.');

		// --- Namespace-safe text getter ---
		const text = (ctx, ...selectors) => {
			for (const sel of selectors) {
				// Try querySelector first
				const el = ctx.querySelector(sel);
				if (el && el.textContent.trim()) return el.textContent.trim();

				// Fallback to tagName search (namespace-safe)
				const tagName = sel.replace(/.*\\:/, ''); // e.g. "itunes\\:duration" → "duration"
				const nsMatch = Array.from(ctx.getElementsByTagName(tagName));
				const nsEl = nsMatch.find((n) => n.prefix === 'itunes' || n.prefix === 'media');
				if (nsEl && nsEl.textContent.trim()) return nsEl.textContent.trim();
			}
			return null;
		};

		const attr = (ctx, selector, attrName) => ctx.querySelector(selector)?.getAttribute(attrName) || null;

		const resolveImage = (ctx) =>
			attr(ctx, 'itunes\\:image', 'href') ||
			attr(ctx, 'image', 'href') ||
			text(ctx, 'image > url') ||
			attr(ctx, 'media\\:thumbnail', 'url') ||
			attr(ctx, 'media\\:content', 'url') ||
			'';

		const podcast = {
			title: text(channel, 'title'),
			link: text(channel, 'link'),
			feedUrl,
			description: text(channel, 'description'),
			summary: text(channel, 'summary'),
			pubDate: text(channel, 'pubDate', 'lastBuildDate'),
			image: resolveImage(channel),
			author: text(channel, 'itunes\\:author', 'author', 'managingEditor'),
			category:
				text(channel, 'itunes\\:category') ||
				channel.querySelector('category')?.getAttribute('text') ||
				text(channel, 'category'),
			explicit: (text(channel, 'itunes\\:explicit') || 'no').toLowerCase().startsWith('y'),
			subtitle: text(channel, 'itunes\\:subtitle'),
		};

		const episodes = Array.from(channel.querySelectorAll('item')).map((item) => {
			const durationRaw = text(item, 'itunes\\:duration', 'duration');
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
				season: text(item, 'season') ? parseInt(text(item, 'season')) : null,
				episode: text(item, 'episode') ? parseInt(text(item, 'episode')) : null,
				filesize: parseInt(attr(item, 'enclosure', 'length') || '0', 10),
				duration,
				progress: 0,
				downloaded: false,
				archived: false,
			};
		});

		return { podcast, episodes };
	} catch (err) {
		console.error('Error fetching/parsing feed:', err);
		throw err;
	}
}

/**
 * Parses a duration string (HH:MM:SS, MM:SS, or numeric seconds) into seconds.
 * @param {string} str
 * @returns {number}
 */
function parseDuration(str) {
	if (!str) return 0;
	const clean = str.trim();
	if (/^\d+$/.test(clean)) return parseInt(clean, 10); // already seconds
	const parts = clean.split(':').map((p) => parseInt(p, 10));
	if (parts.some(isNaN)) return 0;
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return parts[0];
}

export const getFeedUrlFromItunes = async (url) => {
	// Extract podcast ID from URL
	const match = url.match(/id(\d+)/);
	if (!match) return null;

	const podcastId = match[1];
	const apiUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`;

	const response = await fetch(apiUrl);
	const data = await response.json();

	return data.results[0]?.feedUrl;
};

export const addPodcastFromFeedUrl = async (feedUrl) => {
	const { podcast, episodes } = await fetchPodcast(feedUrl);

	if (podcast && episodes) {
		Db.podcasts.upsert(podcast);
		Db.episodes.upsert(episodes);
	}
};

export const refreshAll = async () => {
	const podcasts = await Db.podcasts.readAll();

	const promiseArray = [];
	for (const podcast of podcasts) {
		promiseArray.push(feed(podcast.feedUrl));
	}
	const result = await Promise.all(promiseArray);

	result.forEach((p) => {
		Db.podcasts.upsert(p.podcast);
		Db.episodes.upsert(p.episodes);
	});
};

export const cacheAudio = async (audioUrl) => {
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

			navigator.serviceWorker.controller.postMessage({ type: 'CACHE_AUDIO', url: audioUrl }, [messageChannel.port2]);
		});
	}
};

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
