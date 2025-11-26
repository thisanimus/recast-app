const PROXY_PREFIX = 'https://proxy.thisanimus.com/?url=';

/**
 * Fetches a URL with automatic fallback to proxy for CORS issues.
 *
 * @param {string} url - The URL to fetch
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} If both direct and proxy fetch fail
 */
export const proxyFetch = async (url) => {
	const proxyUrl = PROXY_PREFIX + url;
	let response;

	try {
		// Try direct fetch first
		response = await fetch(url);
		// If fetch succeeds but returns HTTP error, try proxy
		if (!response.ok) {
			console.log(`Direct fetch returned ${response.status}, trying proxy...`);
			response = await fetch(proxyUrl);
			if (!response.ok) {
				throw new Error(`Both fetches failed. Proxy returned: ${response.status}`);
			}
		}
	} catch (fetchError) {
		// CORS errors or network failures end up here
		console.log('Direct fetch failed (likely CORS), trying proxy...', fetchError.message);
		try {
			response = await fetch(proxyUrl);
			if (!response.ok) {
				throw new Error(`Proxy fetch failed: ${response.status}`);
			}
		} catch (proxyError) {
			throw new Error(`Both direct and proxy fetch failed: ${proxyError.message}`);
		}
	}

	return response;
};

export const secToTime = (sec) => {
	const date = new Date(0);
	date.setSeconds(sec);
	const timeString = date.toISOString().substring(11, 19);
	return timeString.startsWith('00:') ? timeString.substring(3, 8) : timeString;
};

export const formatRFCDate = (dateString) => {
	const date = new Date(dateString);

	if (isNaN(date)) {
		throw new Error('Invalid date string');
	}

	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
};

export const secondsToTextTime = (seconds) => {
	// hours = (seconds / 3600) % 60
	let hours = Math.floor(seconds / 3600) % 60;

	if (hours < 1) {
		hours = '';
	} else {
		hours = `${hours}h `;
	}

	// minutes = (seconds / 60) % 60
	let minutes = Math.floor(seconds / 60) % 60;
	minutes = `${minutes}m`;

	return `${hours}${minutes}`;
};

/**
 * Parses a duration (string or number) into seconds.
 *
 * Accepts:
 * - Number of seconds (number)
 * - Numeric string ("120")
 * - MM:SS ("03:25")
 * - HH:MM:SS ("01:05:33")
 *
 * @param {string|number} value
 * @returns {number}
 */
export const parseDuration = (value) => {
	if (value == null) return 0; // null/undefined

	// If number: assume it's already seconds
	if (typeof value === 'number' && !isNaN(value)) {
		return Math.floor(value);
	}

	// Coerce everything else to string
	const str = String(value).trim();
	if (!str) return 0;

	// If the string is purely digits => seconds
	if (/^\d+$/.test(str)) {
		return parseInt(str, 10);
	}

	// Handle colon-based formats
	const parts = str.split(':').map((p) => parseInt(p, 10));
	if (parts.some((n) => isNaN(n))) return 0;

	if (parts.length === 3) {
		// HH:MM:SS
		const [h, m, s] = parts;
		return h * 3600 + m * 60 + s;
	}

	if (parts.length === 2) {
		// MM:SS
		const [m, s] = parts;
		return m * 60 + s;
	}

	// Fallback—just a number (rare)
	return parts[0] || 0;
};
