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
 *
 * "Send to printer" (T-804 follow-up): a second primary action beside the
 * download, sending the same rendered PDF straight to this deployment's
 * configured Brother QL-800 via `POST .../labels/print` instead of a blob
 * download. The download path above is left entirely as-is — it is the
 * fallback whenever no printer is configured for this deployment, or the
 * configured one isn't currently ready (offline, out of paper, etc.),
 * both surfaced via `GET .../printer/health`.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useGetLabelsPdf, usePrinterHealth, usePrintLabels } from '../../hooks/genetics/useGenetics';
import type { Accession } from '../../types/genetics';
import { Modal } from './Modal';
import { Banner, Button, Field, FormRow, Hint, Input, Label, Select } from './styled';

// Printing is physical and irreversible — a batch above this size gets an
// explicit "are you sure" step before the request fires, in addition to the
// count always being visible on the button itself.
const PRINT_CONFIRM_THRESHOLD = 10;

// Mirrors `_MAX_LABELS_PER_REQUEST` in src/modules/genetics/api/v1/labels.py
// exactly — the server is the real enforcement; this is only a UI nudge so a
// mistyped range is obvious before the request round-trips and 400s.
const MAX_LABELS_PER_REQUEST = 500;

// Mirrors `_parse_tape_spec` in src/modules/genetics/api/v1/labels.py:
// '29x90'/'17x87' are fixed die-cut stock (one physical length each); '62xN'
// is the one parameterizable family — continuous tape, any integer feed
// length in mm within this range. These three constants are the ONLY numbers
// mirrored client-side; the QR density/module-size arithmetic itself
// (`compute_qr_geometry`) stays server-only — see the low-density hint below.
const CONTINUOUS_MIN_MM = 12;
const CONTINUOUS_MAX_MM = 100;
const CONTINUOUS_DEFAULT_MM = 15; // user-confirmed: prints and scans cleanly on this lab's QL-800.

// Below this length the QR is visibly denser than the confirmed-good 15mm
// default (spec §6.2: shorter feed length -> fewer mm per QR module for the
// same payload). This is a qualitative nudge, not a computed threshold — the
// real module-size math (`compute_qr_geometry`) only exists server-side and
// is deliberately not duplicated here.
const DENSITY_HINT_BELOW_MM = 15;

type TapeType = 'continuous' | '29x90' | '17x87';

function composeSize(tapeType: TapeType, continuousLengthMm: number): string {
  if (tapeType === '29x90' || tapeType === '17x87') return tapeType;
  return `62x${continuousLengthMm}`;
}

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
  const printerHealth = usePrinterHealth();
  const printLabels = usePrintLabels(accession.id);

  // Server-default formula, mirrored client-side (spec §5.1).
  const naturalFrom = accession.labelledVesselCount + 1;
  const naturalTo = Math.max(accession.labelledVesselCount, accession.quantity);
  const nothingUnprinted = naturalFrom > naturalTo;

  // When the natural range is inverted (nothing left to print — see file
  // header), fall back to "reprint everything that currently exists" rather
  // than prefilling a range the server will reject outright.
  const [fromStr, setFromStr] = useState(String(nothingUnprinted ? 1 : naturalFrom));
  const [toStr, setToStr] = useState(String(nothingUnprinted ? Math.max(accession.quantity, 1) : naturalTo));
  // Defaults to the 62mm continuous roll at the confirmed-good 15mm length
  // regardless of printer availability — this IS the "printer path"
  // default the media in the tray actually is; a user picking a die-cut
  // size for a PDF-only export can still switch it below.
  const [tapeType, setTapeType] = useState<TapeType>('continuous');
  const [continuousLengthStr, setContinuousLengthStr] = useState(String(CONTINUOUS_DEFAULT_MM));
  const [lastDownload, setLastDownload] = useState<string | null>(null);
  const [lastPrintJob, setLastPrintJob] = useState<{ jobId: number | null; pagesPrinted: number } | null>(
    null
  );
  const [confirmingPrint, setConfirmingPrint] = useState(false);

  const fromNum = Number(fromStr);
  const toNum = Number(toStr);
  const rangeValid =
    Number.isInteger(fromNum) && Number.isInteger(toNum) && fromNum >= 1 && toNum >= 1 && fromNum <= toNum;
  const pageCount = rangeValid ? toNum - fromNum + 1 : 0;
  const overCap = rangeValid && pageCount > MAX_LABELS_PER_REQUEST;

  const continuousLengthNum = Number(continuousLengthStr);
  // Mirrors `_TAPE_62_MIN_MM`/`_TAPE_62_MAX_MM` validation in labels.py —
  // only meaningful for the continuous tape type; the two die-cut sizes have
  // no length field to validate.
  const continuousLengthValid =
    tapeType !== 'continuous' ||
    (Number.isInteger(continuousLengthNum) &&
      continuousLengthNum >= CONTINUOUS_MIN_MM &&
      continuousLengthNum <= CONTINUOUS_MAX_MM);

  // Both paths raise `labelledVesselCount` server-side, so neither is
  // allowed to fire while the other is in flight — avoids two overlapping
  // requests racing the same high-water mark.
  const anyRequestPending = labelsPdf.isPending || printLabels.isPending;
  const canDownload = rangeValid && !overCap && continuousLengthValid && !anyRequestPending;

  const printerData = printerHealth.data;
  // `configured` gates whether the printer action renders AT ALL — no
  // LABEL_PRINTER_BASE_URL set for this deployment means there is nothing
  // to offer beyond the PDF download.
  const printerConfigured = printerData?.configured === true;
  const printerReady = printerConfigured && printerData?.ok === true;
  const printerReasons = printerData?.status ?? [];
  const canPrint = rangeValid && !overCap && continuousLengthValid && printerReady && !anyRequestPending;

  const handleDownload = async () => {
    setLastDownload(null);
    const size = composeSize(tapeType, continuousLengthNum);
    const result = await labelsPdf.mutateAsync({ from: fromNum, to: toNum, size });
    triggerBlobDownload(result.blob, result.filename);
    setLastDownload(result.filename);
  };

  const submitPrint = async () => {
    setConfirmingPrint(false);
    setLastPrintJob(null);
    const size = composeSize(tapeType, continuousLengthNum);
    const result = await printLabels.mutateAsync({ from: fromNum, to: toNum, size });
    setLastPrintJob({ jobId: result.jobId, pagesPrinted: result.pagesPrinted });
  };

  // Printing is irreversible, so a large batch gets one extra confirm step
  // before the request fires — the count is already visible on the button
  // itself either way (spec requirement, not just for the confirm case).
  const handlePrintClick = () => {
    if (pageCount > PRINT_CONFIRM_THRESHOLD) {
      setConfirmingPrint(true);
      return;
    }
    void submitPrint();
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
          {/* Only offered when this deployment actually has a printer
              configured (T-804 follow-up) — see printerConfigured below. */}
          {printerConfigured && (
            <Button
              type="button"
              // The one gold/"primary" CTA on this screen shifts to
              // whichever action is actually usable right now — printer
              // when ready, download otherwise — rather than both
              // competing for it at once.
              $variant={printerReady ? 'primary' : 'ghost'}
              onClick={handlePrintClick}
              disabled={!canPrint}
            >
              {printLabels.isPending
                ? 'Sending…'
                : `Send to printer${pageCount > 0 ? ` — ${pageCount} label${pageCount === 1 ? '' : 's'}` : ''}`}
            </Button>
          )}
          <Button
            type="button"
            $variant={printerReady ? 'ghost' : 'primary'}
            onClick={handleDownload}
            disabled={!canDownload}
          >
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

      {printLabels.isError && (
        <Banner $tone="error">
          {(printLabels.error as any)?.response?.data?.detail ?? printLabels.error.message}
        </Banner>
      )}

      {lastPrintJob && !printLabels.isError && (
        <Banner $tone="info">
          Sent to printer{lastPrintJob.jobId !== null ? ` — job ${lastPrintJob.jobId}` : ''},{' '}
          {lastPrintJob.pagesPrinted} page
          {lastPrintJob.pagesPrinted === 1 ? '' : 's'} printed.
        </Banner>
      )}

      {printerConfigured && !printerReady && (
        <Banner $tone="warning">
          Printer not ready{printerReasons.length > 0 ? ` — ${printerReasons.join(', ')}` : ''}.
          You can still download the PDF below.
        </Banner>
      )}

      {confirmingPrint && (
        <Banner $tone="warning">
          Print {pageCount} labels? This sends a real job to the printer and cannot be undone.
          <ConfirmActions>
            <Button type="button" $variant="ghost" onClick={() => setConfirmingPrint(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitPrint()}>
              Yes, print {pageCount} labels
            </Button>
          </ConfirmActions>
        </Banner>
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

      <FormRow $cols={2}>
        <Field>
          <Label>Tape</Label>
          <Select value={tapeType} onChange={(e) => setTapeType(e.target.value as TapeType)}>
            <option value="continuous">62 mm continuous</option>
            <option value="29x90">29 × 90 mm die-cut</option>
            <option value="17x87">17 × 87 mm die-cut — not recommended</option>
          </Select>
        </Field>
        <Field>
          <Label>Length (mm)</Label>
          <Input
            type="number"
            min={CONTINUOUS_MIN_MM}
            max={CONTINUOUS_MAX_MM}
            value={continuousLengthStr}
            onChange={(e) => setContinuousLengthStr(e.target.value)}
            disabled={tapeType !== 'continuous'}
          />
        </Field>
      </FormRow>

      {tapeType === 'continuous' && !continuousLengthValid && (
        <Banner $tone="warning">
          Continuous tape length must be a whole number between {CONTINUOUS_MIN_MM} and{' '}
          {CONTINUOUS_MAX_MM}mm.
        </Banner>
      )}

      {tapeType === 'continuous' &&
        continuousLengthValid &&
        continuousLengthNum < DENSITY_HINT_BELOW_MM && (
          <Hint>
            Shorter tape packs the QR code denser — test-scan a label before printing a large
            batch at this length.
          </Hint>
        )}

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
        scan. (Applies to the downloaded PDF — a direct printer send is scaled correctly by
        the printer itself.)
      </Banner>
    </Modal>
  );
}

const ConfirmActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 10px;
`;
