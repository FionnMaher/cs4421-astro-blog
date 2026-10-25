export type Reaction = 'like' | 'dislike' | null;

export interface ReactionDeltas {
	likes: number;
	dislikes: number;
}

export function getReactionDeltas(previous: Reaction, next: Reaction): ReactionDeltas {
	if (previous === next) return { likes: 0, dislikes: 0 };

	return {
		likes: Number(next === 'like') - Number(previous === 'like'),
		dislikes: Number(next === 'dislike') - Number(previous === 'dislike'),
	};
}
