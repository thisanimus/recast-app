/**
 * Manages podcast application settings with localStorage persistence.
 * Provides methods to load, save, and update settings.
 */
class PodcastAppSettings {
	constructor() {
		/**
		 * The localStorage key used to store settings.
		 * @type {string}
		 */
		this.storageKey = 'podcastAppSettings';

		/**
		 * Settings data object containing all podcast app configuration.
		 * @property {number} playbackRate - Playback speed multiplier (e.g., 1 = normal, 1.5 = 1.5x speed)
		 * @property {string} currentEpisode - The currently selected/playing episode
		 */
		this.stored = {
			playbackRate: 1,
			currentEpisode: null,
			persisted: false,
			usage: 0,
			quota: 0,
		};
		this.online = navigator.onLine;

		this.loadStored();
		this.fetchStorageStats();
		this.checkStoragePersistence();
		this.addEventListeners();
	}

	addEventListeners() {
		window.addEventListener('online', () => this.setOlineStatus(true));
		window.addEventListener('offline', () => this.setOlineStatus(false));
	}

	setOlineStatus(online) {
		if (online !== this.online) {
			this.online = online;
			console.log('Online changed:', online);
		}
	}

	/**
	 * Loads settings from localStorage and merges them with default values.
	 * If loading fails, logs an error and keeps default settings.
	 */
	loadStored() {
		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				const parsed = JSON.parse(stored);
				this.stored = { ...this.stored, ...parsed };
			}
		} catch (error) {
			console.error('Error loading settings from localStorage:', error);
		}
	}

	/**
	 * Saves current settings to localStorage.
	 * Logs an error if saving fails.
	 */
	saveStored() {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(this.stored));
		} catch (error) {
			console.error('Error saving settings to localStorage:', error);
		}
	}

	/**
	 * Updates a specific property in settings and persists the change.
	 * @param {string} key - The property key to update
	 * @param {*} value - The new value for the property
	 */
	setStored(key, value) {
		this.stored[key] = value;
		this.saveStored();
	}

	async fetchStorageStats() {
		if ('storage' in navigator && 'estimate' in navigator.storage) {
			const { usage, quota } = await navigator.storage.estimate();

			this.stored.usage = usage;
			this.stored.quota = quota;
			this.saveStored();
		}
	}

	async requestPersistentStorage() {
		if (navigator.storage && navigator.storage.persist) {
			const isPersisted = await navigator.storage.persist();
			console.log(`Persistent storage granted: ${isPersisted}`);
			this.setStored('persisted', isPersisted);
			return isPersisted;
		}
		return false;
	}

	async checkStoragePersistence() {
		if (navigator.storage && navigator.storage.persisted) {
			const isPersisted = await navigator.storage.persisted();
			console.log(`Storage is persistent: ${isPersisted}`);
			this.setStored('persisted', isPersisted);
			return isPersisted;
		}
		return false;
	}
}

/**
 * Singleton instance of PodcastAppSettings.
 * Use this to access and modify podcast app settings throughout the application.
 * @type {PodcastAppSettings}
 */
export const Settings = new PodcastAppSettings();
