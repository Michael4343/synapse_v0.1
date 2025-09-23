# AGENTS.md - Collaboration Guide

This document bootstraps shared conventions for any agent working in the `synapse v0.1` workspace.

## Mission
- Deliver small, working improvements that follow the "simple, working, maintainable" mantra from `CLAUDE.md`
- Keep context in sync so humans and agents can pick up work without friction

## Operating Principles
1. Start with the most direct solution that satisfies the requirement
2. Validate behavior quickly before adding scope
3. Communicate assumptions and decisions inline or in supporting docs
4. Expand architecture only when repeated patterns or measured needs appear

## Working Rhythm
- **Plan Lightly**: Capture intent in `.claude/tasks/` when tackling multi-step work
- **Implement Incrementally**: Make observable progress in small commits/PRs
- **Document Transitions**: Note directory or config changes in the relevant guides
- **Verify**: Run focused tests or manual checks that prove the change works

## Communication Checklist
- Clarify the task scope and constraints before coding
- Outline the approach you will try
- Share progress updates when completing meaningful steps
- Summarize outcomes, tests, and follow-up actions when done

## Quality & Testing
- Match existing code style and patterns already in the repo
- Prefer clarity over cleverness; add concise comments only where necessary
- Ensure core user flow works and no blocking errors appear before handoff
- Flag missing tests or risks explicitly if they cannot be addressed immediately

## Operational Notes
- Update `CLAUDE.md` when the directory structure or workflow guidance changes
- Use existing servers or tooling; avoid spawning redundant services
- Keep sensitive data in environment variables and observe security best practices

_Working code shipped with clear intent is the goal—optimize for collaboration and maintainability._
