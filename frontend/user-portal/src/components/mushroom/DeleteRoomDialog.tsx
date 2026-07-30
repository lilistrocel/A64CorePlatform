/**
 * DeleteRoomDialog
 *
 * Confirms deleting a room, and refuses up-front when records are attached.
 *
 * The dependency check runs before the button is offered rather than letting
 * the API reject it, because the useful information is *what* is attached: 40
 * fruiting blocks is a different decision from 3 old environment logs. A room
 * that has been used but should no longer be is a job for the decommissioned
 * phase, which keeps its history — so that alternative is offered here rather
 * than leaving deletion as the only visible option.
 */

import styled from 'styled-components';
import { useDeleteRoom, useRoomDependents } from '../../hooks/mushroom/useRoomData';
import { useAdvancePhase } from '../../hooks/mushroom/useRoomData';
import type { GrowingRoom } from '../../types/mushroom';
import { Modal } from '../genetics/Modal';
import { Banner, Button, Hint } from '../genetics/styled';

const DEPENDENT_LABELS: Record<string, string> = {
  accessions: 'accession record(s) — cultures, spawn or blocks',
  harvests: 'harvest record(s)',
  contaminationReports: 'contamination report(s)',
  environmentLogs: 'environment log(s)',
};

const List = styled.ul`
  margin: 8px 0 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Item = styled.li`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Count = styled.strong`
  font-weight: 700;
`;

interface DeleteRoomDialogProps {
  room: GrowingRoom;
  facilityId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteRoomDialog({
  room,
  facilityId,
  onClose,
  onDeleted,
}: DeleteRoomDialogProps) {
  const { data: dependents, isLoading } = useRoomDependents(facilityId, room.id);
  const deleteRoom = useDeleteRoom(facilityId);
  const advancePhase = useAdvancePhase(facilityId, room.id);

  const blocking = Object.entries(dependents ?? {}).filter(([, n]) => n > 0);
  const isBlocked = blocking.length > 0;
  const alreadyDecommissioned = room.currentPhase === 'decommissioned';

  return (
    <Modal
      title={`Delete ${room.roomCode}?`}
      subtitle={room.name ?? undefined}
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {isBlocked && !alreadyDecommissioned && (
            <Button
              type="button"
              $variant="ghost"
              disabled={advancePhase.isPending}
              onClick={async () => {
                await advancePhase.mutateAsync({ targetPhase: 'decommissioned' });
                onClose();
              }}
            >
              {advancePhase.isPending ? 'Retiring…' : 'Decommission instead'}
            </Button>
          )}
          <Button
            type="button"
            $variant="danger"
            disabled={isLoading || isBlocked || deleteRoom.isPending}
            onClick={async () => {
              await deleteRoom.mutateAsync(room.id);
              onDeleted?.();
              onClose();
            }}
          >
            {deleteRoom.isPending ? 'Deleting…' : 'Delete room'}
          </Button>
        </>
      }
    >
      {deleteRoom.isError && (
        <Banner $tone="error">
          {(deleteRoom.error as any)?.response?.data?.detail ?? deleteRoom.error.message}
        </Banner>
      )}

      {isLoading && <Hint>Checking what is attached to this room…</Hint>}

      {!isLoading && !isBlocked && (
        <Banner>
          Nothing is attached to this room, so deleting it loses no records. This cannot
          be undone.
        </Banner>
      )}

      {!isLoading && isBlocked && (
        <>
          <Banner $tone="warning">
            This room cannot be deleted — it still has records attached, and removing it
            would orphan them:
            <List>
              {blocking.map(([key, n]) => (
                <Item key={key}>
                  <Count>{n}</Count> {DEPENDENT_LABELS[key] ?? key}
                </Item>
              ))}
            </List>
          </Banner>
          <Hint>
            {alreadyDecommissioned ? (
              <>
                This room is already decommissioned, so it is out of use while keeping
                its history. To delete it outright, move or discard the attached material
                first.
              </>
            ) : (
              <>
                If the room is simply no longer in use, <strong>decommission</strong> it
                instead — it stops being usable but keeps its harvest and lineage history
                intact. Deletion is only for rooms created by mistake.
              </>
            )}
          </Hint>
        </>
      )}
    </Modal>
  );
}
