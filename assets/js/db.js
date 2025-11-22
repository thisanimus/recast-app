/**
 * @typedef {Object} Podcast
 * @property {string} title - The podcast title
 * @property {string} link - The podcast website link
 * @property {string} feedUrl - The podcast RSS feed URL (unique key)
 * @property {string} description - The podcast description
 * @property {string} summary - The podcast description
 * @property {string} pubDate - The podcast publication date
 * @property {string} image - The podcast cover image URL
 * @property {string} author - The podcast author/creator
 * @property {string} category - The podcast category
 * @property {boolean} explicit - Whether the podcast contains explicit content
 * @property {string} subtitle - The podcast subtitle
 */

/**
 * @typedef {Object} Episode
 * @property {string} podcast - The parent podcast's feedUrl
 * @property {string} title - The episode title
 * @property {string} link - The episode website link
 * @property {string} description - The episode description
 * @property {string} subtitle - The episode subtitle
 * @property {string} pubDate - The episode publication date
 * @property {string} guid - The episode unique identifier (unique key)
 * @property {string} image - The episode cover image URL
 * @property {string} audio - The episode audio file URL
 * @property {number} season - The season
 * @property {number} episode - The episode number
 * @property {number} filesize - The audio file size in bytes
 * @property {number} duration - The episode duration in seconds
 * @property {number} progress - The episode progress in seconds
 * @property {boolean} downloaded - If the audio file is downloaded
 * @property {boolean} archived - If the audio file is downloaded
 */

/**
 * IndexedDB Podcast Manager
 * Manages podcasts and episodes with an intuitive API
 */

class PodcastAppDB {
	constructor() {
		this.dbName = 'PodcastAppDB';
		this.version = 1;
		this.db = null;
	}

	/**
	 * Initialize the database
	 * @returns {Promise<IDBDatabase>}
	 */
	async init() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve(this.db);
			};

			request.onupgradeneeded = (event) => {
				const db = event.target.result;

				// Create podcasts store
				if (!db.objectStoreNames.contains('podcasts')) {
					const podcastStore = db.createObjectStore('podcasts', { keyPath: 'feedUrl' });
					podcastStore.createIndex('feedUrl', 'feedUrl', { unique: true });
				}

				// Create episodes store
				if (!db.objectStoreNames.contains('episodes')) {
					const episodeStore = db.createObjectStore('episodes', { keyPath: 'guid' });
					episodeStore.createIndex('guid', 'guid', { unique: true });
					episodeStore.createIndex('podcast', 'podcast', { unique: false });
				}
			};
		});
	}

	/**
	 * Podcast operations
	 */
	podcasts = {
		/**
		 * Upsert (create or update) a single podcast
		 * @param {Podcast} data - Single podcast object
		 * @returns {Promise<{success: boolean, feedUrl: string, error?: string}>}
		 */
		upsert: async (data) => {
			await this._ensureInit();
			const tx = this.db.transaction(['podcasts'], 'readwrite');
			const store = tx.objectStore('podcasts');

			try {
				await new Promise((resolve, reject) => {
					const request = store.put(data);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});

				await new Promise((resolve, reject) => {
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				});

				return { success: true, feedUrl: data.feedUrl };
			} catch (error) {
				return { success: false, feedUrl: data.feedUrl, error: error.message };
			}
		},

		/**
		 * Read one or more podcasts by feedUrl
		 * @param {string|string[]} feedUrls - Single feedUrl or array of feedUrls
		 * @returns {Promise<Podcast|Podcast[]|null>} Single podcast, array of podcasts, or null if not found
		 */
		read: async (feedUrls) => {
			await this._ensureInit();
			const urls = Array.isArray(feedUrls) ? feedUrls : [feedUrls];
			const tx = this.db.transaction(['podcasts'], 'readonly');
			const store = tx.objectStore('podcasts');

			const results = [];
			for (const url of urls) {
				const podcast = await new Promise((resolve, reject) => {
					const request = store.get(url);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
				results.push(podcast || null);
			}

			return Array.isArray(feedUrls) ? results : results[0];
		},

		/**
		 * Read all podcasts
		 * @returns {Promise<Podcast[]>}
		 */
		readAll: async () => {
			await this._ensureInit();
			const tx = this.db.transaction(['podcasts'], 'readonly');
			const store = tx.objectStore('podcasts');

			return new Promise((resolve, reject) => {
				const request = store.getAll();
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		},

		/**
		 * Delete a single podcast and all its episodes
		 * @param {string} feedUrl - The podcast's feedUrl
		 * @returns {Promise<{success: boolean, feedUrl: string, deletedEpisodes: number, error?: string}>}
		 */
		delete: async (feedUrl) => {
			await this._ensureInit();
			const tx = this.db.transaction(['podcasts', 'episodes'], 'readwrite');
			const podcastStore = tx.objectStore('podcasts');
			const episodeStore = tx.objectStore('episodes');
			const episodeIndex = episodeStore.index('podcast');

			try {
				// Delete the podcast
				await new Promise((resolve, reject) => {
					const request = podcastStore.delete(feedUrl);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});

				// Get all episodes for this podcast
				const episodes = await new Promise((resolve, reject) => {
					const request = episodeIndex.getAll(feedUrl);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});

				// Delete all episodes
				for (const episode of episodes) {
					await new Promise((resolve, reject) => {
						const request = episodeStore.delete(episode.guid);
						request.onsuccess = () => resolve();
						request.onerror = () => reject(request.error);
					});
				}

				await new Promise((resolve, reject) => {
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				});

				return { success: true, feedUrl, deletedEpisodes: episodes.length };
			} catch (error) {
				return { success: false, feedUrl, deletedEpisodes: 0, error: error.message };
			}
		},
	};

	/**
	 * Episode operations
	 */
	episodes = {
		/**
		 * Upsert (create or update) one or more episodes
		 * @param {Episode|Episode[]} data - Single episode or array of episodes
		 * @returns {Promise<Array<{success: boolean, guid: string, error?: string}>>}
		 */
		upsert: async (data) => {
			await this._ensureInit();
			const items = Array.isArray(data) ? data : [data];
			const tx = this.db.transaction(['episodes'], 'readwrite');
			const store = tx.objectStore('episodes');

			const results = [];
			for (const item of items) {
				try {
					// First, try to get the existing item
					const existingItem = await new Promise((resolve, reject) => {
						const request = store.get(item.guid); // assuming 'guid' is your key
						request.onsuccess = () => resolve(request.result);
						request.onerror = () => reject(request.error);
					});

					// Merge: preserve progress and archived from existing item
					const mergedItem = {
						...item,
						...(existingItem && {
							progress: existingItem.progress,
							archived: existingItem.archived,
						}),
					};

					await new Promise((resolve, reject) => {
						const request = store.put(mergedItem);
						request.onsuccess = () => resolve(request.result);
						request.onerror = () => reject(request.error);
					});
					results.push({ success: true, guid: item.guid });
				} catch (error) {
					results.push({ success: false, guid: item.guid, error: error.message });
				}
			}

			await new Promise((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});

			return results;
		},

		/**
		 * Upsert (create or update) one or more episodes
		 * @param {string} guid - the ID of the episode
		 * @param {string} key - the prop key to update
		 * @param {string|number|boolean} value - the new prop value
		 * @returns {Promise<Episode>}
		 */
		updateProp: async (guid, key, value) => {
			await this._ensureInit();
			const tx = this.db.transaction(['episodes'], 'readwrite');
			const store = tx.objectStore('episodes');

			const getEpisode = store.get(guid);

			getEpisode.onsuccess = (event) => {
				const episode = event.target.result;
				if (episode) {
					episode[key] = value;
					store.put(episode);
					return episode;
				} else {
					console.log('Record not found');
				}
			};

			getEpisode.onerror = function (event) {
				console.error('Error retrieving data:', event.target.error);
			};
		},

		/**
		 * Read one or more episodes by guid
		 * @param {string|string[]} guids - Single guid or array of guids
		 * @returns {Promise<Episode|Episode[]|null>} Single episode, array of episodes, or null if not found
		 */
		read: async (guids) => {
			await this._ensureInit();
			const ids = Array.isArray(guids) ? guids : [guids];
			const tx = this.db.transaction(['episodes'], 'readonly');
			const store = tx.objectStore('episodes');

			const results = [];
			for (const id of ids) {
				const episode = await new Promise((resolve, reject) => {
					const request = store.get(id);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
				results.push(episode || null);
			}

			return Array.isArray(guids) ? results : results[0];
		},

		/**
		 * Read all episodes
		 * @returns {Promise<Episode[]>}
		 */
		readAll: async () => {
			await this._ensureInit();
			const tx = this.db.transaction(['episodes'], 'readonly');
			const store = tx.objectStore('episodes');

			return new Promise((resolve, reject) => {
				const request = store.getAll();
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		},

		/**
		 * Read all episodes for a specific podcast
		 * @param {string} feedUrl - The podcast's feedUrl
		 * @returns {Promise<Episode[]>}
		 */
		readByPodcast: async (feedUrl) => {
			await this._ensureInit();
			const tx = this.db.transaction(['episodes'], 'readonly');
			const store = tx.objectStore('episodes');
			const index = store.index('podcast');

			return new Promise((resolve, reject) => {
				const request = index.getAll(feedUrl);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		},

		/**
		 * Delete one or more episodes by guid
		 * @param {string|string[]} guids - Single guid or array of guids
		 * @returns {Promise<Array<{success: boolean, guid: string, error?: string}>>}
		 */
		delete: async (guids) => {
			await this._ensureInit();
			const ids = Array.isArray(guids) ? guids : [guids];
			const tx = this.db.transaction(['episodes'], 'readwrite');
			const store = tx.objectStore('episodes');

			const results = [];
			for (const id of ids) {
				try {
					await new Promise((resolve, reject) => {
						const request = store.delete(id);
						request.onsuccess = () => resolve();
						request.onerror = () => reject(request.error);
					});
					results.push({ success: true, guid: id });
				} catch (error) {
					results.push({ success: false, guid: id, error: error.message });
				}
			}

			await new Promise((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});

			return results;
		},
	};

	/**
	 * Ensure database is initialized
	 * @private
	 */
	async _ensureInit() {
		if (!this.db) {
			await this.init();
		}
	}

	/**
	 * Close the database connection
	 */
	close() {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}

	/**
	 * Delete the entire database
	 * @returns {Promise<void>}
	 */
	static async deleteDatabase() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.deleteDatabase('PodcastDB');
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}
}

export const Db = new PodcastAppDB();
