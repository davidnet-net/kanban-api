export const START_TIME = Date.now();

/**
Returns uptime in ms
**/
export function uptime() {
	return Date.now() - START_TIME;
}

export default uptime;
