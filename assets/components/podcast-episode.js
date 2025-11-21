import { formatRFCDate, secondsToTextTime } from '../js/utilities.js';
export const podcastEpisode = (e) => {
	const makePrepend = () => {
		let prependArray = [];
		if (e.season && e.episode) {
			prependArray.push(`S${e.season}/E${e.episode}`);
		}
		prependArray.push(formatRFCDate(e.pubDate));
		return prependArray.join(' • ');
	};
	const prepend = makePrepend();

	const makeAppend = () => {
		let appendArray = [secondsToTextTime(e.duration)];
		if (e.progress > 0) {
			appendArray.push(`${secondsToTextTime(e.duration - e.progress)} left`);
		}
		return appendArray.join(' • ');
	};
	const append = makeAppend();

	return `<li class="podcast-episode">
					<play-pause state="pause" guid="${e.guid}" progress="${e.progress / e.duration}">
						<button title="Play">
							<div class="episode-details">
							<div class="prepend">${prepend}</div>
							<div class="title">${e.title}</div>
							<div class="append">${append}</div>
							</div>
							<div>
							<div class="icon-wrapper">
								<div class="icon">
									<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
										<path d="M173,440c-6.14-.01-12.17-1.62-17.5-4.67-12-6.8-19.46-20-19.46-34.33V111c0-14.37,7.46-27.53,19.46-34.33,11.11-6.39,24.82-6.21,35.77.45l247.85,148.36c16.84,10.56,21.94,32.78,11.38,49.62-2.89,4.6-6.77,8.49-11.38,11.38l-247.89,148.4c-5.5,3.33-11.8,5.1-18.23,5.12Z"/>
									</svg>
								</div>
								<div class="circle-progress">
									<div class="progress"></div>
								</div>
							</div>
							
						</button>
					</play-pause>
			</li>`;
};
