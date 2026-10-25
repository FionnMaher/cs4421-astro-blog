import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	GetCommand,
	TransactGetCommand,
	TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { getEntry } from 'astro:content';
import { getReactionDeltas, type Reaction } from '../../../utils/reactions';

const readerCookie = 'blog_reader_id';
const cookieMaxAge = 60 * 60 * 24 * 365;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: { 'Cache-Control': 'no-store' },
	});
}

function getReaderId(cookies: Parameters<APIRoute>[0]['cookies'], secure: boolean): string {
	const existingId = cookies.get(readerCookie)?.value;
	const readerId =
		existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingId)
			? existingId
			: randomUUID();

	if (readerId !== existingId) {
		cookies.set(readerCookie, readerId, {
			httpOnly: true,
			maxAge: cookieMaxAge,
			path: '/api/reactions',
			sameSite: 'lax',
			secure,
		});
	}

	return readerId;
}

async function getPublishedPost(slug: string | undefined) {
	if (!slug) return undefined;
	const post = await getEntry('blog', slug);
	if (!post || post.data.pubDate.getTime() > Date.now()) return undefined;
	return post;
}

function getTableName(): string | undefined {
	return process.env.REACTIONS_TABLE_NAME;
}

function countValue(value: unknown): number {
	if (value === undefined) return 0;
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new Error('Stored reaction count is invalid');
	}
	return value;
}

async function readReaction(
	tableName: string,
	postKey: string,
	readerId: string,
): Promise<Reaction> {
	const result = await dynamo.send(
		new GetCommand({
			TableName: tableName,
			Key: { pk: postKey, sk: `READER#${readerId}` },
			ConsistentRead: true,
		}),
	);
	const reaction = result.Item?.reaction;
	if (reaction === undefined) return null;
	if (reaction !== 'like' && reaction !== 'dislike') {
		throw new Error('Stored reader reaction is invalid');
	}
	return reaction;
}

async function responseState(
	tableName: string,
	postKey: string,
	readerId: string,
): Promise<{ likes: number; dislikes: number; reaction: Reaction }> {
	const result = await dynamo.send(
		new TransactGetCommand({
			TransactItems: [
				{ Get: { TableName: tableName, Key: { pk: postKey, sk: 'COUNTS' } } },
				{ Get: { TableName: tableName, Key: { pk: postKey, sk: `READER#${readerId}` } } },
			],
		}),
	);
	const [countsResult, reactionResult] = result.Responses ?? [];
	const reactionValue = reactionResult?.Item?.reaction;
	let reaction: Reaction = null;
	if (reactionValue !== undefined) {
		if (reactionValue !== 'like' && reactionValue !== 'dislike') {
			throw new Error('Stored reader reaction is invalid');
		}
		reaction = reactionValue;
	}

	return {
		likes: countValue(countsResult?.Item?.likes),
		dislikes: countValue(countsResult?.Item?.dislikes),
		reaction,
	};
}

export const GET: APIRoute = async ({ params, cookies, request }) => {
	const post = await getPublishedPost(params.slug);
	if (!post) return json({ error: 'Post not found' }, 404);

	const tableName = getTableName();
	if (!tableName) {
		console.error('REACTIONS_TABLE_NAME is not configured');
		return json({ error: 'Reactions are temporarily unavailable' }, 503);
	}

	try {
		const readerId = getReaderId(cookies, new URL(request.url).protocol === 'https:');
		return json(await responseState(tableName, `POST#${post.id}`, readerId));
	} catch (error) {
		console.error('Failed to read post reactions', error);
		return json({ error: 'Unable to load reactions' }, 500);
	}
};

export const POST: APIRoute = async ({ params, cookies, request }) => {
	const post = await getPublishedPost(params.slug);
	if (!post) return json({ error: 'Post not found' }, 404);

	const tableName = getTableName();
	if (!tableName) {
		console.error('REACTIONS_TABLE_NAME is not configured');
		return json({ error: 'Reactions are temporarily unavailable' }, 503);
	}

	let nextReaction: Reaction;
	try {
		const body: unknown = await request.json();
		if (
			typeof body !== 'object' ||
			body === null ||
			!('reaction' in body) ||
			(body.reaction !== 'like' && body.reaction !== 'dislike' && body.reaction !== null)
		) {
			return json({ error: 'Reaction must be like, dislike, or null' }, 400);
		}
		nextReaction = body.reaction;
	} catch {
		return json({ error: 'Request body must be valid JSON' }, 400);
	}

	const readerId = getReaderId(cookies, new URL(request.url).protocol === 'https:');
	const postKey = `POST#${post.id}`;

	try {
		for (let attempt = 0; attempt < 4; attempt += 1) {
			const previousReaction = await readReaction(tableName, postKey, readerId);
			if (previousReaction === nextReaction) {
				return json(await responseState(tableName, postKey, readerId));
			}

			const deltas = getReactionDeltas(previousReaction, nextReaction);
			const reactionKey = { pk: postKey, sk: `READER#${readerId}` };
			const transactionItems = [
				{
					Update: {
						TableName: tableName,
						Key: { pk: postKey, sk: 'COUNTS' },
						UpdateExpression: 'ADD #likes :likes, #dislikes :dislikes',
						ExpressionAttributeNames: { '#likes': 'likes', '#dislikes': 'dislikes' },
						ExpressionAttributeValues: {
							':likes': deltas.likes,
							':dislikes': deltas.dislikes,
						},
					},
				},
				nextReaction === null
					? {
							Delete: {
								TableName: tableName,
								Key: reactionKey,
								ConditionExpression: '#reaction = :previous',
								ExpressionAttributeNames: { '#reaction': 'reaction' },
								ExpressionAttributeValues: { ':previous': previousReaction },
							},
						}
					: {
							Put: {
								TableName: tableName,
								Item: { ...reactionKey, reaction: nextReaction },
								ConditionExpression: previousReaction
									? '#reaction = :previous'
									: 'attribute_not_exists(pk)',
								...(previousReaction && {
									ExpressionAttributeNames: { '#reaction': 'reaction' },
									ExpressionAttributeValues: { ':previous': previousReaction },
								}),
							},
						},
			];

			try {
				await dynamo.send(
					new TransactWriteCommand({
						TransactItems: transactionItems,
					}),
				);
				return json(await responseState(tableName, postKey, readerId));
			} catch (error) {
				if (
					typeof error === 'object' &&
					error !== null &&
					'name' in error &&
					error.name === 'TransactionCanceledException'
				) {
					continue;
				}
				throw error;
			}
		}

		return json({ error: 'Reaction changed concurrently; please try again' }, 409);
	} catch (error) {
		console.error('Failed to save post reaction', error);
		return json({ error: 'Unable to save reaction' }, 500);
	}
};
