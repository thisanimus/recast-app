import { Db } from '../js/db.js';
import { fetchPodcast, cacheAudio } from '../js/podcast.js';

/**
 * @typedef {import('../js/db.js').Podcast} Podcast
 * @typedef {import('../js/db.js').Episode} Episode
 */

class PodcastSingle extends HTMLElement {
	constructor() {
		super();
		this.q = new URLSearchParams(window.location.search);
		this.refs = {
			view: this.closest('router-view'),
			image: this.querySelector('.image'),
			title: this.querySelector('.title'),
			category: this.querySelector('.category'),
			author: this.querySelector('.author'),
			description: this.querySelector('.description'),
			episodes: this.querySelector('.episodes'),
			subscriptionButton: this.querySelector('#subscription'),
		};
		this.isSubscribed = false;
		/** @type {Podcast} */
		this.podcast;
		/** @type {Episode[]} */
		this.episodes = [];
		this.loadPodcast();
	}
	connectedCallback() {
		this.attachEventListeners();
	}
	async loadPodcast() {
		this.refs.view.removeAttribute('ready');

		// Quick exit if conditions aren't met
		if (this.q.get('view') !== 'podcast') return;
		const feedUrl = this.q.get('feedUrl');
		if (!feedUrl) return;

		// Try DB first
		const podcast = await Db.podcasts.read(feedUrl);
		if (podcast) {
			this.podcast = podcast;
			this.isSubscribed = true;
			this.episodes = await Db.episodes.readByPodcast(feedUrl);
		}

		// If DB failed, fetch from network
		if (!this.podcast || !this.episodes) {
			const result = await fetchPodcast(feedUrl);
			this.podcast = result.podcast;
			this.episodes = result.episodes;
		}

		// Only render if both values exist
		if (this.podcast && this.episodes) {
			this.render();
		}
	}
	attachEventListeners() {
		window.addEventListener('urlchange', () => {
			this.q = new URLSearchParams(window.location.search);
			if (this.q.get('view') !== 'podcast') {
				this.refs.view.removeAttribute('ready');
				this.isSubscribed = false;
				this.podcast = null;
				this.episodes = null;
			} else {
				this.loadPodcast();
			}
		});

		this.refs.subscriptionButton.addEventListener('click', async () => {
			const { podcast, episodes, isSubscribed } = this;
			if (!isSubscribed) {
				await Promise.all([Db.podcasts.upsert(podcast), Db.episodes.upsert(episodes)]);
				this.isSubscribed = true;
			} else {
				await Db.podcasts.delete(podcast.feedUrl);
				this.isSubscribed = false;
			}
			this.updateSubscribeButton();
		});

		this.refs.description.addEventListener('click', (e) => {
			const status = e.target.getAttribute('aria-expanded');
			this.refs.description.setAttribute('aria-expanded', status == 'true' ? 'false' : 'true');
		});
	}
	updateSubscribeButton() {
		this.refs.subscriptionButton.textContent = this.isSubscribed ? 'Unsubscribe' : '+ Subscribe';
	}
	createEpisodeList() {
		const episodeList = document.createDocumentFragment();
		this.episodes.reverse().forEach((ep) => {
			const el = document.createElement('podcast-episode');
			el.episode = ep;
			episodeList.appendChild(el);
		});
		this.refs.episodes.replaceChildren(episodeList);
	}

	render() {
		const imageSrc = this.podcast.image || '/assets/img/default-episode-image.webp';
		this.refs.image.src = imageSrc;
		this.refs.title.textContent = this.podcast.title;
		this.refs.author.textContent = this.podcast.author;
		this.refs.category.textContent = this.podcast.category;
		this.refs.description.textContent = this.podcast.summary;
		this.createEpisodeList();
		this.updateSubscribeButton();
		this.refs.view.setAttribute('ready', true);
	}
}
customElements.define('podcast-single', PodcastSingle);
