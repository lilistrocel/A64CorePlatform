/**
 * Protocols — SOP library
 *
 * The written procedures for the lab and farm. Draft, approve, revise.
 *
 * Status is the load-bearing concept here, so it leads the card: only an
 * ACTIVE protocol is offered at the point of work, and revising an approved
 * one drops it back to draft. Someone scanning this page needs to see at a
 * glance which procedures are actually in force.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { HelpButton } from '../../components/tutorials/HelpButton';
import { ProtocolFormModal } from '../../components/protocols/ProtocolFormModal';
import { ProtocolViewModal } from '../../components/protocols/ProtocolViewModal';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Grid,
  Input,
  PageHeader,
  PageSubtitle,
  PageTitle,
  PageWrap,
  Select,
  Tag,
  Toolbar,
} from '../../components/genetics/styled';
import { useApproveProtocol, useProtocols } from '../../hooks/protocols/useProtocols';
import type { Protocol, ProtocolCategory, ProtocolStatus } from '../../types/protocols';
import {
  PROTOCOL_CATEGORY_ICONS,
  PROTOCOL_CATEGORY_LABELS,
  PROTOCOL_STATUS_LABELS,
} from '../../types/protocols';

const STATUS_STYLES: Record<ProtocolStatus, { bg: string; fg: string }> = {
  draft: { bg: '#fef3c7', fg: '#92400e' },
  active: { bg: '#f0fdf4', fg: '#15803d' },
  retired: { bg: '#eeeeee', fg: '#616161' },
};

const StatusBadge = styled.span<{ $status: ProtocolStatus }>`
  display: inline-flex;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: 12px;
  font-weight: 700;
  background: ${({ $status }) => STATUS_STYLES[$status].bg};
  color: ${({ $status }) => STATUS_STYLES[$status].fg};
`;

const ProtocolCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const CardTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const Code = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Title = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-top: 2px;
`;

const Purpose = styled.p`
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Meta = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ScopeRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const ScopeTag = styled(Tag)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 10.5px;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
`;

const FilterSelect = styled(Select)`
  max-width: 190px;
`;

const SearchInput = styled(Input)`
  max-width: 260px;
`;

export function ProtocolsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Protocol | null>(null);
  const [viewing, setViewing] = useState<Protocol | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: page, isLoading } = useProtocols({
    perPage: 60,
    search: search || undefined,
    category: category || undefined,
    status: statusFilter || undefined,
  });
  const protocols = page?.data ?? [];

  const draftCount = protocols.filter((p) => p.status === 'draft').length;

  return (
    <PageWrap>
      <PageHeader>
        <div>
          <PageTitle>📋 Protocols<HelpButton topic="protocols.library" /></PageTitle>
          <PageSubtitle>
            Written procedures — how a job is done here. Only approved protocols are
            offered when recording work, and revising one returns it to draft for
            re-approval.
          </PageSubtitle>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New protocol</Button>
      </PageHeader>

      {draftCount > 0 && (
        <Banner $tone="warning">
          {draftCount} protocol{draftCount === 1 ? '' : 's'} awaiting approval. Drafts
          are not offered at the bench — approve them to put them into use.
        </Banner>
      )}

      <Toolbar>
        <SearchInput
          placeholder="Search title, code or purpose…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {(Object.keys(PROTOCOL_CATEGORY_LABELS) as ProtocolCategory[]).map((c) => (
            <option key={c} value={c}>
              {PROTOCOL_CATEGORY_ICONS[c]} {PROTOCOL_CATEGORY_LABELS[c]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {(Object.keys(PROTOCOL_STATUS_LABELS) as ProtocolStatus[]).map((s) => (
            <option key={s} value={s}>
              {PROTOCOL_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>

      {isLoading && <EmptyState>Loading…</EmptyState>}

      {!isLoading && protocols.length === 0 && (
        <EmptyState>
          {search || category || statusFilter ? (
            <>No protocols match that filter.</>
          ) : (
            <>
              No protocols yet.
              <br />
              Write one for a job that goes wrong when a step is skipped — pouring
              agar, sterilising grain, responding to contamination. Tag it with where
              it applies and it will appear inside the modal that records that work.
            </>
          )}
        </EmptyState>
      )}

      {protocols.length > 0 && (
        <Grid $min="330px">
          {protocols.map((p) => (
            <ProtocolRow
              key={p.id}
              protocol={p}
              onView={() => setViewing(p)}
              onEdit={() => setEditing(p)}
            />
          ))}
        </Grid>
      )}

      {viewing && (
        <ProtocolViewModal
          protocol={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const p = viewing;
            setViewing(null);
            setEditing(p);
          }}
        />
      )}

      {(showCreate || editing) && (
        <ProtocolFormModal
          protocol={editing ?? undefined}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
        />
      )}
    </PageWrap>
  );
}

function ProtocolRow({
  protocol,
  onView,
  onEdit,
}: {
  protocol: Protocol;
  onView: () => void;
  onEdit: () => void;
}) {
  const approve = useApproveProtocol(protocol.id);

  return (
    <ProtocolCard
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView();
        }
      }}
      title="Open the procedure"
      style={{ cursor: 'pointer' }}
    >
      <CardTop>
        <div>
          <Code>
            {protocol.code} · v{protocol.version}
          </Code>
          <Title>{protocol.title}</Title>
        </div>
        <StatusBadge $status={protocol.status}>
          {PROTOCOL_STATUS_LABELS[protocol.status]}
        </StatusBadge>
      </CardTop>

      {protocol.purpose && <Purpose>{protocol.purpose}</Purpose>}

      {protocol.appliesTo.length > 0 && (
        <ScopeRow>
          {protocol.appliesTo.map((s) => (
            <ScopeTag key={s} title="Appears in the screen that records this work">
              {s}
            </ScopeTag>
          ))}
        </ScopeRow>
      )}

      <Meta>
        <span>
          {PROTOCOL_CATEGORY_ICONS[protocol.category]}{' '}
          {PROTOCOL_CATEGORY_LABELS[protocol.category]}
        </span>
        <span>{protocol.steps.length} steps</span>
        {protocol.steps.some((s) => s.isCritical) && (
          <span>{protocol.steps.filter((s) => s.isCritical).length} critical</span>
        )}
        {protocol.approvedByName && <span>✓ {protocol.approvedByName}</span>}
      </Meta>

      <Actions onClick={(e) => e.stopPropagation()}>
        <Button
          $variant="ghost"
          style={{ padding: '5px 12px', fontSize: 13 }}
          onClick={onView}
        >
          Read
        </Button>
        {protocol.status !== 'retired' && (
          <Button
            $variant="ghost"
            style={{ padding: '5px 12px', fontSize: 13 }}
            onClick={onEdit}
            title={
              protocol.status === 'active'
                ? 'Editing an approved procedure returns it to draft'
                : undefined
            }
          >
            Edit
          </Button>
        )}
        {protocol.status === 'draft' && (
          <Button
            style={{ padding: '5px 12px', fontSize: 13 }}
            disabled={protocol.steps.length === 0 || approve.isPending}
            title={
              protocol.steps.length === 0
                ? 'Add at least one step before approving'
                : undefined
            }
            onClick={() => approve.mutate(undefined)}
          >
            {approve.isPending ? 'Approving…' : 'Approve'}
          </Button>
        )}
      </Actions>
    </ProtocolCard>
  );
}
