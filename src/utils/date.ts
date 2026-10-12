const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(date: Date): string {
	const normalizedDate = new Date(date);

	if (Number.isNaN(normalizedDate.getTime())) {
		throw new TypeError('Invalid date');
	}

	return `${monthNames[normalizedDate.getMonth()]} ${normalizedDate.getDate()}, ${normalizedDate.getFullYear()}`;
}