(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PREFS_KEY = 'xunyue.preferences.v1';
  const PROGRESS_PREFIX = 'xunyue.progress.';
  const NOTES_PREFIX = 'xunyue.notes.';
  const CHAT_PREFIX = 'xunyue.chat-display.';
  const defaultChat = { names: ['陈晨', '林悦', '周航'], ownName: '我', selfReplies: ['收到。', '我不理解这是什么意思。', '稍等一下。', '好的，我看看。'], autoReply: true, replyEvery: 3 };
  const workGroups = ['项目讨论群', '技术交流群', '产品研发组', '需求评审群', '版本发布群', '资料同步群'];
  const defaults = { theme: 'dingtalk', fontSize: 18, lineHeight: 1.7, fontFamily: 'sans', maskTitles: true, lastBook: null };
  let savedPreferences = {};
  try { savedPreferences = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (_) { /* Optional preferences must not prevent reading. */ }
  const needsAppearanceMigration = savedPreferences.appearanceVersion !== 2;
  const settings = { ...defaults, ...savedPreferences };
  settings.theme = settings.theme === 'feishu' ? 'feishu' : 'dingtalk';
  settings.fontSize = Math.max(13, Math.min(24, Number(settings.fontSize) || 18));
  settings.lineHeight = Math.max(1.5, Math.min(2.5, Number(settings.lineHeight) || 1.7));
  settings.fontFamily = settings.fontFamily === 'serif' ? 'serif' : 'sans';
  settings.maskTitles = needsAppearanceMigration ? true : (typeof savedPreferences.maskTitles === 'boolean' ? savedPreferences.maskTitles : true);
  settings.appearanceVersion = 2;
  const state = { ready: false, book: null, persisted: false, chapter: 0, listMode: 'all', listPage: 0, query: '', loading: false, away: false, restoring: false, searchGeneration: 0 };
  state.chat = { ...defaultChat };
  state.replyTarget = null;
  let saveTimer, toastTimer, searchTimer, scrollFrame, lastFocus, dialogOpener, dropDepth = 0, renderGeneration = 0;
  const writeQueue = new Map();
  const sampleText = `第一章 雨中的来信
下午三点，城市下起了雨。
林舟把伞收在旧书店门口。铜铃轻轻响了一声，书架间的灯随之亮起，像一列缓缓驶来的火车。
“今天来得比平时早。”老板从一本地图后探出头。
“提前下班。”他说，却没有解释为什么。他只是想在回家之前，找一个可以安静坐一会儿的地方。
靠窗的位置还空着。桌上放着一封信，没有邮票，也没有收件人的名字，信封正面只写了一行字：给下一个在这里避雨的人。
林舟看向老板。老人推了推眼镜，像是早就知道他想问什么。
“放在这儿很久了。每个人都以为是给别人的。”
雨水沿着窗玻璃划出一道道细线。他在椅子上坐下，小心地拆开了信封。
里面没有信纸，只有一张泛黄的车票。日期是明天，终点是一座他从未听说过的小镇。
车票背面写着：如果你也忘了自己曾经想去哪里，就来这里看看。

第二章 没有终点的地图
第二天，林舟带上了那张车票。
站台的时钟停在八点十七分。列车还没来，一位提着藤箱的老太太在长椅上坐着，脚边蜷着一只橘猫。
“去南溪？”她问。
林舟点了点头，把票翻过来给她看。
老太太笑了：“很多年以前，我也收到过一样的票。”
“那里有什么？”
“一条河，一座桥，还有一些没有来得及做的事情。”她看向轨道尽头，“不过每个人看到的都不一样。”
列车驶进站台时没有鸣笛。车窗映着雨后的天空，像一排刚刚洗净的玻璃杯。
他上车，坐在靠窗的位置，把手机调成了静音。
这一次，他没有急着打开任何消息。

第三章 日光落在书页上
小镇比他想象的更安静。
河边有一家没有招牌的书店，门口的铜铃和城市里那一家一模一样。
林舟推门进去。窗边的桌子上放着一本画册，第一页画着一艘纸船，旁边写着他小时候的名字。
他终于记起，自己曾经想画一本关于旅行的书。
那时他把每一天都当作新的一页，直到后来日子变得忙碌，他渐渐把空白误认成了结束。
店里没人。他找来一支铅笔，在画册的第二页画下了眼前的窗。
阳光从窗外照进来，落在尚未完成的线条上。
原来有些旅途，不是为了走得更远，而是为了把自己找回来。
临走前，他也留下一封信，写给下一个在这里停下来的人。
雨已经停了。`;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', '#i-' + name); svg.append(use);
    return svg;
  }
  function button(label, className, handler) {
    const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', handler); return node;
  }
  function notice(message, error = false) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3000);
  }
  function warnStorage(message) { $('storageWarning').textContent = message; $('storageWarning').hidden = false; }
  function savePreferences() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(settings)); }
    catch (_) { $('saveStatus').textContent = '设置仅本次有效'; }
  }
  function bookTitle() { return settings.maskTitles ? '项目资料' : state.book.title; }
  function chapterTitle(index) {
    if (!settings.maskTitles) return state.book.chapters[index].title;
    const group = workGroups[index % workGroups.length], cycle = Math.floor(index / workGroups.length);
    return group + (cycle ? ' ' + (cycle + 1) : '');
  }
  function wordCount(count) { return count >= 10000 ? (count / 10000).toFixed(1) + ' 万字' : count.toLocaleString('zh-CN') + ' 字'; }
  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--reader-font-size', settings.fontSize + 'px');
    root.style.setProperty('--reader-line-height', String(settings.lineHeight));
    root.style.setProperty('--reader-font-family', settings.fontFamily === 'serif' ? '"Songti SC", "STSong", "Noto Serif CJK SC", serif' : '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif');
    const ding = settings.theme === 'dingtalk';
    document.querySelectorAll('[data-feishu-only]').forEach((node) => { node.hidden = ding; });
    $('savedTab').hidden = !ding;
    if (ding && state.listMode === 'unread') { state.listMode = 'all'; state.listPage = Math.floor(state.chapter / 100); }
    for (const id of ['brandMark', 'awayBrandMark']) $(id).textContent = ding ? '钉' : '飞';
    for (const id of ['brandName', 'awayBrandName']) $(id).textContent = ding ? '钉钉' : '飞书';
    $('themeMark').textContent = ding ? '飞' : '钉';
    $('themeBtn').title = '切换到' + (ding ? '飞书' : '钉钉') + '外观';
    if ($('feishuThemeBtn')) $('feishuThemeBtn').title = $('themeBtn').title;
    document.title = ding ? '钉钉' : '飞书';
    $('fontSize').value = settings.fontSize; $('fontSizeLabel').value = settings.fontSize + ' px';
    $('lineHeight').value = settings.lineHeight; $('lineHeightLabel').value = settings.lineHeight.toFixed(1);
    $('fontFamily').value = settings.fontFamily; $('maskTitles').checked = settings.maskTitles;
    if ($('feishuMaskBtn')) {
      $('feishuMaskBtn').setAttribute('aria-pressed', String(settings.maskTitles));
      $('feishuMaskBtn').title = settings.maskTitles ? '显示真实章节标题' : '使用工作群标题';
      $('feishuMaskBtn').setAttribute('aria-label', $('feishuMaskBtn').title);
    }
    document.querySelectorAll('[data-theme-choice]').forEach((node) => {
      node.classList.toggle('active', node.dataset.themeChoice === settings.theme);
      node.setAttribute('aria-pressed', String(node.dataset.themeChoice === settings.theme));
    });
    if (state.book) { updateHeader(); renderChapters(); }
  }
  function switchTheme(theme = settings.theme === 'dingtalk' ? 'feishu' : 'dingtalk') {
    capturePosition(); settings.theme = theme; applySettings(); savePreferences();
    if (state.book) restorePosition(state.book.progress);
  }
  function setMaskTitles(masked) {
    capturePosition(); settings.maskTitles = masked; applySettings(); savePreferences();
    if (state.book) renderMessages();
  }
  function showDialog(id) {
    if (state.away) return;
    dialogOpener = document.activeElement;
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    $(id).showModal();
  }
  function closeDialog(dialog) { dialog.close(); if (dialogOpener && dialogOpener.isConnected) dialogOpener.focus(); }
  function toggleSidebar(open) {
    document.documentElement.classList.toggle('sidebar-open', open);
    $('sidebarBackdrop').hidden = !open;
  }
  function openImport() {
    if (state.loading) return;
    $('importStatus').textContent = ''; $('fileInput').value = ''; showDialog('importDialog');
  }
  function updateHeader() {
    $('sidebarBookTitle').textContent = bookTitle();
    $('sidebarBookMeta').textContent = state.book.chapters.length + ' 个章节 · ' + wordCount(state.book.charCount);
    $('chatTitle').textContent = chapterTitle(state.chapter);
    $('chatSubtitle').textContent = '归属于 个人工作空间';
    if ($('chatAvatar')) $('chatAvatar').textContent = chapterTitle(state.chapter).slice(0, 4);
    $('chapterPosition').textContent = '第 ' + (state.chapter + 1) + ' / ' + state.book.chapters.length + ' 节';
    $('chapterCount').textContent = state.book.chapters.length;
    $('bookmarkCount').textContent = state.book.bookmarks.length;
    $('prevChapter').disabled = state.chapter <= 0;
    $('nextChapter').disabled = state.chapter >= state.book.chapters.length - 1;
    updateBookmarkButton();
  }
  function updateBookmarkButton() {
    if (!state.book) return;
    const p = state.book.progress;
    const saved = state.book.bookmarks.some((b) => b.chapter === state.chapter && b.paragraph === p.paragraph);
    $('addBookmark').setAttribute('aria-pressed', String(saved));
    $('addBookmark').classList.toggle('active', saved);
    $('addBookmark').title = saved ? '取消此处书签' : '收藏当前阅读位置';
    $('addBookmark').setAttribute('aria-label', $('addBookmark').title);
  }
  function renderChapters() {
    const list = $('chapterList');
    const query = state.query.trim().toLocaleLowerCase();
    let items = state.listMode === 'saved'
      ? state.book.bookmarks.slice().sort((a, b) => b.createdAt - a.createdAt).map((b) => ({ index: b.chapter, bookmark: b }))
      : state.book.chapters.map((_, index) => ({ index }));
    if (state.listMode === 'unread') items = items.filter(({ index }) => index > state.book.progress.chapter);
    if (query) items = items.filter(({ index, bookmark }) => (state.book.chapters[index].title + ' ' + (bookmark?.excerpt || '')).toLocaleLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(items.length / 100));
    state.listPage = Math.min(state.listPage, pages - 1);
    const fragment = document.createDocumentFragment();
    if (!items.length) fragment.append(el('p', 'empty-list', query ? '没有找到匹配章节' : state.listMode === 'unread' ? '后续章节已全部读完' : '还没有书签\n点击正文右上角的收藏图标，记录当前的位置。'));
    for (const item of items.slice(state.listPage * 100, (state.listPage + 1) * 100)) {
      const { index, bookmark } = item;
      const node = button('', 'chapter-item' + (index === state.chapter ? ' active' : ''), () => {
        openChapter(index, bookmark || { paragraph: 0, offset: 0 }); toggleSidebar(false);
      });
      node.setAttribute('aria-current', index === state.chapter ? 'true' : 'false');
      node.title = chapterTitle(index);
      const avatar = el('span', 'chapter-avatar', chapterTitle(index).slice(0, 4));
      avatar.style.setProperty('--avatar-color', ['#3787ed', '#67b36c', '#e99748', '#64a7c6', '#8b7bd2', '#cd8c5f'][index % 6]);
      const copy = el('span', 'chapter-copy');
      const title = el('span', 'conversation-title');
      title.append(el('strong', '', chapterTitle(index)), el('span', 'group-badge', '内部群')); copy.append(title);
      let preview = settings.maskTitles ? '文档助手：[文件] 项目资料' : (state.book.chapters[index].paragraphs[0] || '文档助手：[文件] ' + bookTitle());
      if (bookmark) preview = settings.maskTitles ? '收藏位置 · 第 ' + (bookmark.paragraph + 1) + ' 段' : (bookmark.excerpt || '');
      copy.append(el('small', '', preview.slice(0, 80)));
      const side = el('span', 'chapter-side'); side.append(el('time', '', '第 ' + (index + 1) + ' 节'));
      if (state.book.bookmarks.some((b) => b.chapter === index)) { const mark = icon('bookmark'); mark.classList.add('chapter-bookmark'); side.append(mark); node.classList.add('saved'); }
      node.append(avatar, copy, side); fragment.append(node);
    }
    if (pages > 1) {
      const pager = el('div', 'list-pager');
      const prev = button('上一组', 'quiet-btn', () => { state.listPage--; renderChapters(); list.scrollTop = 0; }); prev.disabled = state.listPage === 0;
      const next = button('下一组', 'quiet-btn', () => { state.listPage++; renderChapters(); list.scrollTop = 0; }); next.disabled = state.listPage >= pages - 1;
      pager.append(prev, el('span', '', `${state.listPage + 1} / ${pages}`), next); fragment.append(pager);
    }
    list.replaceChildren(fragment);
    $('allTab').classList.toggle('selected', state.listMode === 'all'); $('allTab').setAttribute('aria-selected', String(state.listMode === 'all'));
    $('savedTab').classList.toggle('selected', state.listMode === 'saved'); $('savedTab').setAttribute('aria-selected', String(state.listMode === 'saved'));
    if ($('feishuUnreadTab')) {
      $('feishuUnreadTab').classList.toggle('selected', state.listMode === 'unread');
      $('feishuUnreadTab').setAttribute('aria-selected', String(state.listMode === 'unread'));
    }
    $('bookmarkCount').textContent = state.book.bookmarks.length;
  }
  function normalizeChatConfig(raw = {}) {
    const names = ReaderDialogue.parseNames(Array.isArray(raw.names) ? raw.names.join('\n') : '');
    const replies = Array.isArray(raw.selfReplies) ? raw.selfReplies.filter((text) => typeof text === 'string').map((text) => text.trim().slice(0, 120)).filter(Boolean).slice(0, 20) : defaultChat.selfReplies.slice();
    return {
      names: names.length ? names : defaultChat.names.slice(),
      ownName: typeof raw.ownName === 'string' && raw.ownName.trim() ? raw.ownName.trim().slice(0, 20) : '我',
      selfReplies: replies,
      autoReply: typeof raw.autoReply === 'boolean' ? raw.autoReply : true,
      replyEvery: [2, 3, 5, 8].includes(Number(raw.replyEvery)) ? Number(raw.replyEvery) : 3
    };
  }
  function loadChatConfig(id) {
    try { return normalizeChatConfig(JSON.parse(localStorage.getItem(CHAT_PREFIX + id) || '{}') || {}); }
    catch (_) { return normalizeChatConfig(); }
  }
  function openChatSetup() {
    if (!state.book) return;
    const config = state.chat;
    $('knownNames').value = config.names.join('\n');
    $('selfDisplayName').value = config.ownName;
    $('selfReplies').value = config.selfReplies.join('\n');
    $('autoReply').checked = config.autoReply;
    $('replyEvery').value = String(config.replyEvery);
    $('namesFile').value = ''; $('chatSetupStatus').textContent = '';
    $('chatSetupDialog').dataset.book = state.book.id;
    showDialog('chatSetupDialog');
  }
  function saveChatSetup() {
    if (!state.book || $('chatSetupDialog').dataset.book !== state.book.id) return;
    const names = ReaderDialogue.parseNames($('knownNames').value);
    const selfReplies = $('selfReplies').value.split(/\r?\n/).map((text) => text.trim()).filter(Boolean);
    if (!names.length) { $('chatSetupStatus').textContent = '请至少填写一个聊天姓名。'; return; }
    if (selfReplies.length > 20 || selfReplies.some((text) => text.length > 120)) { $('chatSetupStatus').textContent = '最多 20 句预设回复，每句最多 120 字。'; return; }
    if ($('autoReply').checked && !selfReplies.length) { $('chatSetupStatus').textContent = '请填写至少一句回复，或关闭“穿插我的回复”。'; return; }
    const next = normalizeChatConfig({ names, selfReplies, ownName: $('selfDisplayName').value, autoReply: $('autoReply').checked, replyEvery: Number($('replyEvery').value) });
    try { localStorage.setItem(CHAT_PREFIX + state.book.id, JSON.stringify(next)); }
    catch (_) { $('chatSetupStatus').textContent = '设置未保存，请检查浏览器本地存储是否可用。输入内容已保留。'; return; }
    capturePosition(); state.chat = next; renderMessages(); scheduleSave();
    closeDialog($('chatSetupDialog')); notice('聊天姓名与预设回复已保存');
  }
  async function importNames(file) {
    if (!file || !state.book) return;
    const bookId = state.book.id;
    if (file.size > 64 * 1024) { $('chatSetupStatus').textContent = '姓名文件请控制在 64 KB 以内，最多使用 50 个姓名。'; return; }
    const save = $('saveChatSetup'); save.disabled = true;
    $('chatSetupStatus').textContent = '正在读取姓名…';
    try {
      const parsed = await ReaderCore.parseFile(file, 'auto');
      if (state.book.id !== bookId || !$('chatSetupDialog').open) return;
      const names = ReaderDialogue.parseNames(parsed.chapters.flatMap((chapter) => chapter.paragraphs).join('\n'));
      if (!names.length) throw new Error('没有读到姓名，请检查文件内容。');
      $('knownNames').value = names.join('\n');
      $('chatSetupStatus').textContent = `已载入 ${names.length} 个姓名，确认后点“保存并应用”。`;
    } catch (error) { $('chatSetupStatus').textContent = error.message || '无法读取姓名文件。'; }
    finally { save.disabled = false; $('namesFile').value = ''; }
  }
  function ownMessage(text, time, generated = false) {
    const row = el('article', 'message-row own-message' + (generated ? ' generated-reply' : ' local-reply'));
    row.append(el('span', 'message-avatar', ReaderDialogue.initials(state.chat.ownName)));
    const body = el('div', 'message-body'); body.append(el('span', 'sender-name', state.chat.ownName));
    const bubble = el('div', 'message-bubble'); bubble.append(el('p', 'note-text', text)); body.append(bubble);
    if (time) body.append(el('small', 'note-status', time));
    row.append(body); return row;
  }
  function renderMessages() {
    const generation = ++renderGeneration;
    state.restoring = true; state.replyTarget = null;
    const container = $('messages'), chapter = state.book.chapters[state.chapter];
    const fragment = document.createDocumentFragment();
    const timestamp = new Date(state.book.createdAt || Date.now());
    fragment.append(el('div', 'chapter-divider', timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })));
    const plan = ReaderDialogue.plan(chapter.paragraphs, state.chat.names, state.chat);
    for (const paragraph of plan) {
      const wrapper = el('div', 'novel-paragraph'); wrapper.dataset.paragraph = String(paragraph.paragraph);
      for (const part of paragraph.parts) {
        const row = el('article', 'message-row dialogue-message novel-message');
        row.dataset.part = String(part.start);
        const color = ReaderDialogue.colorFor(part.speaker);
        row.style.setProperty('--speaker-color', color); row.style.setProperty('--speaker-soft', color + '20');
        row.append(el('span', 'message-avatar', ReaderDialogue.initials(part.speaker)));
        const body = el('div', 'message-body');
        const sender = button(part.speaker, 'sender-name speaker-name', (event) => { event.stopPropagation(); openChatSetup(); });
        sender.title = '设置聊天姓名与回复';
        const bubble = el('div', 'message-bubble'); bubble.append(el('p', '', part.text));
        body.append(sender, bubble); row.append(body); wrapper.append(row);
        for (const reply of paragraph.replyAfter || []) {
          if (reply.afterStart === part.start) wrapper.append(ownMessage(reply.text, '', true));
        }
        const replies = el('div', 'reply-slot'); replies.dataset.replySlot = String(part.start); wrapper.append(replies);
      }
      fragment.append(wrapper);
    }
    if (!chapter.paragraphs.length) fragment.append(el('p', 'empty-list', '本节为卷标题，正文从下一章开始。'));
    fragment.append(el('div', 'chapter-end', state.chapter === state.book.chapters.length - 1 ? '— 已到文档末尾 —' : '— 本章结束 · 点击下一章继续 —'));
    const notes = el('div', 'chapter-notes'); notes.id = 'chapterNotes'; fragment.append(notes);
    container.replaceChildren(fragment); updateHeader(); renderChapterNotes();
    const composer = $('composerInput'), context = state.book.id + '.' + state.chapter;
    if (composer.dataset.context !== context) { composer.value = ''; composer.dataset.context = context; }
    updateComposer();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation !== renderGeneration) return;
      restorePosition(state.book.progress);
      state.restoring = false; updateReadingProgress();
    }));
  }
  function readChapterNotes() {
    const notes = JSON.parse(localStorage.getItem(NOTES_PREFIX + state.book.id + '.' + state.chapter) || '[]');
    if (!Array.isArray(notes) || notes.some((note) => !note || typeof note.text !== 'string')) throw new Error('本章消息数据无法读取');
    return notes;
  }
  function renderChapterNotes(focusId) {
    const container = $('chapterNotes');
    if (!container) return;
    $('messages').querySelectorAll('.reply-slot').forEach((slot) => slot.replaceChildren());
    container.replaceChildren();
    let notes, focused;
    try { notes = readChapterNotes(); }
    catch (_) { container.append(el('p', 'note-status', '本章个人消息暂时无法读取')); return; }
    for (const note of notes) {
      const time = Number.isFinite(note.createdAt) ? new Date(note.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
      const row = ownMessage(note.text, time);
      let destination = container;
      if (Number.isInteger(note.afterParagraph) && note.afterParagraph >= 0) {
        const wrapper = $('messages').querySelector(`[data-paragraph="${note.afterParagraph}"]`);
        if (wrapper) {
          const slots = Array.from(wrapper.querySelectorAll('.reply-slot'));
          destination = slots.filter((slot) => Number(slot.dataset.replySlot) <= (Number(note.afterPart) || 0)).pop() || slots[0] || container;
        }
      }
      destination.append(row); if (note.id === focusId) focused = row;
    }
    return focused;
  }
  function updateComposer() {
    $('sendNote').disabled = !state.book || !$('composerInput').value.trim();
  }
  function replyAnchor() {
    if (state.replyTarget) return state.replyTarget;
    const bounds = $('messageScroll').getBoundingClientRect();
    const rows = Array.from($('messages').querySelectorAll('.novel-message'));
    let chosen = rows[0];
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.top >= bounds.bottom) break;
      if (rect.bottom <= bounds.bottom || !chosen || chosen.getBoundingClientRect().bottom <= bounds.top) chosen = row;
    }
    return chosen ? { paragraph: Number(chosen.closest('[data-paragraph]').dataset.paragraph), part: Number(chosen.dataset.part) } : null;
  }
  function sendNote() {
    const input = $('composerInput');
    if (!state.ready || !state.book || state.away) return;
    const text = input.value.trim();
    if (!text) return;
    if (text.length > 4000) { notice('一条消息最多 4000 字，请分条保存。', true); return; }
    const anchor = replyAnchor();
    const note = { id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9), text, createdAt: Date.now(), afterParagraph: anchor?.paragraph, afterPart: anchor?.part };
    try {
      const notes = readChapterNotes();
      if (notes.length >= 200) { notice('本章已保存 200 条个人消息，请使用其他章节记录。', true); return; }
      notes.push(note);
      localStorage.setItem(NOTES_PREFIX + state.book.id + '.' + state.chapter, JSON.stringify(notes));
    } catch (_) { notice('消息未保存，请检查本地存储。输入内容已保留。', true); return; }
    input.value = ''; updateComposer();
    const row = renderChapterNotes(note.id); row?.scrollIntoView({ block: 'nearest' });
    input.focus(); notice('消息已保存在本机');
  }
  function restorePosition(position) {
    const scroller = $('messageScroll');
    const index = Math.max(0, Math.min(Number(position?.paragraph) || 0, state.book.chapters[state.chapter].paragraphs.length - 1));
    const node = $('messages').querySelector(`[data-paragraph="${index}"]`);
    if (index === 0 && !position?.offset) { scroller.scrollTop = 0; return; }
    if (node) {
      const rect = node.getBoundingClientRect();
      // Replies and theme changes can shorten a paragraph; never restore past it.
      const offset = Math.max(0, Math.min(Number(position.offset) || 0, Math.max(0, rect.height - 1)));
      scroller.scrollTop += rect.top - scroller.getBoundingClientRect().top + offset - 20;
    } else scroller.scrollTop = 0;
  }
  function capturePosition() {
    if (!state.book || state.restoring || state.away) return;
    const scroller = $('messageScroll');
    const boundary = scroller.getBoundingClientRect().top + 20;
    const paragraphs = $('messages').querySelectorAll('[data-paragraph]');
    let low = 0, high = paragraphs.length - 1, found = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (paragraphs[mid].getBoundingClientRect().top <= boundary) { found = mid; low = mid + 1; }
      else high = mid - 1;
    }
    const target = paragraphs[found];
    state.book.progress = { chapter: state.chapter, paragraph: target ? Number(target.dataset.paragraph) : 0, offset: target ? boundary - target.getBoundingClientRect().top : 0 };
    if (scroller.scrollTop < 1) state.book.progress = { chapter: state.chapter, paragraph: 0, offset: 0 };
    updateReadingProgress(); updateBookmarkButton();
  }
  function updateReadingProgress() {
    if (!state.book) return;
    const book = state.book, scroller = $('messageScroll');
    const before = book.chapters.slice(0, state.chapter).reduce((sum, chapter) => sum + chapter.charCount, 0);
    const chapter = book.chapters[state.chapter], paragraph = book.progress.paragraph;
    let read = chapter.paragraphs.slice(0, paragraph).reduce((sum, text) => sum + text.length, 0);
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8) read = chapter.charCount;
    const percent = book.charCount ? Math.min(100, (before + read) / book.charCount * 100) : 0;
    $('progressText').textContent = (settings.maskTitles ? '文档进度 ' : '阅读进度 ') + percent.toFixed(1) + '%';
    $('progressFill').style.width = percent + '%'; $('progressTrack').setAttribute('aria-valuenow', percent.toFixed(1));
  }
  function persistState() {
    clearTimeout(saveTimer);
    if (!state.book || state.book.id === 'sample' || !state.persisted) return Promise.resolve(false);
    const book = state.book;
    const snapshot = { progress: { ...book.progress }, bookmarks: book.bookmarks.map((b) => ({ ...b })), updatedAt: Date.now() };
    // Tiny synchronous mirror keeps the latest position across a quick tab close.
    try { localStorage.setItem(PROGRESS_PREFIX + book.id, JSON.stringify({ progress: snapshot.progress, updatedAt: snapshot.updatedAt })); } catch (_) { /* IndexedDB remains the primary store. */ }
    const previous = writeQueue.get(book.id) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => ReaderDB.updateState(book.id, snapshot)).then(() => {
      if (state.book.id === book.id) $('saveStatus').textContent = '进度已保存'; return true;
    }).catch((error) => {
      if (state.book.id === book.id) { $('saveStatus').textContent = '保存失败'; warnStorage('无法保存进度：' + error.message + '。请保留原始文件。'); } return false;
    });
    writeQueue.set(book.id, task); task.finally(() => { if (writeQueue.get(book.id) === task) writeQueue.delete(book.id); });
    return task;
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persistState, 500); }
  function openChapter(index, position = { paragraph: 0, offset: 0 }) {
    if (!state.book || index < 0 || index >= state.book.chapters.length || state.away) return;
    capturePosition(); persistState();
    state.chapter = index;
    state.book.progress = { chapter: index, paragraph: Math.max(0, Number(position.paragraph) || 0), offset: Number(position.offset) || 0 };
    if (state.listMode === 'all' && !state.query) state.listPage = Math.floor(index / 100);
    renderChapters(); renderMessages(); scheduleSave();
  }
  async function activateBook(book, persisted) {
    capturePosition(); await persistState();
    clearTimeout(searchTimer); ++state.searchGeneration;
    $('textSearch').value = ''; $('searchResults').replaceChildren();
    $('searchSummary').textContent = '在当前文档的全部章节中查找。';
    state.book = book; state.persisted = persisted; state.chat = loadChatConfig(book.id); state.replyTarget = null;
    book.bookmarks = Array.isArray(book.bookmarks) ? book.bookmarks : [];
    book.progress = book.progress || { chapter: 0, paragraph: 0, offset: 0 };
    if (persisted) {
      try {
        const mirror = JSON.parse(localStorage.getItem(PROGRESS_PREFIX + book.id) || 'null');
        if (mirror?.updatedAt > book.updatedAt && mirror.progress) book.progress = mirror.progress;
      } catch (_) { /* Ignore stale or malformed optional mirror. */ }
      settings.lastBook = book.id; savePreferences();
    }
    state.chapter = Math.max(0, Math.min(Number(book.progress.chapter) || 0, book.chapters.length - 1));
    book.progress.chapter = state.chapter;
    state.query = ''; state.listMode = 'all'; state.listPage = Math.floor(state.chapter / 100); $('chapterSearch').value = '';
    $('saveStatus').textContent = book.id === 'sample' ? '示例文档' : persisted ? '进度已保存' : '仅本次会话';
    renderChapters(); renderMessages(); toggleSidebar(false);
  }
  async function importBook(book) {
    let persisted = false;
    // Never overwrite an old copy without a concrete choice in the library.
    try { await ReaderDB.put(book); persisted = true; $('storageWarning').hidden = true; }
    catch (error) { warnStorage('文档已打开，但无法持久保存：' + error.message + '。关闭页面前请保留原始 TXT。'); }
    await activateBook(book, persisted);
    $('importDialog').close(); $('libraryDialog').close();
    notice(persisted ? `已导入 ${book.chapters.length} 个章节，阅读进度会自动保存` : '已临时打开，文档未保存到浏览器', !persisted);
  }
  function setImportBusy(busy, message = '') {
    state.loading = busy; document.body.classList.toggle('importing', busy);
    $('fileInput').disabled = busy; $('pasteImport').disabled = busy; $('encodingSelect').disabled = busy;
    $('importStatus').textContent = message;
    $('fileDrop').setAttribute('aria-busy', String(busy));
  }
  async function importFile(file) {
    if (!file || state.loading) return;
    if (!$('importDialog').open) showDialog('importDialog');
    setImportBusy(true, '正在读取、识别章节并保存，请稍候…');
    try { const book = await ReaderCore.parseFile(file, $('encodingSelect').value); await importBook(book); }
    catch (error) { $('importStatus').textContent = error.message || '导入失败，请检查文件。'; $('importStatus').classList.add('error'); }
    finally { setImportBusy(false, $('importDialog').open ? $('importStatus').textContent : ''); $('fileInput').value = ''; }
  }
  async function openLibrary() {
    showDialog('libraryDialog'); const list = $('libraryList'); list.replaceChildren(el('p', 'empty-list', '正在读取本地文档…'));
    try {
      const books = await ReaderDB.list();
      list.replaceChildren();
      if (!books.length) list.append(el('p', 'empty-list', '这里还没有文档\n导入第一本 TXT，就可以开始阅读。'));
      for (const book of books.sort((a, b) => b.updatedAt - a.updatedAt)) {
        const row = el('div', 'library-item'); const open = button('', 'library-open', async () => {
          open.disabled = true;
          try { const full = await ReaderDB.get(book.id); if (!full) throw new Error('文档已被删除'); await activateBook(full, true); $('libraryDialog').close(); }
          catch (error) { notice(error.message, true); } finally { open.disabled = false; }
        });
        const badge = el('span', 'file-icon'); badge.append(icon('doc'));
        const copy = el('span', 'library-copy'); copy.append(el('strong', '', book.title), el('small', '', `${book.chapterCount} 章 · ${wordCount(book.charCount)} · 读到第 ${(book.progress?.chapter || 0) + 1} 章`));
        open.append(badge, copy);
        const remove = button('', 'icon-btn library-delete', async () => {
          if (!confirm(`从此浏览器删除《${book.title}》及其进度、书签、个人消息和聊天设置？\n原始 TXT 文件不会被删除。`)) return;
          remove.disabled = true;
          try {
            if (state.book.id === book.id) { clearTimeout(saveTimer); await persistState(); }
            await (writeQueue.get(book.id) || Promise.resolve()); await ReaderDB.delete(book.id);
            let localCleanupFailed = false;
            try {
              localStorage.removeItem(PROGRESS_PREFIX + book.id);
              localStorage.removeItem(CHAT_PREFIX + book.id);
              const notesPrefix = NOTES_PREFIX + book.id + '.';
              for (let index = localStorage.length - 1; index >= 0; index--) {
                const key = localStorage.key(index);
                if (key && key.startsWith(notesPrefix)) localStorage.removeItem(key);
              }
            } catch (_) { localCleanupFailed = true; }
            if (state.book.id === book.id) { state.persisted = false; settings.lastBook = null; savePreferences(); await activateBook(makeSample(), false); }
            await openLibrary(); notice(localCleanupFailed ? '文档已删除，但本地便签清理失败，请检查浏览器存储权限。' : '已从本地文档库删除', localCleanupFailed);
          } catch (error) { notice(error.message, true); remove.disabled = false; }
        });
        remove.append(icon('trash')); remove.setAttribute('aria-label', '删除《' + book.title + '》'); remove.title = '删除本地副本';
        row.append(open, remove); list.append(row);
      }
    } catch (error) { list.replaceChildren(el('p', 'empty-list', '无法读取文档库：' + error.message)); }
  }
  async function toggleBookmark() {
    capturePosition(); const p = state.book.progress;
    const index = state.book.bookmarks.findIndex((b) => b.chapter === state.chapter && b.paragraph === p.paragraph);
    if (index >= 0) state.book.bookmarks.splice(index, 1);
    else state.book.bookmarks.push({ id: String(Date.now()) + '-' + Math.random().toString(36).slice(2), chapter: state.chapter, paragraph: p.paragraph, offset: p.offset, excerpt: (state.book.chapters[state.chapter].paragraphs[p.paragraph] || state.book.chapters[state.chapter].title).slice(0, 70), createdAt: Date.now() });
    updateBookmarkButton(); renderChapters();
    const saved = await persistState();
    notice(index >= 0 ? '已取消此处书签' : saved ? '已收藏当前阅读位置' : '已添加书签（仅本次会话）');
  }
  function openSearch() { showDialog('searchDialog'); $('textSearch').focus(); }
  function openBookmarks() { state.listMode = 'saved'; state.listPage = 0; renderChapters(); toggleSidebar(true); }
  function openMessages() { state.listMode = 'all'; state.listPage = Math.floor(state.chapter / 100); renderChapters(); toggleSidebar(true); }
  async function searchBook() {
    const generation = ++state.searchGeneration; const query = $('textSearch').value.trim(); const container = $('searchResults');
    container.replaceChildren();
    if (!query) { $('searchSummary').textContent = '在当前文档的全部章节中查找。'; return; }
    $('searchSummary').textContent = '正在查找…';
    const book = state.book, folded = query.toLocaleLowerCase(), hits = []; let visited = 0, capped = false;
    outer: for (let chapter = 0; chapter < book.chapters.length; chapter++) {
      for (let paragraph = 0; paragraph < book.chapters[chapter].paragraphs.length; paragraph++) {
        const text = book.chapters[chapter].paragraphs[paragraph], at = text.toLocaleLowerCase().indexOf(folded);
        if (at >= 0) { hits.push({ chapter, paragraph, text, at }); if (hits.length >= 100) { capped = true; break outer; } }
        if (++visited % 2000 === 0) { await new Promise((resolve) => setTimeout(resolve, 0)); if (generation !== state.searchGeneration || book !== state.book) return; }
      }
    }
    if (generation !== state.searchGeneration || book !== state.book) return;
    $('searchSummary').textContent = hits.length ? `找到 ${capped ? '至少 ' : ''}${hits.length} 个匹配段落${capped ? '，显示前 100 条' : ''}` : '没有找到匹配内容，试试更短的关键词。';
    const fragment = document.createDocumentFragment();
    for (const hit of hits) {
      const result = button('', 'search-result', () => {
        if (book !== state.book) { searchBook(); return; }
        closeDialog($('searchDialog')); openChapter(hit.chapter, { paragraph: hit.paragraph, offset: 0 });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const paragraph = $('messages').querySelector(`[data-paragraph="${hit.paragraph}"]`);
          if (paragraph) { paragraph.classList.add('search-highlight'); setTimeout(() => paragraph.classList.remove('search-highlight'), 2200); }
        }));
      });
      result.append(el('span', 'result-chapter', chapterTitle(hit.chapter)));
      const snippet = el('span', 'result-excerpt'), start = Math.max(0, hit.at - 28), end = Math.min(hit.text.length, hit.at + query.length + 65);
      snippet.append(document.createTextNode((start ? '…' : '') + hit.text.slice(start, hit.at)), el('mark', '', hit.text.slice(hit.at, hit.at + query.length)), document.createTextNode(hit.text.slice(hit.at + query.length, end) + (end < hit.text.length ? '…' : '')));
      result.append(snippet); fragment.append(result);
    }
    container.replaceChildren(fragment);
  }
  function showFileInfo() {
    const info = $('fileInfo'); info.replaceChildren();
    for (const [key, value] of [['名称', state.book.title], ['文件', state.book.fileName], ['当前章节', state.book.chapters[state.chapter].title], ['编码', state.book.encoding], ['章节', String(state.book.chapters.length)], ['字数', wordCount(state.book.charCount)], ['存储', state.book.id === 'sample' ? '内置原创示例' : state.persisted ? '本机浏览器' : '仅本次会话']]) info.append(el('dt', '', key), el('dd', '', value));
    showDialog('infoDialog');
  }
  function toggleAway(force) {
    const away = typeof force === 'boolean' ? force : !state.away;
    if (away === state.away) return;
    if (away) {
      capturePosition(); persistState(); lastFocus = document.activeElement;
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close()); toggleSidebar(false);
      $('dropOverlay').hidden = true; dropDepth = 0; $('toast').hidden = true;
      $('awayDate').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }
    state.away = away; $('awayScreen').hidden = !away;
    document.querySelector('.app-shell').inert = away;
    if (away) $('resumeBtn').focus(); else if (lastFocus?.isConnected && !lastFocus.closest('dialog:not([open])')) lastFocus.focus(); else $('messageScroll').focus();
  }
  function makeSample() {
    const book = ReaderCore.parseText(sampleText, '雨停之前 · 原创示例.txt'); book.id = 'sample'; book.title = '雨停之前 · 原创示例'; return book;
  }

  for (const id of ['importNav', 'importPlus']) $(id).addEventListener('click', openImport);
  for (const id of ['libraryBtn', 'currentFileBtn']) $(id).addEventListener('click', openLibrary);
  $('libraryImport').addEventListener('click', openImport);
  for (const id of ['settingsBtn', 'readingSettings']) $(id).addEventListener('click', () => showDialog('settingsDialog'));
  for (const id of ['globalSearch', 'searchBtn']) $(id).addEventListener('click', openSearch);
  $('fileInfoBtn').addEventListener('click', showFileInfo);
  $('themeBtn').addEventListener('click', () => switchTheme());
  $('feishuThemeBtn')?.addEventListener('click', () => switchTheme());
  document.querySelectorAll('[data-theme-choice]').forEach((node) => node.addEventListener('click', () => switchTheme(node.dataset.themeChoice)));
  for (const id of ['fontSize', 'lineHeight', 'fontFamily']) $(id).addEventListener('input', () => {
    capturePosition(); const position = { ...state.book.progress };
    settings[id] = id === 'fontFamily' ? $(id).value : Number($(id).value); applySettings(); savePreferences(); restorePosition(position);
  });
  $('maskTitles').addEventListener('change', () => setMaskTitles($('maskTitles').checked));
  $('feishuMaskBtn')?.addEventListener('click', () => setMaskTitles(!settings.maskTitles));
  $('allTab').addEventListener('click', () => { state.listMode = 'all'; state.listPage = Math.floor(state.chapter / 100); renderChapters(); });
  $('savedTab').addEventListener('click', () => { state.listMode = 'saved'; state.listPage = 0; renderChapters(); });
  $('feishuUnreadTab')?.addEventListener('click', () => { state.listMode = 'unread'; state.listPage = 0; renderChapters(); });
  $('bookmarksBtn').addEventListener('click', openBookmarks);
  $('messagesNav').addEventListener('click', openMessages);
  $('feishuMessagesNav')?.addEventListener('click', openMessages);
  $('chapterSearch').addEventListener('input', () => { state.query = $('chapterSearch').value; state.listPage = 0; renderChapters(); });
  $('prevChapter').addEventListener('click', () => openChapter(state.chapter - 1));
  $('nextChapter').addEventListener('click', () => openChapter(state.chapter + 1));
  $('addBookmark').addEventListener('click', toggleBookmark);
  $('openSidebar').addEventListener('click', () => toggleSidebar(true));
  for (const id of ['closeSidebar', 'sidebarBackdrop']) $(id).addEventListener('click', () => toggleSidebar(false));
  $('awayBtn').addEventListener('click', () => toggleAway(true)); $('resumeBtn').addEventListener('click', () => toggleAway(false));
  const shortcutActions = { import: openImport, library: openLibrary, bookmarks: openBookmarks, settings: () => showDialog('settingsDialog'), search: openSearch, info: showFileInfo, away: () => toggleAway(true) };
  const boundShortcutIds = new Set(['importNav', 'importPlus', 'libraryBtn', 'currentFileBtn', 'libraryImport', 'settingsBtn', 'readingSettings', 'globalSearch', 'searchBtn', 'fileInfoBtn', 'bookmarksBtn', 'awayBtn']);
  document.querySelectorAll('[data-action]').forEach((node) => {
    if (boundShortcutIds.has(node.id)) return;
    const action = shortcutActions[node.dataset.action];
    if (action) node.addEventListener('click', () => { if (state.ready && !state.away) action(); });
  });
  $('composerInput')?.addEventListener('input', updateComposer);
  $('composerInput')?.addEventListener('keydown', (event) => {
    // IME confirmation must not send a message (including WebKit's 229 event).
    if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!event.repeat) sendNote();
  });
  $('sendNote')?.addEventListener('click', sendNote);
  for (const id of ['chatSetupBtn', 'settingsChatSetup']) $(id).addEventListener('click', openChatSetup);
  $('saveChatSetup').addEventListener('click', saveChatSetup);
  $('namesFile').addEventListener('change', () => importNames($('namesFile').files[0]));
  $('messages').addEventListener('click', (event) => {
    const row = event.target.closest('.novel-message');
    if (!row || !window.getSelection()?.isCollapsed) return;
    $('messages').querySelectorAll('.reply-selected').forEach((node) => node.classList.remove('reply-selected'));
    row.classList.add('reply-selected');
    state.replyTarget = { paragraph: Number(row.closest('[data-paragraph]').dataset.paragraph), part: Number(row.dataset.part) };
  });
  $('fileInput').addEventListener('change', () => { $('importStatus').classList.remove('error'); importFile($('fileInput').files[0]); });
  $('pasteImport').addEventListener('click', async () => {
    if (state.loading) return;
    setImportBusy(true, '正在识别章节并保存…'); $('importStatus').classList.remove('error');
    try { const book = ReaderCore.parseText($('pasteContent').value, ($('pasteTitle').value.trim() || '未命名文档') + '.txt'); await importBook(book); $('pasteContent').value = ''; $('pasteTitle').value = ''; }
    catch (error) { $('importStatus').textContent = error.message; $('importStatus').classList.add('error'); }
    finally { setImportBusy(false, $('importDialog').open ? $('importStatus').textContent : ''); }
  });
  $('textSearch').addEventListener('input', () => { clearTimeout(searchTimer); ++state.searchGeneration; searchTimer = setTimeout(searchBook, 180); });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.querySelectorAll('[data-close]').forEach((node) => node.addEventListener('click', () => closeDialog(dialog)));
    dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog); } });
    dialog.addEventListener('close', () => { if (dialog.id === 'searchDialog') ++state.searchGeneration; });
  });
  $('messageScroll').addEventListener('scroll', () => {
    if (state.restoring || state.away) return;
    cancelAnimationFrame(scrollFrame); scrollFrame = requestAnimationFrame(() => { capturePosition(); scheduleSave(); });
  }, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (event.isComposing || !state.ready) return;
    const input = event.target.closest('input,textarea,select,[contenteditable="true"]');
    const dialog = document.querySelector('dialog[open]');
    if ((event.metaKey || event.ctrlKey) && ['k', 'f'].includes(event.key.toLowerCase())) { event.preventDefault(); if (!state.away) openSearch(); return; }
    if (event.key === 'Escape') {
      if (dialog) return;
      event.preventDefault(); if (document.documentElement.classList.contains('sidebar-open')) toggleSidebar(false); else toggleAway(); return;
    }
    if (input || dialog || state.away || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); openChapter(state.chapter + (event.key === 'ArrowRight' ? 1 : -1)); }
  });
  function hasFiles(event) { return Array.from(event.dataTransfer?.types || []).includes('Files'); }
  document.addEventListener('dragenter', (event) => { if (!hasFiles(event) || state.away || state.loading || !state.ready) return; event.preventDefault(); dropDepth++; $('dropOverlay').hidden = false; });
  document.addEventListener('dragover', (event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = state.away || state.loading || !state.ready ? 'none' : 'copy'; });
  document.addEventListener('dragleave', (event) => { if (!hasFiles(event)) return; if (--dropDepth <= 0) { dropDepth = 0; $('dropOverlay').hidden = true; } });
  document.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return; event.preventDefault(); dropDepth = 0; $('dropOverlay').hidden = true;
    if (state.away || state.loading || !state.ready) return;
    const files = event.dataTransfer.files; if (files.length !== 1) { notice('请一次导入一个 TXT 文件', true); return; }
    $('importStatus').classList.remove('error'); importFile(files[0]);
  });
  window.addEventListener('blur', () => { dropDepth = 0; $('dropOverlay').hidden = true; capturePosition(); persistState(); });
  window.addEventListener('pagehide', () => { capturePosition(); persistState(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { capturePosition(); persistState(); } });

  async function boot() {
    applySettings();
    if (needsAppearanceMigration) savePreferences();
    if (!window.ReaderCore || !window.ReaderDB) { warnStorage('程序文件不完整，请使用“摸鱼神器.html”完整版本。'); return; }
    let book = null;
    if (settings.lastBook) {
      try { book = await ReaderDB.get(settings.lastBook); }
      catch (error) { warnStorage('无法读取上次的文档：' + error.message); }
    }
    await activateBook(book || makeSample(), !!book);
    if (!settings.lastBook) {
      try { await ReaderDB.list(); } catch (error) { warnStorage('浏览器暂不支持本地持久保存：' + error.message + '。仍可临时阅读，请保留原始 TXT。'); }
    }
  }
  document.querySelector('.app-shell').inert = true;
  boot().catch((error) => warnStorage('启动失败：' + error.message + '。请重新打开完整 HTML 文件。'))
    .finally(() => { state.ready = !!state.book; document.querySelector('.app-shell').inert = state.away; });
})();
