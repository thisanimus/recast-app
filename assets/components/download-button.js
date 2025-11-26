import { cacheAudio, checkAudio, deleteAudio } from '../js/podcast.js';

class DownloadButton extends HTMLElement {
	static get observedAttributes() {
		return ['downloaded'];
	}
	constructor() {
		super();
		this.downloaded = this.getAttribute('downloaded');
		this.guid = this.getAttribute('guid');
		this.url = this.getAttribute('url');
		this.refs = {
			button: this.querySelector('button'),
		};
		this.handleButtonClick = this.handleButtonClick.bind(this);
	}
	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue !== newValue && this[name] !== newValue) {
			this[name] = newValue;
			if (name == 'downloaded') {
				this.render();
			}
		}
	}
	connectedCallback() {
		this.refs.button.addEventListener('click', this.handleButtonClick);
		checkAudio(this.url, this.guid).then((res) => {
			this.setAttribute('downloaded', res);
			this.render();
		});
	}
	disconnectedCallback() {
		this.refs.button.removeEventListener('click', this.handleButtonClick);
	}
	handleButtonClick() {
		if (this.downloaded == 'true') {
			deleteAudio(this.url, this.guid).then(() => {
				this.setAttribute('downloaded', 'false');
			});
		} else {
			this.setAttribute('downloaded', 'pending');
			cacheAudio(this.url, this.guid).then(() => {
				this.setAttribute('downloaded', 'true');
			});
		}
	}
	icon() {
		if (this.downloaded == 'true') {
			return /*html*/ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="54" d="M416 128L192 384l-96-96"/></svg>`;
		} else if (this.downloaded == 'pending') {
			return /*html*/ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
				<circle stroke-dasharray="164.93361431346415 56.97787143782138" r="35" stroke-width="8" stroke="currentColor" fill="none" cy="50" cx="50" data-idx="2" transform="matrix(-0.904827075144395,0.42577924337106826,-0.42577924337106826,-0.904827075144395,116.53031592577317,73.95239158866633)">
					<animateTransform
						attributeName="transform"
						attributeType="XML"
						type="rotate"
						from="0 50 50"
						to="360 50 50"
						dur="2s"
						repeatCount="indefinite" />
				</circle>
			</svg>`;
		} else {
			return /*html*/ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M112 268l144 144 144-144M256 392V100"/></svg>`;
		}
	}
	render() {
		this.refs.button.title = this.downloaded == 'true' ? 'Remove from Downloads' : 'Download';
		this.refs.button.innerHTML = this.icon();
	}
}
customElements.define('download-button', DownloadButton);
