import { useMemo, useState } from 'react';
import { Check, HelpCircle, Image as ImageIcon, MessageSquare, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import type { FlaggedContent, ModerationStatus } from '../types';
import { useStore } from '../store/useStore';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Tabs } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { ModerationStatusBadge } from '../components/ui/StatusBadge';
import { SearchBar } from '../components/ui/SearchBar';
import { formatRelative, titleCase } from '../utils/format';

const OPEN_STATUSES: ModerationStatus[] = ['under_review', 'needs_info'];

const TYPE_ICON = {
  review: MessageSquare,
  photo: ImageIcon,
  profile: UserRound,
} as const;

const summaryOf = (item: FlaggedContent): string => {
  if (item.content.kind === 'review') return item.content.text;
  if (item.content.kind === 'photo') return `${item.content.caption} · uploaded by ${item.content.uploaderName}`;
  return item.content.summary;
};

export default function ModerationPage() {
  const flagged = useStore((state) => state.flagged);
  const resolveFlag = useStore((state) => state.resolveFlag);

  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return flagged
      .filter((item) =>
        tab === 'open' ? OPEN_STATUSES.includes(item.status) : !OPEN_STATUSES.includes(item.status),
      )
      .filter((item) =>
        needle
          ? [item.id, item.reason, item.reporterName, summaryOf(item)].join(' ').toLowerCase().includes(needle)
          : true,
      );
  }, [flagged, tab, query]);

  // Selection is derived so the panel always follows the queue: resolve the
  // top report and the next one slides into place with no effect round-trip.
  const selected =
    visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const openCount = flagged.filter((item) => OPEN_STATUSES.includes(item.status)).length;

  const select = (item: FlaggedContent) => {
    setSelectedId(item.id);
    setNotes(item.adminNotes ?? '');
  };

  const act = (status: ModerationStatus) => {
    if (!selected) return;
    resolveFlag(selected.id, status, notes.trim());
    setSelectedId(null);
    setNotes('');
  };

  return (
    <>
      <PageHeader
        title="Moderation queue"
        description={`${openCount} report${openCount === 1 ? '' : 's'} waiting on a decision. Removing content notifies the person who posted it.`}
      />

      <div className="workspace">
        <section className="card">
          <div style={{ padding: '0 1rem' }}>
            <Tabs
              label="Queue filter"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'open', label: 'Open', count: openCount },
                { id: 'resolved', label: 'Resolved', count: flagged.length - openCount },
              ]}
            />
          </div>

          <div className="filters">
            <div className="filters-main">
              <SearchBar value={query} onChange={setQuery} placeholder="Search reports…" />
            </div>
          </div>

          <div className="card-body">
            {visible.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck size={28} strokeWidth={1.5} />}
                title={tab === 'open' ? 'Queue is clear' : 'Nothing resolved yet'}
                message={
                  tab === 'open'
                    ? 'Every reported review, photo and profile has been dealt with.'
                    : 'Resolved reports will collect here for the audit trail.'
                }
              />
            ) : (
              <div className="queue-list">
                {visible.map((item) => {
                  const Icon = TYPE_ICON[item.contentType];
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className="queue-item"
                      aria-pressed={item.id === selected?.id}
                      onClick={() => select(item)}
                    >
                      <span className="thumb" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="body">
                        <span className="title">
                          {titleCase(item.contentType)} report · <span className="mono">{item.id}</span>
                        </span>
                        <span className="meta">
                          {item.reporterName} · {formatRelative(item.dateReported)}
                        </span>
                        <span className="excerpt">{item.reason}</span>
                      </span>
                      <ModerationStatusBadge status={item.status} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="workspace-sticky">
          <section className="card" aria-live="polite">
            {selected ? (
              <>
                <div className="card-head">
                  <div style={{ minWidth: 0 }}>
                    <h2>{titleCase(selected.contentType)} report</h2>
                    <p className="card-sub mono">{selected.id}</p>
                  </div>
                  <ModerationStatusBadge status={selected.status} />
                </div>

                <div className="card-body stack">
                  {selected.content.kind === 'review' ? (
                    <blockquote className="tc">
                      <div className="row-between">
                        <span className="strong">{selected.content.authorName}</span>
                        <Badge tone={selected.content.rating <= 2 ? 'danger' : 'neutral'} plain>
                          {'★'.repeat(selected.content.rating)}
                          {'☆'.repeat(5 - selected.content.rating)}
                        </Badge>
                      </div>
                      <p>{selected.content.text}</p>
                      <p className="dim" style={{ fontSize: '0.75rem' }}>
                        Review of {selected.content.subjectName}
                      </p>
                    </blockquote>
                  ) : null}

                  {selected.content.kind === 'photo' ? (
                    <div className="stack-sm">
                      <div className="thumb thumb-lg" aria-hidden="true">
                        <span className="thumb-art" />
                      </div>
                      <p className="dim" style={{ fontSize: '0.8125rem' }}>
                        “{selected.content.caption}” · {selected.content.context} photo by{' '}
                        {selected.content.uploaderName}
                      </p>
                    </div>
                  ) : null}

                  {selected.content.kind === 'profile' ? (
                    <div className="tc">
                      <p className="strong">{selected.content.profileName}</p>
                      <p className="dim" style={{ fontSize: '0.8125rem' }}>
                        {titleCase(selected.content.profileType)}
                      </p>
                      <p>{selected.content.summary}</p>
                    </div>
                  ) : null}

                  <dl className="dl">
                    <div>
                      <dt>Reported by</dt>
                      <dd>
                        {selected.reporterName} <span className="dim mono">({selected.reporterId})</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Reason given</dt>
                      <dd>{selected.reason}</dd>
                    </div>
                    <div>
                      <dt>Reported</dt>
                      <dd>{formatRelative(selected.dateReported)}</dd>
                    </div>
                  </dl>

                  <div>
                    <label className="label" htmlFor="admin-notes">
                      Admin notes
                    </label>
                    <textarea
                      id="admin-notes"
                      className="textarea"
                      value={notes}
                      placeholder="What did you check, and what did you decide?"
                      onChange={(event) => setNotes(event.target.value)}
                    />
                    <p className="hint">Notes are attached to the audit log entry for this decision.</p>
                  </div>

                  <div className="stack-sm">
                    <button type="button" className="btn btn-primary" onClick={() => act('approved')}>
                      <Check size={15} /> Keep content
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
                      <Trash2 size={15} /> Remove content
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => act('needs_info')}>
                      <HelpCircle size={15} /> Request more information
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="No report selected"
                message="Choose a report from the queue to review the content and decide."
              />
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        title={
          selected?.contentType === 'photo'
            ? 'Remove this photo and warn the user?'
            : selected?.contentType === 'review'
              ? 'Remove this review and warn the author?'
              : 'Remove this profile from search?'
        }
        message="The content is hidden from the app immediately and the person who posted it receives a warning SMS. The decision is recorded in the audit log."
        confirmLabel="Remove & warn"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          act('rejected');
          setConfirming(false);
        }}
      />
    </>
  );
}
