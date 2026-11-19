'use strict';

function matchProxy(content, members) {
  const text = String(content || '').replace(/\u200b/g, '');
  if (text.startsWith('\\')) return { escaped: text.slice(1) };
  let best = null;
  for (const member of members) {
    const prefix = member.tag_prefix || '';
    const suffix = member.tag_suffix || '';
    if (!prefix && !suffix) continue;
    if (prefix && !text.startsWith(prefix)) continue;
    if (suffix && !text.endsWith(suffix)) continue;
    if (text.length <= prefix.length + suffix.length) continue;
    const inner = text.slice(prefix.length, suffix ? text.length - suffix.length : undefined).trim();
    if (!inner) continue;
    const score = prefix.length + suffix.length;
    if (!best || score > best.score) best = { member, inner, score };
  }
  return best;
}

function proxyName(member, system) {
  const base = String(member?.name || 'Member').replace(/[@#]/g, '').trim() || 'Member';
  const tag = system?.tag ? ` | ${system.tag}` : '';
  return `${base}${tag}`.slice(0, 80);
}

module.exports = { matchProxy, proxyName };
