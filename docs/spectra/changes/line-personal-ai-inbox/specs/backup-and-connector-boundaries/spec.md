## Purpose

The backup-and-connector-boundaries capability defines replaceable fake adapters for the first milestone and preserves a safe path to the future Mac mini connector and encrypted Google Drive backup. It makes integration limitations observable instead of implying that real LINE or provider access already exists.

## ADDED Requirements

### Requirement: Replaceable simulated adapters

The first milestone MUST inject connector, AI, notification, email, and backup adapters behind replaceable interfaces. The fake connector MUST provide private, group, and openchat fixtures; the rule-based AI adapter MUST provide quadrant, confidence, reason, task-candidate, and draft results; and each adapter MUST expose deterministic test outcomes without external credentials.

#### Scenario: Fake adapters run without external providers

- **WHEN** the test deployment starts without LINE, AI, Email, or Google credentials
- **THEN** seeded data and adapter responses MUST remain available through deterministic fake adapters

### Requirement: Connector continuity and retry queue

The system MUST continue writing locally received messages when backup availability fails. Backup work MUST enter a retryable local queue, and backup failure MUST NOT stop connector intake or AI queue processing.

#### Scenario: Backup outage does not stop local intake

- **WHEN** the connector receives a new message while the backup adapter is unavailable
- **THEN** the system MUST persist the message locally, enqueue AI processing, and place the backup upload in a retryable queue

### Requirement: Explicit integration capability states

The system MUST label simulated, disabled, offline, paused, backfilling, and error integration states in API responses and the workbench. A disabled capability MUST reject its outbound action with a stable error code and MUST preserve the input draft or source data.

#### Scenario: Disabled OpenChat capability blocks sending

- **WHEN** an OpenChat send is requested before the capability test passes
- **THEN** the API MUST return `capability_disabled` and MUST preserve the draft without sending

### Requirement: Encrypted backup versions and retention

The backup adapter MUST create incremental versions by encrypting data locally before upload. A future Google Drive adapter MUST restrict OAuth access to the dedicated backup folder, MUST never upload raw LINE plaintext, and MUST rotate versions under the 90-day retention policy.

#### Scenario: Backup version contains no raw plaintext

- **WHEN** a scheduled backup window creates an incremental version
- **THEN** the upload payload MUST be locally encrypted, scoped to the dedicated backup folder, and eligible for 90-day rotation

### Requirement: Preview-only backup restore

The system MUST allow only Fish to preview a selected encrypted backup version and restore it into an isolated location or explicitly selected scope. The system MUST verify integrity, preserve permission and audit metadata, and MUST NOT overwrite current data. An invalid recovery key MUST fail without plaintext fallback.

#### Scenario: Fish previews and restores an encrypted version

- **WHEN** Fish selects a valid encrypted backup and completes integrity verification
- **THEN** the system MUST restore into an isolated target without overwriting current data and MUST preserve permission, version, and audit metadata

#### Scenario: Invalid recovery key fails closed

- **WHEN** any actor supplies an invalid recovery key for an encrypted backup
- **THEN** the system MUST reject decryption and MUST NOT return plaintext
