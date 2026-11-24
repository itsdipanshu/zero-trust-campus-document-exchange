/**
 * CampusVault – Unit Tests for Audit Logger
 * Developer: Abdul (Security Testing)
 */

const auditLogger = require('../../src/audit/auditLogger');

describe('Audit Logger', () => {
  beforeEach(() => {
    auditLogger.clearLogs();
  });

  test('logs a decision entry', async () => {
    const entry = await auditLogger.logDecision({
      userId: 'user-001',
      documentId: 'doc-001',
      action: 'view',
      decision: 'ALLOW',
      reason: 'ACCESS_GRANTED',
    });

    expect(entry.userId).toBe('user-001');
    expect(entry.documentId).toBe('doc-001');
    expect(entry.action).toBe('view');
    expect(entry.decision).toBe('ALLOW');
    expect(entry.reason).toBe('ACCESS_GRANTED');
    expect(entry.timestamp).toBeDefined();
  });

  test('never logs sensitive data', async () => {
    const entry = await auditLogger.logDecision({
      userId: 'user-001',
      documentId: 'doc-001',
      action: 'view',
      decision: 'ALLOW',
      reason: 'ACCESS_GRANTED',
      metadata: {
        ip: '192.168.1.1',
        password: 'supersecret',
        token: 'jwt-token-here',
        fileContent: 'exam answers',
        documentContent: 'classified data',
        secret: 'api-key-123',
      },
    });

    expect(entry.metadata.ip).toBe('192.168.1.1');
    expect(entry.metadata.password).toBeUndefined();
    expect(entry.metadata.token).toBeUndefined();
    expect(entry.metadata.fileContent).toBeUndefined();
    expect(entry.metadata.documentContent).toBeUndefined();
    expect(entry.metadata.secret).toBeUndefined();
  });

  test('queryLogs filters by userId', async () => {
    await auditLogger.logDecision({ userId: 'user-001', documentId: 'doc-001', action: 'view', decision: 'ALLOW', reason: 'ACCESS_GRANTED' });
    await auditLogger.logDecision({ userId: 'user-002', documentId: 'doc-001', action: 'view', decision: 'DENY', reason: 'USER_SUSPENDED' });

    const results = auditLogger.queryLogs({ userId: 'user-001' });
    expect(results).toHaveLength(1);
    expect(results[0].userId).toBe('user-001');
  });

  test('queryLogs filters by decision', async () => {
    await auditLogger.logDecision({ userId: 'user-001', documentId: 'doc-001', action: 'view', decision: 'ALLOW', reason: 'ACCESS_GRANTED' });
    await auditLogger.logDecision({ userId: 'user-002', documentId: 'doc-002', action: 'view', decision: 'DENY', reason: 'GRANT_REVOKED' });
    await auditLogger.logDecision({ userId: 'user-003', documentId: 'doc-003', action: 'view', decision: 'DENY', reason: 'GRANT_EXPIRED' });

    const denials = auditLogger.queryLogs({ decision: 'DENY' });
    expect(denials).toHaveLength(2);
  });

  test('getAllLogs returns all entries', async () => {
    await auditLogger.logDecision({ userId: 'user-001', documentId: 'doc-001', action: 'view', decision: 'ALLOW', reason: 'ACCESS_GRANTED' });
    await auditLogger.logDecision({ userId: 'user-002', documentId: 'doc-002', action: 'view', decision: 'DENY', reason: 'USER_SUSPENDED' });

    const all = auditLogger.getAllLogs();
    expect(all).toHaveLength(2);
  });

  test('clearLogs empties the store', async () => {
    await auditLogger.logDecision({ userId: 'user-001', documentId: 'doc-001', action: 'view', decision: 'ALLOW', reason: 'ACCESS_GRANTED' });
    auditLogger.clearLogs();
    expect(auditLogger.getAllLogs()).toHaveLength(0);
  });

  test('setStore routes entries to external persistence', async () => {
    const externalStore = [];
    auditLogger.setStore(async (entry) => { externalStore.push(entry); });

    await auditLogger.logDecision({ userId: 'user-001', documentId: 'doc-001', action: 'view', decision: 'ALLOW', reason: 'ACCESS_GRANTED' });

    expect(externalStore).toHaveLength(1);
    expect(externalStore[0].userId).toBe('user-001');

    // Clean up
    auditLogger.setStore(null);
  });
});
