import '../components/router-layout.js';
import '../components/router-view.js';
import '../components/router-nav.js';
import '../components/episode-player.js';
import '../components/podcast-episode.js';
import '../components/download-button.js';
import '../components/play-pause.js';
import '../views/podcast-index.js';
import '../views/podcast-single.js';
import '../views/podcast-search.js';

import { Settings } from './settings.js';
import { refreshAll } from './podcast.js';

(function () {
	const originalPushState = history.pushState;
	const originalReplaceState = history.replaceState;

	history.pushState = function (...args) {
		originalPushState.apply(this, args);
		window.dispatchEvent(new Event('urlchange'));
	};

	history.replaceState = function (...args) {
		originalReplaceState.apply(this, args);
		window.dispatchEvent(new Event('urlchange'));
	};
})();

document.querySelectorAll('img').forEach((img) => {
	img.addEventListener('error', () => {
		img.src = 'assets/img/default-episode-image.webp';
	});
});

//await refreshAll();

const persistButton = document.getElementById('persist');
if (persistButton) {
	persistButton.addEventListener('click', async (e) => {
		await Settings.requestPersistentStorage();
	});
}
/*
const podcasts = [
	'https://deepspacerobots.com/jukebox/feed.xml',
	'https://feeds.simplecast.com/BqbsxVfO',
	'https://www.thisamericanlife.org/podcast/rss.xml',
];

const { podcast, episodes } = await feed('https://deepspacerobots.com/jukebox/feed.xml');

if (podcast && episodes) {
	Db.podcasts.upsert(podcast);
	Db.episodes.upsert(episodes);
}

*/
if ('serviceWorker' in navigator) {
	navigator.serviceWorker
		.register('/service-worker.js')
		.then((reg) => console.log('Service Worker registered', reg))
		.catch((err) => console.error('Service Worker registration failed', err));
}
