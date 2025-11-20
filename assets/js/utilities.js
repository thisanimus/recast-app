export const secToTime = (sec) => {
	const date = new Date(0);
	date.setSeconds(sec);
	const timeString = date.toISOString().substring(11, 19);
	return timeString.startsWith('00:') ? timeString.substring(3, 8) : timeString;
};
