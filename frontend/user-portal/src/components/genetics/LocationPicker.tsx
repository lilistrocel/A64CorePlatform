/**
 * Genetics Repo - Location Picker
 *
 * Places physical material in a real facility and room rather than free text,
 * which is what makes "what is in my lab right now" a query.
 *
 * Rooms are suggested by type: a petri dish belongs in a lab, grain spawn in a
 * spawn room, a fruiting block in an incubation or fruiting room. The list is
 * ordered so the sensible rooms come first, but nothing is hidden — a lab that
 * doubles as cold storage is a real situation and the model should not fight it.
 */

import { useMemo } from 'react';
import styled from 'styled-components';
import { Check } from 'lucide-react';
import { useFacilities } from '../../hooks/mushroom/useFacilityData';
import { useFacilityRooms } from '../../hooks/mushroom/useRoomData';
import type { RoomType } from '../../types/mushroom';
import { ROOM_TYPE_LABELS } from '../../types/mushroom';
import type { VesselForm } from '../../types/genetics';
import { Field, FormRow, Hint, Input, Label, Select } from './styled';

/**
 * Which room types suit a given vessel form. Used only for ordering the
 * dropdown — never to restrict it.
 */
const FORM_ROOM_AFFINITY: Partial<Record<VesselForm, RoomType[]>> = {
  petri_dish: ['lab'],
  slant: ['lab', 'storage'],
  agar_plug: ['lab'],
  liquid_culture: ['lab', 'spawn'],
  tissue_jar: ['lab'],
  spore_print: ['lab', 'storage'],
  spore_syringe: ['lab', 'storage'],
  cryo_vial: ['storage'],
  sample: ['lab', 'storage'],
  grain_spawn: ['spawn', 'incubation'],
  bulk_spawn: ['spawn', 'incubation'],
  fruiting_block: ['incubation', 'fruiting'],
  seed_lot: ['storage'],
};

const Suggested = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.bright.emerald};
`;

interface LocationPickerProps {
  facilityId: string;
  roomId: string;
  /** Drives which rooms are suggested first. */
  form?: VesselForm;
  unit: string;
  position: string;
  onChange: (patch: {
    facilityId?: string;
    roomId?: string;
    unit?: string;
    position?: string;
  }) => void;
}

export function LocationPicker({
  facilityId,
  roomId,
  form,
  unit,
  position,
  onChange,
}: LocationPickerProps) {
  const { data: facilities } = useFacilities();
  const { data: rooms } = useFacilityRooms(facilityId || undefined);

  const preferred = (form && FORM_ROOM_AFFINITY[form]) || [];

  const orderedRooms = useMemo(() => {
    const list = rooms ?? [];
    return [...list].sort((a, b) => {
      const ai = preferred.indexOf(a.roomType);
      const bi = preferred.indexOf(b.roomType);
      const aRank = ai === -1 ? 99 : ai;
      const bRank = bi === -1 ? 99 : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a.roomCode.localeCompare(b.roomCode);
    });
  }, [rooms, preferred]);

  const selectedRoom = orderedRooms.find((r) => r.id === roomId);

  return (
    <>
      <FormRow $cols={2}>
        <Field>
          <Label>Facility</Label>
          <Select
            value={facilityId}
            onChange={(e) =>
              // Changing facility invalidates the room — clear it rather than
              // leaving a room pointing at a different building.
              onChange({ facilityId: e.target.value, roomId: '' })
            }
          >
            <option value="">— not placed —</option>
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Room</Label>
          <Select
            value={roomId}
            onChange={(e) => onChange({ roomId: e.target.value })}
            disabled={!facilityId}
          >
            <option value="">
              {facilityId ? '— not placed —' : 'select a facility first'}
            </option>
            {orderedRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomCode}
                {r.name ? ` · ${r.name}` : ''} — {ROOM_TYPE_LABELS[r.roomType]}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>

      {selectedRoom && preferred.length > 0 && (
        <Hint>
          {preferred.includes(selectedRoom.roomType) ? (
            <Suggested><Check size={12} strokeWidth={2.2} /> Typical room for this vessel type.</Suggested>
          ) : (
            <>
              Usually kept in a{' '}
              {preferred.map((t) => ROOM_TYPE_LABELS[t]).join(' or ')} room — this is
              allowed, just unusual.
            </>
          )}
        </Hint>
      )}

      <FormRow $cols={2}>
        <Field>
          <Label>Unit</Label>
          <Input
            value={unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="incubator-2, shelf rack B"
          />
        </Field>
        <Field>
          <Label>Position</Label>
          <Input
            value={position}
            onChange={(e) => onChange({ position: e.target.value })}
            placeholder="shelf-3, slot 12"
          />
        </Field>
      </FormRow>
    </>
  );
}
