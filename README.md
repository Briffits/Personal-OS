# Personal OS

Personal OS is an iPhone-first application designed to reduce the mental effort required to work out what deserves the user's attention now.

Rather than replacing existing applications, Personal OS acts as an **orchestration and executive-function layer** across services such as Apple Reminders, Calendar, Apple Health and, later, email and other information sources.

The central product question is:

> **Across everything happening in my life, what requires my attention now?**

## Project Status

Personal OS is currently in the **planning and early development stage** as part of the Codistry Zero to AI Builder course.

The project will be developed incrementally, beginning with a small working MVP before introducing more advanced integrations.

## Technology Direction

The planned v1.0 stack is:

- React Native
- TypeScript
- Native Swift integration where Apple-specific APIs require it
- iPhone as the initial platform
- Apple Health, Calendar and Reminders integrations
- Provider-independent AI architecture
- EU-hosted backend in a later development phase

## Initial MVP

The first working version will focus on:

**Today**
- NOW: one recommended next action
- TODAY: two additional priorities

**Prescription Wallet**
- current prescription
- medication stock tracking
- Apple Health integration
- quick Face ID-protected prescription access

**Apple Reminders**
- source of truth for tasks

**Apple Calendar**
- schedule context

**Help Me Start**
- AI-assisted reduction of a task into one small first action

Later phases will introduce features such as Gmail intelligence, configurable briefings, Waiting For, Projects, news intelligence and broader cross-source reasoning.

## Project Documentation

Detailed project documentation is available here:

- [Project Overview](docs/PROJECT_OVERVIEW.md)
- [MVP Specification](docs/MVP_SPEC.md)
- [AI Agent Instructions](AGENTS.md)

## Development Principles

Personal OS follows several core principles:

- **Orchestrate, do not replace**
- **Complex underneath, simple on top**
- **User control first**
- **Local-first processing where practical**
- **No hidden behavioural profiling**
- **User-owned data**
- **Graceful degradation**
- **AI should reduce cognitive load, not create more of it**

## Repository Security

This repository is public.

No API keys, authentication secrets, health information, prescription images, personal email content or private user data should ever be committed.

Example configuration is provided through `.env.example`, while real local configuration is excluded through `.gitignore`.

## Current Development Milestones

1. Application shell
2. Prescription Wallet
3. Apple Health integration
4. Apple Reminders integration
5. Calendar integration
6. NOW and TODAY priority engine
7. Help Me Start
8. Daily briefing

## Long-Term Goal

Personal OS succeeds if the user can open one screen and quickly understand:

```text
NOW
One thing to focus on.

TODAY
Two additional priorities.

ATTENTION
Only genuine exceptions.
