import { formatRFCDate, secondsToTextTime } from '../js/utilities.js';
/**
 * @typedef {import('../js/db.js').Podcast} Podcast
 * @typedef {import('../js/db.js').Episode} Episode
 */

class PodcastEpisode extends HTMLElement {
	/** @type {Episode} */
	_episode;

	constructor() {
		super();
	}

	// Public setter
	set episode(value) {
		this._episode = value;
		this.render();
	}

	connectedCallback() {
		if (this._episode) this.render();
	}

	makePrepend() {
		const prependArray = [];
		if (this._episode.explicit === true) {
			prependArray.push('<span class="explicit">E</span>');
		}

		const season = this._episode.season ? 'S' + this._episode.season + ' ' : '';
		if (this._episode.type.toLowerCase() == 'trailer') {
			prependArray.push(`${season}Trailer`);
		}
		if (this._episode.type.toLowerCase() == 'bonus') {
			prependArray.push(`${season}Bonus`);
		}
		// eg S1/E1
		if (this._episode.season && this._episode.episode) {
			prependArray.push(`S${this._episode.season}/E${this._episode.episode}`);
		}
		prependArray.push(formatRFCDate(this._episode.pubDate));

		return prependArray.join(' • ');
	}

	makeAppend() {
		let appendArray = [secondsToTextTime(this._episode.duration)];
		if (this._episode.progress > 0) {
			appendArray.push(`${secondsToTextTime(this._episode.duration - this._episode.progress)} left`);
		}
		return appendArray.join(' • ');
	}

	render() {
		if (!this._episode) return;
		const prepend = this.makePrepend();
		const append = this.makeAppend();

		this.innerHTML = /*html*/ `
			<li class="podcast-episode">
				<div class="episode-details">
					<div class="prepend">${prepend}</div>
					<div class="title">${this._episode.title}</div>
					<div class="append">${append}</div>
				</div>
				<download-button 
					guid="${this._episode.guid}"
					url="${this._episode.audio}"
					downloaded="${this._episode.downloaded.toString()}" >
						<button></button>
					</download-button>
				<play-pause state="pause" guid="${this._episode.guid}" progress="${this._episode.progress / this._episode.duration}">
					<button title="Play">
						<div class="icon-wrapper">
							<div class="icon">
								<svg xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 512 512">
									<path d="M173,440c-6.14-.01-12.17-1.62-17.5-4.67-12-6.8-19.46-20-19.46-34.33V111c0-14.37,7.46-27.53,19.46-34.33,11.11-6.39,24.82-6.21,35.77.45l247.85,148.36c16.84,10.56,21.94,32.78,11.38,49.62-2.89,4.6-6.77,8.49-11.38,11.38l-247.89,148.4c-5.5,3.33-11.8,5.1-18.23,5.12Z"/>
								</svg>
							</div>
							<div class="circle-progress">
								<div class="progress"></div>
							</div>
					</button>
				</play-pause>
			</li>`;
	}
}

customElements.define('podcast-episode', PodcastEpisode);
