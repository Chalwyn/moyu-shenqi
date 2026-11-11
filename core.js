(function (global) {
  'use strict';

  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_CHARACTERS = 10000000;
  const MAX_PARAGRAPHS = 100000;
  const MAX_CHAPTERS = 20000;
  const PARAGRAPH_LENGTH = 1200;
  const FRAGMENT_LENGTH = 6000;
  const CHAPTER_LENGTH = 12000;

  function makeId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      global.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }
    return 'book-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function isHeading(line) {
    if (line.length > 80 || /[。！？!?；;]/.test(line)) return false;
    const chinese = line.match(/^第[零〇一二三四五六七八九十百千万亿两\d０-９]{1,16}[章回节卷](.*)$/);
    if (chinese) {
      const tail = chinese[1];
      // A sentence referring to a chapter is not itself a chapter heading.
      if (/^(?:的|中|里|时|时候|之后|之前|讲述|提到|说道|写道|已经|就是|是指)/.test(tail)) return false;
      return true;
    }
    if (/^(?:序章|序言|序幕|楔子|引子|后记|尾声|终章)(?:$|[\s:：、.．\-—（(]).*/.test(line)) return true;
    if (/^番外(?:$|[\s:：、.．\-—（(零〇一二三四五六七八九十百千万\d]).*/.test(line)) return true;
    return /^chapter\s+(?:\d{1,6}|[ivxlcdm]{1,12})(?:$|[\s:：.．\-—]).*/i.test(line);
  }

  function splitParagraph(line) {
    const parts = [];
    let start = 0;
    while (line.length - start > PARAGRAPH_LENGTH) {
      let end = start + PARAGRAPH_LENGTH;
      const lower = start + 750;
      for (let i = end - 1; i >= lower; i -= 1) {
        if (/[。！？!?；;，,、\s]/.test(line.charAt(i))) {
          end = i + 1;
          break;
        }
      }
      // Do not cut an emoji / supplementary character between its surrogate halves.
      const last = line.charCodeAt(end - 1);
      if (last >= 0xD800 && last <= 0xDBFF) end -= 1;
      parts.push(line.slice(start, end));
      start = end;
    }
    if (start < line.length) parts.push(line.slice(start));
    return parts;
  }

  function parseText(rawText, fileName, encoding) {
    if (typeof rawText !== 'string') throw new Error('未读到文字内容，请重新选择 TXT 文件。');
    if (rawText.length > MAX_CHARACTERS) throw new Error('这本书超过 1000 万字符，请拆分成较小的 TXT 文件后导入。');
    const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!text.trim()) throw new Error('这个 TXT 文件是空的，请选择有正文的文件。');
    if (!text.replace(/[\s\u0000]/g, '')) throw new Error('文件只有空字符，无法作为小说阅读。请确认文件是有效的 TXT 文本。');

    const blocks = [];
    let headingCount = 0;
    let start = 0;
    while (start < text.length) {
      const newline = text.indexOf('\n', start);
      const end = newline === -1 ? text.length : newline;
      const line = text.slice(start, end).trim();
      start = end + 1;
      if (!line) continue;
      if (isHeading(line)) {
        headingCount += 1;
        if (headingCount > MAX_CHAPTERS) throw new Error('文件章节数量过多，请拆分为几个 TXT 文件后导入。');
        blocks.push({ text: line, heading: true });
      } else {
        const parts = splitParagraph(line);
        for (let i = 0; i < parts.length; i += 1) {
          blocks.push({ text: parts[i], heading: false });
          if (blocks.length > MAX_PARAGRAPHS) throw new Error('文件段落数量过多，请拆分为几个 TXT 文件后导入。');
        }
      }
      if (blocks.length > MAX_PARAGRAPHS) throw new Error('文件段落数量过多，请拆分为几个 TXT 文件后导入。');
    }

    const chapters = [];
    let current = null;
    let originalTitle = '开篇';
    let continuation = 0;
    function addChapter(title, titleCharacters) {
      if (chapters.length >= MAX_CHAPTERS) throw new Error('文件章节数量过多，请拆分为几个 TXT 文件后导入。');
      current = { title: title, paragraphs: [], charCount: titleCharacters || 0 };
      chapters.push(current);
    }
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (headingCount && block.heading) {
        originalTitle = block.text;
        continuation = 0;
        addChapter(block.text, block.text.length);
        continue;
      }
      if (!current) addChapter(headingCount ? '开篇' : '阅读片段 1', 0);
      if (!headingCount && current.charCount >= FRAGMENT_LENGTH) {
        addChapter('阅读片段 ' + (chapters.length + 1), 0);
      }
      if (headingCount && current.paragraphs.length && current.charCount + block.text.length > CHAPTER_LENGTH) {
        continuation += 1;
        // Generated continuation titles do not inflate the original book's character count.
        addChapter(originalTitle + '（续 ' + continuation + '）', 0);
      }
      current.paragraphs.push(block.text);
      current.charCount += block.text.length;
    }
    if (!chapters.length) throw new Error('未找到可阅读的正文，请确认文件内容。');

    const name = typeof fileName === 'string' && fileName.trim() ? fileName : '未命名.txt';
    const title = name.replace(/^.*[\\/]/, '').replace(/\.txt$/i, '').trim() || '未命名';
    const now = Date.now();
    return {
      id: makeId(),
      title: title,
      fileName: name,
      encoding: encoding || 'UTF-8',
      chapters: chapters,
      charCount: chapters.reduce(function (sum, chapter) { return sum + chapter.charCount; }, 0),
      createdAt: now,
      updatedAt: now,
      progress: { chapter: 0, paragraph: 0, offset: 0 },
      bookmarks: []
    };
  }

  async function parseFile(file, encoding) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('请选择一个 TXT 文件。');
    if (!/\.txt$/i.test(file.name || '')) throw new Error('目前只支持 .txt 小说，请选择 TXT 文件。');
    if (file.size > MAX_BYTES) throw new Error('文件超过 20 MB，请拆分成较小的 TXT 文件后导入。');
    if (file.size === 0) throw new Error('这个 TXT 文件是空的，请选择有正文的文件。');
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (error) {
      throw new Error('无法读取这个文件，请重新选择文件后再试。');
    }
    if (buffer.byteLength > MAX_BYTES) throw new Error('文件超过 20 MB，请拆分成较小的 TXT 文件后导入。');
    if (typeof global.TextDecoder !== 'function') throw new Error('当前浏览器不支持文本解码，请使用新版 Chrome、Edge 或 Safari。');
    const bytes = new Uint8Array(buffer);
    const requested = (encoding || 'auto').toLowerCase().replace(/_/g, '-');
    let decoded;
    let detected;
    try {
      if (requested !== 'auto') {
        if (!['utf-8', 'utf8', 'gb18030', 'utf-16le', 'utf-16be'].includes(requested)) {
          throw new Error('unsupported-encoding');
        }
        detected = requested === 'utf8' ? 'UTF-8' : requested.toUpperCase();
        decoded = new global.TextDecoder(detected, { fatal: true }).decode(bytes);
      } else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        detected = 'UTF-16LE';
        decoded = new global.TextDecoder('utf-16le', { fatal: true }).decode(bytes);
      } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        detected = 'UTF-16BE';
        decoded = new global.TextDecoder('utf-16be', { fatal: true }).decode(bytes);
      } else {
        try {
          decoded = new global.TextDecoder('utf-8', { fatal: true }).decode(bytes);
          detected = 'UTF-8';
        } catch (utf8Error) {
          decoded = new global.TextDecoder('gb18030', { fatal: true }).decode(bytes);
          detected = 'GB18030';
        }
      }
    } catch (error) {
      if (error.message === 'unsupported-encoding') throw new Error('不支持该编码，请选择自动识别、UTF-8、GB18030、UTF-16LE 或 UTF-16BE。');
      throw new Error('无法按所选编码读取文件。请尝试自动识别或 GB18030，或将文件另存为 UTF-8 后导入。');
    }
    return parseText(decoded, file.name, detected);
  }

  const DATABASE_NAME = 'im-novel-reader';
  const STORE_NAMES = ['books', 'metadata', 'states'];
  let databasePromise = null;

  function storageError(error, operation) {
    const name = error && error.name;
    let message;
    if (name === 'QuotaExceededError') {
      message = '本地存储空间不足，保存失败。请删除不需要的书籍或释放浏览器存储空间后重试。';
    } else if (name === 'SecurityError' || name === 'NotAllowedError') {
      message = '浏览器禁止了本地存储，无法保存书库。请允许此页面使用本地存储，或换用普通浏览窗口。';
    } else if (name === 'InvalidStateError' || name === 'NotFoundError' || name === 'VersionError') {
      message = '本地书库暂时无法使用，请关闭其他阅读器页面后重新打开。';
    } else {
      message = (operation || '访问本地书库') + '失败。请检查浏览器是否允许本地存储，或关闭其他阅读器页面后重试。';
    }
    const result = new Error(message);
    result.cause = error;
    return result;
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(function (resolve, reject) {
      let request;
      let settled = false;
      let timer;
      function fail(error) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        reject(error);
      }
      try {
        if (!global.indexedDB) {
          fail(new Error('当前浏览器未开放本地书库存储，书籍和进度无法保存在本机。请换用普通浏览窗口或新版浏览器。'));
          return;
        }
        request = global.indexedDB.open(DATABASE_NAME, 1);
      } catch (error) {
        fail(storageError(error, '打开本地书库'));
        return;
      }
      timer = global.setTimeout(function () {
        fail(new Error('打开本地书库超时，请关闭其他阅读器页面后重新打开。'));
      }, 10000);
      request.onupgradeneeded = function () {
        const db = request.result;
        STORE_NAMES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      request.onerror = function () { fail(storageError(request.error, '打开本地书库')); };
      request.onblocked = function () {
        fail(new Error('本地书库被另一个阅读器页面占用，请关闭其他页面后重试。'));
      };
      request.onsuccess = function () {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        if (STORE_NAMES.some(function (name) { return !db.objectStoreNames.contains(name); })) {
          db.close();
          fail(new Error('本地书库结构不兼容，无法读取。请使用最初导入这些书籍的阅读器版本。'));
          return;
        }
        settled = true;
        global.clearTimeout(timer);
        db.onversionchange = function () {
          db.close();
          databasePromise = null;
        };
        db.onclose = function () { databasePromise = null; };
        resolve(db);
      };
    }).catch(function (error) {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  async function transact(stores, mode, operation, work) {
    const db = await openDatabase();
    return new Promise(function (resolve, reject) {
      let transaction;
      let result;
      let failure;
      try {
        transaction = db.transaction(stores, mode);
        transaction.oncomplete = function () { resolve(typeof result === 'function' ? result() : result); };
        transaction.onerror = function (event) { failure = failure || (event.target && event.target.error) || transaction.error; };
        transaction.onabort = function () {
          reject(failure && failure.readerMessage ? failure : storageError(failure || transaction.error, operation));
        };
        result = work(transaction, function (message) {
          failure = new Error(message);
          failure.readerMessage = true;
          transaction.abort();
        });
      } catch (error) {
        failure = error;
        if (transaction) {
          try { transaction.abort(); } catch (abortError) { /* It may already have finished. */ }
        }
        reject(storageError(error, operation));
      }
    });
  }

  function normalizedProgress(value) {
    const input = value || {};
    return {
      chapter: Number.isFinite(input.chapter) ? Math.max(0, Math.floor(input.chapter)) : 0,
      paragraph: Number.isFinite(input.paragraph) ? Math.max(0, Math.floor(input.paragraph)) : 0,
      offset: Number.isFinite(input.offset) ? Math.max(0, input.offset) : 0
    };
  }

  function bookMetadata(book, progress, updatedAt) {
    return {
      id: book.id,
      title: book.title,
      fileName: book.fileName,
      encoding: book.encoding,
      chapterCount: book.chapters.length,
      charCount: book.charCount,
      bookmarksCount: Array.isArray(book.bookmarks) ? book.bookmarks.length : 0,
      createdAt: book.createdAt,
      updatedAt: updatedAt,
      progress: progress
    };
  }

  const ReaderDB = {
    list: function () {
      return transact(['metadata'], 'readonly', '读取书库', function (transaction) {
        const rows = [];
        const request = transaction.objectStore('metadata').openCursor();
        request.onsuccess = function () {
          const cursor = request.result;
          if (cursor) {
            rows.push(cursor.value);
            cursor.continue();
          }
        };
        return function () { return rows.sort(function (a, b) { return b.updatedAt - a.updatedAt; }); };
      });
    },
    get: function (id) {
      return transact(['books', 'states'], 'readonly', '读取书籍', function (transaction) {
        const body = transaction.objectStore('books').get(id);
        const state = transaction.objectStore('states').get(id);
        return function () {
          if (!body.result) return null;
          const book = body.result;
          const saved = state.result || {};
          book.progress = normalizedProgress(saved.progress || book.progress);
          book.bookmarks = Array.isArray(saved.bookmarks) ? saved.bookmarks : (book.bookmarks || []);
          book.updatedAt = saved.updatedAt || book.updatedAt;
          return book;
        };
      });
    },
    put: function (book) {
      if (!book || typeof book.id !== 'string' || !Array.isArray(book.chapters)) {
        return Promise.reject(new Error('书籍内容不完整，无法保存。请重新导入 TXT 文件。'));
      }
      const progress = normalizedProgress(book.progress);
      const updatedAt = Number.isFinite(book.updatedAt) ? book.updatedAt : Date.now();
      const body = {
        id: book.id,
        title: book.title,
        fileName: book.fileName,
        encoding: book.encoding,
        chapters: book.chapters,
        charCount: book.charCount,
        createdAt: book.createdAt,
        updatedAt: updatedAt
      };
      return transact(STORE_NAMES, 'readwrite', '保存书籍', function (transaction) {
        transaction.objectStore('books').put(body);
        transaction.objectStore('states').put({
          id: book.id,
          progress: progress,
          bookmarks: Array.isArray(book.bookmarks) ? book.bookmarks : [],
          updatedAt: updatedAt
        });
        transaction.objectStore('metadata').put(bookMetadata(book, progress, updatedAt));
        return book.id;
      });
    },
    delete: function (id) {
      return transact(STORE_NAMES, 'readwrite', '删除书籍', function (transaction) {
        STORE_NAMES.forEach(function (name) { transaction.objectStore(name).delete(id); });
      });
    },
    updateState: function (id, patch) {
      const changes = patch || {};
      return transact(['metadata', 'states'], 'readwrite', '保存阅读进度', function (transaction, abort) {
        const metadataStore = transaction.objectStore('metadata');
        const statesStore = transaction.objectStore('states');
        const metadataRequest = metadataStore.get(id);
        const stateRequest = statesStore.get(id);
        let ready = 0;
        function merge() {
          ready += 1;
          if (ready !== 2) return;
          if (!metadataRequest.result) {
            abort('这本书已不在本地书库中，无法保存进度。请重新导入。');
            return;
          }
          const metadata = metadataRequest.result;
          const state = stateRequest.result || { id: id, progress: metadata.progress, bookmarks: [] };
          if (Object.prototype.hasOwnProperty.call(changes, 'progress')) state.progress = normalizedProgress(changes.progress);
          if (Object.prototype.hasOwnProperty.call(changes, 'bookmarks')) {
            if (!Array.isArray(changes.bookmarks)) {
              abort('书签数据不完整，未保存本次更改。');
              return;
            }
            state.bookmarks = changes.bookmarks;
          }
          state.updatedAt = Number.isFinite(changes.updatedAt) ? changes.updatedAt : Date.now();
          metadata.updatedAt = state.updatedAt;
          metadata.progress = normalizedProgress(state.progress);
          metadata.bookmarksCount = Array.isArray(state.bookmarks) ? state.bookmarks.length : 0;
          try {
            statesStore.put(state);
            metadataStore.put(metadata);
          } catch (error) {
            abort('阅读进度或书签数据无法保存，本次更改尚未写入本机。');
          }
        }
        metadataRequest.onsuccess = merge;
        stateRequest.onsuccess = merge;
      });
    }
  };

  global.ReaderCore = Object.freeze({ parseFile: parseFile, parseText: parseText });
  global.ReaderDB = Object.freeze(ReaderDB);
})(window);
