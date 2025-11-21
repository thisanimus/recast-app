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
