---
roster:
  - id: intake
    label: Scoping
    agent: project-manager
    interactive: true
  - id: product-design
    label: Designing the experience
    agent: product-designer
  - id: architecture
    label: Architecting
    agent: software-architect
  - id: implementation
    label: Implementing
    agent: developer
  - id: review
    label: Reviewing
    agent: software-architect
    engine: secondary
    executionPolicy: quality
  - id: test
    label: Verifying
    agent: tester
    executionPolicy: quality
  - id: release
    label: Preparing the release
    agent: release-manager
    executionPolicy: delivery
  - id: closeout
    label: Closing out
    agent: orchestrator
    executionPolicy: closeout
flows:
  delivery:
    - { role: intake, step: plan-feature }
    - { role: implementation, step: implement-feature }
    - { role: review, step: review-implementation }
    - { role: test, step: verify-feature }
    - { role: release, step: prepare-release }
    - { role: closeout, step: closeout-feature }
  discovery:
    - { role: intake, step: plan-feature }
    - { role: product-design, step: design-experience }
    - { role: architecture, step: design-architecture }
    - { role: closeout, step: closeout-feature }
---
# The team

This project's standing team. The Orchestrator picks one of the flows above for
each run, and asks no one before it starts. It changes the roster or the flows only
through a proposal the owner approves, which rewrites this file.

- **delivery** builds a change: scope it, implement it, review it on the secondary
  engine without the Developer's account, verify it, prepare the release, close out.
- **discovery** researches before anything is built: scope the question, design the
  experience and the architecture, close out. Nobody writes code.

Edit this file by hand at any time. A role is one agent on one engine; a flow is the
order in which roles take their steps, and a role appears at most once in a flow.
