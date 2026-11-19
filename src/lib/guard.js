'use strict';

function hasInvite(text) {
  return /(discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i.test(String(text || ''));
}

function spamVerdict(history, content, now) {
  const recent = history.filter((entry) => now - entry.at < 8_000);
  const burst = recent.length >= 5;
  const dupes = recent.filter((entry) => entry.content === content && now - entry.at < 20_000).length >= 3;
  return { burst, dupes, recent };
}

function advancePhase(session, now) {
  if (session.phase_ends_at > now) return { ...session, changed: false };
  if (session.phase === 'work') {
    return {
      ...session,
      phase: 'break',
      phase_ends_at: now + session.break_ms,
      changed: true,
    };
  }
  return {
    ...session,
    phase: 'work',
    round: (session.round || 1) + 1,
    phase_ends_at: now + session.work_ms,
    changed: true,
  };
}

module.exports = { hasInvite, spamVerdict, advancePhase };
