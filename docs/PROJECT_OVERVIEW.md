# Personal OS

## Project Overview

**Personal OS** is an iPhone-first application designed to reduce the mental effort required to work out what needs attention now.

Rather than replacing the apps people already use, Personal OS acts as an **orchestration and executive-function layer** across them. It connects information from existing services such as Apple Reminders, Calendar, Health, Gmail and iCloud, then presents a simple, prioritised view of what matters.

The central question Personal OS aims to answer is:

> **Across everything happening in my life, what requires my attention now?**

---

## The Problem

Daily information is spread across multiple systems:

- tasks in Apple Reminders;
- appointments in Calendar;
- important messages in email;
- medication records in Apple Health;
- prescriptions and documents in Files or iCloud;
- notes and ideas in separate apps;
- deliveries, replies and other outstanding items that must simply be remembered.

Each individual application may work well, but the user is still responsible for mentally combining all of this information and deciding what is important.

For people dealing with high workloads, busy family lives, or executive-function difficulties such as ADHD, this creates unnecessary cognitive load.

Personal OS aims to reduce that burden.

---

## Product Philosophy

Personal OS is based on a few core principles.

### 1. Orchestrate, do not replace

Existing specialist applications remain the source of truth wherever possible.

Examples:

- Apple Reminders remains the task manager;
- Apple Calendar remains the calendar;
- Apple Health remains responsible for medication dose logging;
- Gmail remains the email system;
- iCloud or user-selected storage remains the document location.

Personal OS adds intelligence and coordination on top of those systems.

### 2. Complex underneath, simple on top

The application may use multiple APIs, services and AI tools behind the scenes, but the user should see a simple interface focused on what matters now.

### 3. User control first

AI may analyse, prioritise, draft and recommend actions, but consequential actions require user approval.

Low-risk actions may be automated only where the user has explicitly allowed them.

### 4. No hidden behavioural profiling

Personal OS should use preferences deliberately configured by the user rather than silently building a behavioural profile.

### 5. Local first, cloud only when useful

Sensitive information should remain on-device or in user-controlled storage where practical.

The backend should retain only the minimum information necessary for integration, synchronisation and intelligence.

### 6. The user's data should remain usable without Personal OS

Removing the app should not remove access to the user's tasks, calendar, health information, documents or notes.

---

## Personal OS 1.0

The first usable version will intentionally be smaller than the long-term product vision.

The aim of version 1.0 is to prove that Personal OS can reduce the mental effort needed to understand what deserves attention today.

### Core navigation

The application will initially use four main areas:

- **Today** — mandatory main dashboard;
- **Ask** — AI-assisted reasoning across authorised information;
- **Capture** — quick voice, text, photo and file capture;
- **Library** — access to personal information such as prescriptions and saved items.

The user may later customise the navigation, but **Today** will always remain available.

---

## Today

Today is the core Personal OS experience.

Instead of presenting a long task list, the interface will reduce the user's immediate decision space.

### NOW

One recommended action to focus on next.

### TODAY

Two additional priorities for the day.

A user may override the AI recommendation at any time and manually choose their priority.

Example:

```text
NOW
Call pharmacy · ~5 min
Prescription available

TODAY
Finish Codistry exercise · ~40 min
Reply to Sarah · ~10 min
```

The Today screen may adapt throughout the day so that morning, midday and evening views emphasise the most relevant information.

---

## Help Me Start

A task can be difficult even when the user knows exactly what must be done.

Personal OS will therefore include **Help Me Start**, which turns a large or vague task into one very small first action.

Example:

```text
Original task: Sort the garage

First step:
Get one rubbish bag and stand at the garage entrance.
Estimated time: 2 minutes
```

The aim is to support task initiation rather than create another large checklist.

---

## Apple Reminders

Apple Reminders will remain the source of truth for tasks.

Personal OS may:

- read reminders;
- display and prioritise them;
- suggest scheduling;
- create reminders after approval;
- identify tasks that fit available free time.

Personal OS will not attempt to become a replacement task-management system.

---

## Calendar

Personal OS will use calendar information to understand the user's available time and upcoming commitments.

Planned capabilities include:

- reading today's events;
- identifying free time;
- detecting conflicts;
- suggesting suitable time blocks for tasks;
- associating relevant information with calendar events.

Calendar changes will require user approval.

---

## Prescription Wallet

The Prescription Wallet is one of the original reasons for creating Personal OS and is therefore an essential version 1.0 feature.

Apple Health will remain responsible for medication schedules, prompts and logging whether doses were taken.

Personal OS will instead handle the administrative side of medication management.

### Planned functions

- store the current prescription as an image or document;
- provide quick Face ID-protected access so it can be shown to a pharmacist;
- record physical medication stock added by the user;
- read medication dose events from Apple Health where permission is granted;
- calculate estimated stock using actual doses logged as taken;
- allow manual stock correction;
- warn when estimated stock becomes low.

Example:

```text
Medication A
Estimated stock: 23 tablets
Approximately 23 days remaining

[View Prescription] [Add Stock] [Correct Stock]
```

Personal OS does not aim to become a medication-adherence application and will not duplicate Apple Health's dose-taking interface.

---

## Gmail Intelligence

Gmail will be the first email integration.

Personal OS should help identify information that deserves attention rather than simply displaying another inbox.

Planned functions include:

- classify incoming email;
- identify messages that require action;
- identify important information;
- detect likely forgotten or unanswered messages;
- prepare draft replies;
- detect orders, dispatches and delivery issues.

Personal OS will not automatically send email.

The email architecture should allow additional providers, such as Microsoft Outlook, to be added later.

---

## Briefings

Personal OS will provide configurable briefings rather than a single fixed daily summary.

A user may choose different times and different content for each briefing.

Example:

```text
07:00 — Full Brief
Calendar · NOW/TODAY · Gmail · Medication

13:00 — Midday Check
Remaining priorities · Important new email

20:30 — Evening Preview
Outstanding actions · Tomorrow
```

The user should also be able to generate a briefing manually at any time.

---

## Notifications

Notifications will use three levels:

1. **Critical** — requires prompt attention;
2. **Important** — worth seeing soon;
3. **Briefing Only** — does not interrupt the user and appears in the next briefing.

Notification behaviour will be configurable and should respect iOS Focus modes.

---

## Search and Ask

Personal OS will keep **Search** and **Ask** separate.

### Search

Fast, literal retrieval of existing information.

Example:

```text
MacBook receipt
```

### Ask

AI-assisted reasoning across information sources that the user has explicitly authorised.

Examples:

```text
What should I deal with today?
Which important emails have I not answered?
When will I run low on my medication?
Why is this my highest priority?
```

Personal OS should be able to explain why it made a recommendation.

---

## Capture

Capture should make it possible to save something before deciding where it belongs.

Supported input should eventually include:

- voice;
- text;
- photo;
- scanned document;
- imported file;
- content shared from another application.

AI may suggest whether the captured item is a reminder, saved item, document, prescription or other type of information.

The user remains able to correct that classification.

---

## Data and Privacy

Personal OS should request permissions only when the related feature is first used.

Expected permissions include:

- notifications;
- Calendar read/write;
- Reminders read/write;
- medication-related Apple Health access;
- camera;
- selected Photos access;
- microphone and speech recognition where required;
- Files/iCloud access;
- Face ID;
- Gmail OAuth.

Personal OS does **not** initially require:

- location access;
- Contacts access.

The application will include a Privacy Dashboard showing connected services, permissions and AI access.

A user will be able to pause Personal OS intelligence without deleting underlying data.

---

## Security

Personal OS will use **Sign in with Apple**.

Sensitive areas such as the Prescription Wallet will require Face ID by default.

AI will not be permitted to perform destructive actions autonomously.

Deleting or replacing important information requires explicit confirmation.

---

## Architecture

Personal OS 1.0 will be **iPhone-first**.

The architecture should allow future iPad, Mac or web clients without requiring the application to be redesigned from the beginning.

The planned architecture is hybrid:

### On the iPhone

- user interface;
- Calendar and Reminders access;
- Apple Health access;
- prescription storage and secure access;
- local search where practical;
- local cache and offline capability.

### Backend

A small EU-hosted server, likely using a provider such as Hetzner, will support features that need to operate while the phone is inactive.

Potential responsibilities include:

- Gmail background processing;
- scheduled briefings;
- selected AI processing;
- synchronisation;
- activity logging;
- future news and external integrations.

The backend should primarily store references, relationships, metadata and settings rather than permanent copies of source data.

---

## AI Architecture

Personal OS should not depend permanently on one AI vendor.

AI functionality should be exposed through a provider-independent service layer so that different cloud or on-device models can be used later.

The preferred order of processing is:

1. explicit user preference;
2. native/on-device capability;
3. Personal OS backend;
4. external AI service where necessary.

The default AI behaviour is **approval-first**.

AI may analyse, prioritise and propose actions, while low-risk routines may operate automatically only when explicitly authorised by the user.

---

## Offline Behaviour

Personal OS should remain useful when there is no internet connection.

Local information such as Reminders, Calendar, prescriptions and cached Today information should remain accessible.

Features requiring Gmail, fresh external information or cloud AI can temporarily become unavailable and resume when connectivity returns.

Offline actions should be queued for later synchronisation where appropriate.

---

## Initial Development Plan

The course project will be built incrementally rather than attempting the full product at once.

### Milestone 1 — Application shell

Create the basic iPhone application and navigation structure.

### Milestone 2 — Prescription Wallet

Implement prescription storage, stock entry, secure access and the basic medication interface.

### Milestone 3 — Apple Health integration

Read medication and dose information from HealthKit and use it to estimate stock.

### Milestone 4 — Apple Reminders

Read and display tasks due today.

### Milestone 5 — Calendar

Read today's events and identify available time.

### Milestone 6 — NOW and TODAY

Create the first rules-based priority engine.

### Milestone 7 — Help Me Start

Introduce a tightly scoped generative AI feature that produces one small first action for a selected task.

### Milestone 8 — Briefings

Combine Calendar, Reminders and medication information into a useful daily briefing.

Further integrations such as Gmail, backend services, Waiting For, Projects, news and advanced AI reasoning will be introduced after the core experience is stable.

---

## Success Criterion

Personal OS succeeds if it reduces the number of applications and decisions required to understand what deserves the user's attention.

The key experience should ultimately be:

```text
NOW
One thing to focus on.

TODAY
Two additional priorities.

ATTENTION
Only genuine exceptions.
```

Everything else in the application exists to support that outcome.

---

## Current Status

Personal OS is currently in the **product definition and architecture stage** as part of the Codistry Zero to AI Builder learning process.

The immediate next step is to turn this product vision into a smaller MVP specification and begin implementation with the iPhone application shell and Prescription Wallet.
