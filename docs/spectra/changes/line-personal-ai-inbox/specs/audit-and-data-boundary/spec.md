## Purpose

The audit-and-data-boundary capability prevents raw personal LINE content from crossing the intended trust boundary and makes sensitive actions traceable. It preserves masked projections, scoped audit records, retention policy, and Fish-only urgent notifications.

## ADDED Requirements

### Requirement: Masked data projection

The system MUST keep raw LINE text and raw attachment content in the local connector boundary and MUST expose only masked summaries, source metadata, classification results, task data, and permitted status fields to the cloud workbench. Any external-AI payload MUST be derived from the masked projection and MUST exclude configured sensitive values.

#### Scenario: Sensitive values are masked before an AI call

- **WHEN** the system prepares a provider payload for a message containing a phone number or address
- **THEN** the raw message MUST remain local and the provider payload MUST omit the configured sensitive values

#### Scenario: Family response never contains raw content

- **WHEN** a family actor requests the inbox or a task
- **THEN** the response MUST omit raw text and unmasked attachment content

### Requirement: Append-only scoped audit events

The system MUST record security-sensitive actions as append-only events containing actor, family workspace, action, target, result, timestamp, request or action identifier, and error code when applicable. Fish MUST read complete audit details, while family actors MUST read only their own result summaries. Audit records MUST NOT contain raw content, tokens, or secrets.

#### Scenario: Protected-operation denial is auditable

- **WHEN** a family actor is denied access to a protected operation
- **THEN** the system MUST append an authorization-failure event scoped to that actor and MUST omit raw message content

#### Scenario: Duplicate action remains idempotent

- **WHEN** the same action identifier is submitted twice
- **THEN** the system MUST return the original result and MUST append no second business operation

### Requirement: Retention and important holds

The system MUST remove raw messages and unnecessary attachment indexes after 90 days unless the conversation is marked important to retain. The system MUST retain masked summaries, quadrant results, formal tasks, and required audit records according to policy. Encrypted backup content MUST follow the same 90-day policy.

#### Scenario: Unheld raw content expires

- **WHEN** the retention job processes raw content older than 90 days without a hold
- **THEN** the raw content and unnecessary attachment indexes MUST be removed while policy-retained projections and audit records remain

#### Scenario: Important conversation remains retained

- **WHEN** the retention job processes an important conversation marked for retention
- **THEN** the conversation raw content MUST remain available within the local boundary

### Requirement: Fish-only masked urgent notifications

The system MUST send an important-and-urgent notification only to Fish devices outside a configured mute period. The notification MUST contain a masked summary and a workbench entry point, and MUST NOT contain raw LINE text.

#### Scenario: Urgent notification reaches only Fish

- **WHEN** an item becomes important and urgent while notifications are enabled and not muted
- **THEN** only Fish devices MUST receive a masked notification with a workbench entry point
