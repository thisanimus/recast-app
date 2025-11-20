import '../components/router-layout.js';
import '../components/router-view.js';
import '../components/episode-player.js';
import '../components/play-pause.js';
import '../components/podcast-index.js';
import '../components/podcast-single.js';

import { feed } from './feed.js';
import { Db } from './db.js';
import { Settings } from './settings.js';

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

//refreshAll();

await Settings.requestPersistentStorage();
const podcasts = [
	'https://deepspacerobots.com/jukebox/feed.xml',
	'https://feeds.simplecast.com/BqbsxVfO',
	'https://www.thisamericanlife.org/podcast/rss.xml',
];

const { podcast, episodes } = await feed('https://feeds.simplecast.com/BqbsxVfO');

if (podcast && episodes) {
	Db.podcasts.upsert(podcast);
	Db.episodes.upsert(episodes);
}
