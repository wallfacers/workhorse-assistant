import { describe, it, expect } from 'vitest';
import { unifiedStatus } from './unifiedStatus';
import type { SupervisorStatus } from './wsl';

const sup = (state: SupervisorStatus['state'], extra: Partial<SupervisorStatus> = {}): SupervisorStatus => ({
  state,
  ...extra,
});

describe('unifiedStatus', () => {
  describe('managed modes read the supervisor', () => {
    it('maps healthy/adopted to ok (green)', () => {
      expect(unifiedStatus('native', sup('healthy'), 'idle')).toMatchObject({ tone: 'ok', pulse: false });
      expect(unifiedStatus('wsl', sup('adopted'), 'idle')).toMatchObject({ tone: 'ok' });
    });

    it('maps probing/starting/restarting to pending (pulse)', () => {
      for (const s of ['probing', 'starting', 'restarting'] as const) {
        const r = unifiedStatus('native', sup(s), 'idle');
        expect(r.tone).toBe('pending');
        expect(r.pulse).toBe(true);
      }
    });

    it('maps failed to error and carries the reason', () => {
      const r = unifiedStatus('native', sup('failed', { reason: 'port busy' }), 'idle');
      expect(r.tone).toBe('error');
      expect(r.reason).toBe('port busy');
    });

    it('maps disabled to idle', () => {
      expect(unifiedStatus('native', sup('disabled'), 'connected').tone).toBe('idle');
    });

    it('uses settings.runtime.state.* label and a runtime suffix', () => {
      const r = unifiedStatus('wsl', sup('healthy', { runtime: 'wsl' }), 'idle');
      expect(r.labelKey).toBe('settings.runtime.state.healthy');
      expect(r.runtimeKey).toBe('settings.runtime.wsl');
    });

    it('ignores agent.status entirely in managed modes', () => {
      // Supervisor healthy but agent error → still ok (supervisor is authoritative).
      expect(unifiedStatus('native', sup('healthy'), 'error').tone).toBe('ok');
    });
  });

  describe('remote mode reads the auto-connect probe', () => {
    it('maps agent.status to tone, ignoring the supervisor', () => {
      // Supervisor is disabled in remote mode; agent.status is authoritative.
      expect(unifiedStatus('remote', sup('disabled'), 'connected').tone).toBe('ok');
      expect(unifiedStatus('remote', sup('disabled'), 'connecting')).toMatchObject({ tone: 'pending', pulse: true });
      expect(unifiedStatus('remote', sup('disabled'), 'error').tone).toBe('error');
      expect(unifiedStatus('remote', sup('disabled'), 'idle').tone).toBe('idle');
    });

    it('uses agent.status.* label keys and the remote runtime suffix', () => {
      const r = unifiedStatus('remote', sup('disabled'), 'connected');
      expect(r.labelKey).toBe('agent.status.connected');
      expect(r.runtimeKey).toBe('settings.runtime.remote');
    });
  });
});
