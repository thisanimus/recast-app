import { Db } from '../js/db.js';
import { onSwipe } from '../js/onSwipe.js';
import { setLockscreenMedia } from '../js/podcast.js';
import { Settings } from '../js/settings.js';
import { secToTime } from '../js/utilities.js';

export class EpisodePlayer extends HTMLElement {
	static get observedAttributes() {
		return ['guid', 'minimized'];
	}
	constructor() {
		super();
		this.guid = this.getAttribute('guid') || Settings.data.currentEpisode || null;
		this.minimized = this.getAttribute('minimized');

		this.refs = {
			audio: this.querySelector('audio'),
			image: this.querySelector('.image'),
			imageMini: this.querySelector('.image-mini'),
			title: this.querySelector('.title'),
			podcastTitle: this.querySelector('.podcast-title'),
			playPause: this.querySelector('play-pause'),
			timeTotal: this.querySelector('.time-total'),
			timeRemaining: this.querySelector('.time-remaining'),
			timeRange: this.querySelector('#time-input'),
			skipBack: this.querySelector('#skip-back'),
			skipForward: this.querySelector('#skip-forward'),
			playbackRate: this.querySelector('#playback-rate'),
			toggle: this.querySelector('#toggle'),
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
		this.episode = {
			podcast: null,
			title: null,
			link: null,
			description: null,
			subtitle: null,
			pubDate: null,
			guid: null,
			author: null,
			image: null,
			audio: null,
			filesize: null,
			duration: null,
			progress: null,
			downloaded: null,
			archived: null,
		};

		this.rates = [0.75, 1, 1.25, 1.5, 2];
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue !== newValue && this[name] !== newValue) {
			this[name] = newValue;
			if (name == 'guid') {
				Settings.setProp('currentEpisode', newValue);
				this.loadEpisode();
			}
			if (name == 'minimized') {
				this.refs.toggle.title = this.minimized == 'true' ? 'Expand' : 'Minimize';
			}
		}
	}

	attachEventListeners() {
		onSwipe(this, {
			onSwipeUp: () => {
				this.setAttribute('minimized', 'false');
			},
			onSwipeDown: () => {
				this.setAttribute('minimized', 'true');
			},
		});

		this.refs.audio.addEventListener('pause', () => {
			const playPauses = document.querySelectorAll('play-pause');
			playPauses.forEach((playPause) => {
				const state = playPause.guid == this.episode.guid ? 'pause' : 'stop';
				playPause.setAttribute('state', state);
			});
		});

		this.refs.audio.addEventListener('play', () => {
			const playPauses = document.querySelectorAll('play-pause');
			playPauses.forEach((playPause) => {
				const state = playPause.guid == this.episode.guid ? 'play' : 'stop';
				playPause.setAttribute('state', state);
			});
		});

		// increment the playback rate
		this.refs.playbackRate.addEventListener('click', () => {
			const speedIndex = this.rates.indexOf(Settings.data.playbackRate);
			const nextIndex = speedIndex == this.rates.length ? 0 : speedIndex + 1;
			this.setPlaybackRate(this.rates[nextIndex]);
		});

		// skips
		this.refs.skipForward.addEventListener('click', (e) => {
			this.seek(30);
		});
		this.refs.skipBack.addEventListener('click', (e) => {
			this.seek(-10);
		});
		this.refs.toggle.addEventListener('click', (e) => {
			this.setAttribute('minimized', this.minimized == 'true' ? 'false' : 'true');
		});

		// time
		this.refs.timeRange.addEventListener('input', () => {
			this.refs.audio.currentTime = this.refs.timeRange.value;
		});
		this.refs.audio.addEventListener('timeupdate', async (e) => {
			const time = Math.round(this.refs.audio.currentTime);
			this.episode.progress = time;
			this.refs.timeRange.value = this.episode.progress;
			this.refs.timeRemaining.textContent = `-${secToTime(this.episode.duration - this.episode.progress)}`;

			if (this.episode.guid && time % 5 === 0) {
				const playPauses = document.querySelectorAll(`play-pause[guid="${this.episode.guid}"]`);
				playPauses.forEach((playPause) => {
					playPause.setAttribute('progress', (this.episode.progress / this.episode.duration).toFixed(3));
				});
			}

			// if time is divisible by 10, save it in the Db
			if (this.episode.guid && time % 10 === 0) {
				await Db.episodes.updateProp(this.episode.guid, 'progress', this.episode.progress);
			}
		});
	}

	connectedCallback() {
		this.attachEventListeners();
		if (this.guid) {
			this.loadEpisode();
		}
		// set playbackRate
		if (this.refs.audio.playbackRate !== Settings.data.playbackRate) {
			this.setPlaybackRate(Settings.data.playbackRate || 1);
		}
	}
	async loadEpisode() {
		if (!this.guid && Settings.data.currentEpisode) {
			this.setAttribute('guid', Settings.data.currentEpisode);
		}
		if (this.guid) {
			const episode = await Db.episodes.read(this.guid);
			if (episode) {
				const podcast = await Db.podcasts.read(episode.podcast);
				if (episode && podcast) {
					this.episode = episode;
					this.podcast = podcast;
				}
			}
		}
		this.render();
	}

	setPlaybackRate(rate = 1) {
		this.refs.audio.playbackRate = rate;
		this.refs.playbackRate.textContent = `${rate}x`;
		Settings.setProp('playbackRate', rate);
	}

	seek(s) {
		this.refs.audio.currentTime = this.refs.audio.currentTime + s;
	}
	play() {
		if (this.refs.audio.src !== this.episode.audio) {
			this.refs.audio.pause();
			this.refs.audio.src = '';
			this.refs.audio.src = this.episode.audio;
			this.refs.audio.load();
		}

		this.refs.audio.play();
	}
	pause() {
		this.refs.audio.pause();
	}

	render() {
		const imageSrc = this.episode.image || this.podcast.image || '/assets/img/default-episode-image.webp';
		this.refs.image.src = imageSrc;
		this.refs.imageMini.src = imageSrc;
		this.refs.title.textContent = this.episode.title;
		this.refs.podcastTitle.textContent = this.podcast.title;
		this.refs.playPause.setAttribute('guid', this.episode.guid);
		this.refs.timeTotal.textContent = secToTime(this.episode.duration);
		this.refs.timeRemaining.textContent = `-${secToTime(this.episode.duration - this.episode.progress)}`;
		this.refs.timeRange.max = this.episode.duration;
		this.refs.timeRange.value = this.episode.progress;
		this.refs.audio.src = this.episode.audio;
		this.refs.audio.load();
		this.refs.audio.currentTime = this.episode.progress;

		setLockscreenMedia({
			title: this.episode.title,
			artist: this.podcast.author,
			podcast: this.podcast.title,
			image: imageSrc,
			w: this.refs.image.naturalWidth,
			h: this.refs.image.naturalHeight,
		});
	}
}
customElements.define('episode-player', EpisodePlayer);
