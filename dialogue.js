(function (global) {
  'use strict';

  const MAX_NAMES = 50;
  const MAX_NAME_LENGTH = 20;
  const MIN_PART_LENGTH = 180;
  const MAX_PART_LENGTH = 260;
  const COLORS = ['#3978C6', '#378B77', '#8A65B2', '#B17642', '#B95775', '#4B899F', '#738746', '#926E5D', '#5E71AD', '#A3638F'];

  function parseNames(text) {
    const names = [];
    const seen = new Set();
    const source = typeof text === 'string' ? text : '';
    const entries = source.split(/[\r\n,，、;；]+/);
    for (let i = 0; i < entries.length && names.length < MAX_NAMES; i += 1) {
      const clean = entries[i].replace(/[\u0000-\u001F\u007F]/g, '').trim();
      const name = Array.from(clean).slice(0, MAX_NAME_LENGTH).join('').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  }

  function splitEnd(text, start) {
    const limit = Math.min(text.length, start + MAX_PART_LENGTH);
    if (limit === text.length) return limit;
    let end = limit;
    let found = false;
    // Prefer a sentence ending, including its closing quotation mark when it fits.
    for (let i = limit - 1; i >= start + MIN_PART_LENGTH - 1; i -= 1) {
      if (/[。！？!?；;\n]/.test(text.charAt(i))) {
        end = i + 1;
        while (end < limit && /[”’」』"')）\]】]/.test(text.charAt(end))) end += 1;
        found = true;
        break;
      }
    }
    if (!found) {
      for (let i = limit - 1; i >= start + MIN_PART_LENGTH - 1; i -= 1) {
        if (/[，,、\s]/.test(text.charAt(i))) { end = i + 1; break; }
      }
    }
    // A hard split is necessary for very long sentences; preserve surrogate pairs.
    const last = text.charCodeAt(end - 1);
    if (last >= 0xD800 && last <= 0xDBFF) end -= 1;
    return end;
  }

  function plan(paragraphs, names, options) {
    if (!Array.isArray(paragraphs)) throw new TypeError('聊天排版需要段落数组。');
    const settings = options && typeof options === 'object' ? options : {};
    const namesText = Array.isArray(names) ? names.filter(function (name) { return typeof name === 'string'; }).join('\n') : names;
    const speakers = parseNames(namesText);
    if (!speakers.length) speakers.push('同事');
    const replies = Array.isArray(settings.selfReplies) ? settings.selfReplies.filter(function (reply) {
      return typeof reply === 'string' && reply.trim();
    }).map(function (reply) { return reply.trim(); }) : [];
    const interval = Number(settings.replyEvery);
    const replyEvery = Number.isFinite(interval) && interval >= 1 ? Math.max(1, Math.floor(interval)) : 3;
    const offset = Number(settings.startIndex);
    const startIndex = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const autoReply = settings.autoReply !== false;
    let messageIndex = startIndex;

    return paragraphs.map(function (text, paragraph) {
      if (typeof text !== 'string') throw new TypeError('聊天排版只接受文字段落。');
      const parts = [];
      const replyAfter = [];
      let start = 0;
      while (start < text.length) {
        const end = splitEnd(text, start);
        parts.push({ text: text.slice(start, end), speaker: speakers[messageIndex % speakers.length], kind: 'dialogue', start: start });
        messageIndex += 1;
        if (autoReply && replies.length && messageIndex % replyEvery === 0) {
          const replyIndex = (Math.floor(messageIndex / replyEvery) - 1) % replies.length;
          replyAfter.push({ text: replies[replyIndex], afterStart: start });
        }
        start = end;
      }
      // Replies are separate from original parts so exporting/rejoining parts keeps the novel unchanged.
      return { paragraph: paragraph, parts: parts, replyAfter: replyAfter };
    });
  }

  function discoveredSpeakers(result) {
    const names = new Set();
    if (!Array.isArray(result)) return [];
    result.forEach(function (paragraph) {
      if (!paragraph || !Array.isArray(paragraph.parts)) return;
      paragraph.parts.forEach(function (part) {
        if (part && typeof part.speaker === 'string' && part.speaker) names.add(part.speaker);
      });
    });
    return Array.from(names);
  }

  function colorFor(name) {
    if (name === '旁白') return '#7A8495';
    if (name === '对话') return '#788B9F';
    const value = typeof name === 'string' ? name : '';
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return COLORS[(hash >>> 0) % COLORS.length];
  }

  function initials(name) {
    const value = typeof name === 'string' ? name.trim() : '';
    const chinese = value.match(/[\u3400-\u9fff]/g);
    if (chinese && chinese.length) return chinese.slice(0, 2).join('');
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length > 1) return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
    return Array.from(value).slice(0, 2).join('').toUpperCase() || '聊';
  }

  global.ReaderDialogue = Object.freeze({ plan: plan, parseNames: parseNames, discoveredSpeakers: discoveredSpeakers, colorFor: colorFor, initials: initials });
})(window);
