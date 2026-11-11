// Package the reader as a portable, network-free HTML file.
import { readFile, writeFile } from 'node:fs/promises';
const source = new URL('./', import.meta.url);
const [template, css, feishuCss, chatCss, core, dialogue, app] = await Promise.all(
  ['index.html', 'styles.css', 'feishu.css', 'chat-features.css', 'core.js', 'dialogue.js', 'app.js'].map((name) => readFile(new URL(name, source), 'utf8'))
);
if (/<\/script/i.test(core + dialogue + app)) throw new Error('Inline JavaScript contains an unexpected closing script tag.');
const html = template
  .replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + css + '\n</style>')
  .replace('<link rel="stylesheet" href="feishu.css">', () => '<style>\n' + feishuCss + '\n</style>')
  .replace('<link rel="stylesheet" href="chat-features.css">', () => '<style>\n' + chatCss + '\n</style>')
  .replace('<script src="core.js"></script>', () => '<script>\n' + core + '\n</script>')
  .replace('<script src="dialogue.js"></script>', () => '<script>\n' + dialogue + '\n</script>')
  .replace('<script src="app.js"></script>', () => '<script>\n' + app + '\n</script>');
await writeFile(new URL('摸鱼神器.html', source), html);
console.log('Packaged 摸鱼神器.html (' + Buffer.byteLength(html) + ' bytes)');
