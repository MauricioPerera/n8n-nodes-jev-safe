import type { IDataObject } from 'n8n-workflow';

export type QuestionType = 'noul' | 'choice' | 'score';

const QUESTION_TYPES: QuestionType[] = ['noul', 'choice', 'score'];
const MAX_CHOICE_OPTIONS = 255;
const MAX_SCORE_LEVELS = 10;

/** One entry of the "Questions" fixed collection, as n8n hands it to us. */
export interface QuestionField {
	id?: string;
	type?: string;
	instructions?: string;
	choiceOptions?: unknown;
	scoreLevels?: unknown;
	trueCriterion?: string;
	falseCriterion?: string;
}

/** Thrown for problems in how the user defined the questions; the node turns these into NodeOperationErrors. */
export class QuestionDefinitionError extends Error {}

function splitLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/**
 * Choice options come from a multi-line field: one option per line, optionally
 * followed by `: description`. An expression may also return an array of option
 * names or an `{ option: description }` object.
 */
export function parseChoiceOptions(value: unknown, id: string): IDataObject {
	const criteria: IDataObject = {};
	const addOption = (rawName: unknown, rawDescription: unknown) => {
		if (typeof rawName !== 'string') {
			throw new QuestionDefinitionError(`Question "${id}" has a non-text option name`);
		}
		const name = rawName.trim();
		if (!name) throw new QuestionDefinitionError(`Question "${id}" has an option with no name`);
		if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
			throw new QuestionDefinitionError(`Question "${id}" has a reserved option name`);
		}
		if (Object.prototype.hasOwnProperty.call(criteria, name)) {
			throw new QuestionDefinitionError(`Question "${id}" lists option "${name}" twice`);
		}
		if (rawDescription == null || rawDescription === '') {
			criteria[name] = null;
		} else if (typeof rawDescription === 'string') {
			criteria[name] = rawDescription.trim() || null;
		} else if (isDescription(rawDescription)) {
			criteria[name] = rawDescription as IDataObject;
		} else {
			throw new QuestionDefinitionError(`Question "${id}" has an invalid option description`);
		}
	};

	if (Array.isArray(value)) {
		for (const option of value) addOption(option, null);
	} else if (value && typeof value === 'object') {
		for (const [option, description] of Object.entries(value)) {
			addOption(option, description);
		}
	} else {
		for (const line of splitLines(String(value ?? ''))) {
			const colon = line.indexOf(':');
			const option = (colon === -1 ? line : line.slice(0, colon)).trim();
			const description = colon === -1 ? '' : line.slice(colon + 1).trim();
			addOption(option, description);
		}
	}

	if (Object.keys(criteria).length < 2) {
		throw new QuestionDefinitionError(`Choice question "${id}" needs at least two options`);
	}
	if (Object.keys(criteria).length > MAX_CHOICE_OPTIONS) {
		throw new QuestionDefinitionError(`Choice question "${id}" allows at most ${MAX_CHOICE_OPTIONS} options`);
	}
	return criteria;
}

/** Score levels: one per line, lowest level first. An expression may also return an array. */
export function parseScoreLevels(value: unknown, id: string): string[] {
	const levels = Array.isArray(value)
		? value.map((level) => {
				if (typeof level !== 'string' || !level.trim()) {
					throw new QuestionDefinitionError(`Score question "${id}" has an empty or non-text level`);
				}
				return level.trim();
			})
		: splitLines(String(value ?? ''));

	if (levels.length < 2) {
		throw new QuestionDefinitionError(`Score question "${id}" needs at least two levels`);
	}
	if (levels.length > MAX_SCORE_LEVELS) {
		throw new QuestionDefinitionError(`Score question "${id}" allows at most ${MAX_SCORE_LEVELS} levels`);
	}
	if (new Set(levels).size !== levels.length) {
		throw new QuestionDefinitionError(`Score question "${id}" has duplicate levels`);
	}
	return levels;
}

export function buildQuestionsFromFields(fields: QuestionField[]): IDataObject {
	if (fields.length === 0) throw new QuestionDefinitionError('Add at least one question');

	const questions: IDataObject = {};
	for (const [index, field] of fields.entries()) {
		const id = (field.id ?? '').trim();
		if (!id) throw new QuestionDefinitionError(`Question ${index + 1} has no ID`);
		if (id === '__proto__' || id === 'constructor' || id === 'prototype') {
			throw new QuestionDefinitionError(`Question ID "${id}" is reserved`);
		}
		if (Object.prototype.hasOwnProperty.call(questions, id)) throw new QuestionDefinitionError(`Question ID "${id}" is used twice`);

		const instructions = (field.instructions ?? '').trim();
		if (!instructions) throw new QuestionDefinitionError(`Question "${id}" has no instructions`);

		const type = field.type ?? 'noul';
		if (!QUESTION_TYPES.includes(type as QuestionType)) {
			throw new QuestionDefinitionError(`Question "${id}" must have a valid answer type`);
		}
		const question: IDataObject = { type, instructions };

		if (type === 'choice') {
			question.criteria = parseChoiceOptions(field.choiceOptions, id);
		} else if (type === 'score') {
			question.criteria = parseScoreLevels(field.scoreLevels, id);
		} else {
			const criteria: IDataObject = {};
			if (field.trueCriterion?.trim()) criteria.true = field.trueCriterion.trim();
			if (field.falseCriterion?.trim()) criteria.false = field.falseCriterion.trim();
			if (Object.keys(criteria).length > 0) question.criteria = criteria;
		}

		questions[id] = question;
	}
	return questions;
}

function isDescription(value: unknown): boolean {
	return (typeof value === 'string' && value.trim().length > 0) ||
		(Array.isArray(value) && value.length > 0) ||
		(value !== null && typeof value === 'object' && Object.keys(value).length > 0);
}

/** Validate stable API constraints while preserving structured questions unchanged. */
export function validateQuestionsJson(value: unknown): IDataObject {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new QuestionDefinitionError(
			'Questions JSON must be an object mapping question IDs to questions',
		);
	}
	const entries = Object.entries(value as IDataObject);
	if (entries.length === 0) throw new QuestionDefinitionError('Add at least one question');

	for (const [id, question] of entries) {
		if (!id.trim()) throw new QuestionDefinitionError('Question ID is empty');
		if (id === '__proto__' || id === 'constructor' || id === 'prototype') {
			throw new QuestionDefinitionError(`Question ID "${id}" is reserved`);
		}
		const definition = question as IDataObject | null;
		const type = definition?.type;
		if (!QUESTION_TYPES.includes(type as QuestionType)) {
			throw new QuestionDefinitionError(
				`Question "${id}" must have "type" set to one of: ${QUESTION_TYPES.join(', ')}`,
			);
		}
		if (!isDescription(definition?.instructions)) {
			throw new QuestionDefinitionError(`Question "${id}" needs instructions`);
		}
		const criteria = definition?.criteria;
		if (type === 'choice') {
			if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
				throw new QuestionDefinitionError(`Choice question "${id}" needs an options map`);
			}
			const options = Object.entries(criteria);
			if (options.length < 2 || options.length > MAX_CHOICE_OPTIONS) {
				throw new QuestionDefinitionError(`Choice question "${id}" needs 2 to ${MAX_CHOICE_OPTIONS} options`);
			}
			for (const [option, description] of options) {
				if (!option.trim() || ['__proto__', 'constructor', 'prototype'].includes(option)) {
					throw new QuestionDefinitionError(`Choice question "${id}" has an invalid option name`);
				}
				if (description !== null && !isDescription(description)) {
					throw new QuestionDefinitionError(`Choice question "${id}" has an invalid option description`);
				}
			}
		} else if (type === 'score') {
			if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > MAX_SCORE_LEVELS) {
				throw new QuestionDefinitionError(`Score question "${id}" needs 2 to ${MAX_SCORE_LEVELS} levels`);
			}
			if (criteria.some((level) => !isDescription(level))) {
				throw new QuestionDefinitionError(`Score question "${id}" has an invalid level`);
			}
		} else if (criteria !== undefined) {
			if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
				throw new QuestionDefinitionError(`Noul question "${id}" needs a criteria object`);
			}
			for (const description of Object.values(criteria)) {
				if (!isDescription(description)) {
					throw new QuestionDefinitionError(`Noul question "${id}" has an invalid criterion`);
				}
			}
		}
	}
	return value as IDataObject;
}

function mostLikelyLevel(answer: IDataObject): string | undefined {
	const legend = answer.legend as Record<string, string> | undefined;
	if (!legend) return undefined;

	const probabilities = answer.probabilities as Record<string, number> | undefined;
	if (probabilities && Object.keys(probabilities).length > 0) {
		const [best] = Object.entries(probabilities).sort(([, a], [, b]) => b - a)[0];
		return legend[best];
	}
	if (typeof answer.score === 'number') return legend[String(Math.round(answer.score))];
	return undefined;
}

/**
 * Flattens `answers` into one value per question so downstream nodes can use
 * `{{ $json.jev.department }}` instead of digging through the raw response:
 *
 * - noul:   `<id>` = probability of yes (0-1)
 * - choice: `<id>` = chosen option, `<id>_confidence`
 * - score:  `<id>` = weighted score, `<id>_level` = most likely level's description, `<id>_confidence`
 *
 * `_model` records the versioned model that answered, since aliases like `jev-latest` move.
 */
export function simplifyResponse(response: IDataObject): IDataObject {
	if (!response.answers || typeof response.answers !== 'object' || Array.isArray(response.answers)) {
		throw new QuestionDefinitionError('Jev returned an invalid answers map');
	}
	const answers = response.answers as Record<string, IDataObject>;
	const result: IDataObject = {};
	const outputKeys = new Set(['_model', '_raw']);

	for (const [id, answer] of Object.entries(answers)) {
		if (id === '__proto__' || id === 'constructor' || id === 'prototype') {
			throw new QuestionDefinitionError(`Jev returned reserved question ID "${id}"`);
		}
		if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
			throw new QuestionDefinitionError(`Jev returned an invalid answer for "${id}"`);
		}
		const keys = [id];
		if (answer.type === 'choice' || answer.type === 'score') keys.push(`${id}_confidence`);
		if (answer.type === 'score') keys.push(`${id}_level`);
		for (const key of keys) {
			if (outputKeys.has(key)) {
				throw new QuestionDefinitionError(`Simplified answer field "${key}" would overwrite another field; use full output`);
			}
			outputKeys.add(key);
		}
		switch (answer.type) {
			case 'noul':
				result[id] = answer.noul;
				break;
			case 'choice':
				result[id] = answer.choice;
				result[`${id}_confidence`] = answer.confidence;
				break;
			case 'score':
				result[id] = answer.score;
				result[`${id}_level`] = mostLikelyLevel(answer);
				result[`${id}_confidence`] = answer.confidence;
				break;
			default:
				result[id] = answer;
		}
	}

	result._model = response.model;
	return result;
}
