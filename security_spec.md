# Security Specification for Swarm Orchestrator

## Data Invariants
1. A Task must have a valid `ownerId` matching the creator's UID.
2. Only the owner can modify or delete a Task.
3. Test Runs are system-generated (simulated for now by users, but in production would be restricted to service accounts).
4. Users can only see their own tasks.

## The Dirty Dozen Payloads
1. **Identity Spoofing**: `create task` with `ownerId` of another user.
2. **Privilege Escalation**: `update task` to change `ownerId`.
3. **Invalid Status**: `update task` with `status: 'BANNED'`.
4. **Large Payload**: `create task` with a 2MB `description` string.
5. **ID Poisoning**: `get task` with ID `../../../etc/passwd`.
6. **Orphaned Write**: `create task` without a title.
7. **Temporal Attack**: `create task` with a future `createdAt` from client.
8. **Field Injection**: `update task` with a hidden field `isVerified: true`.
9. **Cross-User Read**: Auth User A tries to `get task` owned by User B.
10. **Unauthenticated Write**: Non-signed-in user tries to `create task`.
11. **Type Poisoning**: Send `priority: true` instead of a string.
12. **Collection Scraping**: Trying to `list` all tasks without an owner filter.

## Test Cases
- [DENY] Unauthenticated user creates any document.
- [DENY] User A modifies User B's task.
- [DENY] User creates task with invalid priority.
- [ALLOW] User creates, reads, and updates their own task with valid fields.
