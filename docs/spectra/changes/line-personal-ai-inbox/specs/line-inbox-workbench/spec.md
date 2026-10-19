## Purpose

The line-inbox-workbench gives Fish and family members a controlled view of personal LINE activity without exposing raw LINE content to family accounts. It provides quadrant review, task collaboration, draft review, and explicit synchronization states for the first fake-data milestone.

## ADDED Requirements

### Requirement: Conversation source projection and deduplication

The system MUST represent private, group, and openchat conversations with a stable account scope, conversation identifier, source type, received time, and source message identifier. The system MUST reject a duplicate source message identifier within the same account scope and MUST use a deterministic source-time-content fingerprint when the source does not provide a stable identifier.

#### Scenario: Three conversation source types remain distinguishable

- **WHEN** the connector receives private, group, and openchat messages
- **THEN** the inbox projection MUST preserve `private`, `group`, and `openchat` as distinct source types

#### Scenario: Duplicate source messages do not create a second inbox item

- **WHEN** the same source message is ingested twice for one account scope
- **THEN** the system MUST retain one inbox item and MUST expose the deduplication result for audit inspection

### Requirement: Inbox dashboard and quadrant summary

The system MUST present Fish with a pending inbox and a count for each of the four quadrants. The dashboard MUST keep the review queue separate from the four quadrants and MUST display the important-and-urgent count as an explicit value.

#### Scenario: Fish sees pending items and quadrant counts

- **WHEN** Fish opens the home page with seeded private, group, and openchat data
- **THEN** the page MUST show the pending inbox, the four-quadrant summary, and an explicit important-and-urgent count

### Requirement: Quadrant classification and review queue

The system MUST store one of the four quadrant values or a null value for an unconfirmed classification. A classification below the configured confidence threshold MUST enter a review queue with its suggested quadrant, confidence, and reason. Confirming a classification MUST remove the item from the review queue and MUST apply the selected quadrant.

#### Scenario: Low-confidence classification waits for Fish

- **WHEN** the classifier returns a valid quadrant with confidence below the configured threshold
- **THEN** the item MUST enter the review queue and MUST NOT appear as a fifth quadrant

#### Scenario: Fish confirms a corrected quadrant

- **WHEN** Fish changes and confirms the suggested quadrant
- **THEN** the item MUST leave the review queue and MUST appear in the selected quadrant

### Requirement: Fish classification preferences

The system MUST save a classification preference created by Fish corrections, scope that preference to Fish, and provide operations to view, modify, and clear the preference.

#### Scenario: Fish manages a saved preference

- **WHEN** Fish opens classification preferences after correcting a quadrant
- **THEN** the saved preference MUST be visible and Fish MUST be able to modify or clear it

### Requirement: Historical backfill progress

The system MUST support a recent-30-day backfill in bounded batches, persist completed and remaining progress, and resume from the next incomplete batch without removing completed batches.

#### Scenario: Fish resumes a partial backfill

- **WHEN** the first batch of a recent-30-day backfill completes
- **THEN** the dashboard MUST show completed and remaining progress and MUST provide a continue-backfill operation

### Requirement: Sync state and outbound gate

The system MUST expose `online`, `offline`, `backfilling`, `paused`, and `error` states with the last successful synchronization time. The system MUST reject outbound reply actions while offline and MUST resume with backfill after recovery without automatically sending a previously held draft.

#### Scenario: Offline state blocks reply sending

- **WHEN** the connector loses synchronization after a known successful synchronization time
- **THEN** the dashboard MUST show offline status and the reply-send operation MUST be disabled and rejected by the API

#### Scenario: Recovery starts backfill

- **WHEN** synchronization resumes after an outage
- **THEN** the system MUST show backfilling, update the last successful synchronization time after completion, and MUST NOT send a held draft automatically

### Requirement: Approved task collaboration

The system MUST create a formal task only after Fish approves a task candidate with a valid version and action identifier. A formal task MUST preserve title, assignee, due date, status, notes, source summary, and created and completed timestamps. Family members MUST update only the allowed status and notes fields.

#### Scenario: Fish approves a task candidate once

- **WHEN** Fish approves a valid task candidate
- **THEN** the system MUST create one formal task with the collaboration fields and MUST record the approval

#### Scenario: A family member updates an approved task

- **WHEN** a family member updates an approved task
- **THEN** the system MUST allow only permitted status and notes changes and MUST record the family account

### Requirement: Draft review and controlled send

The system MUST show the conversation summary, recipient or group, channel, draft content, and attachment information before Fish can send a reply. Fish MUST confirm each draft individually. The system MUST not send a draft without confirmation and MUST reject OpenChat sends until the OpenChat capability gate passes.

#### Scenario: Fish sends one confirmed draft

- **WHEN** Fish edits one private or group draft and completes the send confirmation
- **THEN** the system MUST send only that draft and MUST create one operation record

#### Scenario: OpenChat sending remains disabled

- **WHEN** Fish opens a draft sourced from OpenChat before the capability gate passes
- **THEN** the UI and API MUST keep sending disabled and MUST show the OpenChat test limitation

### Requirement: Attachment metadata display

The system MUST display only attachment name, type, and availability status or link in the first milestone. The system MUST NOT expose OCR text or speech transcription content.

#### Scenario: Attachment content remains summarized

- **WHEN** Fish opens an item containing a PDF, image, or audio attachment
- **THEN** the system MUST show attachment metadata and MUST omit OCR and transcription content
