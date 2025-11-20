import { pause, play } from '../js/icons.js';

class PlayPause extends HTMLElement {
	static get observedAttributes() {
		return ['guid', 'state', 'progress'];
	}
	constructor() {
		super();
		this.guid = this.getAttribute('guid');
		this.state = this.getAttribute('state');
		this.progress = this.getAttribute('progress');
		this.refs = {
			episodePlayer: document.querySelector('episode-player'),
			icon: this.querySelector('.icon'),
			button: this.querySelector('button'),
		};
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue !== newValue && this[name] !== newValue) {
			this[name] = newValue;
			if (name == 'state') {
				const buttonTitle = newValue == 'play' ? 'Pause' : 'Play';
				this.refs.button.title = buttonTitle;
				this.refs.icon.innerHTML = newValue == 'play' ? pause : play;
			}
			if (name == 'progress') {
				this.style.setProperty('--progress', newValue);
			}
		}
	}

	connectedCallback() {
		this.refs.episodePlayer = document.querySelector('episode-player');
		this.refs.button = this.querySelector('button');
		this.refs.icon.innerHTML = play;
		if (this.refs.episodePlayer.refs?.audio.src === this.guid) {
			if (!this.refs.episodePlayer.refs.audio.paused) {
				this.setAttribute('state', 'play');
				this.refs.icon.innerHTML = pause;
			}
		}
		this.attachEventListeners();
	}

	attachEventListeners() {
		this.addEventListener('click', () => {
			if (this.state == 'play') {
				this.refs.episodePlayer.pause();
			} else {
				if (this.refs.episodePlayer.guid !== this.guid) {
					this.refs.episodePlayer.setAttribute('guid', this.guid);
				}
				// TODO fix this
				setTimeout(() => {
					this.refs.episodePlayer.play();
				}, 20);
			}
		});
	}
}
customElements.define('play-pause', PlayPause);
