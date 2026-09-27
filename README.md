# n8n-nodes-jev-safe

An n8n community node for [TypeSafe's Jev API](https://docs.typesafe.ai/api). Evaluate text or structured JSON with **Choice**, **Noul** (yes/no), and **Score** questions. The node keeps the API's general-purpose question model; your workflow defines the business rules and subsequent actions.

This package is an independent derivative of the MIT-licensed [n8n-nodes-jev](https://github.com/vibe-with-me-tools/n8n-nodes-jev). It is not affiliated with TypeSafe or the original package author. See [LICENSE.md](LICENSE.md) and [Provenance](#provenance).

## Install

Install `n8n-nodes-jev-safe` from **Settings → Community nodes** in a self-hosted n8n instance. You can also follow [n8n's manual installation instructions](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation.md). Create a **Jev Safe (TypeSafe) API** credential with an API key from [TypeSafe](https://console.typesafe.ai/keys).

The node type is `n8n-nodes-jev-safe.jevSafe` and its credential type is `jevSafeApi`. It can coexist with the original package. To migrate a workflow from the original, replace its node and select the new credential.

## Operations

| Operation | Result |
| --- | --- |
| Ask Choice | Picks one option and returns its probabilities and confidence. |
| Ask Noul (Yes/No) | Returns the probability that a condition is true. |
| Ask Score | Rates the state against ordered levels. |
| Ask Questions | Sends multiple Choice, Noul, and Score questions in one API request. |
| Route by Choice | Sends each item to the selected route, a Low Confidence output, or an Error output. |

Each operation sends a `state`, a `model`, and a map of `questions` to `POST /v1/systemone`. The state can be text, JSON, or the incoming item's JSON. **Ask Questions → Using JSON** accepts structured instructions and criteria supported by the TypeSafe API. Choice accepts 2–255 options; Score accepts 2–10 levels. The node checks these limits before making a request.

The **Model** field can search the account's models or accept an ID. An alias such as `jev-latest` can move to a new release; a versioned ID pins behavior. The response reports the effective model ID.

By default, the node writes simplified answers to `$json.jev`. Set **Simplify Output** to false to keep the complete API response. Set **Include Raw Response** to true to also include the complete response under `$json.jev._raw` when using simplified answers or routing. The complete response includes `answers`, probabilities, confidence, `model`, and token `usage`.

## Example

For a Choice question, use state `{{ $json.message }}`, instructions `Which team should handle this?`, and options:

```text
billing: Payments, invoices, or refunds
technical: Bugs, outages, or integrations
sales: Pricing or account upgrades
```

The simplified result is available at `$json.jev.answer`; confidence is at `$json.jev.answer_confidence`. Change **Question ID** to use another key. Route by Choice creates an output for each configured route. It can send uncertain decisions to **Low Confidence**; with **Continue On Fail**, request errors go to **Error**.

Importable example workflows are in [examples](examples/). They use sample data; add your own TypeSafe credential before running them.

## Error handling

The node surfaces API validation and authentication errors. It retries HTTP 429 and 529 responses with backoff, honoring `Retry-After` when provided. **Max Retries** and **Timeout (Ms)** are configurable.

TypeSafe currently reports its best accuracy in English. Evaluate accuracy and confidence thresholds on your own data before using automated decisions in another language. See the [model documentation](https://docs.typesafe.ai/models).

## Development

Use the Node.js version in `.nvmrc`:

```sh
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm pack --dry-run
```

## Provenance

Based on `vibe-with-me-tools/n8n-nodes-jev` 0.2.2, commit `41691e7138750d21baeddee9006056f1ba88bbb8` (September 26, 2026), under the MIT license. This package contains independent changes and is not a release of the original project.
