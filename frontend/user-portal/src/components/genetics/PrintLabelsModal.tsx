/**
 * Genetics Repo - Print Labels Modal (T-804 §7.2)
 *
 * Downloads a print-ready PDF of vessel labels from
 * `GET /api/v1/genetics/accessions/{id}/labels` — one page per vessel, sized
 * for the Brother QL-800. This is a JS-triggered blob download rather than a
 * plain `<a href>`: the endpoint is on the authenticated namespace, so the
 * request has to carry the bearer header the same way every other genetics
 * call does (`apiClient`), and only an XHR/fetch-based request can do that.
 *
 * The range inputs default to the server's own formula (spec §5.1):
 * `from = labelledVesselCount + 1`, `to = max(labelledVesselCount, quantity)`
 * — "print everything that's never been printed." That formula can itself
 * produce `from > to` when `quantity` has since dropped below
 * `labelledVesselCount` (e.g. a vessel was consumed/discarded after its
 * label was printed) — the natural "nothing left to print" case degrades to
 * a broken default range rather than an empty one, so it is special-cased
 * below into a sane reprint suggestion instead of a button that is
 * guaranteed to 400 on first click.
 */

import { useState } from 'react';
import { useGetLabelsPdf } from '../../hooks/genetics/useGenetics';
import type { Accession } from '../../types/genetics';
import { Modal } from './Modal';
import { Banner, Button, Field, FormRow, Hint, Input, Label, Select } from './styled';

// Mirrors `_MAX_LABELS_PER_REQUEST` in src/modules/genetics/api/v1/labels.py
// exactly — the server is the real enforcement; this is only a UI nudge so a
// mistyped range is obvious before the request round-trips and 400s.
const MAX_LABELS_PER_REQUEST = 500;

type TapeSize = '62x20' | '29x90' | '17x87';

interface PrintLabelsModalProps {
  accession: Accession;
  onClose: () => void;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function PrintLabelsModal({ accession, onClose }: PrintLabelsModalProps) {
  const labelsPdf = useGetLabelsPdf(accession.id);

  // Server-default formula, mirrored client-side (spec §5.1).
  const naturalFrom = accession.labelledVesselCount + 1;
  const naturalTo = Math.max(accession.labelledVesselCount, accession.quantity);
  const nothingUnprinted = naturalFrom > naturalTo;

  // When the natural range is inverted (nothing left to print — see file
  // header), fall back to "reprint everything that currently exists" rather
  // than prefilling a range the server will reject outright.
  const [fromStr, setFromStr] = useState(String(nothingUnprinted ? 1 : naturalFrom));
  const [toStr, setToStr] = useState(String(nothingUnprinted ? Math.max(accession.quantity, 1) : naturalTo));
  const [size, setSize] = useState<TapeSize>('62x20');
  const [lastDownload, setLastDownload] = useState<string | null>(null);

  const fromNum = Number(fromStr);
  const toNum = Number(toStr);
  const rangeValid =
    Number.isInteger(fromNum) && Number.isInteger(toNum) && fromNum >= 1 && toNum >= 1 && fromNum <= toNum;
  const pageCount = rangeValid ? toNum - fromNum + 1 : 0;
  const overCap = rangeValid && pageCount > MAX_LABELS_PER_REQUEST;
  const canDownload = rangeValid && !overCap && !labelsPdf.isPending;

  const handleDownload = async () => {
    setLastDownload(null);
    const result = await labelsPdf.mutateAsync({ from: fromNum, to: toNum, size });
    triggerBlobDownload(result.blob, result.filename);
    setLastDownload(result.filename);
  };

  return (
    <Modal
      title={`Print labels — ${accession.accessionCode}`}
      subtitle="One label per vessel, sized for the Brother QL-800 printer."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={handleDownload} disabled={!canDownload}>
            {labelsPdf.isPending
              ? 'Generating…'
              : `Download${pageCount > 0 ? ` ${pageCount} label${pageCount === 1 ? '' : 's'}` : ''}`}
          </Button>
        </>
      }
    >
      {labelsPdf.isError && <Banner $tone="error">{labelsPdf.error.message}</Banner>}

      {lastDownload && !labelsPdf.isError && (
        <Banner $tone="info">Downloaded {lastDownload}.</Banner>
      )}

      {nothingUnprinted && (
        <Banner $tone="info">
          Every vessel up to #{accession.labelledVesselCount} already has a printed label, and
          only {accession.quantity} {accession.unit} currently exist. Showing a reprint range
          below instead — adjust as needed.
        </Banner>
      )}

      <FormRow $cols={2}>
        <Field>
          <Label>From vessel #</Label>
          <Input
            type="number"
            min={1}
            value={fromStr}
            onChange={(e) => setFromStr(e.target.value)}
          />
        </Field>
        <Field>
          <Label>To vessel #</Label>
          <Input type="number" min={1} value={toStr} onChange={(e) => setToStr(e.target.value)} />
        </Field>
      </FormRow>

      <Field>
        <Label>Tape size</Label>
        <Select value={size} onChange={(e) => setSize(e.target.value as TapeSize)}>
          <option value="62x20">62 × 20 mm continuous (recommended)</option>
          <option value="29x90">29 × 90 mm die-cut</option>
          <option value="17x87">17 × 87 mm die-cut — not recommended</option>
        </Select>
      </Field>

      <Hint>
        {rangeValid
          ? `${pageCount} label${pageCount === 1 ? '' : 's'} will be generated — vessel #${fromNum} through #${toNum}.`
          : '"From" must be at least 1 and no greater than "to".'}
      </Hint>

      {overCap && (
        <Banner $tone="warning">
          That range is {pageCount} labels — over the {MAX_LABELS_PER_REQUEST}-per-request cap.
          Split it into smaller batches.
        </Banner>
      )}

      <Banner $tone="info">
        Print at <strong>&quot;Actual size&quot; / 100% scale</strong>. Any &quot;fit to
        page&quot; setting rescales the QR code and is the most likely reason a batch won&apos;t
        scan.
      </Banner>
    </Modal>
  );
}
