## ADDED Requirements

### Requirement: Doctor describes authentication evidence without overstating liveness
The zero-model-cost operator doctor SHALL report whether the fixed Claude credential is present, locally expired, or unavailable and SHALL explicitly report `liveValidated: false` for metadata-only authentication checks. Credential presence MAY remain a passing readiness fact when the host CLI can perform its own refresh, while local expiry SHALL be visible as bounded advisory evidence. Doctor SHALL NOT launch Claude print mode, refresh credentials, mutate the credential store, or claim that a provider request succeeded.

#### Scenario: Auth status reports logged in
- **WHEN** `claude auth status --json` reports a logged-in Claude account and the fixed credential record is readable
- **THEN** doctor reports bounded method/provider/subscription facts, local credential state, and `liveValidated: false` instead of “authentication is active”

#### Scenario: Local access token has expired
- **WHEN** the fixed native credential record has an access expiry at or before the doctor observation time
- **THEN** doctor reports the credential as locally expired or refreshable advisory evidence without exposing secrets or performing a model call

#### Scenario: Diagnostic output is persisted or shared
- **WHEN** doctor output is rendered as text or JSON
- **THEN** it contains no token, token hash, raw credential path content, account identity, organization identity, or arbitrary native auth output

