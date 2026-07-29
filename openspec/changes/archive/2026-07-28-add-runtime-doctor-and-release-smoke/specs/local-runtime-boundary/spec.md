## ADDED Requirements

### Requirement: Installed bootstraps report missing checkout dependencies actionably
Before starting a checkout runtime entrypoint, each installed lifecycle and MCP bootstrap SHALL verify that the canonical checkout can resolve the required production dependencies. A missing dependency SHALL fail with a bounded message that names `/data/CoordExp/cc-plugin-codex` and instructs `npm install`, without exposing the generic Node module-loader stack as the primary error.

#### Scenario: Checkout node_modules is missing
- **WHEN** an installed bootstrap cannot resolve the MCP SDK or Zod from the canonical checkout
- **THEN** it starts no runtime entrypoint and reports the checkout-specific `npm install` recovery

### Requirement: Plugin discovery version derives from package metadata
Local cachebuster refresh SHALL read the base release version from the canonical checkout `package.json`, replace any stale Plugin manifest base, and append exactly one `+codex.<cachebuster>` suffix. Initial installation SHALL validate the same relationship before calling Codex.

#### Scenario: Manifest base drift exists before refresh
- **WHEN** the Plugin manifest base differs from `package.json`
- **THEN** cachebuster refresh replaces it with the package base instead of preserving the stale value

#### Scenario: Install sees unsynchronized version metadata
- **WHEN** initial or refresh installation sees a Plugin base that does not match the package base
- **THEN** installation fails before changing Codex Plugin state
