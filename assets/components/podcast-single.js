import { Db } from '../js/db.js';
import { feed } from '../js/feed.js';

class PodcastSingle extends HTMLElement {
	constructor() {
		super();
		this.q = new URLSearchParams(window.location.search);
		this.refs = {
			image: this.querySelector('.image'),
			title: this.querySelector('.title'),
			category: this.querySelector('.category'),
			author: this.querySelector('.author'),
			description: this.querySelector('.decription'),
			episodes: this.querySelector('.episodes'),
		};
		this.podcast = {
			title: null,
			link: null,
			feedUrl: null,
			description: null,
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
		this.refs.episodes.innerHTML = `${this.episodes
			.map((episode) => {
				return `<li>
					<play-pause state="pause" guid="${episode.guid}" progress="${episode.progress / episode.duration}">
						<button title="Play">
							<div class="episode-details">${episode.title}</div>
							<div class="icon">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-play-circle">
									<circle cx="12" cy="12" r="10"></circle>
									<polygon points="10 8 16 12 10 16 10 8"></polygon>
								</svg>
							</div>
						</button>
					</play-pause>
			</li>`;
			})
			.join('')}`;
	}
}
customElements.define('podcast-single', PodcastSingle);
