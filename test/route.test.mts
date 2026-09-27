import { describe, expect, it } from 'vitest';
import { JevSafe } from '../nodes/Jev/JevSafe.node';
import { buildRouteQuestion, configuredOutputs, decideRoute } from '../nodes/Jev/shared/route';

describe('configuredOutputs', () => {
	it('has a single output for Ask Questions', () => {
		expect(configuredOutputs({ operation: 'ask' })).toEqual([{ type: 'main' }]);
		expect(configuredOutputs({})).toEqual([{ type: 'main' }]);
	});

	it('adds one output per route plus Low Confidence by default', () => {
		expect(
			configuredOutputs({
				operation: 'route',
				routes: { values: [{ name: 'billing' }, { name: '' }] },
			}),
		).toEqual([
			{ type: 'main', displayName: 'billing' },
			{ type: 'main', displayName: 'Route 2' },
			{ type: 'main', displayName: 'Low Confidence' },
			{ type: 'main', displayName: 'Error' },
		]);
	});

	it('omits Low Confidence when sending to the best route', () => {
		expect(
			configuredOutputs({
				operation: 'route',
				lowConfidence: 'bestRoute',
				routes: { values: [{ name: 'a' }, { name: 'b' }] },
			}),
		).toHaveLength(3);
	});

	// n8n evaluates the outputs expression in the editor from the function's source text,
	// so it must work without access to anything outside its own body.
	it('works when evaluated from the node description in isolation', () => {
		const expression = new JevSafe().description.outputs as string;
		expect(expression.startsWith('={{')).toBe(true);
		const evaluate = new Function('$parameter', `return ${expression.slice(3, -2)}`);
		expect(
			evaluate({ operation: 'route', routes: { values: [{ name: 'a' }, { name: 'b' }] } }),
		).toEqual([
			{ type: 'main', displayName: 'a' },
			{ type: 'main', displayName: 'b' },
			{ type: 'main', displayName: 'Low Confidence' },
			{ type: 'main', displayName: 'Error' },
		]);
	});
});

describe('buildRouteQuestion', () => {
	it('builds a Choice question from the routes', () => {
		expect(
			buildRouteQuestion(' Which team? ', [
				{ name: ' billing ', description: 'Payments' },
				{ name: 'sales', description: ' ' },
			]),
		).toEqual({
			type: 'choice',
			instructions: 'Which team?',
			criteria: { billing: 'Payments', sales: null },
		});
	});

	it.each([
		['', [{ name: 'a' }, { name: 'b' }], /Instructions are empty/],
		['q', [{ name: 'a' }], /at least two routes/],
		['q', [{ name: 'a' }, { name: 'a' }], /used twice/],
		['q', [{ name: 'a' }, { name: ' ' }], /has no name/],
	])('rejects invalid routes (%#)', (instructions, routes, message) => {
		expect(() => buildRouteQuestion(instructions, routes)).toThrow(message);
	});
});

describe('decideRoute', () => {
	const response = (choice: string, confidence: number) => ({
		model: 'jev-1.13.0',
		answers: { route: { type: 'choice', choice, confidence, probabilities: { [choice]: 1 } } },
	});
	const names = ['billing', 'technical', 'sales'];

	it('sends confident answers to their route', () => {
		expect(decideRoute(response('technical', 0.9), names, true, 0.7)).toEqual({
			outputIndex: 1,
			result: {
				route: 'technical',
				confidence: 0.9,
				lowConfidence: false,
				probabilities: { technical: 1 },
				_model: 'jev-1.13.0',
			},
		});
	});

	it('sends answers below the threshold to the last output', () => {
		const decision = decideRoute(response('billing', 0.4), names, true, 0.7);
		expect(decision.outputIndex).toBe(3);
		expect(decision.result.lowConfidence).toBe(true);
		expect(decision.result.route).toBe('billing');
	});

	it('treats a confidence equal to the threshold as confident', () => {
		expect(decideRoute(response('sales', 0.7), names, true, 0.7).outputIndex).toBe(2);
	});

	it('ignores the threshold when there is no Low Confidence output', () => {
		expect(decideRoute(response('billing', 0.1), names, false, 0.7).outputIndex).toBe(0);
	});

	it('rejects a choice that is not a configured route', () => {
		expect(() => decideRoute(response('marketing', 0.9), names, true, 0.5)).toThrow(
			/not one of the configured routes/,
		);
		expect(() => decideRoute({ answers: {} }, names, true, 0.5)).toThrow(/Choice answer/);
	});

	it('rejects an answer of the wrong type', () => {
		expect(() => decideRoute({ answers: { route: { type: 'noul', choice: 'billing', confidence: 0.9 } } }, names, true, 0.5)).toThrow(/Choice answer/);
	});

	it.each([undefined, NaN, -0.1, 1.1, '0.9'])(
		'rejects an invalid confidence of %s',
		(confidence) => {
			const invalid = { answers: { route: { type: 'choice', choice: 'billing', confidence } } };
			expect(() => decideRoute(invalid, names, true, 0.5)).toThrow(/invalid route confidence/);
		},
	);
});
