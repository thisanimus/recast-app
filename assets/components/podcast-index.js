import { Db } from '../js/db.js';

export class PodcastIndex extends HTMLElement {
	constructor() {
		super();
		this.refs = {
			grid: this.querySelector('.grid'),
		};
		this.podcasts = [];
	}
	connectedCallback() {
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
			.join('')}`;
	}
}
customElements.define('podcast-index', PodcastIndex);
