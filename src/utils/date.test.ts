import { describe, expect, test } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
	test('formats a date as "Mon D, YYYY"', () => {
		expect(formatDate(new Date(2024, 0, 15))).toBe('Jan 15, 2024');
	});

	test('formats a single-digit day without leading zero', () => {
		expect(formatDate(new Date(2023, 2, 5))).toBe('Mar 5, 2023');
	});

	test('formats dates across different months and years', () => {
		expect(formatDate(new Date(2022, 11, 25))).toBe('Dec 25, 2022');
	});

	test('throws on invalid dates', () => {
		expect(() => formatDate(new Date('invalid'))).toThrow(TypeError);
	});
});