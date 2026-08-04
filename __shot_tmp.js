const { app, BrowserWindow } = require('electron');
const path = require('path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false });
  await win.loadFile(path.join(__dirname, 'admin-win98.html'));
  await new Promise(r => setTimeout(r, 5000));
  const out = await win.webContents.executeJavaScript(`(() => {
    document.body.classList.add('macos-theme');
    const ss = document.styleSheets[0];
    let n = 0, macRules = 0, last = '';
    try { n = ss.cssRules.length; for (const r of ss.cssRules) { if ((r.selectorText||'').includes('macos-theme')) { macRules++; last = r.selectorText; } } } catch(e) { return 'SS ERR ' + e.message; }
    const tp = getComputedStyle(document.querySelector('.win98-tree-pane'));
    const bd = getComputedStyle(document.body);
    return JSON.stringify({ href: ss.href.slice(-40), totalRules: n, macRules, lastMac: last, treeBg: tp.backgroundColor, bodyFont: bd.fontFamily.slice(0,40), bodyColor: bd.color });
  })()`).catch(e => 'ERR ' + e.message);
  console.log('DIAG:', out);
  app.quit();
});
