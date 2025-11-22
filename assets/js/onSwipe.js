export const onSwipe = (element, { onSwipeUp, onSwipeDown, minDistance = 20, maxTime = 500 } = {}) => {
	const touch = { startY: 0, startTime: 0 };

	function start(e) {
		const point = e.touches ? e.touches[0] : e;
		touch.startY = point.clientY;
		touch.startTime = Date.now();
	}

	function end(e) {
		const point = e.changedTouches ? e.changedTouches[0] : e;
		const distY = point.clientY - touch.startY;
		const elapsed = Date.now() - touch.startTime;

		// Too slow → not a swipe
		if (elapsed > maxTime) return;

		// Swipe down
		if (distY > minDistance && typeof onSwipeDown === 'function') {
			onSwipeDown();
		}
		console.log({ distY, min: -minDistance });
		// Swipe up
		if (distY < -minDistance && typeof onSwipeUp === 'function') {
			onSwipeUp();
		}
	}

	// Touch
	element.addEventListener('touchstart', start, { passive: true });
	element.addEventListener('touchend', end);

	// Optional mouse support
	element.addEventListener('mousedown', start);
	element.addEventListener('mouseup', end);
};
