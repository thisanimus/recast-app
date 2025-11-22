import { Db } from '../js/db.js';
import { fetchPodcast, cacheAudio } from '../js/podcast.js';

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
		this.podcast = {
			title: null,
			link: null,
			feedUrl: null,
			description: null,
			summary: null,
			pubDate: null,
			image: null,
			author: null,
			category: null,
			explicit: null,
			subtitle: null,
		};
		this.episodes = [];
	}
	connectedCallback() {
		this.attachEventListeners();
	}
	async loadPodcast() {
		const feedUrl = this.q.get('feedUrl');
		if (feedUrl) {
			this.podcast = await Db.podcasts.read(feedUrl);
			if (this.podcast) {
				this.isSubscribed = true;
				this.episodes = await Db.episodes.readByPodcast(feedUrl);
			}

			if (this.episodes && this.podcast) {
				console.log('foobar');
				this.render();
			} else {
				const { podcast, episodes } = await fetchPodcast(feedUrl);
				this.podcast = podcast;
				this.episodes = episodes;
				if (this.episodes && this.podcast) {
					this.render();
				}
			}
		}
	}
	attachEventListeners() {
		window.addEventListener('urlchange', () => {
			this.q = new URLSearchParams(window.location.search);
			if (this.q.get('view') !== 'podcast') {
				this.refs.view.setAttribute('loading', true);
				this.isSubscribed = false;
			}

			if (this.q.get('view') == 'podcast' && this.q.get('feedUrl') !== this.podcast?.feedUrl) {
				this.refs.view.setAttribute('loading', true);
				this.loadPodcast();
			}
		});

		this.addEventListener('click', this.handleClick.bind(this));
	}
	async handleClick(e) {
		const downloadAudio = e.target.classList.contains('download');
		if (downloadAudio) {
			const guid = e.target.dataset.guid;
			const audio = e.target.dataset.audio;
			const episode = this.episodes.find((e) => e.guid == guid);
			if (!episode.downloaded) {
				cacheAudio(audio).then(() => {
					Db.episodes.updateProp(guid, 'downloaded', true).then(() => {
						this.loadPodcast();
					});
				});
			} else {
				Db.episodes.updateProp(guid, 'downloaded', false).then(() => {
					this.loadPodcast();
				});
			}
		}

		const subscription = e.target.id === 'subscription';
		if (subscription) {
			if (!this.isSubscribed) {
				await Promise.all([Db.podcasts.upsert(this.podcast), Db.episodes.upsert(this.episodes)]);
				this.isSubscribed = true;
				this.updateSubscribeButton();
			} else {
				await Db.podcasts.delete(this.podcast.feedUrl);
				this.isSubscribed = false;
				this.updateSubscribeButton();
			}
		}
	}
	updateSubscribeButton() {
		this.refs.subscriptionButton.textContent = this.isSubscribed ? 'Unsubscribe' : '+ Subscribe';
	}

	render() {
		const imageSrc = this.podcast.image || '/assets/img/default-episode-image.webp';
		this.refs.image.src = imageSrc;
		this.refs.title.textContent = this.podcast.title;
		this.refs.author.textContent = this.podcast.author;
		this.refs.category.textContent = this.podcast.category;
		this.refs.description.textContent = this.podcast.summary;

		const episodeList = document.createDocumentFragment();

		this.episodes.forEach((ep) => {
			if (ep.downloaded) {
				console.log(ep);
			}
			const el = document.createElement('podcast-episode');
			el.episode = ep;
			episodeList.appendChild(el);
		});
		this.refs.episodes.replaceChildren(episodeList);

		this.refs.view.removeAttribute('loading');
		this.updateSubscribeButton();
	}
}
customElements.define('podcast-single', PodcastSingle);
