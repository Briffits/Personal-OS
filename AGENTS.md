# Personal OS — AI Agent Instructions

## Project Purpose

Personal OS is an iPhone-first application designed to reduce the cognitive effort required to determine what deserves the user's attention now.

It acts as an orchestration and executive-function layer over services the user already uses rather than attempting to replace them.

The core product question is:

> Across everything happening in my life, what requires my attention now?

Before making architectural, product or implementation decisions, read:

- `docs/PROJECT_OVERVIEW.md`
- `docs/MVP_SPEC.md`

These documents define the product vision and the current MVP scope.

Do not implement features outside the current requested milestone merely because they appear in the long-term project overview.

---

## Technology Stack

Personal OS 1.0 will use:

- React Native
- TypeScript
- Native iOS integration using Swift where Apple-specific functionality requires it
- iPhone as the only client platform for v1.0
- An EU-hosted backend later in development, likely on Hetzner or a similar provider
- Provider-independent AI architecture

The project should remain architected so that additional platforms may be supported in future without requiring unnecessary complexity in v1.0.

Do not introduce a new framework, major dependency, backend service, database, state-management library or architectural layer without first explaining:

1. why it is required;
2. what problem it solves;
3. what simpler alternatives exist;
4. what maintenance implications it introduces;
5. what privacy or security implications it introduces.

Prefer:

- native platform capabilities;
- standard React Native capabilities;
- TypeScript;
- minimal dependencies;
- clear interfaces;
- simple implementations.

Do not make Expo Managed Workflow a mandatory architectural dependency unless explicitly approved.

If Expo tooling is proposed for a specific purpose, explain why it is preferable to the alternatives and whether it limits native iOS access.

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
- Reminder service communicates with Apple Reminders.
- Calendar service communicates with Apple Calendar.
- Today priority engine determines NOW and TODAY.
- AI service communicates with an authorised AI provider.
- UI components display information but should not contain unrelated business logic.

Avoid large classes, managers, services or components that accumulate unrelated responsibilities.

A component named something such as `PersonalOSManager` that controls HealthKit, reminders, email, AI, notifications and UI state is a design warning and should normally be rejected.

### Prefer Composition Over Monoliths

Complex behaviour should emerge by combining simple, well-defined components.

For example:

```text
HealthKit
    ↓
Medication Dose Events
    ↓
Medication Stock Service
    ↓
Medication State
    ↓
Prescription Wallet / Today
```

The HealthKit integration should not decide how the Today screen is displayed.

The Today screen should not directly query HealthKit.

Each layer should provide a clean interface to the next.

### Keep Interfaces Small

Modules should expose only what other parts of the application genuinely require.

Do not expose implementation details unnecessarily.

Prefer an interface conceptually similar to:

```text
MedicationService.getEstimatedStock()
```

rather than allowing unrelated components to directly manipulate:

- HealthKit;
- medication storage;
- prescription files;
- stock calculations.

### Make Components Replaceable

Where practical, implementations should be replaceable without rewriting unrelated parts of the application.

Examples:

- AI providers should sit behind a common AI service interface.
- Backend hosting should not be tightly coupled to Hetzner.
- Storage implementations should sit behind appropriate interfaces.
- Email providers should eventually use a common mail connector model.
- Apple-specific functionality should be isolated behind native service interfaces.

Depend on capabilities rather than vendors.

### Prefer Simplicity

Choose the simplest solution that correctly solves the current requirement.

Do not introduce:

- unnecessary frameworks;
- speculative abstractions;
- premature microservices;
- unnecessary state-management systems;
- unnecessary design patterns;
- dependencies for functionality that can be implemented clearly using platform capabilities.

Do not build infrastructure for hypothetical future requirements unless the current architecture would otherwise make future development unreasonably difficult.

Avoid premature optimisation.

Avoid abstraction for abstraction's sake.

### Use Existing Tools Well

Do not recreate functionality already provided effectively by the operating system or an existing authorised service.

Examples:

- Apple Reminders handles tasks.
- Apple Calendar handles calendar events.
- Apple Health handles medication dose logging.
- Face ID handles biometric authentication.
- Gmail handles email storage.
- iCloud or user-selected storage handles user documents.

Personal OS should orchestrate these systems rather than duplicate them.

### Prefer Explicit Behaviour Over Hidden Magic

Important application behaviour should be understandable from the code.

Avoid:

- hidden side effects;
- unexpected background actions;
- implicit destructive behaviour;
- state changes that cannot be traced;
- AI decisions that cannot be explained.

Data flow should be traceable.

Where AI or automation makes a decision, the application should retain enough information to explain why the decision was made.

### Fail Gracefully

Failure of one component should not unnecessarily cause failure elsewhere.

Examples:

- If the AI provider is unavailable, Reminders and Calendar should still work.
- If Gmail cannot refresh, medication stock should still work.
- If HealthKit permission is denied, manual medication stock tracking should remain available.
- If the backend is offline, local Personal OS functionality should continue.
- If one external service fails, Today should display whatever reliable information remains available.

Prefer graceful degradation over total failure.

### Prefer Open and Portable Data

Where Personal OS owns data, prefer standard and portable formats where practical.

Examples include:

- JSON
- CSV
- Markdown
- standard image formats
- PDF
- standard document formats

Avoid proprietary formats unless there is a clear technical requirement.

The user should not lose access to their information merely because Personal OS is removed.

### Least Privilege

Every component should request only the data and permissions it requires.

Examples:

- Medication functionality should not request unrelated Health data.
- Personal OS should not request Contacts access unless a future feature genuinely requires it.
- Personal OS should not request location access merely to recreate functionality already available through Apple Reminders.
- Backend services should receive only the information required for the operation being performed.

Permissions should be requested just in time, when the related feature is first used.

### Code for Removal as Well as Addition

A well-designed feature should be removable or replaceable without destabilising unrelated areas of the application.

If removing one module requires rewriting the whole application, the architecture is too tightly coupled.

Features should communicate through explicit interfaces wherever practical.

### Optimise for Understanding

Code will be developed with AI assistance, but it must remain understandable to a human developer.

Prefer readable, conventional code over clever code.

The AI agent should be able to explain:

1. what each component does;
2. what data it receives;
3. what data it returns;
4. what side effects it has;
5. what other components it depends upon;
6. how failures are handled.

If an implementation cannot be explained clearly, it should be simplified.

---

## Development Approach

Work incrementally.

Before implementing any milestone or substantial change:

1. Read the relevant project requirements.
2. Inspect the existing repository.
3. Explain the proposed implementation approach.
4. Identify files that will be created or modified.
5. Identify any new dependencies.
6. Explain why each new dependency is necessary.
7. Explain how the change will be tested.
8. Identify relevant edge cases.
9. Wait for approval before making substantial changes unless explicitly instructed otherwise.

Do not implement future milestones merely because they appear in the project roadmap.

Only implement the scope explicitly requested.

Prefer small, understandable and testable changes over large generated implementations.

Do not generate large quantities of speculative code.

---

## Product Architecture Principles

### Orchestrate, Do Not Replace

Where practical, existing specialist applications remain the source of truth.

Examples:

- Apple Reminders remains the task system.
- Apple Calendar remains the calendar system.
- Apple Health remains responsible for medication dose logging.
- Gmail remains the email system.
- User-controlled storage remains the source of truth for documents.

Personal OS should add:

- intelligence;
- coordination;
- context;
- prioritisation;
- retrieval;
- orchestration.

It should not unnecessarily recreate services already handled well elsewhere.

### Complex Underneath, Simple on Top

Technical complexity must not leak unnecessarily into the user interface.

The user experience should remain focused on reducing cognitive load.

The user should not need to understand:

- APIs;
- providers;
- backend services;
- integration layers;
- sync mechanisms;
- AI models.

The application should surface only the information and actions relevant to the user.

### User Control First

AI may:

- analyse;
- prioritise;
- classify;
- draft;
- summarise;
- recommend;
- propose actions.

Consequential actions should normally require user approval.

Low-risk automation may occur only where explicitly authorised.

AI should never assume permission merely because an action is technically possible.

### No Hidden Behavioural Profiling

Do not silently infer permanent user preferences from behaviour.

Persistent preferences should come from explicit user configuration.

A user dismissing one item should not silently create a long-term behavioural rule.

Do not create psychological, medical or behavioural profiles from application usage.

### Local First

Sensitive information should remain on-device or in user-controlled storage wherever practical.

Cloud processing should be used only where it provides a clear functional benefit.

Before sending information to a backend or external AI provider, consider whether the task can reasonably be completed:

1. on-device;
2. using a native platform capability;
3. using deterministic local logic.

Send only the minimum information required.

### Graceful Degradation

Loss of:

- network connectivity;
- backend availability;
- an AI provider;
- Gmail;
- another external integration

should not make the entire application unusable.

Local functionality should continue wherever possible.

---

## Core Product Behaviour

The core Personal OS experience centres on:

### NOW

One recommended next action.

### TODAY

Two additional priorities.

The aim is to reduce the user's immediate decision space.

The user may manually override priority recommendations.

An explicit user priority always overrides AI ranking.

---

## Help Me Start

Help Me Start should reduce a task to one very small first action.

Example:

```text
Task:
Sort the garage

First step:
Get one rubbish bag and stand at the garage entrance.

Estimated time:
2 minutes
```

The goal is task initiation.

Do not automatically generate large checklists unless the user requests them.

Do not modify the original reminder unless explicitly authorised.

---

## Prescription Wallet Principles

The Prescription Wallet is an essential Personal OS feature.

Apple Health remains responsible for:

- medication schedules;
- medication prompts;
- recording whether medication was taken.

Personal OS handles:

- current prescription access;
- physical stock additions;
- estimated remaining stock;
- manual stock correction;
- low-stock awareness.

Do not recreate a medication-adherence application.

Do not provide diagnosis, treatment recommendations or medical interpretation.

Only the current prescription is required unless future requirements explicitly change this.

Replacing or deleting a prescription requires explicit confirmation.

---

## Data Ownership

Personal OS should avoid becoming the sole owner of user information.

Where practical:

- tasks remain in Apple Reminders;
- events remain in Apple Calendar;
- medication dose records remain in Apple Health;
- email remains in Gmail;
- documents remain in user-controlled storage;
- notes remain in the user's selected notes/storage application where possible.

Personal OS primarily owns:

- relationships;
- metadata;
- preferences;
- derived state;
- orchestration state.

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
- real production credentials

Secrets must be stored using an appropriate local or server-side secret-management mechanism.

If configuration files containing secrets are required:

- add the real file to `.gitignore`;
- provide a safe example file such as `.env.example`;
- use obvious placeholder values only.

Never include real user information in:

- fixtures;
- screenshots;
- tests;
- sample data;
- debug logs;
- committed databases.

Before committing changes, check that no sensitive information has been introduced.

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

Apple-specific logic should remain isolated from unrelated application code.

---

## AI Architecture

Personal OS should remain AI-provider independent.

Application code should depend on an abstract AI service interface rather than directly embedding a single vendor throughout the codebase.

Prefer a conceptual structure such as:

```text
AIService
    ├── summarise()
    ├── classify()
    ├── suggestFirstStep()
    └── explainPriority()
```

rather than vendor-specific calls scattered through application features.

Do not tightly couple application logic to:

- OpenAI;
- Anthropic;
- Google;
- Apple models;
- any other single AI provider.

Use native or deterministic processing where it is sufficient.

AI should be introduced only where it materially improves the user experience.

---

## AI Autonomy

Default behaviour is approval-first.

AI may analyse and prepare actions.

AI must not independently:

- send email;
- delete important user data;
- delete external service data;
- change major calendar commitments;
- make medical decisions;
- make purchases;
- perform irreversible actions.

Low-risk maintenance activity may be automated only where explicitly authorised.

---

## Logging

Logs must not expose:

- medication details unnecessarily;
- health records;
- prescription contents;
- email content;
- authentication tokens;
- secrets;
- sensitive document content.

Use sanitised development logs.

Debug logging should be removable or disabled in production.

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
- testable business logic;
- predictable data flow.

Avoid unnecessary abstraction.

Avoid unnecessary global state.

Do not generate large amounts of speculative code for future functionality.

Comments should explain:

- important reasoning;
- architectural constraints;
- privacy implications;
- non-obvious behaviour.

Comments should not merely restate what the code already says.

---

## State Management

Do not introduce a major state-management library automatically.

Begin with the simplest approach appropriate to the current application.

Before introducing Redux, Zustand, MobX or another external state-management solution, explain:

1. why React's built-in mechanisms are insufficient;
2. what specific problem the library solves;
3. the maintenance cost;
4. whether the dependency is justified at the current project size.

---

## Dependencies

Every third-party dependency should have a clear purpose.

Before adding one, consider:

- whether React Native already provides the capability;
- whether iOS provides the capability natively;
- project maintenance activity;
- security implications;
- licence compatibility;
- long-term support;
- whether the dependency meaningfully reduces complexity.

Avoid installing large libraries for small utilities.

---

## Error Handling

Do not silently swallow errors.

Errors should be handled at the appropriate layer.

User-facing errors should be:

- understandable;
- non-technical where possible;
- actionable where appropriate.

Internal technical detail should be logged safely for development without exposing private information.

---

## Offline Behaviour

Personal OS should remain useful without an internet connection.

Local features should continue wherever technically possible.

Examples:

- Prescription Wallet;
- local stock state;
- Apple Reminders;
- Apple Calendar;
- cached Today information;
- settings.

Cloud-dependent functionality may temporarily become unavailable.

The application should fail gracefully and clearly indicate stale or unavailable information when appropriate.

---

## Testing

Every substantial feature should include a clear testing approach.

Where practical:

- business logic should have automated tests;
- edge cases should be considered explicitly;
- denied permissions should be tested;
- unavailable services should be handled gracefully;
- invalid input should not crash the application;
- offline conditions should be considered;
- duplicate data should be considered;
- empty states should be considered.

A feature is not considered complete merely because it works on the happy path.

Before marking work complete, explain:

1. what was tested;
2. what was not tested;
3. known limitations;
4. any manual testing still required.

---

## Destructive Actions

AI must never autonomously perform destructive user-data actions.

Deletion or replacement of important user information requires explicit confirmation.

External data owned by services such as Apple Health, Gmail, Calendar and Reminders must not be deleted unless the user has explicitly requested that specific action.

---

## Accessibility

Use native accessibility capabilities wherever practical.

UI components should support:

- Dynamic Type;
- VoiceOver;
- appropriate accessibility labels;
- sufficient touch target sizes;
- meaningful focus order.

Do not rely solely on colour to communicate important state.

Accessibility should be considered during implementation rather than added only at the end.

---

## Performance

Do not optimise prematurely.

However:

- avoid unnecessary re-renders;
- avoid repeated expensive API calls;
- avoid loading large datasets unnecessarily;
- avoid blocking the UI thread;
- cache appropriate local information where useful.

Measure before introducing complex performance optimisations.

---

## Source Control

Keep commits focused and understandable.

Do not mix unrelated features in the same change.

Before proposing a commit, summarise:

- what changed;
- why it changed;
- how it was tested;
- any known limitations.

Never commit:

- generated secrets;
- build artefacts;
- private user data;
- temporary development files.

Respect the repository `.gitignore`.

---

## Current Development Scope

The MVP development order is defined in:

`docs/MVP_SPEC.md`

The planned sequence is:

1. Application shell
2. Prescription Wallet
3. Apple Health integration
4. Apple Reminders integration
5. Calendar integration
6. NOW and TODAY priority engine
7. Help Me Start
8. Daily briefing

Do not jump ahead to later milestones without explicit instruction.

---

## Out-of-Scope Features

Unless explicitly requested, do not begin implementing:

- Gmail intelligence;
- Outlook integration;
- full Projects system;
- Waiting For engine;
- news aggregation;
- advanced document vault;
- warranty tracking;
- Hetzner backend;
- cross-device support;
- Android;
- Mac;
- iPad;
- full AI assistant;
- autonomous task scheduling;
- bank integrations;
- behavioural profiling.

These are future product capabilities and should not complicate early implementation.

---

## Agent Workflow

For every meaningful development request, follow this process:

### 1. Understand

Read:

- `AGENTS.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/MVP_SPEC.md`

and the user's current request.

### 2. Inspect

Inspect the existing repository before proposing changes.

Do not assume files, packages or architecture exist.

### 3. Plan

Before substantial implementation, explain:

- proposed approach;
- files affected;
- dependencies;
- data flow;
- permission implications;
- testing approach.

### 4. Confirm Scope

Ensure the plan addresses only the requested milestone.

Do not add unrelated features.

### 5. Implement

Make the smallest coherent implementation that satisfies the approved requirements.

### 6. Test

Run appropriate:

- linting;
- type checks;
- automated tests;
- builds;
- manual checks where possible.

### 7. Explain

After implementation, summarise:

- what changed;
- how it works;
- why the architecture was chosen;
- how it was tested;
- remaining limitations.

### 8. Commit Preparation

Suggest a concise commit message.

Do not commit secrets or private information.

---

## Guiding Product Principle

When uncertain between adding functionality and reducing complexity, prefer the solution that better answers:

> What does the user need to know or do now?

Personal OS should reduce executive load rather than create another system the user must manage.

When uncertain between cleverness and clarity:

> Prefer clarity.

When uncertain between a monolithic solution and a small composable component:

> Prefer the small composable component.

When uncertain whether to duplicate functionality already provided well by another system:

> Orchestrate it instead.
