import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const EMAIL_PATTERN = /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/;
const MAX_RECIPIENTS = 100;
const EMPTY_MESSAGE = { recipients: '', subject: '', body: '' };
const STATUS_LABELS = {
  sent: 'Sent',
  sending: 'Sending',
  partial: 'Partial',
  failed: 'Failed',
  previewed: 'Preview',
  interrupted: 'Interrupted',
};
const TEMPLATES = [
  {
    name: 'A warm welcome',
    subject: 'A little hello from our team',
    body: "Hi there,\n\nWe're so glad you're here! Thanks for being a part of our community.\n\nWe'll be sharing helpful updates, fresh ideas, and a little inspiration along the way.\n\nHave a wonderful day,\nThe team",
  },
  {
    name: 'An exciting update',
    subject: 'Something new, just for you',
    body: "Hi there,\n\nWe've been working on something exciting, and we wanted you to be the first to hear about it.\n\nHere's what's new:\n\n[Share your update here]\n\nThanks for being part of the journey,\nThe team",
  },
  {
    name: 'An event invitation',
    subject: "You're invited! Let's get together",
    body: "Hi there,\n\nWe'd love for you to join us at our upcoming event.\n\nWhen: [Date and time]\nWhere: [Location or meeting link]\n\n[Add a few details about the event]\n\nHope to see you there,\nThe team",
  },
];

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function getInitialMessage() {
  const saved = readStorage('postroom.composer', EMPTY_MESSAGE);
  return saved && ['recipients', 'subject', 'body'].every((key) => typeof saved[key] === 'string')
    ? saved
    : EMPTY_MESSAGE;
}
function parseRecipients(value) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
function isEmail(value) {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}
function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
function getView() {
  return ['compose', 'history', 'drafts', 'settings'].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'compose';
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      'The API returned an unexpected response. Make sure the backend is running on port 5000.',
    );
  }
  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong. Please try again.');
    error.fields = data.errors;
    throw error;
  }
  return data;
}

function Icon({ name, size = 20, ...props }) {
  const paths = {
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    compose: (
      <>
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="m16 3 5 5M9 15l4-1L22 5l-4-4-9 9Z" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    draft: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3 1-1h4l1 3 3 1 3 1v4l-2 2-1 3 1 3-3 2-3-1-3 1-2 2-4-2v-3l-2-3-2-1V9l3-1 2-2Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.2 9a3 3 0 0 1 5.6 1c0 2-3 2-3 4M12 17h.01" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    down: <path d="m6 9 6 6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </>
    ),
    save: (
      <>
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" />
        <path d="M7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
        <path d="m20 1 .8 2.2L23 4l-2.2.8L20 7l-.8-2.2L17 4l2.2-.8Z" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7a9 9 0 0 0-15-2L2 8m0-6v6h6M4 17a9 9 0 0 0 15 2l3-3m0 6v-6h-6" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    leaf: (
      <>
        <path d="M20 3C7 1 2 7 5 15c7 6 16 0 15-12Z" />
        <path d="m3 21 12-12" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.mail}
    </svg>
  );
}

function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">POSTROOM</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function EmailPreview({ message, sender, onClose }) {
  const recipients = Array.isArray(message.recipients)
    ? message.recipients
    : parseRecipients(message.recipients);
  return (
    <Modal title="A peek into the inbox" onClose={onClose} wide>
      <div className="email-preview">
        <div className="email-preview-subject">{message.subject || 'Your subject goes here'}</div>
        <div className="preview-sender">
          <div className="avatar-brand">
            <Icon name="leaf" />
          </div>
          <div>
            <strong>{sender || 'Postroom <hello@example.com>'}</strong>
            <p>To: {recipients.join(', ') || 'your recipients'}</p>
          </div>
        </div>
        <div className="preview-body">
          {message.body || 'Your message will appear here. Make it a good one.'}
        </div>
      </div>
      <p className="modal-footnote">
        <Icon name="info" size={16} /> Each recipient receives their own email. Other addresses stay
        private.
      </p>
    </Modal>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function History({ refreshKey, onDetail, onCompose }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ records: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      api(`/emails?${new URLSearchParams({ search, status, page, limit: 8 })}`, {
        signal: controller.signal,
      })
        .then(setResult)
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, status, page, refreshKey, reload]);
  useEffect(() => {
    if (!result.records.some((record) => record.status === 'sending')) return;
    const timer = setInterval(() => setReload((value) => value + 1), 10000);
    return () => clearInterval(timer);
  }, [result]);
  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <div>
          <h2>Your outbox, at a glance</h2>
          <p>Every message has a story. Here’s yours.</p>
        </div>
        <button
          className="button secondary small"
          onClick={() => setReload((value) => value + 1)}
          aria-label="Refresh email history"
        >
          <Icon name="refresh" size={16} />
          Refresh
        </button>
      </div>
      <div className="history-controls">
        <label className="search-input">
          <Icon name="search" size={18} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search subject or recipient…"
            aria-label="Search email history"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="info" size={28} />
          </div>
          <h3>Let’s connect your database</h3>
          <p>{error}</p>
          <a href="#settings" className="button secondary">
            Open setup guide
            <Icon name="arrow" size={16} />
          </a>
        </div>
      ) : loading ? (
        <div className="empty-state" role="status">
          <span className="spinner" />
          <p>Opening your outbox…</p>
        </div>
      ) : !result.records.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="mail" size={30} />
          </div>
          <h3>{search || status ? 'No matching messages' : 'Your first hello starts here'}</h3>
          <p>
            {search || status
              ? 'Try another search or choose a different status.'
              : 'Sent emails and saved previews will appear here.'}
          </p>
          {!search && !status && (
            <button className="button primary" onClick={onCompose}>
              Compose an email
              <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CAMPAIGN</th>
                  <th>RECIPIENTS</th>
                  <th>STATUS</th>
                  <th>CREATED</th>
                  <th>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.records.map((record) => (
                  <tr key={record._id}>
                    <td>
                      <button className="table-subject" onClick={() => onDetail(record._id)}>
                        <span className="table-mail">
                          <Icon name="mail" size={18} />
                        </span>
                        <span>
                          {record.subject}
                          <small>
                            {record.sentCount} sent
                            {record.failedCount > 0 ? ` · ${record.failedCount} failed` : ''}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {record.recipients.length}{' '}
                      {record.recipients.length === 1 ? 'person' : 'people'}
                    </td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="date-cell">{formatDate(record.createdAt)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`View ${record.subject}`}
                        onClick={() => onDetail(record._id)}
                      >
                        <Icon name="chevron" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {result.total} {result.total === 1 ? 'campaign' : 'campaigns'}
            </span>
            <div>
              <button
                className="button secondary small"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                {page} / {result.pages || 1}
              </span>
              <button
                className="button secondary small"
                disabled={page >= result.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Settings({ health, onRefresh }) {
  return (
    <div className="settings-grid">
      <section className="panel setup-panel">
        <div className="panel-title">
          <div>
            <h2>A few things behind the scenes</h2>
            <p>Connect once. Send something lovely.</p>
          </div>
          <Icon name="settings" />
        </div>
        <div className="setup-step">
          <span>1</span>
          <div>
            <h3>Start your MongoDB database</h3>
            <p>Use a local MongoDB instance, MongoDB Atlas, or the included Docker setup.</p>
            <code>docker compose up -d</code>
            <p>
              Set <code>MONGODB_URI</code> in <code>backend/.env</code> to your connection string.
            </p>
          </div>
        </div>
        <div className="setup-step">
          <span>2</span>
          <div>
            <h3>Try preview mode first</h3>
            <p>
              Copy <code>backend/.env.example</code> to <code>backend/.env</code>. Preview mode
              saves records without sending real email.
            </p>
            <code>MAIL_MODE=preview</code>
          </div>
        </div>
        <div className="setup-step">
          <span>3</span>
          <div>
            <h3>Connect your email provider</h3>
            <p>
              For real email, set the variables below in <code>backend/.env</code>, then restart the
              backend. For Gmail, use an App Password.
            </p>
            <pre>
              {
                'MAIL_MODE=smtp\nMAIL_FROM=Your Name <you@gmail.com>\nSMTP_HOST=smtp.gmail.com\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=you@gmail.com\nSMTP_PASS=your-app-password'
              }
            </pre>
            <p>Credentials stay on the server. They are never stored in the browser.</p>
          </div>
        </div>
      </section>
      <aside className="panel connection-panel">
        <span className="eyebrow">WORKSPACE STATUS</span>
        <h2>Everything connected?</h2>
        <div className="connection-row">
          <span>Express API</span>
          <span className={`connection-label ${health ? 'connected' : ''}`}>
            {health ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="connection-row">
          <span>MongoDB</span>
          <span
            className={`connection-label ${health?.database === 'connected' ? 'connected' : ''}`}
          >
            {health?.database === 'connected' ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="connection-row">
          <span>Email mode</span>
          <span className="mode-chip">
            {health?.mail.mode === 'smtp' ? 'SMTP' : health ? 'Preview' : 'Unknown'}
          </span>
        </div>
        <div className="connection-row">
          <span>Mail configuration</span>
          <span className={`connection-label ${health?.mail.configured ? 'connected' : ''}`}>
            {health?.mail.configured ? 'Ready' : 'Needs setup'}
          </span>
        </div>
        <button className="button secondary full-width" onClick={onRefresh}>
          <Icon name="refresh" size={16} />
          Check connection
        </button>
        <p className="helper">The backend reconnects to MongoDB automatically.</p>
      </aside>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(getView);
  const [message, setMessage] = useState(getInitialMessage);
  const [drafts, setDrafts] = useState(() => {
    const saved = readStorage('postroom.drafts', []);
    return Array.isArray(saved)
      ? saved.filter(
          (draft) =>
            draft &&
            typeof draft.id === 'string' &&
            typeof draft.subject === 'string' &&
            typeof draft.body === 'string' &&
            typeof draft.recipients === 'string' &&
            !Number.isNaN(Date.parse(draft.savedAt)),
        )
      : [];
  });
  const [health, setHealth] = useState(null);
  const [healthLoaded, setHealthLoaded] = useState(false);
  const [stats, setStats] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [templateMenu, setTemplateMenu] = useState(false);
  const [detail, setDetail] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const request = useRef(readStorage('postroom.request', null));
  const sendingLock = useRef(false);
  const uploadRef = useRef(null);
  const recipientList = parseRecipients(message.recipients);
  const validRecipients = recipientList.filter(isEmail);
  const mode = health?.mail.mode;
  const connected = health?.database === 'connected';
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const handleHash = () => {
      setView(getView());
      setMobileMenu(false);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('postroom.composer', JSON.stringify(message));
    } catch {
      /* The composer still works if browser storage is unavailable. */
    }
  }, [message]);
  useEffect(() => {
    const controller = new AbortController();
    api('/health', { signal: controller.signal })
      .then((data) => {
        setHealth(data);
        if (data.database === 'connected') {
          api('/stats', { signal: controller.signal })
            .then(setStats)
            .catch(() => setStats(null));
        } else setStats(null);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setHealth(null);
          setStats(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHealthLoaded(true);
      });
    return () => controller.abort();
  }, [refreshKey]);

  function navigate(next) {
    location.hash = next;
  }
  function update(field, value) {
    setMessage((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }
  function validate() {
    const next = {};
    if (!recipientList.length) next.recipients = 'Add at least one recipient.';
    else if (recipientList.length > MAX_RECIPIENTS)
      next.recipients = `You can send to up to ${MAX_RECIPIENTS} recipients at a time.`;
    else if (validRecipients.length !== recipientList.length)
      next.recipients = `Check these addresses: ${recipientList
        .filter((email) => !isEmail(email))
        .slice(0, 3)
        .join(', ')}`;
    if (
      !message.subject.trim() ||
      /[\r\n]/.test(message.subject) ||
      message.subject.trim().length > 200
    )
      next.subject = 'Add a subject of 1–200 characters, without line breaks.';
    if (!message.body.trim() || message.body.trim().length > 50000)
      next.body = 'Write a message of 1–50,000 characters.';
    setErrors(next);
    if (Object.keys(next).length) document.getElementById(Object.keys(next)[0])?.focus();
    return !Object.keys(next).length;
  }
  function storeDrafts(next) {
    try {
      localStorage.setItem('postroom.drafts', JSON.stringify(next));
      setDrafts(next);
      return true;
    } catch {
      setNotice({
        type: 'error',
        text: 'Could not save the draft. Check your browser storage settings.',
      });
      return false;
    }
  }
  function saveDraft() {
    if (!message.subject.trim() && !message.body.trim() && !message.recipients.trim()) {
      setNotice({ type: 'error', text: 'Add a little something before saving your draft.' });
      return;
    }
    const id = draftId || crypto.randomUUID();
    const draft = { ...message, id, savedAt: new Date().toISOString() };
    if (storeDrafts([draft, ...drafts.filter((item) => item.id !== id)].slice(0, 20))) {
      setDraftId(id);
      setNotice({
        type: 'success',
        text: 'Draft saved on this device. Come back whenever inspiration strikes.',
      });
    }
  }
  function openDraft(draft) {
    setMessage({ recipients: draft.recipients, subject: draft.subject, body: draft.body });
    setDraftId(draft.id);
    setErrors({});
    navigate('compose');
  }
  async function importRecipients(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 100000) {
      setNotice({ type: 'error', text: 'Please choose a CSV or text file smaller than 100 KB.' });
      return;
    }
    try {
      const text = await file.text();
      const emails = parseRecipients(text.replace(/"/g, '').replace(/^\uFEFF/, '')).filter(
        (email) => !['email', 'emails', 'email_address', 'emailaddress'].includes(email),
      );
      const combined = [...new Set([...recipientList, ...emails])];
      if (!emails.length || emails.some((email) => !isEmail(email)))
        throw new Error(
          'Use a one-column CSV of email addresses, optionally with an “email” header.',
        );
      if (combined.length > MAX_RECIPIENTS)
        throw new Error(`Keep your list to ${MAX_RECIPIENTS} recipients or fewer.`);
      update('recipients', combined.join(', '));
      setNotice({
        type: 'success',
        text: `${combined.length} unique recipients ready. Duplicate addresses were removed.`,
      });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  }
  async function sendMessage(event) {
    event.preventDefault();
    if (sendingLock.current || !validate()) return;
    if (!connected || !health?.mail.configured) {
      setNotice({
        type: 'error',
        text: 'Connect MongoDB and configure your email mode in Workspace settings first.',
      });
      return;
    }
    sendingLock.current = true;
    setSending(true);
    setNotice(null);
    const payload = {
      recipients: recipientList,
      subject: message.subject.trim(),
      body: message.body.trim(),
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint || typeof request.current?.id !== 'string')
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      localStorage.setItem('postroom.request', JSON.stringify(request.current));
    } catch {
      /* Idempotency remains available for this session. */
    }
    try {
      const result = await api('/emails', {
        method: 'POST',
        body: JSON.stringify({ ...payload, requestId: request.current.id }),
      });
      const status = result.record.status;
      setNotice({
        type: ['failed', 'partial', 'interrupted'].includes(status) ? 'error' : 'success',
        text:
          status === 'sent'
            ? `${result.record.sentCount} emails accepted by your mail server for delivery.`
            : status === 'previewed'
              ? `Preview saved for ${recipientList.length} ${recipientList.length === 1 ? 'recipient' : 'recipients'}. No real emails were sent.`
              : status === 'sending'
                ? 'This campaign is still sending. Follow its progress in Email history.'
                : result.message,
      });
      // Recorded requests must not be retried automatically: partial delivery may have occurred.
      setMessage(EMPTY_MESSAGE);
      if (draftId) storeDrafts(drafts.filter((draft) => draft.id !== draftId));
      setDraftId(null);
      request.current = null;
      try {
        localStorage.removeItem('postroom.request');
      } catch {
        /* No persistence available. */
      }
      refresh();
    } catch (error) {
      if (error.fields) setErrors(error.fields);
      setNotice({
        type: 'error',
        text: `${error.message === 'Failed to fetch' ? 'Could not reach the backend.' : error.message} Check Email history before retrying. Retrying this unchanged message uses the same request ID.`,
      });
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  }
  async function openDetail(id) {
    try {
      setDetail(await api(`/emails/${id}`));
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  }

  const titles = {
    compose: [
      'Make their inbox a little brighter.',
      'A thoughtful message. A meaningful connection. All in one place.',
    ],
    history: [
      'Every hello, all in one place.',
      'Look back at your campaigns and see how each one went.',
    ],
    drafts: [
      'Good things take a little time.',
      'Your saved ideas, ready when you are. Stored on this device.',
    ],
    settings: ['Make yourself at home.', 'A little setup for a smoother sending experience.'],
  };

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <a href="#compose" className="brand">
          <span className="brand-mark">
            <Icon name="send" size={23} />
          </span>
          postroom<span className="brand-period">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">P</span>
          <div>
            <strong>My workspace</strong>
            <span>Your little corner</span>
          </div>
          <Icon name="leaf" size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {[
            ['compose', 'compose', 'Compose email'],
            ['history', 'history', 'Email history'],
            ['drafts', 'draft', 'Drafts'],
          ].map(([target, icon, label]) => (
            <a
              key={target}
              href={`#${target}`}
              className={view === target ? 'active' : ''}
              aria-current={view === target ? 'page' : undefined}
            >
              <Icon name={icon} size={19} />
              <span>{label}</span>
              {target === 'drafts' && drafts.length > 0 && (
                <span className="nav-count">{drafts.length}</span>
              )}
              {target === 'compose' && <span className="nav-active-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <Icon name="leaf" size={23} />
            </span>
            <h3>
              Small messages.
              <br />
              Big possibilities.
            </h3>
            <p>
              Your next connection is
              <br />
              just a hello away.
            </p>
          </div>
          <a href="#settings" className={`sidebar-link ${view === 'settings' ? 'selected' : ''}`}>
            <Icon name="settings" size={19} />
            Workspace settings
          </a>
          <a href="#settings" className="sidebar-link">
            <Icon name="help" size={19} />
            Help & getting started
            <Icon name="arrow" size={15} />
          </a>
          <div className="profile">
            <span className="profile-avatar">Y</span>
            <div>
              <strong>Your workspace</strong>
              <span>Made for meaningful mail</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Icon name="menu" />
            </button>
            <span>Workspace</span>
            <Icon name="chevron" size={14} />
            <strong>
              {
                {
                  compose: 'Compose email',
                  history: 'Email history',
                  drafts: 'Drafts',
                  settings: 'Settings',
                }[view]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span />
              Personal workspace
            </span>
            <span className="topbar-avatar">Y</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">A LITTLE HELLO GOES A LONG WAY</span>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            <span className="handwritten">
              Made to connect
              <svg viewBox="0 0 100 30" aria-hidden="true">
                <path d="M2 10q45 25 85-3m-8-2 12 1-6 11" />
              </svg>
            </span>
          </div>

          {notice && (
            <div
              className={`notice notice-${notice.type}`}
              role={notice.type === 'error' ? 'alert' : 'status'}
            >
              <Icon name={notice.type === 'error' ? 'info' : 'check'} size={20} />
              <span>{notice.text}</span>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
          )}
          {healthLoaded &&
            (!health || !connected || !health.mail.configured) &&
            view !== 'settings' && (
              <div className="connection-banner">
                <Icon name="info" size={18} />
                <span>
                  {!health
                    ? 'Your backend is offline. Start the app with npm run dev.'
                    : !connected
                      ? 'Your workspace is ready for MongoDB. Connect your database to save and send emails.'
                      : 'Add your SMTP credentials to start sending emails.'}
                </span>
                <a href="#settings">
                  Set up workspace
                  <Icon name="arrow" size={15} />
                </a>
              </div>
            )}

          {(view === 'compose' || view === 'history') && (
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-icon stat-green">
                  <Icon name="mail" size={21} />
                </span>
                <div>
                  <span className="stat-label">Total campaigns</span>
                  <strong>{stats ? stats.campaigns.toLocaleString() : '—'}</strong>
                </div>
                <span className="stat-note">Every hello counts</span>
              </div>
              <div className="stat-card">
                <span className="stat-icon stat-peach">
                  <Icon name="send" size={21} />
                </span>
                <div>
                  <span className="stat-label">Emails sent</span>
                  <strong>{stats ? stats.sent.toLocaleString() : '—'}</strong>
                </div>
                <span className="stat-note">On their way</span>
              </div>
              <div className="stat-card">
                <span className="stat-icon stat-lavender">
                  <Icon name="chart" size={21} />
                </span>
                <div>
                  <span className="stat-label">Send success</span>
                  <strong>
                    {stats && stats.sent + stats.failed > 0
                      ? `${Math.round((stats.sent / (stats.sent + stats.failed)) * 100)}%`
                      : '—'}
                  </strong>
                </div>
                <span className="stat-note">SMTP acceptance rate</span>
              </div>
            </div>
          )}

          {view === 'compose' && (
            <div className="compose-grid">
              <section className="panel composer-panel">
                <div className="panel-title">
                  <div className="panel-heading-icon">
                    <span className="soft-icon">
                      <Icon name="compose" size={21} />
                    </span>
                    <div>
                      <h2>A fresh message</h2>
                      <p>Good conversations start here.</p>
                    </div>
                  </div>
                  <span className="quiet-tag">{draftId ? 'Editing draft' : 'New campaign'}</span>
                </div>
                <form onSubmit={sendMessage} noValidate>
                  <fieldset disabled={sending} className="composer-fields">
                    <div className="field-group">
                      <div className="label-row">
                        <label htmlFor="recipients">
                          To <span className="required">*</span>
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => uploadRef.current.click()}
                        >
                          <Icon name="upload" size={14} />
                          Import CSV
                        </button>
                      </div>
                      <input
                        type="file"
                        ref={uploadRef}
                        accept=".csv,.txt,text/csv,text/plain"
                        hidden
                        onChange={importRecipients}
                      />
                      <div className={`recipient-box ${errors.recipients ? 'has-error' : ''}`}>
                        <Icon name="users" size={19} />
                        <textarea
                          id="recipients"
                          rows="2"
                          placeholder="hello@example.com, friend@example.com"
                          value={message.recipients}
                          onChange={(event) => update('recipients', event.target.value)}
                          aria-invalid={!!errors.recipients}
                          aria-describedby="recipients-help recipients-error"
                        />
                      </div>
                      <div className="helper-row">
                        <p className="helper" id="recipients-help">
                          Separate addresses with commas, spaces, or new lines.
                        </p>
                        <span
                          className={
                            recipientList.length > MAX_RECIPIENTS ? 'text-error count' : 'count'
                          }
                        >
                          {validRecipients.length} / {MAX_RECIPIENTS}
                        </span>
                      </div>
                      {errors.recipients && (
                        <p id="recipients-error" className="field-error">
                          {errors.recipients}
                        </p>
                      )}
                      {validRecipients.length > 0 && (
                        <div className="recipient-chips">
                          {validRecipients.slice(0, 3).map((email) => (
                            <span key={email}>
                              {email}
                              <button
                                type="button"
                                aria-label={`Remove ${email}`}
                                onClick={() =>
                                  update(
                                    'recipients',
                                    recipientList.filter((item) => item !== email).join(', '),
                                  )
                                }
                              >
                                <Icon name="close" size={12} />
                              </button>
                            </span>
                          ))}
                          {validRecipients.length > 3 && (
                            <span className="extra-recipients">
                              +{validRecipients.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="field-group">
                      <div className="label-row">
                        <label htmlFor="subject">
                          Subject <span className="required">*</span>
                        </label>
                        <span className="count">{message.subject.length} / 200</span>
                      </div>
                      <input
                        id="subject"
                        className={errors.subject ? 'has-error' : ''}
                        value={message.subject}
                        onChange={(event) => update('subject', event.target.value)}
                        placeholder="Give them a reason to open it"
                        maxLength={200}
                        aria-invalid={!!errors.subject}
                        aria-describedby={errors.subject ? 'subject-error' : undefined}
                      />
                      {errors.subject && (
                        <p id="subject-error" className="field-error">
                          {errors.subject}
                        </p>
                      )}
                    </div>
                    <div className="field-group body-field">
                      <div className="label-row">
                        <label htmlFor="body">
                          Your message <span className="required">*</span>
                        </label>
                        <span className="helper">Make it sound like you.</span>
                      </div>
                      <div className={`editor ${errors.body ? 'has-error' : ''}`}>
                        <div className="editor-toolbar">
                          <span>
                            <Icon name="draft" size={15} />
                            Plain text
                          </span>
                          <div className="template-control">
                            <button
                              type="button"
                              className="text-button"
                              aria-expanded={templateMenu}
                              onClick={() => setTemplateMenu(!templateMenu)}
                            >
                              <Icon name="spark" size={14} />
                              Use a template
                              <Icon name="down" size={12} />
                            </button>
                            {templateMenu && (
                              <div className="template-menu">
                                {TEMPLATES.map((template) => (
                                  <button
                                    key={template.name}
                                    type="button"
                                    onClick={() => {
                                      setMessage((current) => ({
                                        ...current,
                                        subject: template.subject,
                                        body: template.body,
                                      }));
                                      setErrors((current) => ({
                                        ...current,
                                        subject: '',
                                        body: '',
                                      }));
                                      setTemplateMenu(false);
                                    }}
                                  >
                                    {template.name}
                                    <Icon name="arrow" size={14} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <textarea
                          id="body"
                          rows="10"
                          value={message.body}
                          onChange={(event) => update('body', event.target.value)}
                          placeholder={
                            'Hi there,\n\nSomething worth sharing starts with a few words…\n\nMake it personal. Make it yours.'
                          }
                          maxLength={50000}
                          aria-invalid={!!errors.body}
                          aria-describedby={errors.body ? 'body-error' : undefined}
                        />
                        <div className="editor-footer">
                          <span>A little personality goes a long way.</span>
                          <span>{message.body.length.toLocaleString()} / 50,000</span>
                        </div>
                      </div>
                      {errors.body && (
                        <p id="body-error" className="field-error">
                          {errors.body}
                        </p>
                      )}
                    </div>
                  </fieldset>
                  <div className="composer-actions">
                    <button
                      type="button"
                      className="button draft-button"
                      disabled={sending}
                      onClick={saveDraft}
                    >
                      <Icon name="save" size={17} />
                      Save draft
                    </button>
                    <div>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setPreview(true)}
                      >
                        <Icon name="eye" size={17} />
                        Preview
                      </button>
                      <button
                        type="submit"
                        className="button primary"
                        disabled={sending || !connected || !health?.mail.configured}
                      >
                        {sending ? (
                          <>
                            <span className="spinner" />
                            {mode === 'preview' ? 'Saving…' : 'Sending…'}
                          </>
                        ) : (
                          <>
                            <Icon name={mode === 'smtp' ? 'send' : 'check'} size={17} />
                            {mode === 'smtp' ? 'Send campaign' : 'Save preview'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="composer-footnote">
                    <Icon name="lock" size={13} />
                    <span>
                      {mode === 'smtp'
                        ? 'Sent individually. Recipient addresses stay private.'
                        : 'Preview mode saves to MongoDB without sending real emails.'}
                    </span>
                  </div>
                </form>
              </section>
              <aside className="compose-aside">
                <div className="illustration-card">
                  <svg viewBox="0 0 280 160" className="mail-illustration" aria-hidden="true">
                    <path
                      d="M43 137q80-8 185 0"
                      stroke="#bed1ba"
                      strokeWidth="2"
                      strokeDasharray="4 5"
                      fill="none"
                    />
                    <path
                      d="M62 47q7-16 20-8m135 24q14-8 20 4"
                      stroke="#adc4a4"
                      strokeWidth="2"
                      fill="none"
                    />
                    <g transform="rotate(-9 140 90)">
                      <rect x="69" y="48" width="142" height="90" rx="8" fill="#234d3e" />
                      <path d="m70 128 63-47q7-4 14 0l63 47" fill="#315e4c" />
                      <rect x="92" y="20" width="100" height="91" rx="5" fill="#fffdf5" />
                      <path
                        d="M110 41h45m-45 13h64m-64 13h53"
                        stroke="#c9d4c4"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <path
                        d="m69 55 65 48q6 5 12 0l65-48v75q0 8-8 8H77q-8 0-8-8Z"
                        fill="#477b5d"
                      />
                      <path d="m70 133 60-43m80 43-59-43" stroke="#659373" strokeWidth="1.5" />
                      <path d="m164 28 4 7 8 2-6 5 1 8-7-4-7 4 1-8-6-5 8-2Z" fill="#e9b16e" />
                    </g>
                    <path d="m42 81 3 5 6 1-4 4 1 6-6-3-5 3 1-6-4-4 6-1Z" fill="#d7a66d" />
                    <path d="m226 106 3 5 6 1-4 4 1 6-6-3-5 3 1-6-4-4 6-1Z" fill="#90ac83" />
                  </svg>
                  <span className="eyebrow">MORE THAN JUST EMAIL</span>
                  <h2>
                    A small message.
                    <br />A lasting impression.
                  </h2>
                  <p>
                    Reach the right people with
                    <br />
                    something worth opening.
                  </p>
                </div>
                <section className="panel checklist">
                  <h3>Before you hit send</h3>
                  <p>A little care makes a big difference.</p>
                  {[
                    [
                      validRecipients.length > 0 &&
                        validRecipients.length === recipientList.length &&
                        recipientList.length <= MAX_RECIPIENTS,
                      'Add your people',
                      'The right message, the right inboxes.',
                    ],
                    [
                      !!message.subject.trim(),
                      'Write a clear subject',
                      'Make a good first impression.',
                    ],
                    [
                      !!message.body.trim(),
                      'Make it meaningful',
                      'Give your words a personal touch.',
                    ],
                  ].map(([done, title, subtitle]) => (
                    <div className={`check-item ${done ? 'check-done' : ''}`} key={title}>
                      <span>{done ? <Icon name="check" size={12} /> : null}</span>
                      <div>
                        <strong>{title}</strong>
                        <p>{subtitle}</p>
                      </div>
                    </div>
                  ))}
                </section>
                <section className="sender-card">
                  <span className="sender-icon">
                    <Icon name={mode === 'smtp' ? 'send' : 'eye'} size={18} />
                  </span>
                  <div>
                    <strong>
                      {mode === 'smtp' ? 'Your sending identity' : 'A safe place to try things'}
                    </strong>
                    <p>
                      {mode === 'smtp'
                        ? health.mail.from
                        : 'Preview first. Connect SMTP when you’re ready for the real thing.'}
                    </p>
                    <a href="#settings">
                      {mode === 'smtp' ? 'View mail settings' : 'About preview mode'}
                      <Icon name="arrow" size={13} />
                    </a>
                  </div>
                </section>
              </aside>
            </div>
          )}

          {view === 'history' && (
            <History
              refreshKey={refreshKey}
              onDetail={openDetail}
              onCompose={() => navigate('compose')}
            />
          )}
          {view === 'drafts' && (
            <section className="panel drafts-panel">
              <div className="panel-title">
                <div>
                  <h2>A little inspiration, saved</h2>
                  <p>Up to 20 drafts, stored right here in your browser.</p>
                </div>
                <span className="quiet-tag">{drafts.length} saved</span>
              </div>
              {!drafts.length ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <Icon name="draft" size={30} />
                  </div>
                  <h3>Room for your next idea</h3>
                  <p>Save a draft from the composer and pick it up whenever you’re ready.</p>
                  <button className="button primary" onClick={() => navigate('compose')}>
                    Write something
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              ) : (
                <div className="draft-list">
                  {drafts.map((draft) => (
                    <article className="draft-item" key={draft.id}>
                      <span className="soft-icon">
                        <Icon name="draft" />
                      </span>
                      <button className="draft-open" onClick={() => openDraft(draft)}>
                        <strong>{draft.subject || 'Untitled message'}</strong>
                        <p>{draft.body.slice(0, 110) || 'A work in progress…'}</p>
                        <span>
                          {formatDate(draft.savedAt)} · {parseRecipients(draft.recipients).length}{' '}
                          recipients
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => {
                          if (
                            storeDrafts(drafts.filter((item) => item.id !== draft.id)) &&
                            draft.id === draftId
                          )
                            setDraftId(null);
                        }}
                        aria-label={`Delete draft ${draft.subject || 'Untitled message'}`}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {view === 'settings' && <Settings health={health} onRefresh={refresh} />}
          <footer className="page-footer">
            <span>
              <span className="footer-dot" />
              Thoughtful emails. Meaningful connections.
            </span>
            <span>Made with care, sent with postroom.</span>
          </footer>
        </main>
      </div>
      {preview && (
        <EmailPreview
          message={message}
          sender={health?.mail.from}
          onClose={() => setPreview(false)}
        />
      )}
      {detail && (
        <Modal title="The story of this message" onClose={() => setDetail(null)} wide>
          <div className="detail-title">
            <h3>{detail.subject}</h3>
            <StatusBadge status={detail.status} />
          </div>
          <p className="helper">
            Created {formatDate(detail.createdAt)} · {detail.recipients.length} recipients ·{' '}
            {detail.mode === 'preview' ? 'Preview mode: no real email sent' : 'SMTP delivery'}
          </p>
          {detail.status === 'interrupted' && (
            <div className="notice notice-error">
              <Icon name="info" size={18} />
              <span>
                Sending was interrupted. Some emails may have been accepted without a saved result.
                Check your provider before resending.
              </span>
            </div>
          )}
          <div className="detail-body">{detail.body}</div>
          <h3 className="detail-subheading">Recipient results</h3>
          <div className="delivery-list">
            {detail.recipients.map((email) => {
              const delivery = detail.deliveries.find((item) => item.email === email);
              return (
                <div className="delivery-row" key={email}>
                  <div>
                    <strong>{email}</strong>
                    {delivery?.error && <p className="field-error">{delivery.error}</p>}
                  </div>
                  {delivery ? (
                    <StatusBadge status={delivery.status} />
                  ) : (
                    <span className="quiet-tag">
                      {detail.status === 'sending' ? 'Pending' : 'Unknown'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="modal-footnote">
            <Icon name="info" size={16} />
            “Sent” means accepted by your SMTP server. Inbox placement is not guaranteed.
          </p>
        </Modal>
      )}
    </div>
  );
}
