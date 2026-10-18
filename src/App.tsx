import { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { AlertCircle, ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CircleHelp, FileSpreadsheet, Fingerprint, Info, LockKeyhole, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';

type Issue = { row: number; column: string; type: 'error' | 'warning'; message: string; value?: string };
type Parsed = { headers: string[]; rows: string[][]; name: string; bytes: number };
type Filter = 'all' | 'error' | 'warning';

const sample = `first_name,last_name,email,company,phone,lead_source\nMaya,Patel,maya@example.com,Northstar Labs,+1 415 555 0101,Website\nJon,Lee,jon@example.com,Paper Kite,+1 212 555 0183,Referral\nAva,Morris,ava@example.com,Northstar Labs,,Website\nTheo,Grant,theo@not-an-email,Harbor & Pine,+1 415 555 0128,Event\nMaya,Patel,maya@example.com,Northstar Labs,+1 415 555 0101,Website\nIris,Chen,iris@example.com,,+1 646 555 0120,Partner\nLuis,Ramirez,luis@example.com,Fieldnote,+1 312 555 0175,Website\nNoah,Kim,noah@example.com,Paper Kite,+1 212 555 0164,Referral`;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const cell = (s?: string) => (s ?? '').trim();

function analyze(headers: string[], rows: string[][]): Issue[] {
  const issues: Issue[] = [];
  const emailIndex = headers.findIndex((h) => /e-?mail/i.test(h));
  const required = headers.map((h, i) => ({ h, i })).filter(({ h }) => /^(name|first.?name|last.?name|company|account.?name|email|e-?mail)$/i.test(h.trim()));
  const seen = new Map<string, number>();
  const keys = headers.map((h) => normalize(h));
  const duplicatedHeaders = new Set<string>();
  keys.forEach((h, i) => { if (keys.indexOf(h) !== i) duplicatedHeaders.add(headers[i]); });
  duplicatedHeaders.forEach((h) => issues.push({ row: 1, column: h || '(blank header)', type: 'error', message: 'Duplicate column name' }));

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    if (row.every((v) => !cell(v))) return;
    if (row.length !== headers.length) issues.push({ row: rowNumber, column: 'Row structure', type: 'error', message: `Expected ${headers.length} columns, found ${row.length}` });
    required.forEach(({ h, i }) => {
      if (!cell(row[i])) issues.push({ row: rowNumber, column: h, type: 'warning', message: 'Blank value in a likely key field' });
    });
    if (emailIndex >= 0 && cell(row[emailIndex]) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell(row[emailIndex]))) {
      issues.push({ row: rowNumber, column: headers[emailIndex], type: 'error', message: 'Email format looks invalid', value: cell(row[emailIndex]) });
    }
    const fingerprint = row.map(normalize).join('\u001f');
    if (seen.has(fingerprint)) issues.push({ row: rowNumber, column: 'Entire row', type: 'warning', message: `Exact duplicate of row ${seen.get(fingerprint)}` });
    else seen.set(fingerprint, rowNumber);
    if (emailIndex >= 0 && cell(row[emailIndex])) {
      const email = normalize(row[emailIndex]);
      const prior = seen.get(`email:${email}`);
      if (prior) issues.push({ row: rowNumber, column: headers[emailIndex], type: 'warning', message: `Email also appears in row ${prior}`, value: email });
      else seen.set(`email:${email}`, rowNumber);
    }
  });
  return issues;
}

function parseFile(file: File): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (result) => {
        if (result.errors.length) { reject(new Error(result.errors[0].message)); return; }
        const [headerRow, ...data] = result.data;
        const headers = (headerRow ?? []).map((h) => String(h ?? '').trim());
        if (headers.length < 2 || !headers.some(Boolean)) { reject(new Error('This file does not look like a CSV with a header row.')); return; }
        resolve({ headers, rows: data.map((r) => r.map((v) => String(v ?? ''))), name: file.name, bytes: file.size });
      },
      error: (error) => reject(error),
    });
  });
}

const prettyBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

function App() {
  const [data, setData] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const issues = useMemo(() => data ? analyze(data.headers, data.rows) : [], [data]);
  const errors = issues.filter((i) => i.type === 'error').length;
  const warnings = issues.filter((i) => i.type === 'warning').length;
  const filtered = issues.filter((i) => (filter === 'all' || i.type === filter) && `${i.row} ${i.column} ${i.message} ${i.value ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  const load = useCallback(async (file?: File) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { setNotice('Please choose a .csv file.'); return; }
    if (file.size > 20 * 1024 * 1024) { setNotice('This first release supports CSV files up to 20 MB.'); return; }
    setBusy(true); setNotice('');
    try { setData(await parseFile(file)); setFilter('all'); setQuery(''); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Could not read that file.'); }
    finally { setBusy(false); }
  }, []);

  const loadSample = () => {
    const parsed = Papa.parse<string[]>(sample, { skipEmptyLines: 'greedy' }).data;
    const [headers, ...rows] = parsed;
    setData({ headers, rows, name: 'sample-leads.csv', bytes: new Blob([sample]).size });
    setFilter('all'); setQuery(''); setNotice('');
  };

  const exportReport = () => {
    if (!data) return;
    const csv = Papa.unparse([['Severity', 'Row', 'Column', 'Finding', 'Value'], ...issues.map((i) => [i.type, i.row, i.column, i.message, i.value ?? ''])]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${data.name.replace(/\.csv$/i, '')}-preflight.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="Tabcheck home"><span className="brand-mark"><FileSpreadsheet size={19} strokeWidth={2.3}/></span><span>tabcheck</span></a><div className="topbar-right"><span className="local-tag"><span className="pulse"/> LOCAL BY DESIGN</span><a className="about-link" href="#how-it-works">How it works <ArrowUpRight size={14}/></a></div></header>
    <main id="top">
      <section className="hero"><div className="eyebrow"><span className="eyebrow-line"/> CSV IMPORT PREFLIGHT <span className="eyebrow-line"/></div><h1>Catch the messy bits<br/><em>before they land.</em></h1><p className="hero-copy">A quick, calm checkup for your CSV. Find common import problems, review the rows, and decide what to fix—before they reach your CRM.</p><div className="privacy-note"><LockKeyhole size={15}/> Your file stays in this browser. Nothing is uploaded.</div></section>

      {!data ? <section className={`dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void load(e.dataTransfer.files[0]); }}>
        <div className="upload-icon"><Upload size={22}/></div><h2>{busy ? 'Reading your CSV…' : 'Drop your CSV here'}</h2><p>or choose a file from your computer</p><button className="primary-btn" onClick={() => inputRef.current?.click()} disabled={busy}><span>Choose a CSV</span><ArrowUpRight size={16}/></button><input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void load(e.target.files?.[0])}/><div className="file-hint">CSV only <span>·</span> up to 20 MB <span>·</span> never leaves your device</div>{notice && <div className="notice"><AlertCircle size={15}/>{notice}</div>}<button className="sample-link" onClick={loadSample}>Try a sample file <ArrowUpRight size={13}/></button>
      </section> : <section className="results">
        <div className="file-strip"><div className="file-id"><div className="file-icon"><FileSpreadsheet size={18}/></div><div><strong>{data.name}</strong><span>{data.rows.length.toLocaleString()} data rows <i>·</i> {data.headers.length} columns <i>·</i> {prettyBytes(data.bytes)}</span></div></div><div className="file-actions"><button className="icon-button" onClick={() => { setData(null); setNotice(''); }} title="Start over"><X size={17}/><span>New file</span></button><button className="export-btn" onClick={exportReport}><ArrowDownToLine size={16}/> Export findings</button></div></div>
        <div className="summary-head"><div><div className="eyebrow left"><span className="eyebrow-line"/> PREFLIGHT REPORT</div><h2>Here’s what we found.</h2><p className="summary-copy">A quick review of structure and common data issues. Nothing has been changed.</p></div><div className={`status-chip ${issues.length ? 'has-issues' : 'is-clean'}`}>{issues.length ? <><AlertCircle size={15}/> Needs a look</> : <><Check size={15}/> Looking good</>}</div></div>
        <div className="metric-grid"><div className="metric"><div className="metric-label"><span className="metric-dot dot-neutral"/>ROWS CHECKED</div><div className="metric-value">{data.rows.length.toLocaleString()}<span>rows</span></div><div className="metric-foot">One row at a time</div></div><div className="metric"><div className="metric-label"><span className="metric-dot dot-red"/>ERRORS</div><div className="metric-value">{errors.toLocaleString()}<span>{errors === 1 ? 'finding' : 'findings'}</span></div><div className="metric-foot">Worth fixing before import</div></div><div className="metric"><div className="metric-label"><span className="metric-dot dot-amber"/>WARNINGS</div><div className="metric-value">{warnings.toLocaleString()}<span>{warnings === 1 ? 'finding' : 'findings'}</span></div><div className="metric-foot">Review based on your context</div></div></div>
        <div className="findings-head"><div><h3>Findings <span className="count-pill">{issues.length}</span></h3><p>Potential issues only—your rules may differ.</p></div><div className="table-tools"><div className="search-field"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a row or field" aria-label="Search findings"/></div><label className="filter-select"><select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}><option value="all">All findings</option><option value="error">Errors</option><option value="warning">Warnings</option></select><ChevronDown size={14}/></label></div></div>
        {filtered.length ? <div className="table-wrap"><table><thead><tr><th>SEVERITY</th><th>ROW</th><th>FIELD</th><th>WHAT TO CHECK</th><th>VALUE</th></tr></thead><tbody>{filtered.map((issue, idx) => <tr key={`${issue.row}-${issue.column}-${issue.message}-${idx}`}><td><span className={`severity ${issue.type}`}><span/> {issue.type === 'error' ? 'Error' : 'Review'}</span></td><td className="row-num">{issue.row}</td><td className="field-name">{issue.column}</td><td>{issue.message}</td><td className="value-cell">{issue.value || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state">{issues.length === 0 ? <><div className="empty-icon"><ShieldCheck size={22}/></div><strong>No common issues found</strong><span>Your CSV passed these basic checks. Always review your import mapping too.</span></> : <><Search size={18}/><span>No findings match that search.</span></>}</div>}
        <p className="report-foot"><CircleHelp size={14}/> Findings are suggestions—not an import approval. Check your CRM’s required fields and mapping.</p>
      </section>}

      <section className="how-section" id="how-it-works"><div className="section-top"><div><div className="eyebrow left"><span className="eyebrow-line"/> A LITTLE PEACE OF MIND</div><h2>Three checks. Zero surprises.</h2></div><p>Tabcheck looks for common CSV snags. It doesn’t edit, clean, or upload your data.</p></div><div className="feature-grid"><article><span className="feature-index">01</span><div className="feature-icon peach"><Fingerprint size={19}/></div><h3>Duplicate patterns</h3><p>Spot exact duplicate rows and repeated email addresses worth reviewing.</p></article><article><span className="feature-index">02</span><div className="feature-icon lavender"><Check size={19}/></div><h3>Required-field gaps</h3><p>Catch blanks in likely key fields like names, companies, and email addresses.</p></article><article><span className="feature-index">03</span><div className="feature-icon mint"><Info size={19}/></div><h3>Shape &amp; format</h3><p>Find uneven row lengths and email values that don’t look like email addresses.</p></article></div></section>

      <section className="closing"><div className="closing-icon"><Sparkles size={17}/></div><div><strong>A preflight, not a verdict.</strong><span>Different CRMs have different rules. Tabcheck helps you review—not decide for you.</span></div><button onClick={() => { if (!data) loadSample(); else window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{data ? 'Back to report' : 'Try it with a sample'} <ArrowUpRight size={15}/></button></section>
    </main>
    <footer><a className="footer-brand" href="#top">tabcheck<span>®</span></a><span>Private by design. Made for the careful import.</span><a href="#how-it-works">How it works <ArrowUpRight size={12}/></a></footer>
  </div>;
}

export default App;
