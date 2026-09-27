# Jev Safe roadmap

Jev Safe is a general n8n node for TypeSafe's System One API. It exposes the API's typed question contract. FAQ selection, triage, audits, and other use cases belong in n8n workflows rather than specialized operations in this package.

## Implemented

- Send `state`, `model`, and a `questions` map to `POST /v1/systemone`.
- Accept text, JSON, or the incoming item as state.
- Configure Choice, Noul, and Score with direct operations or send multiple questions in one request.
- Preserve structured instructions and criteria through JSON mode.
- Return the complete API response or simplified fields, with an option to include both.
- Route a Choice answer to named outputs, including Low Confidence and Error.
- Validate Choice's 2–255 options and Score's 2–10 levels.
- Search models with `GET /v1/models`, accept manual model IDs, and retry HTTP 429/529.
- Verify the package with unit tests, build, lint, and a load test on n8n 2.33.7.

## Next

- Exercise a live TypeSafe request when a test credential is available; current tests mock the API response.
- Improve the configuration interface based on feedback from real workflows while retaining JSON mode.
- Consider optional usage, latency, model, and retry metrics without logging state content by default.

## Acceptance principle

A workflow should be able to send every supported combination of Choice, Noul, and Score questions, get the complete TypeSafe response, and optionally use simplified fields. A compatible extension of the API's structured questions should be usable through JSON mode without a domain-specific operation.

References: [API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [TypeSafe skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md).
