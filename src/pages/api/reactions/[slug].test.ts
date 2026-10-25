import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { APIRoute } from 'astro';

const { sendMock, getEntryMock } = vi.hoisted(() => ({
	sendMock: vi.fn(),
	getEntryMock: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
	return {
		...actual,
		DynamoDBDocumentClient: { from: () => ({ send: sendMock }) },
	};
});
vi.mock('astro:content', () => ({ getEntry: getEntryMock }));

import { GetCommand, TransactGetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { GET, POST } from './[slug]';

describe('post reaction API', () => {
	let readerCookie: string | undefined;
	let storedReaction: 'like' | 'dislike' | undefined;
	let counts: { likes: number; dislikes: number };

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.REACTIONS_TABLE_NAME = 'blog-reactions';
		readerCookie = undefined;
		storedReaction = undefined;
		counts = { likes: 0, dislikes: 0 };
		getEntryMock.mockResolvedValue({
			id: 'first-post',
			data: { pubDate: new Date('2020-01-01') },
		});
		sendMock.mockImplementation(
			async (command: GetCommand | TransactGetCommand | TransactWriteCommand) => {
				if (command instanceof GetCommand) {
					return command.input.Key?.sk === 'COUNTS'
						? { Item: counts }
						: storedReaction
							? { Item: { reaction: storedReaction } }
							: {};
				}
				if (command instanceof TransactGetCommand) {
					return {
						Responses: [
							{ Item: counts },
							...(storedReaction ? [{ Item: { reaction: storedReaction } }] : [{}]),
						],
					};
				}

				const update = command.input.TransactItems?.[0]?.Update;
				if (update) {
					const likesDelta = update.ExpressionAttributeValues?.[':likes'];
					const dislikesDelta = update.ExpressionAttributeValues?.[':dislikes'];
					if (typeof likesDelta === 'number') counts.likes += likesDelta;
					if (typeof dislikesDelta === 'number') counts.dislikes += dislikesDelta;
				}
				const reactionWrite = command.input.TransactItems?.[1];
				const putReaction = reactionWrite?.Put?.Item?.reaction;
				if (putReaction === 'like' || putReaction === 'dislike') {
					storedReaction = putReaction;
				} else if (reactionWrite?.Delete) {
					storedReaction = undefined;
				}
				return {};
			},
		);
	});

	function context(request: Request): Parameters<APIRoute>[0] {
		return {
			params: { slug: 'first-post' },
			request,
			cookies: {
				get: () => (readerCookie ? { value: readerCookie } : undefined),
				set: (_name: string, value: string) => {
					readerCookie = value;
				},
			},
		} as unknown as Parameters<APIRoute>[0];
	}

	async function post(reaction: 'like' | 'dislike' | null): Promise<Response> {
		return POST(
			context(
				new Request('http://localhost/api/reactions/first-post', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ reaction }),
				}),
			),
		);
	}

	test('records one reaction, switches it atomically, and reads it after refresh', async () => {
		const firstResponse = await post('like');
		expect(firstResponse.status).toBe(200);
		expect(await firstResponse.json()).toMatchObject({
			likes: 1,
			dislikes: 0,
			reaction: 'like',
		});

		const duplicateResponse = await post('like');
		expect(await duplicateResponse.json()).toMatchObject({
			likes: 1,
			dislikes: 0,
			reaction: 'like',
		});

		const switchResponse = await post('dislike');
		expect(switchResponse.status).toBe(200);
		expect(await switchResponse.json()).toMatchObject({
			likes: 0,
			dislikes: 1,
			reaction: 'dislike',
		});

		const refreshResponse = await GET(
			context(new Request('http://localhost/api/reactions/first-post')),
		);
		expect(await refreshResponse.json()).toMatchObject({
			likes: 0,
			dislikes: 1,
			reaction: 'dislike',
		});
		expect(readerCookie).toBeDefined();
	});

	test('removes a selected reaction without allowing negative counts', async () => {
		await post('like');
		const response = await post(null);

		expect(await response.json()).toMatchObject({
			likes: 0,
			dislikes: 0,
			reaction: null,
		});
	});

	test('rejects invalid reactions', async () => {
		const response = await POST(
			context(
				new Request('http://localhost/api/reactions/first-post', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ reaction: 'angry' }),
				}),
			),
		);

		expect(response.status).toBe(400);
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('does not serve reactions for an unpublished post', async () => {
		getEntryMock.mockResolvedValueOnce({
			id: 'first-post',
			data: { pubDate: new Date(Date.now() + 60_000) },
		});

		const response = await GET(
			context(new Request('http://localhost/api/reactions/first-post')),
		);

		expect(response.status).toBe(404);
		expect(sendMock).not.toHaveBeenCalled();
	});
});
