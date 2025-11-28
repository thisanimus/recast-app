import { getFeedUrlFromItunes } from '../js/podcast.js';

class PodcastSearch extends HTMLElement {
	constructor() {
		super();
		this.refs = {
			view: this.closest('router-view'),
			form: this.querySelector('form'),
			search: this.querySelector('#url'),
			results: this.querySelector('.results'),
		};
	}
	connectedCallback() {
		this.addEventListeners();
		this.refs.view.setAttribute('ready', true);
	}

	addEventListeners() {
		window.addEventListener('urlchange', () => {
			const q = new URLSearchParams(window.location.search);
			if (q.get('view') !== 'search') {
				this.refs.view.removeAttribute('ready');
				this.refs.form.reset();
			}
		});

		this.refs.form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const searchValue = this.refs.search.value;
			let feedUrl = null;
			if (searchValue.includes('podcasts.apple.com') || searchValue.includes('itunes.com')) {
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
