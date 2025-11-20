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
		this.data = {
			playbackRate: 1,
			currentEpisode: null,
		};

		this.loadSettings();
	}

	/**
	 * Loads settings from localStorage and merges them with default values.
	 * If loading fails, logs an error and keeps default settings.
	 */
	loadSettings() {
		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				const parsed = JSON.parse(stored);
				this.data = { ...this.data, ...parsed };
			}
		} catch (error) {
			console.error('Error loading settings from localStorage:', error);
		}
	}

	/**
	 * Saves current settings to localStorage.
	 * Logs an error if saving fails.
	 */
	saveSettings() {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(this.data));
		} catch (error) {
			console.error('Error saving settings to localStorage:', error);
		}
	}

	/**
	 * Updates a specific property in settings and persists the change.
	 * @param {string} key - The property key to update
	 * @param {*} value - The new value for the property
	 */
	setProp(key, value) {
		this.data[key] = value;
		this.saveSettings();
	}

	async requestPersistentStorage() {
		if (navigator.storage && navigator.storage.persist) {
			const isPersisted = await navigator.storage.persist();
			console.log(`Persistent storage granted: ${isPersisted}`);
			return isPersisted;
		}
		return false;
	}

	async checkStoragePersistence() {
		if (navigator.storage && navigator.storage.persisted) {
			const isPersisted = await navigator.storage.persisted();
			console.log(`Storage is persistent: ${isPersisted}`);
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
