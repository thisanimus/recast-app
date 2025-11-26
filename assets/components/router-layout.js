const transitions = [
	{
		nav: ['index->podcast', 'index->episode', 'podcast->episode'],
		exit: 'to-left',
		enter: 'from-right',
	},
	{
		nav: ['episode->podcast', 'episode->index', 'podcast->index'],
		exit: 'to-right',
		enter: 'from-left',
	},
	{
		nav: ['episode->add', 'podcast->add'],
		exit: 'to-right',
		enter: 'from-back',
	},
	{
		nav: ['add->podcast', 'add->episode'],
		exit: 'to-back',
		enter: 'from-right',
	},
	{
		nav: ['index->add'],
		exit: 'to-left',
		enter: 'from-back',
	},
	{
		nav: ['add->index'],
		exit: 'to-back',
		enter: 'from-left',
	},
];

export class RouterLayout extends HTMLElement {
	constructor() {
		super();
		this.q = new URLSearchParams(window.location.search);
		this.refs = {
			views: this.querySelectorAll('router-view'),
			currentView: this.querySelector('router-view[state="active"]'),
		};
	}

	connectedCallback() {
		if (this.q.get('view') !== this.refs.currentView.id) {
			this.navigate();
		}

		this.addEventListener('click', this.handleClick.bind(this));

		window.addEventListener('urlchange', () => {
			this.q = new URLSearchParams(window.location.search);
			if (this.q.get('view') !== this.refs.currentView.id) {
				this.navigate();
			}
		});

		window.addEventListener('popstate', () => {
			this.q = new URLSearchParams(window.location.search);
			this.navigate();
		});
	}

	handleClick(e) {
		const link = e.target.closest('a.router-link');
		if (!link) return;

		e.preventDefault();

		const href = link.getAttribute('href');
		window.history.pushState({}, '', href);
	}

	async navigate() {
		const nextId = this.q.get('view');
		const fromId = this.refs.currentView.id;
		const nav = `${fromId}->${nextId}`;

		const enteringView = [...this.refs.views].find((v) => v.id === nextId);

		if (!enteringView) return;

		const t = transitions.find((t) => t.nav.includes(nav));
		document.documentElement.style.setProperty('--exit-animation', t.exit);
		document.documentElement.style.setProperty('--enter-animation', t.enter);

		enteringView.scrollTop = 0;

		const currentView = this.refs.currentView;

		// Wait for the entering view to be loaded before starting transition
		if (!enteringView.hasAttribute('ready')) {
			await new Promise((resolve) => {
				const observer = new MutationObserver((mutations) => {
					if (enteringView.hasAttribute('ready')) {
						observer.disconnect();
						resolve();
					}
				});

				observer.observe(enteringView, {
					attributes: true,
					attributeFilter: ['ready'],
				});

				// If it's already loaded by the time we check, resolve immediately
				if (enteringView.hasAttribute('ready')) {
					observer.disconnect();
					resolve();
				}
			});
		}

		// Set view transition names BEFORE making views visible
		currentView.style.viewTransitionName = 'old-view';
		enteringView.style.viewTransitionName = 'new-view';

		document
			.startViewTransition(() => {
				currentView.setAttribute('state', 'inactive');
				enteringView.setAttribute('state', 'active');
				this.refs.currentView = enteringView;
			})
			.finished.then(() => {
				// Cleanup names after transition completes
				currentView.style.viewTransitionName = '';
				enteringView.style.viewTransitionName = '';
			});
	}
}

customElements.define('router-layout', RouterLayout);
