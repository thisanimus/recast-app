import { Settings } from '../data/settings.js';
import { formatBytes } from '../js/utilities.js';

class ViewSettings extends HTMLElement {
	constructor() {
		super();
		this.refs = {
			view: this.closest('router-view'),
			usage: this.querySelector('#usage'),
			quota: this.querySelector('#quota'),
			percentage: this.querySelector('#percentage'),
			persisted: this.querySelector('#persisted'),
			requestPersist: this.querySelector('#request-persist'),
			online: this.querySelector('#online'),
		};
	}
	connectedCallback() {
		this.addEventListeners();
		this.render();
		this.refs.view.setAttribute('ready', true);
	}

	addEventListeners() {
		this.refs.requestPersist.addEventListener('click', async () => {
			const isPersisted = await Settings.requestPersistentStorage();
			this.refs.persisted.textContent = isPersisted ? '✓' : '⨉';
		});
	}
	render() {
		this.refs.usage.textContent = formatBytes(Settings.stored.usage);
		this.refs.quota.textContent = formatBytes(Settings.stored.quota);
		this.refs.percentage.value = Settings.stored.usage;
		this.refs.percentage.max = Settings.stored.quota;
		this.refs.online.textContent = Settings.online ? '✓' : '⨉';
	}
}
customElements.define('view-settings', ViewSettings);
