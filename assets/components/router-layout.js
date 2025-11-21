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
		nav: ['episode->search', 'podcast->search'],
		exit: 'to-right',
		enter: 'from-back',
	},
	{
		nav: ['search->podcast', 'search->episode'],
		exit: 'to-back',
		enter: 'from-right',
	},
	{
		nav: ['index->search'],
		exit: 'to-left',
		enter: 'from-back',
	},
	{
		nav: ['search->index'],
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
			currentView: this.querySelector('router-view.active'),
		};
	}

	connectedCallback() {
		this.navigate();

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

	navigate() {
		const nextId = this.q.get('view');
		const fromId = this.refs.currentView.id;
		const nav = `${fromId}->${nextId}`;

		const t = transitions.find((t) => t.nav.includes(nav));
		document.documentElement.style.setProperty('--exit-animation', t.exit);
		document.documentElement.style.setProperty('--enter-animation', t.enter);

		const enteringView = [...this.refs.views].find((v) => v.id === nextId);
		if (!enteringView) return;

		enteringView.scrollTop = 0;

		const currentView = this.refs.currentView;

		// Set view transition names BEFORE making views visible
		currentView.style.viewTransitionName = 'old-view';
		enteringView.style.viewTransitionName = 'new-view';

		document
			.startViewTransition(() => {
				// Simply swap the active states - both views should be styled to be visible
				// when they have the active class, and the view-transition-name property
				// will handle capturing and animating them
				currentView.classList.remove('active');
				enteringView.classList.add('active');
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
