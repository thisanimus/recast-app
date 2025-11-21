import { Db } from '../js/db.js';
import { feed } from '../js/feed.js';
import { podcastEpisode } from './podcast-episode.js';

class PodcastSingle extends HTMLElement {
	constructor() {
		super();
		this.q = new URLSearchParams(window.location.search);
		this.refs = {
			image: this.querySelector('.image'),
			title: this.querySelector('.title'),
			category: this.querySelector('.category'),
			author: this.querySelector('.author'),
			description: this.querySelector('.description'),
			episodes: this.querySelector('.episodes'),
		};
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
		this.loadPodcast();
	}
	connectedCallback() {
		this.attachEventListeners();
	}
	async loadPodcast() {
		const feedUrl = this.q.get('feedUrl');

		if (feedUrl) {
			let podcast = await Db.podcasts.read(feedUrl);
			let episodes = await Db.episodes.readByPodcast(feedUrl);
			if (episodes && podcast) {
				this.podcast = podcast;
				this.episodes = episodes;
			} else {
				let { podcast, episodes } = feed(feedUrl);
				this.podcast = podcast;
				this.episodes = episodes;
			}
		}
		this.render();
	}
	attachEventListeners() {
		window.addEventListener('urlchange', () => {
			this.q = new URLSearchParams(window.location.search);

			if (this.q.get('view') == 'podcast' && this.q.get('feedUrl') !== this.podcast.feedUrl) {
				this.loadPodcast();
			}
		});
	}

	render() {
		const imageSrc = this.podcast.image || '/assets/img/default-episode-image.webp';
		this.refs.image.src = imageSrc;
		this.refs.title.textContent = this.podcast.title;
		this.refs.author.textContent = this.podcast.author;
		this.refs.category.textContent = this.podcast.category;
		this.refs.description.textContent = this.podcast.summary;
		this.refs.episodes.innerHTML = `${this.episodes.map(podcastEpisode).join('')}`;
	}
}
customElements.define('podcast-single', PodcastSingle);
