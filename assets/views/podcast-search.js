import { getFeedUrlFromItunes } from '../js/podcast.js';

class PodcastSearch extends HTMLElement {
	constructor() {
		super();
		this.refs = {
			form: this.querySelector('form'),
			search: this.querySelector('#search'),
			results: this.querySelector('.results'),
		};
	}
	connectedCallback() {
		this.addEventListeners();
	}

	async search(searchString) {}
	addEventListeners() {
		this.refs.form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const searchValue = this.refs.search.value;
			let feedUrl = null;
			if (searchValue.includes('podcasts.apple.com')) {
				feedUrl = await getFeedUrlFromItunes(searchValue);
			} else {
				feedUrl = searchValue;
			}
			if (feedUrl) {
				window.history.pushState({}, '', `?view=podcast&feedUrl=${feedUrl}`);
			}
		});
	}
}
customElements.define('podcast-search', PodcastSearch);
