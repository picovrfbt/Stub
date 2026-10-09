// ===== Stub — Google Apps Script back end =====
// Your own private server for Stub. It runs in YOUR Google account and:
//  - stores your budget data (compressed, in this script's private storage),
//  - reads your bank's alert emails from your Gmail (read-only search),
//  - runs a daily 8 AM check and sends the email summaries you turn on.
// The web app is open to "Anyone", but every request must carry your secret key (see doPost),
// which only you have. Run setup() once from the editor to create it. See the README.

// Where the app lives. Change this only if you host the app yourself.
const APP_URL = 'https://picovrfbt.github.io/Stub/';

// Which emails count as transaction alerts (the senders are chosen in the app: Settings → Bank sync).
// Security emails (verify, login, statements, settings changes) are left out.
const ALERT_SUBJECTS = 'subject:(transaction OR transfer OR received OR approved OR withdrawal OR deposit OR purchase OR debit OR credit OR payment OR alert) -subject:(verify OR verification OR login OR "sign in" OR statement OR preference OR password)';

const APP_NAME = 'Stub';
const APP_ICON = APP_URL + 'icon-192.png';

// Opening this script's address in a browser shows a short note (no data is ever shown here).
function doGet() {
  return HtmlService.createHtmlOutput('<div style="font-family:system-ui,sans-serif;max-width:440px;margin:60px auto;padding:0 16px;text-align:center"><h2>This is your Stub server</h2>'
    + '<p>Open <a href="' + APP_URL + '">Stub</a> and paste this page\'s address (it ends in <b>/exec</b>) along with your key.</p></div>')
    .setTitle(APP_NAME).setFaviconUrl(APP_ICON).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ----- The app's requests: {k: your key, fn: what to do, args: [...]} -----
// Only these can be called, and only with the right key.
const API = {
  loadState: (...a) => loadState_(...a),
  saveState: (...a) => saveState_(...a),
  getAlertTransactions: (...a) => getAlertTransactions_(...a),
  setupEmails: (...a) => setupEmails_(...a),
  sendTestEmail: (...a) => sendTestEmail_(...a),
};
function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (!keyOk_(req.k)) out = { error: 'bad-key' };
    else if (!Object.prototype.hasOwnProperty.call(API, req.fn)) out = { error: 'unknown request' };
    else out = { ok: API[req.fn].apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
// The key itself is never stored, only its SHA-256 fingerprint (in this script's private properties).
const sha256_ = s => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
  .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
function keyOk_(k) {
  const want = PropertiesService.getScriptProperties().getProperty('KEY_HASH');
  if (typeof k !== 'string' || k.length < 32 || !want) return false;
  const hex = sha256_(k);
  let diff = hex.length ^ want.length;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// ===== Run this once from the editor (select "setup" above, then Run) =====
// Creates your secret key and schedules the daily check. Your key is printed in the Execution log below:
// copy it into the app. It's shown only this once; if you lose it, run newKey() to make a new one.
function setup() {
  if (PropertiesService.getScriptProperties().getProperty('KEY_HASH')) {
    ensureDailyJob();
    console.log('Already set up. The daily check is scheduled. Lost your key? Run newKey() to make a new one.');
    return;
  }
  newKey();
}
function newKey() {
  const key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('KEY_HASH', sha256_(key));
  ensureDailyJob();
  console.log('Your Stub key (copy it now; it will not be shown again):\n\n' + key + '\n\nAny device still using an older key will be asked for this one.');
}

// The shared budget logic (Core.gs, copied from core.js) works on this.
var S;

// sinceMs = last sync time (0 on first run → last 90 days).
// senders = email addresses or domains the alerts come from, e.g. ["alerts@mybank.com", "mybank.com"].
function getAlertTransactions_(sinceMs, senders) {
  const tz = Session.getScriptTimeZone();
  const since = sinceMs ? Math.floor(sinceMs / 1000) - 3 * 86400 : Math.floor(Date.now() / 1000) - 90 * 86400;
  // only plain addresses/domains are allowed into the Gmail search
  const from = (Array.isArray(senders) ? senders : [])
    .map(s => String(s).trim().toLowerCase()).filter(s => /^[a-z0-9@._+-]{3,100}$/.test(s)).slice(0, 20);
  if (!from.length) return { transactions: [], unread: [] };
  const threads = GmailApp.search('from:(' + from.join(' OR ') + ') ' + ALERT_SUBJECTS + ' after:' + since, 0, 300);
  const transactions = [], unread = [];
  for (const thread of threads) {
    for (const m of thread.getMessages()) {
      if (m.getDate().getTime() / 1000 < since) continue;
      const subject = m.getSubject(), body = m.getPlainBody() || '';
      const emailDate = Utilities.formatDate(m.getDate(), tz, 'yyyy-MM-dd');
      const t = parseAlert(subject, body, emailDate);
      if (t) transactions.push(Object.assign({ id: m.getId() }, t));
      else unread.push({ date: emailDate, subject: subject, snippet: body.replace(/\s+/g, ' ').slice(0, 300) });
    }
  }
  return { transactions: transactions, unread: unread.slice(0, 20) };
}

// ----- Shared budget data, so every device sees the same thing -----
// Stored compressed in this script's private storage in your Google account
// (in chunks, because each stored value is limited to ~9 KB).
const STORE = PropertiesService.getUserProperties();

function loadState_() {
  const version = Number(STORE.getProperty('ver') || 0);
  const n = Number(STORE.getProperty('chunks') || 0);
  if (!n) return { version: version, data: null };
  let b64 = '';
  for (let i = 0; i < n; i++) b64 += STORE.getProperty('c' + i) || '';
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip');
  return { version: version, data: Utilities.ungzip(blob).getDataAsString() };
}

// Saves only if nobody else saved since this device last loaded (baseVersion); otherwise returns the newer data to merge.
function saveState_(json, baseVersion) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const current = Number(STORE.getProperty('ver') || 0);
    if (baseVersion !== current) {
      const s = loadState_();
      return { conflict: true, version: s.version, data: s.data };
    }
    const b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes());
    const size = 8000, n = Math.ceil(b64.length / size), props = {};
    for (let i = 0; i < n; i++) props['c' + i] = b64.slice(i * size, (i + 1) * size);
    props.chunks = String(n);
    props.ver = String(current + 1);
    const oldN = Number(STORE.getProperty('chunks') || 0);
    STORE.setProperties(props);
    for (let i = n; i < oldN; i++) STORE.deleteProperty('c' + i);
    return { version: current + 1 };
  } finally {
    lock.releaseLock();
  }
}

// Pull amount, direction and description out of one alert email.
function parseAlert(subject, body, emailDate) {
  // only the alert itself, not the legal footer (footers often mention phone numbers and "at <bank>")
  body = body.split(/View transaction details|Get help & support|Service Email:/i)[0];
  const text = (subject + '\n' + body).replace(/ /g, ' ');
  const amt = text.match(/Amount:\s*\$\s?([\d,]+\.\d{2})/i) || text.match(/\$\s?([\d,]+\.\d{2})/);
  if (!amt) return null;
  const amount = parseFloat(amt[1].replace(/,/g, ''));
  if (!amount) return null;

  const IN = /deposit|credit(?!\s*card)|received|refund/i, OUT = /withdraw|debit|purchase|payment|spent|charge|transaction/i;
  let type = IN.test(subject) ? 'income' : OUT.test(subject) ? 'expense' : IN.test(body) ? 'income' : OUT.test(body) ? 'expense' : null;
  if (!type) return null;

  let desc = '';
  const patterns = [
    /(?:From|To|Description|Merchant|Payee|Transaction Description|Location)\s*:\s*([^\n]+)/i,
    /\bat\s+([A-Z0-9][^\n]{2,40}?)(?:\s+on\s|\s+for\s|\s+(?:was|were|has|is)\s|\.\s|\n|$)/,
    /\b(?:to|from)\s+([A-Z0-9][^\n]{2,40}?)(?:\s+on\s|\s+for\s|\s+(?:was|were|has|is)\s|\.\s|\n|$)/,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) { desc = m[1].trim(); break; } }
  if (!desc) desc = subject.replace(/^[\w .&'-]{2,30}alert:\s*/i, ''); // e.g. "Transfer Received"

  // Use a date written in the email if it's close to when the email arrived
  let date = emailDate;
  const dm = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (dm) {
    const y = dm[3].length === 2 ? '20' + dm[3] : dm[3];
    const iso = y + '-' + ('0' + dm[1]).slice(-2) + '-' + ('0' + dm[2]).slice(-2);
    if (Math.abs(new Date(iso) - new Date(emailDate)) <= 10 * 86400000) date = iso;
  }
  // Last 4 digits of the account, e.g. "account ending in 5678", "x5678", "****5678"
  const am = text.match(/(?:ending(?:\s+in)?|acct\.?|account(?:\s+(?:number|no\.?|#))?)\s*[:#]?\s*[x*•.]*\s*(\d{4})\b/i) || text.match(/[x*•]{2,}\s*(\d{4})\b/i);
  const acct = am ? am[1] : '';
  return { date: date, desc: desc.slice(0, 60), amount: amount, type: type, acct: acct };
}

// ----- Daily job: brings in new bank alerts, then sends the email summaries you turned on -----
// Runs every day around 8 AM, even with all emails off, so alerts are picked up without opening the app.
// Scheduled by setup() (Google doesn't allow scheduling it from the web page).
function dailyJob() {
  const st = loadState_();
  if (!st.data) return;
  S = normalize(JSON.parse(st.data));
  resetCaches();
  const added = importAlerts(getAlertTransactions_(S.bank.lastSync * 1000, S.settings.alertFrom).transactions);
  const mails = dueEmails_();
  if (added || mails.length) {
    S.bank.lastSync = Math.floor(Date.now() / 1000);
    saveFromServer_(st.version);
  }
  mails.forEach(m => sendMail_(m.subject, m.html));
}

function ensureDailyJob() {
  const jobs = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyJob');
  if (!jobs.length) ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(8).create();
  for (let i = 1; i < jobs.length; i++) ScriptApp.deleteTrigger(jobs[i]); // never more than one
  return true;
}

// Email choices are stored with your budget data; the daily job reads them. This just confirms it's scheduled.
function setupEmails_(prefs) {
  try { ensureDailyJob(); } catch (e) { /* already scheduled from the editor */ }
  return { on: !!(prefs && (prefs.weekly || prefs.payday || prefs.limits)) };
}

function sendTestEmail_() {
  const st = loadState_();
  S = normalize(st.data ? JSON.parse(st.data) : null);
  resetCaches();
  const n = budgetNumbers(pIndex(todayISO()));
  sendMail_('Test: ' + $m(n.left) + ' left to spend', summaryHtml_(n, 'This is what your summaries will look like.'));
  return true;
}

// Which emails are due today (each is recorded in S.emailLog so it's only sent once)
function dueEmails_() {
  const e = S.settings.email || {}, log = S.emailLog, today = todayISO(), out = [];
  const n = budgetNumbers(pIndex(today)), p = n.p;
  // payday: within 3 days after this period's payday, once per paycheck
  const paid = S.settings.payMode !== 'auto' || (paydays() || []).includes(p.start);
  if (e.payday && paid && log.payday !== p.start && dn(today) - dn(p.start) <= 3) {
    out.push({ subject: 'Payday: ' + $m(n.left) + ' to spend until ' + pretty(p.end), html: summaryHtml_(n, 'Your new pay period started ' + pretty(p.start) + '.') });
    log.payday = p.start;
  }
  if (e.weekly && new Date().getDay() === 0 && log.weekly !== today) {
    out.push({ subject: 'Weekly budget: ' + $m(n.left) + ' left, ' + n.daysLeft + ' days to payday', html: summaryHtml_(n, 'Your weekly check-in.') });
    log.weekly = today;
  }
  if (e.limits) {
    const sent = log.limits = log.limits || {};
    for (const k of Object.keys(sent)) if (dn(today) - dn(k.slice(0, 10)) > 60) delete sent[k];
    for (const l of limitStatus(p)) {
      const k = p.start + '|' + l.cat;
      if (l.pct >= 1 && !sent[k]) {
        out.push({ subject: l.cat + ' is over its limit: ' + $r(l.spent) + ' of ' + $r(l.limit), html: summaryHtml_(n, '<b>' + escH_(l.cat) + '</b> went over its ' + $r(l.limit) + ' limit for this paycheck.') });
        sent[k] = 1;
      }
    }
  }
  return out;
}

// Save what the job changed; if the app saved in the meantime, combine and try again
function saveFromServer_(version) {
  for (let i = 0; i < 3; i++) {
    const { dirty, syncVer, ...rest } = S;
    const r = saveState_(JSON.stringify(rest), version);
    if (!r.conflict) return;
    S = mergeStates(S, normalize(JSON.parse(r.data)));
    resetCaches();
    version = r.version;
  }
}

function sendMail_(subject, html) {
  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject,
    'Open Stub to see this summary.', { htmlBody: html, name: APP_NAME });
}

const escH_ = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function summaryHtml_(n, intro) {
  const p = n.p, today = todayISO(), over = n.left < 0;
  const row = (l, v) => '<tr><td style="padding:6px 0;color:#52514e">' + l + '</td><td style="padding:6px 0;text-align:right;font-weight:600">' + v + '</td></tr>';
  const section = t => '<h3 style="font-size:15px;margin:22px 0 6px">' + t + '</h3>';
  let h = '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0b0b0b">';
  h += '<p style="color:#52514e;margin:0 0 14px">' + intro + '</p>';
  h += '<div style="background:#f2f2ee;border-radius:14px;padding:16px">';
  h += '<div style="font-size:13px;color:#52514e">' + (over ? 'Over budget by' : 'Left to spend') + ' &middot; ' + pretty(p.start) + ' &ndash; ' + pretty(p.end) + '</div>';
  h += '<div style="font-size:34px;font-weight:750;' + (over ? 'color:#c62f2f' : '') + '">' + $m(Math.abs(n.left)) + '</div>';
  if (n.perDay) h += '<div style="font-size:14px;color:#52514e">About <b>' + $m(n.perDay) + '</b> a day for ' + n.daysLeft + ' days</div>';
  h += '</div><table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:14px">';
  h += row('Income', $m(p.income)) + row('Spent', $m(p.spent)) + row('Recurring', $m(p.billsTotal));
  if (n.goal) h += row(n.spendMode ? 'Spending limit' : 'Savings goal', $m(n.goal));
  h += '</table>';
  // spent in the last 7 days
  const week = p.txs.filter(t => t.type === 'expense' && t.cat !== 'Transfer' && !t.excluded && dn(today) - dn(t.date) < 7);
  if (week.length) h += '<p style="font-size:14px;margin:14px 0 0">Last 7 days: <b>' + $m(week.reduce((a, t) => a + t.amount, 0)) + '</b> across ' + week.length + ' purchase' + (week.length === 1 ? '' : 's') + '.</p>';
  const cats = Object.entries(p.byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (cats.length) h += section('Top categories') + '<table style="width:100%;border-collapse:collapse;font-size:14px">' + cats.map(([c, v]) => row(escH_(c), $m(v))).join('') + '</table>';
  const ls = limitStatus(p);
  if (ls.length) {
    h += section('Category limits');
    h += ls.map(l => '<div style="font-size:14px;margin:8px 0 2px">' + escH_(l.cat) + ': <b>' + $r(l.spent) + '</b> of ' + $r(l.limit)
      + (l.pct >= 1 ? ' <span style="color:#c62f2f;font-weight:600">&middot; over</span>' : l.pct >= .8 ? ' <span style="color:#8a5a00;font-weight:600">&middot; almost there</span>' : '') + '</div>'
      + '<div style="height:8px;background:#ebeae5;border-radius:4px"><div style="height:8px;border-radius:4px;width:' + Math.min(100, Math.round(l.pct * 100)) + '%;background:' + (l.pct >= 1 ? '#c62f2f' : '#2a78d6') + '"></div></div>').join('');
  }
  const due = p.bills.filter(o => !o.tx && o.date >= today && dn(o.date) - dn(today) <= 7);
  if (due.length) h += section('Recurring due this week') + '<table style="width:100%;border-collapse:collapse;font-size:14px">' + due.map(o => row(escH_(o.r.name) + ' &middot; ' + pretty(o.date), $m(o.r.amount))).join('') + '</table>';
  const url = APP_URL;
  if (url) h += '<p style="margin:22px 0 0"><a href="' + url + '" style="background:#2a78d6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;display:inline-block">Open my budget</a></p>';
  h += '<p style="font-size:12px;color:#898781;margin-top:22px">Change or turn off these emails in the app: Settings, then Email summaries.</p></div>';
  return h;
}
