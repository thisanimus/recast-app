import { Db } from '../js/db.js';

export class PodcastIndex extends HTMLElement {
	constructor() {
		super();
		this.refs = {
			grid: this.querySelector('.grid'),
		};
		this.podcasts = [];
		this.getPodcasts();
	}
	connectedCallback() {
		window.addEventListener('urlchange', () => {
			this.q = new URLSearchParams(window.location.search);
			if (this.q.get('view') == 'index') {
				this.getPodcasts();
			}
		});
	}
	getPodcasts() {
		Db.podcasts.readAll().then((podcasts) => {
			this.podcasts = podcasts;
			this.render();
		});
	}
	render() {
		this.refs.grid.innerHTML = `${this.podcasts
			.map((podcast) => {
				return `<a class="router-link" href="?view=podcast&feedUrl=${podcast.feedUrl}" title="${podcast.title}">
				<img src="${podcast.image || '/assets/img/default-episode-image.webp'}" />
			</a>`;
			})
			.join('')}
			<a class="router-link add-link" href="?view=add" title="Add New Podcast">
				<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 112v288M400 256H112"/></svg>
			</a>`;
	}
}
customElements.define('podcast-index', PodcastIndex);
