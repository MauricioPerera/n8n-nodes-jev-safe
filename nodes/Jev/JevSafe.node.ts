import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { jsonParse, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { searchModels } from './listSearch/searchModels';
import {
	modelProperty,
	operationProperty,
	optionsProperty,
	questionProperties,
	routeProperties,
	singleQuestionProperties,
	stateProperties,
} from './shared/descriptions';
import type { QuestionField } from './shared/questions';
import {
	buildQuestionsFromFields,
	QuestionDefinitionError,
	simplifyResponse,
	validateQuestionsJson,
} from './shared/questions';
import type { RouteField } from './shared/route';
import {
	buildRouteQuestion,
	configuredOutputs,
	decideRoute,
	ROUTE_QUESTION_ID,
} from './shared/route';
import { jevApiRequest } from './shared/transport';

interface JevOptions {
	includeInputFields?: boolean;
	includeRawResponse?: boolean;
	maxRetries?: number;
	outputField?: string;
	simplify?: boolean;
	timeout?: number;
}

function parseJsonParameter(
	this: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): unknown {
	if (typeof value !== 'string') return value;
	try {
		return jsonParse(value);
	} catch {
		throw new NodeOperationError(this.getNode(), `${label} is not valid JSON`, { itemIndex });
	}
}

export class JevSafe implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Jev Safe',
		name: 'jevSafe',
		icon: { light: 'file:../../icons/jev.svg', dark: 'file:../../icons/jev.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["model"].cachedResultName || $parameter["model"].value }}',
		description:
			"Ask TypeSafe's Jev model Choice, Noul, or Score questions, or route items by its choice",
		defaults: {
			name: 'Jev Safe',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: `={{(${configuredOutputs})($parameter)}}`,
		credentials: [
			{
				name: 'jevSafeApi',
				required: true,
			},
		],
		properties: [
			operationProperty,
			modelProperty,
			...stateProperties,
			...questionProperties,
			...singleQuestionProperties,
			...routeProperties,
			optionsProperty,
		],
	};

	methods = {
		listSearch: {
			searchModels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;

		// Route names determine the static output layout. Descriptions may vary by item.
		const routeFields =
			operation === 'route' ? (this.getNodeParameter('routes.values', 0, []) as RouteField[]) : [];
		const routeNames = routeFields.map((route) => (route.name ?? '').trim());
		const lowConfidenceOutput =
			operation === 'route' && this.getNodeParameter('lowConfidence', 0) !== 'bestRoute';
		const errorOutputIndex = routeNames.length + (lowConfidenceOutput ? 1 : 0);
		const outputCount = operation === 'route' ? errorOutputIndex + 1 : 1;
		const returnData: INodeExecutionData[][] = Array.from(
			{ length: Math.max(outputCount, 1) },
			() => [],
		);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const model = this.getNodeParameter('model', itemIndex, '', {
					extractValue: true,
				}) as string;
				if (!model) {
					throw new NodeOperationError(this.getNode(), 'Select a model', { itemIndex });
				}

				const state = getState.call(this, itemIndex, items[itemIndex]);
				const options = this.getNodeParameter('options', itemIndex, {}) as JevOptions;
				const itemRouteFields =
					operation === 'route'
						? (this.getNodeParameter('routes.values', itemIndex, []) as RouteField[])
						: [];
				if (
					operation === 'route' &&
					(itemRouteFields.length !== routeNames.length ||
						itemRouteFields.some((route, index) => (route.name ?? '').trim() !== routeNames[index]))
				) {
					throw new NodeOperationError(this.getNode(), 'Route names must remain the same for every item', { itemIndex });
				}
				const questions =
					operation === 'route'
						? {
								[ROUTE_QUESTION_ID]: buildRouteQuestion(
									this.getNodeParameter('routeInstructions', itemIndex, '') as string,
									itemRouteFields,
								),
							}
						: operation === 'ask'
							? getQuestions.call(this, itemIndex)
							: getSingleQuestion.call(this, operation, itemIndex);

				const response = await jevApiRequest.call(
					this,
					'POST',
					'/v1/systemone',
					{ state, model, questions } as IDataObject,
					{ maxRetries: options.maxRetries, timeout: options.timeout, itemIndex },
				);

				let outputIndex = 0;
				let result: IDataObject;
				if (operation === 'route') {
					const threshold = lowConfidenceOutput
						? (this.getNodeParameter('confidenceThreshold', itemIndex, 0.5) as number)
						: 0;
					const decision = decideRoute(response, routeNames, lowConfidenceOutput, threshold);
					outputIndex = decision.outputIndex;
					result = decision.result;
				} else {
					result = options.simplify === false ? response : simplifyResponse(response);
				}
				if (options.includeRawResponse && result !== response) {
					result._raw = response;
				}

				const outputField = options.outputField?.trim() || 'jev';
				const includeInput = options.includeInputFields !== false;

				returnData[outputIndex].push({
					json: includeInput
						? { ...items[itemIndex].json, [outputField]: result }
						: { [outputField]: result },
					binary: includeInput ? items[itemIndex].binary : undefined,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				const nodeError =
					error instanceof QuestionDefinitionError
						? new NodeOperationError(this.getNode(), error.message, { itemIndex })
						: error;

				if (this.continueOnFail()) {
					returnData[operation === 'route' ? errorOutputIndex : 0].push({
						json: { ...items[itemIndex].json, error: nodeError.message },
						binary: items[itemIndex].binary,
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				if (nodeError.context) nodeError.context.itemIndex = itemIndex;
				throw nodeError;
			}
		}

		return returnData;
	}
}

function getState(
	this: IExecuteFunctions,
	itemIndex: number,
	item: INodeExecutionData,
): IDataObject | IDataObject[] | string {
	const source = this.getNodeParameter('stateSource', itemIndex) as string;

	if (source === 'inputItem') return item.json;

	if (source === 'json') {
		const state = parseJsonParameter.call(
			this,
			this.getNodeParameter('stateJson', itemIndex),
			'State (JSON)',
			itemIndex,
		);
		if (state === null || typeof state !== 'object') {
			throw new NodeOperationError(this.getNode(), 'State (JSON) must be a JSON object or array', {
				itemIndex,
			});
		}
		return state as IDataObject | IDataObject[];
	}

	const text = this.getNodeParameter('stateText', itemIndex, '') as unknown;
	// An expression like {{ $json.ticket }} can resolve to an object; send it as structured state.
	if (text !== null && typeof text === 'object') return text as IDataObject;
	const state = String(text ?? '');
	if (!state.trim()) throw new NodeOperationError(this.getNode(), 'State is empty', { itemIndex });
	return state;
}

function getQuestions(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const mode = this.getNodeParameter('questionMode', itemIndex) as string;

	if (mode === 'json') {
		const value = parseJsonParameter.call(
			this,
			this.getNodeParameter('questionsJson', itemIndex),
			'Questions (JSON)',
			itemIndex,
		);
		return validateQuestionsJson(value);
	}

	const fields = this.getNodeParameter('questions.question', itemIndex, []) as QuestionField[];
	return buildQuestionsFromFields(fields);
}

function getSingleQuestion(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): IDataObject {
	if (!['choice', 'noul', 'score'].includes(operation)) {
		throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex });
	}
	const field: QuestionField = {
		id: this.getNodeParameter('singleQuestionId', itemIndex, 'answer') as string,
		type: operation,
		instructions: this.getNodeParameter('singleInstructions', itemIndex, '') as string,
	};
	if (operation === 'choice') {
		field.choiceOptions = this.getNodeParameter('singleChoiceOptions', itemIndex, '');
	} else if (operation === 'score') {
		field.scoreLevels = this.getNodeParameter('singleScoreLevels', itemIndex, '');
	} else {
		field.trueCriterion = this.getNodeParameter('singleTrueCriterion', itemIndex, '') as string;
		field.falseCriterion = this.getNodeParameter('singleFalseCriterion', itemIndex, '') as string;
	}
	return buildQuestionsFromFields([field]);
}
