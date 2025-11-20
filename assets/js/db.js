import { sqlite3Worker1Promiser } from '/assets/sqlite-wasm/index.mjs';

/**
 * @typedef {Object} Podcast
 * @property {string} title - The podcast title
 * @property {string} link - The podcast website link
 * @property {string} feedUrl - The podcast RSS feed URL (unique key)
 * @property {string} description - The podcast description
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
 * SQLite-wasm + OPFS Podcast Manager
 * Manages podcasts and episodes with an intuitive API
 */

class PodcastAppDB {
	constructor() {
		this.dbName = 'podcast.db';
		this.promiser = null;
	}

	/**
	 * Initialize the database with SQLite worker
	 * @returns {Promise<void>}
	 */
	async init() {
		if (this.promiser) return;

		this.promiser = await sqlite3Worker1Promiser({
			type: 'module',
			url: '/assets/js/sqlite-wasm/jswasm/sqlite3-worker1.mjs',
		});

		// Open database with OPFS
		await this.promiser('open', {
			filename: 'file:podcast.db?vfs=opfs',
		});

		// Create tables
		await this.promiser('exec', {
			sql: `
				CREATE TABLE IF NOT EXISTS podcasts (
					feedUrl TEXT PRIMARY KEY,
					title TEXT NOT NULL,
					link TEXT,
					description TEXT,
					pubDate TEXT,
					image TEXT,
					author TEXT,
					category TEXT,
					explicit INTEGER DEFAULT 0,
					subtitle TEXT
				);

				CREATE TABLE IF NOT EXISTS episodes (
					guid TEXT PRIMARY KEY,
					podcast TEXT NOT NULL,
					title TEXT NOT NULL,
					link TEXT,
					description TEXT,
					subtitle TEXT,
					pubDate TEXT,
					image TEXT,
					audio TEXT,
					season INTEGER,
					episode INTEGER,
					filesize INTEGER,
					duration INTEGER,
					progress INTEGER DEFAULT 0,
					downloaded INTEGER DEFAULT 0,
					archived INTEGER DEFAULT 0,
					FOREIGN KEY (podcast) REFERENCES podcasts(feedUrl) ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_episodes_podcast ON episodes(podcast);
				CREATE INDEX IF NOT EXISTS idx_episodes_pubDate ON episodes(pubDate);
			`,
			returnValue: 'resultRows',
		});
	}

	/**
	 * Podcast operations
	 */
	podcasts = {
		/**
		 * Upsert (create or update) one or more podcasts
		 * @param {Podcast} data - Single podcast
		 * @returns {Promise<Podcast>}
		 */
		upsert: async (data) => {
			await this._ensureInit();

			await this.promiser('exec', {
				sql: `
					INSERT INTO podcasts (feedUrl, title, link, description, pubDate, image, author, category, explicit, subtitle)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(feedUrl) DO UPDATE SET
						title = excluded.title,
						link = excluded.link,
						description = excluded.description,
						pubDate = excluded.pubDate,
						image = excluded.image,
						author = excluded.author,
						category = excluded.category,
						explicit = excluded.explicit,
						subtitle = excluded.subtitle
				`,
				bind: [
					data.feedUrl,
					data.title,
					data.link || null,
					data.description || null,
					data.pubDate || null,
					data.image || null,
					data.author || null,
					data.category || null,
					data.explicit ? 1 : 0,
					data.subtitle || null,
				],
			});

			return data;
		},

		/**
		 * Read one podcast by feedUrl
		 * @param {string} feedUrl - Single feedUrl
		 * @returns {Promise<Podcast|null>} Single podcast, or null if not found
		 */
		read: async (feedUrl) => {
			await this._ensureInit();

			const query = await this.promiser('exec', {
				sql: 'SELECT * FROM podcasts WHERE feedUrl = ?',
				bind: [feedUrl],
				returnValue: 'resultRows',
				rowMode: 'object',
			});

			const rows = query.result.resultRows;
			if (rows.length > 0) {
				return {
					...rows[0],
					explicit: Boolean(rows[0].explicit),
				};
			}
			return null;
		},

		/**
		 * Read all podcasts
		 * @returns {Promise<Podcast[]>}
		 */
		readAll: async () => {
			await this._ensureInit();

			const query = await this.promiser('exec', {
				sql: 'SELECT * FROM podcasts ORDER BY title',
				returnValue: 'resultRows',
				rowMode: 'object',
			});

			return query.result.resultRows.map((row) => ({
				...row,
				explicit: Boolean(row.explicit),
			}));
		},

		/**
		 * Delete podcasts by feedUrl
		 * @param {string} feedUrl - Single feedUrl
		 * @returns {Promise<{success: boolean, error?: string}>}
		 */
		delete: async (feedUrl) => {
			await this._ensureInit();

			try {
				await this.promiser('exec', {
					sql: 'DELETE FROM podcasts WHERE feedUrl = ?',
					bind: [feedUrl],
				});
				return { success: true };
			} catch (error) {
				return { success: false, error: error.message };
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

			const episodes = Array.isArray(data) ? data : [data];
			const results = [];

			for (const episode of episodes) {
				try {
					// First check if episode exists to preserve progress, archived, downloaded
					const query = await this.promiser('exec', {
						sql: 'SELECT progress, archived, downloaded FROM episodes WHERE guid = ?',
						bind: [episode.guid],
						returnValue: 'resultRows',
						rowMode: 'object',
					});

					const existing = query.result.resultRows;
					const preserveProgress = existing.length > 0 ? existing[0].progress : 0;
					const preserveArchived = existing.length > 0 ? existing[0].archived : 0;
					const preserveDownloaded = existing.length > 0 ? existing[0].downloaded : 0;

					await this.promiser('exec', {
						sql: `
							INSERT INTO episodes (guid, podcast, title, link, description, subtitle, pubDate, image, audio, season, episode, filesize, duration, progress, downloaded, archived)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
							ON CONFLICT(guid) DO UPDATE SET
								podcast = excluded.podcast,
								title = excluded.title,
								link = excluded.link,
								description = excluded.description,
								subtitle = excluded.subtitle,
								pubDate = excluded.pubDate,
								image = excluded.image,
								audio = excluded.audio,
								season = excluded.season,
								episode = excluded.episode,
								filesize = excluded.filesize,
								duration = excluded.duration
						`,
						bind: [
							episode.guid,
							episode.podcast,
							episode.title,
							episode.link || null,
							episode.description || null,
							episode.subtitle || null,
							episode.pubDate || null,
							episode.image || null,
							episode.audio || null,
							episode.season || null,
							episode.episode || null,
							episode.filesize || null,
							episode.duration || null,
							preserveProgress,
							preserveDownloaded,
							preserveArchived,
						],
					});

					results.push({ success: true, guid: episode.guid });
				} catch (error) {
					results.push({ success: false, guid: episode.guid, error: error.message });
				}
			}

			return results;
		},

		/**
		 * Update Prop - Update a single property of one episode
		 * @param {string} guid - the ID of the episode
		 * @param {string} key - the prop key to update
		 * @param {string|number} value - the new prop value
		 * @returns {Promise<Episode>}
		 */
		updateProp: async (guid, key, value) => {
			await this._ensureInit();

			// Validate the key to prevent SQL injection
			const allowedKeys = [
				'progress',
				'downloaded',
				'archived',
				'title',
				'description',
				'subtitle',
				'image',
				'audio',
				'season',
				'episode',
				'filesize',
				'duration',
			];
			if (!allowedKeys.includes(key)) {
				throw new Error(`Invalid property key: ${key}`);
			}

			await this.promiser('exec', {
				sql: `UPDATE episodes SET ${key} = ? WHERE guid = ?`,
				bind: [value, guid],
			});

			return await this.episodes.read(guid);
		},

		/**
		 * Read one episode by guid
		 * @param {string} guid - Single guid
		 * @returns {Promise<Episode|null>} Single episode, or null if not found
		 */
		read: async (guid) => {
			await this._ensureInit();

			const query = await this.promiser('exec', {
				sql: 'SELECT * FROM episodes WHERE guid = ?',
				bind: [guid],
				returnValue: 'resultRows',
				rowMode: 'object',
			});

			const rows = query.result.resultRows;
			if (rows.length > 0) {
				return {
					...rows[0],
					downloaded: Boolean(rows[0].downloaded),
					archived: Boolean(rows[0].archived),
				};
			}
			return null;
		},

		/**
		 * Read all episodes
		 * @returns {Promise<Episode[]>}
		 */
		readAll: async () => {
			await this._ensureInit();

			const query = await this.promiser('exec', {
				sql: 'SELECT * FROM episodes ORDER BY pubDate DESC',
				returnValue: 'resultRows',
				rowMode: 'object',
			});

			return query.result.resultRows.map((row) => ({
				...row,
				downloaded: Boolean(row.downloaded),
				archived: Boolean(row.archived),
			}));
		},

		/**
		 * Read all episodes for a specific podcast
		 * @param {string} feedUrl - The podcast's feedUrl
		 * @returns {Promise<Episode[]>}
		 */
		readByPodcast: async (feedUrl) => {
			await this._ensureInit();

			const query = await this.promiser('exec', {
				sql: 'SELECT * FROM episodes WHERE podcast = ? ORDER BY pubDate DESC',
				bind: [feedUrl],
				returnValue: 'resultRows',
				rowMode: 'object',
			});

			return query.result.resultRows.map((row) => ({
				...row,
				downloaded: Boolean(row.downloaded),
				archived: Boolean(row.archived),
			}));
		},

		/**
		 * Delete one or more episodes by guid
		 * @param {string|string[]} guids - Single guid or array of guids
		 * @returns {Promise<Array<{success: boolean, guid: string, error?: string}>>}
		 */
		delete: async (guids) => {
			await this._ensureInit();

			const guidArray = Array.isArray(guids) ? guids : [guids];
			const results = [];

			for (const guid of guidArray) {
				try {
					await this.promiser('exec', {
						sql: 'DELETE FROM episodes WHERE guid = ?',
						bind: [guid],
					});
					results.push({ success: true, guid });
				} catch (error) {
					results.push({ success: false, guid, error: error.message });
				}
			}

			return results;
		},
	};

	/**
	 * Ensure database is initialized
	 * @private
	 */
	async _ensureInit() {
		if (!this.promiser) {
			await this.init();
		}
	}

	/**
	 * Close the database connection
	 */
	close() {
		if (this.promiser) {
			this.promiser('close');
			this.promiser = null;
		}
	}

	/**
	 * Delete the entire database
	 * @returns {Promise<void>}
	 */
	static async deleteDatabase() {
		// For OPFS, we need to manually delete the file
		try {
			const root = await navigator.storage.getDirectory();
			await root.removeEntry('podcast.db');
		} catch (error) {
			console.warn('Database file may not exist:', error);
		}
	}
}

export const Db = new PodcastAppDB();
