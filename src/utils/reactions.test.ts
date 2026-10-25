import { describe, expect, test } from 'vitest';
import { getReactionDeltas, type Reaction, type ReactionDeltas } from './reactions';

describe('getReactionDeltas', () => {
	const cases: [Reaction, Reaction, ReactionDeltas][] = [
		[null, 'like', { likes: 1, dislikes: 0 }],
		[null, 'dislike', { likes: 0, dislikes: 1 }],
		['like', 'dislike', { likes: -1, dislikes: 1 }],
		['dislike', 'like', { likes: 1, dislikes: -1 }],
		['like', null, { likes: -1, dislikes: 0 }],
		['dislike', null, { likes: 0, dislikes: -1 }],
		['like', 'like', { likes: 0, dislikes: 0 }],
	];

	test.each(cases)('calculates the counter changes from %s to %s', (previous, next, expected) => {
		expect(getReactionDeltas(previous, next)).toEqual(expected);
	});
});
