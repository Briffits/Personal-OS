# Personal OS — MVP Specification

## Purpose

This document defines the first working version of Personal OS.

The MVP should prove one core proposition:

> Personal OS can reduce the mental effort required to understand what deserves the user's attention today.

The MVP is intentionally limited in scope.

Do not implement features that are listed as future work unless explicitly requested.

---

## Platform

Personal OS MVP is:

- iPhone-first
- built with React Native
- written primarily in TypeScript
- allowed to use native Swift modules where Apple-specific APIs require them

The project should remain architected so future platforms may be added later, but no Android, iPad, Mac or web client is required for the MVP.

---

## MVP Core Navigation

The application should include these main areas:

### Today

Mandatory main screen.

Today must always remain available.

### Ask

Placeholder only in the first build.

No AI functionality is required initially.

### Capture

Placeholder only in the first build.

No voice, camera or file processing is required initially.

### Library

Provides access to the Prescription Wallet.

Other library features may remain placeholders.

### Settings

Accessible from the main interface.

---

## Today Screen

The Today screen should use this structure:

### NOW

One highest-priority action.

### TODAY

Two additional priorities.

The initial implementation may use placeholder or test data.

The goal is to establish the interface structure before connecting real task or calendar sources.

Example:

```text
NOW

Call pharmacy
Estimated time: 5 minutes

TODAY

Finish Codistry exercise
Estimated time: 40 minutes

Reply to important email
Estimated time: 10 minutes
