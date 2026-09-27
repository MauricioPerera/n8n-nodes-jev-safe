# Changelog

## 0.3.0 (September 26, 2026)

- Added direct Choice, Noul, and Score operations while retaining multi-question requests and Choice routing.
- Added an option to include the complete API response alongside simplified answers.
- Validated documented limits for Choice and Score questions.

## 0.1.0 (September 26, 2026)

Initial independent derivative of the MIT-licensed `n8n-nodes-jev` 0.2.2.

- Added a dedicated Error output for failed Route by Choice items when Continue On Fail is enabled.
- Evaluated route descriptions for each item.
- Added validation for options, levels, identifiers, and confidence values.
- Gave the package, node, and credential distinct identities so they can coexist with the original.
