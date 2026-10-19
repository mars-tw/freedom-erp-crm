## Purpose

The family-access-control capability separates the personal LINE workbench from the existing anonymous ERP/CRM demo session. It gives Fish administrative control and gives family members only the collaboration permissions explicitly granted to them.

## ADDED Requirements

### Requirement: Fish bootstrap and separate identity boundary

The system MUST allow a one-time bootstrap to create the Fish administrator only when the family workspace is uninitialized. The system MUST use a family identity, actor role, and `line_session` HttpOnly cookie that are independent from `freedom_session`. The system MUST reject client-supplied actor or workspace values as authorization input.

#### Scenario: Bootstrap creates only the first administrator

- **WHEN** an uninitialized family workspace submits valid Fish bootstrap data
- **THEN** the system MUST create one administrator and MUST reject every later bootstrap attempt

#### Scenario: Existing anonymous ERP session remains separate

- **WHEN** a browser has an existing `freedom_session` and starts a family login
- **THEN** the system MUST create and authorize a separate `line_session` without changing the ERP/CRM session

### Requirement: Family session lifecycle

The system MUST create an idle-expiring family session after successful login, revoke the session on logout, and reject requests after Fish revokes the device session. Fish MUST be able to inspect and revoke family device sessions.

#### Scenario: Fish revokes a family device session

- **WHEN** Fish revokes a family session for a device
- **THEN** subsequent requests using that session MUST be rejected and the device MUST require a new login

### Requirement: Role-scoped access

The system MUST enforce permissions on the server for Fish and family actors. Fish MUST access raw-dependent review, classification, audit detail, task approval, and reply sending. Family actors MUST access masked summaries, quadrant counts, Fish-approved tasks, permitted task status and notes updates, and their own result summaries only.

#### Scenario: Family access excludes protected operations

- **WHEN** a family actor requests raw content, a reply draft, or a send operation
- **THEN** the API MUST reject the request and MUST record the authorization failure

#### Scenario: Family access permits collaboration only

- **WHEN** a family actor updates an approved task status or note
- **THEN** the API MUST allow the permitted update and MUST record the family actor

### Requirement: One-time email password reset

The system MUST issue a password-reset link through the testable Email outbox for an account with a verified email. The link MUST expire after 15 minutes, MUST be usable once, and MUST become invalid immediately after a successful password change. An expired or used link MUST NOT change the password.

#### Scenario: Family member completes a valid reset

- **WHEN** a family member submits a valid reset link within 15 minutes and sets a new password
- **THEN** the system MUST complete the reset, invalidate the link, and require a new login

#### Scenario: Expired reset cannot change credentials

- **WHEN** a family member submits an expired or previously used reset link
- **THEN** the API MUST reject the request and MUST leave the password unchanged

### Requirement: CSRF and rate-limit protection

The system MUST require a valid CSRF token for state-changing family endpoints and MUST rate-limit bootstrap, login, and password-reset requests. A failed protection check MUST return the standard error shape without mutating family data.

#### Scenario: Invalid CSRF request is rejected

- **WHEN** a state-changing family request has an invalid CSRF token
- **THEN** the API MUST return `csrf_failed` and MUST not mutate the target resource

#### Scenario: Excessive authentication attempts are limited

- **WHEN** a client exceeds the configured authentication or reset request limit
- **THEN** the API MUST return `rate_limited` and MUST not reveal account secrets
