import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  Clock3,
  Database,
  ExternalLink,
  Filter,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { api } from './api.js';

const DeadlineChart = lazy(() => import('./DeadlineChart.jsx'));

const pages = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'explorer', label: 'Explore awards', icon: Search },
  { id: 'alerts', label: 'Alerts & updates', icon: Bell },
  { id: 'admin', label: 'Source monitor', icon: Database }
];

const emptyDashboard = {
  stats: { total: 0, upcoming: 0, closingSoon: 0, updated: 0, unknownDeadlines: 0 },
  deadlines: [], notices: [], recentAlerts: [], lastSuccessfulRefresh: null, freshness: 'loading'
};

function formatDeadline(iso, timezone = 'UTC') {
  if (!iso) return 'Deadline not confirmed';
  try {
    return `${formatInTimeZone(new Date(iso), timezone, 'MMM d, yyyy')} · ${timezone}`;
  } catch {
    return `${format(new Date(iso), 'MMM d, yyyy')} · ${timezone}`;
  }
}

function countdown(iso) {
  if (!iso) return 'Date unknown';
  const date = new Date(iso);
  if (isPast(date)) return 'Deadline passed';
  return formatDistanceToNow(date, { addSuffix: false });
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [admin, setAdmin] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ level: '', programme: '', category: '', discipline: '', region: '', source: '', status: '', from: '', to: '', sort: 'deadline' });
  const [filterOptions, setFilterOptions] = useState({ level: [], programme: [], category: [], discipline: [], region: [], sources: [] });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  async function loadWorkspace() {
    setBusy(true);
    setError('');
    try {
      const [summary, scholarships, alertRows, monitor, scholarshipFilters] = await Promise.all([
        api.dashboard(), api.scholarships(), api.alerts(), api.adminStatus(), api.scholarshipFilters()
      ]);
      setDashboard(summary);
      setItems(scholarships);
      setAlerts(alertRows);
      setAdmin(monitor);
      setFilterOptions(scholarshipFilters);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadWorkspace(); }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPage('explorer');
        setTimeout(() => document.getElementById('explorer-search')?.focus(), 0);
      } else if (event.key === 'Escape') {
        setSelected(null);
        setMobileMenu(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (page !== 'explorer') return undefined;
    const timer = setTimeout(async () => {
      try {
        const results = await api.scholarships({ q: query, ...filters });
        setItems(results);
      } catch (requestError) {
        setError(requestError.message);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [page, query, filters]);

  useEffect(() => {
    if (!selected) return undefined;
    let cancelled = false;
    api.scholarship(selected.notice_id)
      .then((details) => { if (!cancelled) setSelected(details); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [selected?.notice_id]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    try {
      const result = await api.refresh();
      setNotice(result.message);
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRetry(sourceId) {
    try {
      const result = await api.retrySource(sourceId);
      setNotice(result.message);
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleAddSource(source) {
    await api.addSource(source);
    setNotice('Approved source added. It has not been contacted.');
    await loadWorkspace();
  }

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMobileMenu(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); navigate('dashboard'); }}>
          <span className="brand-mark"><GraduationCap size={22} strokeWidth={2.4} /></span>
          <span className="brand-copy"><strong>scholartrack</strong><small>FUNDING, IN FOCUS</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {pages.map(({ id, label, icon: Icon }) => (
            <button className={`nav-link ${page === id ? 'nav-link-active' : ''}`} key={id} onClick={() => navigate(id)}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {id === 'alerts' && alerts.length > 0 && <span className="nav-count">{alerts.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note-icon"><ShieldCheck size={17} /></div>
          <div><strong>Source-first, always</strong><p>Every opportunity links back to its original notice.</p></div>
          <span className="sidebar-rule" />
          <div className="user-row">
            <div className="avatar">ST</div>
            <div className="user-copy"><strong>Student workspace</strong><span>Personal tracker</span></div>
            <ChevronDown size={16} />
          </div>
        </div>
      </aside>

      {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{pages.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-actions">
            <button className="top-search" onClick={() => { navigate('explorer'); setTimeout(() => document.getElementById('explorer-search')?.focus(), 0); }}>
              <Search size={16} /><span>Search opportunities</span><kbd>Ctrl K</kbd>
            </button>
            <button className="icon-button notification-button" aria-label="View alerts" onClick={() => navigate('alerts')}>
              <Bell size={18} />{alerts.length > 0 && <span className="notification-dot" />}
            </button>
            <div className="top-avatar">S</div>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="message-banner message-error"><ShieldAlert size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
          {notice && <div className="message-banner message-success"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}
          {busy && !items.length && <div className="loading-strip"><LoaderCircle className="spin" size={17} /> Connecting to your workspace</div>}

          {page === 'dashboard' && <Dashboard dashboard={dashboard} onSelect={setSelected} onExplore={() => navigate('explorer')} onAlerts={() => navigate('alerts')} />}
          {page === 'explorer' && (
            <Explorer
              items={items}
              query={query}
              setQuery={setQuery}
              filters={filters}
              filterOptions={filterOptions}
              updateFilter={updateFilter}
              clearFilters={() => setFilters({ level: '', programme: '', category: '', discipline: '', region: '', source: '', status: '', from: '', to: '', sort: 'deadline' })}
              onSelect={setSelected}
              busy={busy}
            />
          )}
          {page === 'alerts' && <AlertsPage alerts={alerts} onSelect={setSelected} />}
          {page === 'admin' && <AdminPage admin={admin} refreshing={refreshing} onRefresh={handleRefresh} onRetry={handleRetry} onAddSource={handleAddSource} />}
        </div>
      </main>

      {selected && <DetailsDrawer item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>
      {action}
    </div>
  );
}

function Dashboard({ dashboard, onSelect, onExplore, onAlerts }) {
  const { stats } = dashboard;
  const chartData = dashboard.deadlines.map((item) => ({
    name: item.title.length > 18 ? `${item.title.slice(0, 16)}…` : item.title,
    days: Math.max(0, Math.ceil((new Date(item.due_at) - Date.now()) / 86400000)),
    isDemo: Boolean(item.is_demo)
  }));
  const statCards = [
    { label: 'Active opportunities', value: stats.total, icon: BookOpenCheck, color: 'cyan', note: 'Across all study levels' },
    { label: 'Deadlines ahead', value: stats.upcoming, icon: CalendarRange, color: 'blue', note: 'Next 60 days' },
    { label: 'Closing soon', value: stats.closingSoon, icon: Clock3, color: 'amber', note: 'Within 14 days' },
    { label: 'Updated notices', value: stats.updated, icon: RefreshCw, color: 'coral', note: 'New or revised from source' }
  ];

  return (
    <>
      <PageHeading
        eyebrow={`${format(new Date(), 'EEEE, MMMM d').toUpperCase()} · YOUR FUNDING DESK`}
        title="Your next opportunity, in view."
        subtitle="A clear view of funding notices, verified dates, and what needs your attention."
        action={<button className="button-primary" onClick={onExplore}><Search size={16} /> Explore awards</button>}
      />
      <div className="data-notice"><span className="demo-pip" /> Demo workspace <span className="notice-divider">/</span> Sample records are illustrative, not live or verified.</div>

      <section className="stats-grid" aria-label="Scholarship summary">
        {statCards.map(({ label, value, icon: Icon, color, note }) => (
          <article className="stat-card" key={label}>
            <div className={`stat-icon stat-${color}`}><Icon size={19} /></div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value ?? 0}</div>
            <div className="stat-note">{note}</div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel deadline-panel">
          <div className="panel-heading">
            <div><div className="section-kicker">THE NEXT 60 DAYS</div><h2>Deadline runway</h2></div>
            <button className="text-action" onClick={onExplore}>All opportunities <ArrowUpRight size={15} /></button>
          </div>
          {chartData.length ? (
            <div className="chart-wrap" aria-label="Days until upcoming deadlines">
              <Suspense fallback={<div className="chart-loading">Loading deadline timeline…</div>}>
                <DeadlineChart data={chartData} />
              </Suspense>
            </div>
          ) : <EmptyState icon={CalendarDays} title="No upcoming deadlines" detail="New dates will appear here when they are available." />}
          <div className="chart-footnote"><span className="chart-legend" /> Days until deadline <span>Unknown dates are never plotted.</span></div>
        </article>

        <article className="panel activity-panel">
          <div className="panel-heading">
            <div><div className="section-kicker">SOURCE ACTIVITY</div><h2>Recent updates</h2></div>
            <button className="icon-button panel-icon-button" aria-label="View all alerts" onClick={onAlerts}><ArrowUpRight size={17} /></button>
          </div>
          {dashboard.recentAlerts.length ? (
            <div className="activity-list">
              {dashboard.recentAlerts.map((alert) => <ActivityRow key={alert.alert_id} alert={alert} onSelect={onSelect} />)}
            </div>
          ) : (
            <EmptyState icon={Sparkles} title="A quiet activity feed" detail="Collected notices and meaningful changes will show up here." />
          )}
          <div className="freshness-block">
            <div className="freshness-icon"><RefreshCw size={16} /></div>
            <div><strong>{dashboard.lastSuccessfulRefresh ? 'Last source check' : 'No source checks yet'}</strong><span>{dashboard.lastSuccessfulRefresh ? `${formatDistanceToNow(new Date(dashboard.lastSuccessfulRefresh), { addSuffix: true })} · ${dashboard.freshness}` : 'This workspace is showing demo records only.'}</span></div>
          </div>
        </article>
      </section>

      <section className="panel opportunities-panel">
        <div className="panel-heading">
          <div><div className="section-kicker">A GOOD PLACE TO START</div><h2>Opportunities to explore</h2></div>
          <button className="text-action" onClick={onExplore}>Browse all <ArrowUpRight size={15} /></button>
        </div>
        {dashboard.notices.length ? (
          <div className="opportunity-grid">
            {dashboard.notices.slice(0, 3).map((item) => <OpportunityCard item={item} key={item.notice_id} onSelect={onSelect} />)}
          </div>
        ) : <EmptyState icon={BookOpenCheck} title="No opportunities yet" detail="Notices will appear here after sources are approved and collected." />}
      </section>
      <div className="dashboard-footer"><span><ShieldCheck size={15} /> Eligibility summaries are keywords, not eligibility decisions.</span><span>Last successful refresh: {dashboard.lastSuccessfulRefresh ? format(new Date(dashboard.lastSuccessfulRefresh), 'MMM d, h:mm a') : 'Not yet available'}</span></div>
    </>
  );
}

function ActivityRow({ alert, onSelect }) {
  const label = {
    new_notice: 'New notice',
    deadline_revised: 'Deadline revised',
    withdrawn: 'Notice withdrawn',
    deadline_approaching: 'Deadline approaching'
  }[alert.alert_type] || 'Update';
  return (
    <button className="activity-row" onClick={() => alert.notice_id && onSelect({ notice_id: alert.notice_id })}>
      <span className={`activity-marker marker-${alert.alert_type}`}><Sparkles size={14} /></span>
      <span className="activity-copy"><strong>{alert.title || label}</strong><span>{label} <i>·</i> {alert.is_demo ? 'Demo record' : 'Source update'}</span></span>
      <span className="activity-time">{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</span>
    </button>
  );
}

function OpportunityCard({ item, onSelect }) {
  const urgent = item.due_at && (new Date(item.due_at) - Date.now()) / 86400000 <= 14;
  return (
    <article className="opportunity-card">
      <div className="opportunity-card-top"><span className="level-tag">{item.education_level || 'All levels'}</span>{item.is_demo && <span className="demo-label">DEMO</span>}</div>
      <button className="opportunity-title" onClick={() => onSelect(item)}>{item.title}</button>
      <div className="provider-line">{item.provider}</div>
      <p>{item.benefit_text || 'Benefit details are not available.'}</p>
      <div className="opportunity-meta"><span><CalendarDays size={14} />{item.due_at ? formatDeadline(item.due_at, item.timezone) : 'Deadline unknown'}</span><span className={`status-pill ${urgent ? 'status-urgent' : 'status-open'}`}>{item.due_at ? countdown(item.due_at) : 'Unconfirmed'}</span></div>
      <button className="card-open" onClick={() => onSelect(item)}>View details <ArrowUpRight size={14} /></button>
    </article>
  );
}

function Explorer({ items, query, setQuery, filters, filterOptions, updateFilter, clearFilters, onSelect, busy }) {
  const [showFilters, setShowFilters] = useState(false);
  const select = (label, key, values) => (
    <label className="filter-control" key={key}><span>{label}</span><select value={filters[key]} onChange={(event) => updateFilter(key, event.target.value)}><option value="">All {label.toLowerCase()}</option>{values.map((value) => <option key={value}>{value}</option>)}</select></label>
  );

  return (
    <>
      <PageHeading eyebrow="FIND YOUR NEXT STEP" title="Explore opportunities" subtitle="Search public notices and compare the details that matter to you." />
      <div className="explorer-toolbar">
        <label className="explorer-search"><Search size={18} /><input id="explorer-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by award or provider" /><kbd>/</kbd></label>
        <button className={`button-secondary ${showFilters ? 'button-secondary-active' : ''}`} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={16} /> Filters <span className="filter-count">{Object.entries(filters).filter(([key, value]) => key !== 'sort' && value).length}</span></button>
        <label className="sort-control"><ArrowDownWideNarrow size={16} /><select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="deadline">Deadline</option><option value="updated">Recently updated</option><option value="title">Title A–Z</option></select></label>
      </div>
      {showFilters && <div className="filter-drawer">
        {select('Study level', 'level', filterOptions.level)}
        {select('Programme', 'programme', filterOptions.programme)}
        {select('Funding category', 'category', filterOptions.category)}
        {select('Discipline', 'discipline', filterOptions.discipline)}
        {select('Region', 'region', filterOptions.region)}
        <label className="filter-control"><span>Scholarship source</span><select value={filters.source} onChange={(event) => updateFilter('source', event.target.value)}><option value="">All sources</option>{filterOptions.sources.map((source) => <option value={source.source_id} key={source.source_id}>{source.name}</option>)}</select></label>
        <label className="filter-control"><span>Notice status</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All notices</option><option value="active">Active</option><option value="unknown">Deadline unknown</option><option value="closed">Closed</option><option value="withdrawn">Withdrawn</option></select></label>
        <label className="filter-control"><span>Deadline from</span><input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
        <label className="filter-control"><span>Deadline to</span><input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
        <button className="button-secondary filter-reset" onClick={clearFilters}>Clear filters</button>
      </div>}
      <div className="results-summary"><span>{busy ? 'Updating results…' : `${items.length} ${items.length === 1 ? 'opportunity' : 'opportunities'}`}</span><span>Each listing links to its source record</span></div>
      {items.length ? <div className="explorer-grid">{items.map((item) => <OpportunityCard key={item.notice_id} item={item} onSelect={onSelect} />)}</div> : <EmptyState icon={Filter} title="No matching opportunities" detail="Try a different search or remove one of the filters." />}
    </>
  );
}

function AlertsPage({ alerts, onSelect }) {
  return (
    <>
      <PageHeading eyebrow="CHANGES WORTH KNOWING" title="Alerts & updates" subtitle="New notices, approaching deadlines, revisions, and withdrawals from tracked sources." />
      <div className="alert-summary"><div className="alert-summary-icon"><Bell size={19} /></div><div><strong>{alerts.length} tracked updates</strong><span>Duplicate revisions are grouped by notice and meaningful deadline change.</span></div><span className="summary-status"><span /> {alerts.some((item) => !item.is_demo) ? 'Source updates' : 'Demo workspace'}</span></div>
      {alerts.length ? <div className="alert-feed">{alerts.map((alert) => <AlertCard alert={alert} key={alert.alert_id} onSelect={onSelect} />)}</div> : <EmptyState icon={Bell} title="No updates to review" detail="When a source adds a notice or changes a deadline, it will appear here with its verification state." />}
      <div className="uncertainty-note"><ShieldCheck size={17} /><span><strong>Keep the source in view.</strong> Alerts reflect changes observed in public notices; always confirm application details with the provider.</span></div>
    </>
  );
}

function AlertCard({ alert, onSelect }) {
  const status = alert.is_demo ? 'Demo only' : alert.source_approved ? 'Source approved' : 'Needs verification';
  const icon = alert.alert_type === 'withdrawn' ? ShieldAlert : alert.alert_type === 'deadline_revised' ? CalendarDays : Sparkles;
  const Icon = icon;
  return (
    <article className="alert-card">
      <div className={`alert-icon alert-${alert.alert_type}`}><Icon size={18} /></div>
      <div className="alert-body"><div className="alert-overline">{alert.alert_type.replaceAll('_', ' ')} <span>·</span> {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</div><button className="alert-title" onClick={() => alert.notice_id && onSelect({ notice_id: alert.notice_id })}>{alert.title || 'Scholarship notice'}</button><p>{alert.message}</p><div className="alert-bottom"><span className={alert.is_demo ? 'verification-demo' : 'verification-state'}>{alert.is_demo ? <Sparkles size={13} /> : <ShieldCheck size={13} />}{status}</span><a href={alert.url || '#'} target="_blank" rel="noreferrer" onClick={(event) => { if (alert.is_demo) event.preventDefault(); }}>Source record <ExternalLink size={13} /></a></div></div>
    </article>
  );
}

function AdminPage({ admin, refreshing, onRefresh, onRetry, onAddSource }) {
  const sources = admin?.sources || [];
  const runs = admin?.runs || [];
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [sourceError, setSourceError] = useState('');

  async function submitSource(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let selectors = {};
    try {
      selectors = form.get('selectors') ? JSON.parse(form.get('selectors')) : {};
      if (!selectors || typeof selectors !== 'object' || Array.isArray(selectors)) throw new Error();
    } catch {
      setSourceError('Selectors must be a valid JSON object.');
      return;
    }
    try {
      await onAddSource({
        name: form.get('name'),
        url: form.get('url'),
        adapterKey: form.get('adapterKey'),
        selectors,
        approvalConfirmed: form.get('rightsReviewed') === 'on'
      });
      formElement.reset();
      setShowSourceForm(false);
      setSourceError('');
    } catch (requestError) {
      setSourceError(requestError.message);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="COLLECTION HEALTH & SOURCE RIGHTS"
        title="Source monitor"
        subtitle="Review approved sources, collection attempts, and data freshness."
        action={<button className="button-primary" disabled={refreshing} onClick={onRefresh}>{refreshing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{refreshing ? 'Checking…' : 'Run refresh'}</button>}
      />
      <div className={`collection-state ${admin?.publicScrapingEnabled ? 'collection-enabled' : ''}`}><div className="collection-state-icon">{admin?.publicScrapingEnabled ? <ShieldCheck size={19} /> : <ShieldAlert size={19} />}</div><div><strong>{admin?.publicScrapingEnabled ? 'Public collection enabled' : 'Public collection disabled'}</strong><span>{admin?.publicScrapingEnabled ? 'Only approved, non-demo sources are eligible for collection.' : 'Manual refresh records a skipped run. Demo records remain unchanged.'}</span></div><span className="collection-state-tag">{admin?.publicScrapingEnabled ? 'CONFIGURED' : 'SAFE MODE'}</span></div>
      <div className="admin-stats"><div><span>Approved sources</span><strong>{sources.filter((source) => source.approved && !source.is_demo).length}</strong></div><div><span>Failed attempts</span><strong>{admin?.failedCount || 0}</strong></div><div><span>Last successful refresh</span><strong className="admin-date">{admin?.lastSuccessfulRefresh ? formatDistanceToNow(new Date(admin.lastSuccessfulRefresh), { addSuffix: true }) : 'Never'}</strong></div></div>
      <section className="panel source-panel"><div className="panel-heading"><div><div className="section-kicker">SOURCE REGISTER</div><h2>Configured sources</h2></div><div className="source-panel-actions"><span className="source-count">{sources.length} records</span><button className="button-secondary" onClick={() => setShowSourceForm((value) => !value)}>{showSourceForm ? 'Cancel' : 'Add source'}</button></div></div>
        {showSourceForm && <form className="source-form" onSubmit={submitSource}>
          <div className="source-form-grid">
            <label className="filter-control"><span>Source name</span><input name="name" required maxLength="120" placeholder="Official funding office" /></label>
            <label className="filter-control"><span>Official HTTPS URL</span><input name="url" type="url" required placeholder="https://example.edu/funding" /></label>
            <label className="filter-control"><span>Adapter</span><select name="adapterKey"><option value="html-notices">HTML notice list</option><option value="rss-notices">RSS / Atom feed</option><option value="nsp-schemes">National Scholarship Portal (public schemes)</option></select></label>
            <label className="filter-control source-selectors"><span>CSS selectors (optional for RSS and NSP)</span><textarea name="selectors" rows="3" placeholder={'{"item":".notice","title":".title","link":"a","deadline":"time.deadline"}'} /></label>
          </div>
          <label className="rights-confirmation"><input name="rightsReviewed" type="checkbox" required /><span>I reviewed this site's terms, robots.txt, rate limits, and access permissions for this URL.</span></label>
          {sourceError && <p className="source-form-error">{sourceError}</p>}
          <div className="source-form-footer"><span>Registering a source will not contact it. For NSP use https://scholarships.gov.in/All-Scholarships. Collection requires ENABLE_PUBLIC_SCRAPING=true.</span><button className="button-primary" type="submit">Approve and add source</button></div>
        </form>}
        <div className="source-list">{sources.map((source) => <div className="source-row" key={source.source_id}><div className={`source-symbol ${source.is_demo ? 'source-symbol-demo' : ''}`}>{source.is_demo ? <Sparkles size={17} /> : <Database size={17} />}</div><div className="source-info"><strong>{source.name}</strong><span>{source.url}</span></div><span className={`source-status ${source.approved ? 'source-approved' : source.is_demo ? 'source-demo' : 'source-unapproved'}`}><i />{source.approved ? 'Approved' : source.is_demo ? 'Demo only' : 'Not approved'}</span><span className="adapter-status">{source.adapter_status.replaceAll('_', ' ')}</span>{!source.is_demo && <button className="icon-button retry-button" aria-label={`Retry ${source.name}`} disabled={!source.approved} onClick={() => onRetry(source.source_id)}><RefreshCw size={15} /></button>}</div>)}</div>
      </section>
      <section className="panel run-panel"><div className="panel-heading"><div><div className="section-kicker">DIAGNOSTICS</div><h2>Collection history</h2></div></div>
        {runs.length ? <div className="run-table-wrap"><table className="run-table"><thead><tr><th>Started</th><th>Source</th><th>Result</th><th>Records</th><th>Details</th></tr></thead><tbody>{runs.map((run) => <tr key={run.run_id}><td>{format(new Date(run.started_at), 'MMM d, yyyy · h:mm a')}</td><td>{run.source_name || 'All approved sources'}</td><td><span className={`run-status run-${run.status}`}>{run.status}</span></td><td>{run.records_seen}</td><td>{run.error_message || (run.records_changed ? `${run.records_changed} changed` : '—')}</td></tr>)}</tbody></table></div> : <EmptyState icon={RefreshCw} title="No collection attempts yet" detail="A refresh attempt and its outcome will be recorded here." />}
      </section>
      <p className="admin-footnote"><ShieldCheck size={15} /> Source approval requires a rights and robots.txt review. Do not enable a source until its permission and crawl policy are documented.</p>
    </>
  );
}

function DetailsDrawer({ item, onClose }) {
  if (!item) return null;
  const isDemo = Boolean(item.is_demo);
  return (
    <div className="drawer-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="details-drawer" role="dialog" aria-modal="true" aria-label="Scholarship details">
        <div className="drawer-top"><span className="drawer-kicker">OPPORTUNITY DETAILS</span><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={19} /></button></div>
        <div className="drawer-content">
          <div className="drawer-badges"><span className="level-tag">{item.education_level || 'All levels'}</span><span className={isDemo ? 'demo-label' : 'verified-label'}>{isDemo ? 'DEMO RECORD' : item.verified_at ? 'SOURCE CHECKED' : 'NOT VERIFIED'}</span></div>
          <h2>{item.title || 'Loading notice…'}</h2>
          <div className="drawer-provider">{item.provider || item.source_name || 'Provider not stated'}</div>
          {isDemo && <div className="detail-demo-note"><Sparkles size={15} /> Illustrative demo data. This is not a live opportunity; details are not verified.</div>}
          <div className="deadline-callout"><span><CalendarDays size={16} /> APPLICATION DEADLINE</span><strong>{formatDeadline(item.due_at, item.timezone)}</strong><small>{item.due_at ? `${countdown(item.due_at)} remaining` : 'The source has not provided a confirmed date.'}</small></div>
          <div className="detail-section"><h3>Funding & programme</h3><p>{item.benefit_text || 'Benefit details have not been provided.'}</p><div className="detail-pills"><span><GraduationCap size={14} />{item.programme || item.education_level || 'Programme not stated'}</span><span><MapPin size={14} />{item.region || 'Region not stated'}</span></div></div>
          <div className="detail-section"><h3>Eligibility notes</h3><p>{item.eligibility_excerpt || 'Eligibility details have not been provided.'}</p><p className="muted-detail">{item.residency_rule || 'Residency rules not stated.'} Keyword summaries do not determine eligibility.</p></div>
          <div className="detail-section verification-section"><h3>Verification & source</h3><div className="verification-line"><span>Verification status</span><strong>{isDemo ? 'Demo only' : item.verified_at ? 'Source checked' : 'Not verified'}</strong></div><div className="verification-line"><span>Timezone</span><strong>{item.timezone || 'Not stated'}</strong></div><div className="verification-line"><span>Captured</span><strong>{item.captured_at ? format(new Date(item.captured_at), 'MMM d, yyyy') : 'Not available'}</strong></div><div className="verification-line"><span>Last verified</span><strong>{item.verified_at ? format(new Date(item.verified_at), 'MMM d, yyyy') : 'Not verified'}</strong></div>{!isDemo && <a className="source-link-button" href={item.url} target="_blank" rel="noreferrer">Open official announcement <ExternalLink size={15} /></a>}</div>
          <div className="detail-section"><h3>Deadline history</h3>{item.history?.length ? <div className="history-list">{item.history.map((change) => <div className="history-item" key={change.change_id}><span className="history-point" /><div><strong>{change.change_type.replaceAll('_', ' ')}</strong><p>{change.previous_deadline ? formatDeadline(change.previous_deadline, item.timezone) : 'No previous date'} <ArrowUpRight size={12} /> {change.updated_deadline ? formatDeadline(change.updated_deadline, item.timezone) : 'No new date'}</p><small>{format(new Date(change.captured_at), 'MMM d, yyyy · h:mm a')}</small></div></div>)}</div> : <div className="history-empty">No recorded deadline revisions.</div>}</div>
        </div>
      </aside>
    </div>
  );
}

function EmptyState({ icon: Icon, title, detail }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={19} /></div><strong>{title}</strong><span>{detail}</span></div>;
}

export default App;