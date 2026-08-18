## MODIFIED Requirements

### Requirement: Development and live execution use distinct fixed worktrees
The repository SHALL use `/data/CoordExp/codex-harnessdock-dev` on branch `developer` for implementation and verification, and `/data/CoordExp/codex-harnessdock` on branch `main` as the sole live Plugin runtime checkout. Both worktrees SHALL share the same independent Git common directory. The development worktree SHALL NOT become an executable Plugin runtime source.

#### Scenario: Development begins
- **WHEN** an operator edits the Plugin on the development track
- **THEN** the edit occurs in `/data/CoordExp/codex-harnessdock-dev` without changing files in the live main checkout

#### Scenario: Plugin runtime resolves source
- **WHEN** Codex invokes an installed CC lifecycle operation
- **THEN** executable source resolves only from `/data/CoordExp/codex-harnessdock` and never from the developer worktree
