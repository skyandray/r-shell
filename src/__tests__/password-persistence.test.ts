/**
 * Regression tests for SSH password persistence across restarts.
 *
 * Background: two bugs broke session restoration so users had to re-enter
 * passwords on every launch:
 *   1. `migrateFromLegacy` (terminal-group-serializer.ts) treated the CURRENT
 *      `r-shell-active-connections` localStorage key as legacy and wiped it
 *      on every startup, discarding the list of tabs to restore.
 *   2. Several `setEditingConnection` call sites in App.tsx omitted the
 *      `password` / `privateKeyPath` / `passphrase` fields, so opening the
 *      edit dialog for a saved connection showed empty credential fields and
 *      saving would overwrite the stored password with `undefined`.
 *
 * These tests guard the storage layer and the migration contract.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConnectionStorageManager,
  ActiveConnectionsManager,
  type ConnectionData,
} from '../lib/connection-storage';
import { migrateFromLegacy } from '../lib/terminal-group-serializer';

beforeEach(() => {
  localStorage.clear();
  ConnectionStorageManager.initialize();
});

describe('Password persistence across restarts', () => {
  it('saveConnectionWithId preserves the password field', () => {
    const saved = ConnectionStorageManager.saveConnectionWithId('conn-1', {
      name: 'My Server',
      host: '10.0.0.1',
      port: 22,
      username: 'deploy',
      protocol: 'SSH',
      folder: 'All Connections',
      authMethod: 'password',
      password: 's3cret-pw',
    });

    const loaded = ConnectionStorageManager.getConnection(saved.id);
    expect(loaded).toBeDefined();
    expect(loaded!.password).toBe('s3cret-pw');
    expect(loaded!.authMethod).toBe('password');
  });

  it('updateConnection preserves the password when other fields change', () => {
    const saved = ConnectionStorageManager.saveConnectionWithId('conn-2', {
      name: 'Server',
      host: '10.0.0.2',
      port: 22,
      username: 'deploy',
      protocol: 'SSH',
      folder: 'All Connections',
      authMethod: 'password',
      password: 'original-pw',
    });

    // Simulate a reconnect that only updates the lastConnected timestamp.
    ConnectionStorageManager.updateConnection(saved.id, {
      lastConnected: new Date().toISOString(),
    });

    const loaded = ConnectionStorageManager.getConnection(saved.id);
    expect(loaded!.password).toBe('original-pw');
  });

  it('updateConnection can overwrite the password without losing it', () => {
    const saved = ConnectionStorageManager.saveConnectionWithId('conn-3', {
      name: 'Server',
      host: '10.0.0.3',
      port: 22,
      username: 'deploy',
      protocol: 'SSH',
      folder: 'All Connections',
      authMethod: 'password',
      password: 'old-pw',
    });

    ConnectionStorageManager.updateConnection(saved.id, {
      password: 'new-pw',
      lastConnected: new Date().toISOString(),
    });

    const loaded = ConnectionStorageManager.getConnection(saved.id);
    expect(loaded!.password).toBe('new-pw');
  });

  it('keyboard-interactive auth method persists alongside the password', () => {
    const saved = ConnectionStorageManager.saveConnectionWithId('conn-ki', {
      name: 'KI Server',
      host: '10.0.0.4',
      port: 22,
      username: 'deploy',
      protocol: 'SSH',
      folder: 'All Connections',
      authMethod: 'keyboard-interactive',
      password: 'ki-pw',
    });

    const loaded = ConnectionStorageManager.getConnection(saved.id);
    expect(loaded!.authMethod).toBe('keyboard-interactive');
    expect(loaded!.password).toBe('ki-pw');
  });

  it('private key path and passphrase persist', () => {
    const saved = ConnectionStorageManager.saveConnectionWithId('conn-key', {
      name: 'Key Server',
      host: '10.0.0.5',
      port: 22,
      username: 'deploy',
      protocol: 'SSH',
      folder: 'All Connections',
      authMethod: 'publickey',
      privateKeyPath: '~/.ssh/id_ed25519',
      passphrase: 'key-pass',
    });

    const loaded = ConnectionStorageManager.getConnection(saved.id);
    expect(loaded!.privateKeyPath).toBe('~/.ssh/id_ed25519');
    expect(loaded!.passphrase).toBe('key-pass');
  });
});

describe('Active connections survive migrateFromLegacy on restart', () => {
  // This is the core regression: the old migrateFromLegacy deleted
  // `r-shell-active-connections`, which is the CURRENT key, so no tab ever
  // survived a restart. It must now be preserved.
  it('migrateFromLegacy does NOT remove the current r-shell-active-connections key', () => {
    const active: ConnectionData[] = [
      {
        id: 'conn-1',
        name: 'My Server',
        host: '10.0.0.1',
        port: 22,
        username: 'deploy',
        protocol: 'SSH',
        authMethod: 'password',
        password: 's3cret-pw',
        createdAt: new Date().toISOString(),
      } as ConnectionData,
    ];
    localStorage.setItem('r-shell-connections', JSON.stringify(active));

    const activeStates = [
      { tabId: 'conn-1', connectionId: 'conn-1', order: 0, protocol: 'SSH' },
    ];
    ActiveConnectionsManager.saveActiveConnections(activeStates);

    // Simulate app restart: TerminalGroupProvider calls migrateFromLegacy()
    // during initializeState(), then App.tsx reads ActiveConnectionsManager.
    migrateFromLegacy();

    const restored = ActiveConnectionsManager.getActiveConnections();
    expect(restored).toHaveLength(1);
    expect(restored[0].connectionId).toBe('conn-1');

    // And the connection's password must still be there.
    const conn = ConnectionStorageManager.getConnection('conn-1');
    expect(conn?.password).toBe('s3cret-pw');
  });

  it('migrateFromLegacy still removes the true legacy r-shell-active-sessions key', () => {
    localStorage.setItem('r-shell-active-sessions', '[]');
    migrateFromLegacy();
    expect(localStorage.getItem('r-shell-active-sessions')).toBeNull();
  });
});

describe('buildConnectionTree does not leak credentials into UI nodes', () => {
  // Defense-in-depth: the tree used for rendering must NOT carry passwords,
  // even though storage holds them. UI components only get credentials by
  // calling getConnection() explicitly.
  it('tree nodes omit password / privateKeyPath / passphrase', () => {
    ConnectionStorageManager.saveConnectionWithId('leak-1', {
      name: 'Leak Test',
      host: '10.0.0.9',
      port: 22,
      username: 'u',
      protocol: 'SSH',
      folder: 'All Connections',
      authMethod: 'password',
      password: 'should-not-appear-in-tree',
      privateKeyPath: 'should-not-appear',
      passphrase: 'should-not-appear',
    });

    const tree = ConnectionStorageManager.buildConnectionTree();
    const flat = JSON.stringify(tree);
    expect(flat).not.toContain('should-not-appear-in-tree');
    expect(flat).not.toContain('should-not-appear');

    // But getConnection still returns the password.
    const conn = ConnectionStorageManager.getConnection('leak-1');
    expect(conn?.password).toBe('should-not-appear-in-tree');
  });
});
