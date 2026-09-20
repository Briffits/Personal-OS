# Personal OS — AI Agent Instructions

## Project Purpose

Personal OS is an iPhone-first application designed to reduce the cognitive effort required to determine what deserves the user's attention now.

It acts as an orchestration and executive-function layer over services the user already uses rather than attempting to replace them.

The core product question is:

> Across everything happening in my life, what requires my attention now?

Before making architectural or product decisions, read:

`docs/PERSONAL_OS_PROJECT_OVERVIEW.md`
`docs/MVP_SPEC.md`

---

## Technology Stack

Personal OS 1.0 will use:

- React Native
- TypeScript
- Native iOS integration using Swift where Apple-specific functionality requires it
- iPhone as the only client platform for v1.0
- An EU-hosted backend later in development, likely on Hetzner or a similar provider

The project should remain architected so that additional platforms may be supported in future without requiring unnecessary complexity in v1.0.

Do not introduce a new framework, major dependency, backend service, database, state-management library or architectural layer without first explaining:

1. why it is required;
2. what problem it solves;
3. what simpler alternatives exist;
4. what maintenance or security implications it introduces.

Prefer native platform capabilities and minimal dependencies.

Do not make Expo Managed Workflow a mandatory architectural dependency unless explicitly approved.

---

## Engineering Philosophy — Unix/Linux Principles

Personal OS should be engineered according to the Unix philosophy:

> Do one thing, and do it well.

This principle should guide architectural and implementation decisions throughout the project.

### Build Small, Focused Components

Each component, service or module should have one clear responsibility.

Examples:

- HealthKit service reads medication-related Health data.
- Medication stock service calculates estimated stock.
- Prescription storage service manages the current prescription.
- Today priority engine determines NOW and TODAY.
- UI components display information but should not contain unrelated business logic.

Avoid large components or services that accumulate unrelated responsibilities.

### Prefer Composition Over Monoliths

Complex behaviour should emerge by combining simple, well-defined components.

For example:

```text
HealthKit
    ↓
Medication Dose Events
    ↓
Stock Calculator
    ↓
Medication State
    ↓
Today / Prescription Wallet

---

## Development Approach

Work incrementally.

Before implementing any milestone or substantial change:

1. Read the relevant project requirements.
2. Inspect the existing repository.
3. Explain the proposed implementation approach.
4. Identify files that will be created or modified.
5. Identify any new dependencies.
6. Explain how the change will be tested.
7. Wait for approval before making substantial changes unless explicitly instructed otherwise.

Do not implement future milestones merely because they appear in the project roadmap.

Only implement the scope explicitly requested.

Prefer small, understandable and testable changes over large generated implementations.

---

## Product Architecture Principles

### Orchestrate, do not replace

Where practical, existing specialist applications remain the source of truth.

Examples:

- Apple Reminders remains the task system.
- Apple Calendar remains the calendar system.
- Apple Health remains responsible for medication dose logging.
- Gmail remains the email system.
- User-controlled storage remains the source of truth for documents.

Personal OS should add intelligence, coordination and context around these services.

### Complex underneath, simple on top

Technical complexity must not leak unnecessarily into the user interface.

The user experience should remain focused on reducing cognitive load.

### User control first

AI may analyse, prioritise, classify, draft and recommend.

Consequential actions should normally require user approval.

Low-risk automation may occur only where explicitly authorised.

### No hidden behavioural profiling

Do not silently infer permanent user preferences from behaviour.

Persistent preferences should come from explicit user configuration.

### Local first

Sensitive information should remain on-device or in user-controlled storage wherever practical.

Cloud processing should be used only where it provides a clear benefit.

### Graceful degradation

Loss of network connectivity, backend availability or an AI provider should not make the whole application unusable.

Local functionality should continue wherever possible.

---

## Privacy and Security

This repository is PUBLIC.

Never commit:

- API keys
- OAuth secrets
- access tokens
- refresh tokens
- passwords
- signing credentials
- private certificates
- health records
- prescription images
- real medication information
- personal email content
- private user documents
- personally identifiable test data

Secrets must be stored using an appropriate local or server-side secret-management mechanism.

If configuration files containing secrets are required:

- add the real file to `.gitignore`;
- provide a safe example file such as `.env.example`;
- use obvious placeholder values only.

Never include real user information in fixtures, screenshots, tests or sample data committed to the repository.

---

## Native iOS Integration

Apple-specific capabilities may require native Swift modules or iOS extensions.

Expected future integrations include:

- HealthKit
- EventKit / Calendar
- Apple Reminders
- Face ID / LocalAuthentication
- Sign in with Apple
- iCloud / Files
- iOS widgets
- Share extensions
- background processing

Do not create native bridges until the relevant feature requires them.

Native modules should expose the smallest practical interface to the React Native layer.

---

## AI Architecture

Personal OS should remain AI-provider independent.

Application code should depend on an abstract AI service interface rather than directly embedding a single vendor throughout the codebase.

Prefer:

`AIService.summarise()`

rather than vendor-specific calls scattered through application features.

Use native or deterministic processing where it is sufficient.

AI should be introduced only where it materially improves the user experience.

---

## Code Quality

Use TypeScript for React Native application code.

Prefer:

- clear naming;
- small focused components;
- separation of UI, domain logic and integrations;
- reusable service interfaces;
- strict typing;
- explicit error handling;
- testable business logic.

Avoid unnecessary abstraction.

Do not generate large amounts of speculative code for future functionality.

Comments should explain important reasoning, constraints or non-obvious behaviour rather than restating what the code already says.

---

## Testing

Every substantial feature should include a clear testing approach.

Where practical:

- business logic should have automated tests;
- edge cases should be considered explicitly;
- denied permissions should be tested;
- unavailable services should be handled gracefully;
- invalid input should not crash the application.

A feature is not considered complete merely because it works on the happy path.

---

## Destructive Actions

AI must never autonomously perform destructive user-data actions.

Deletion or replacement of important user information requires explicit confirmation.

External data owned by services such as Apple Health, Gmail, Calendar and Reminders must not be deleted unless the user has explicitly requested that specific action.

---

## Source Control

Keep commits focused and understandable.

Do not mix unrelated features in the same change.

Before proposing a commit, summarise:

- what changed;
- why it changed;
- how it was tested;
- any known limitations.

Never commit generated secrets, build artefacts or private user data.

---

## Guiding Product Principle

When uncertain between adding functionality and reducing complexity, prefer the solution that better answers:

> What does the user need to know or do now?

Personal OS should reduce executive load rather than create another system the user must manage.
