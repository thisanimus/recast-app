class RouterView extends HTMLElement {
	static get observedAttributes() {
		return ['ready', 'state'];
	}
	constructor() {
		super();
		this.ready = this.getAttribute('ready');
		this.state = this.getAttribute('state');
	}
	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue !== newValue && this[name] !== newValue) {
			this[name] = newValue;
		}
	}
	connectedCallback() {
		window.addEventListener('urlchange', () => {
			const q = new URLSearchParams(window.location.search);
			if (q.get('view') !== this.id) {
				this.removeAttribute('ready');
			}
		});
	}
}
customElements.define('router-view', RouterView);
