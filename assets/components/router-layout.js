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
			if (this.q.view !== this.refs.currentView.id) {
				this.navigate();
			}
		});

		window.addEventListener('popstate', (e) => {
			e.preventDefault();
			// TODO: always go "back"

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
		const nav = `${this.refs.currentView.id}->${this.q.get('view')}`;

		const transition = transitions.find((t) => t.nav.includes(nav));

		const exitingAnimation = transition?.exit || 'fade-out';
		const enteringAnimation = transition?.enter || 'fade-in';

		const enteringView = Array.from(this.refs.views).find((v) => v.id == this.q.get('view'));
		if (enteringView) {
			enteringView.scrollTop = 0;
			enteringView.classList.add('active', 'entering', 'animating');

			enteringView.style.animationName = enteringAnimation;
			enteringView.style.zIndex = 3;
			if (this.refs.currentView.id !== enteringView.id) {
				this.refs.currentView.classList.remove('active');
			}

			this.refs.currentView.classList.add('exiting', 'animating');
			this.refs.currentView.style.animationName = exitingAnimation;
			Promise.all([
				new Promise((resolve) => {
					this.refs.currentView.addEventListener('animationend', resolve, { once: true });
				}),
				new Promise((resolve) => {
					enteringView.addEventListener('animationend', resolve, { once: true });
				}),
			]).then(() => {
				// Clean up
				this.refs.currentView.classList.remove('exiting', 'animating');
				this.refs.currentView.removeAttribute('style');

				enteringView.classList.remove('entering', 'animating');
				enteringView.removeAttribute('style');

				this.refs.currentView = enteringView;
			});
		}
	}
}
customElements.define('router-layout', RouterLayout);
