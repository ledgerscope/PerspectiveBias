import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { OrbitControls } from "@react-three/drei";
import { Desk } from "./Desk";
import { CubicleWall } from "./CubicleWall";
import { Paper } from "./Paper";
import { RotaryPhone } from "./RotaryPhone";
import { Cheque } from "./Cheque";
import { StampTool } from "./StampTool";
import { StaplerTool } from "./StaplerTool";
import { PaymentsTray } from "./PaymentsTray";
import { StapledBundle } from "./StapledBundle";
import { generateInitialLayout, TABLE_DIMENSIONS } from "./layout";
import { generateCheques, generateChequeLayout } from "./chequeLayout";
import { useInvoices } from "./useInvoices";
import { useResetOnSpace } from "./useResetOnSpace";
import { getReferenceDate } from "./dateUtils";
import { rngFromString } from "./hash";
import { TRAY_XZ, STAMP_XZ, STAPLER_XZ } from "./toolZone";
import { STAPLE_ANIM_DURATION } from "./Cheque";
import { StatusOverlay } from "../components/StatusOverlay";

// Fixed desk spots for the reconciliation tools, all clustered together near
// one front corner of the desk (see toolZone.ts, which scattered/stacked
// paperwork is kept clear of) so the tray, stamp and stapler are easy to
// find and reach together once an invoice is held. Both tools already have
// their base mesh positioned so its underside sits right at the group's own
// origin (see StampTool.tsx/StaplerTool.tsx), so their home position only
// needs a hairline epsilon above the desk surface to avoid z-fighting - not
// the multi-centimetre offsets that used to leave them visibly hovering.
const TRAY_POSITION: [number, number, number] = [TRAY_XZ[0], TABLE_DIMENSIONS.surfaceY + 0.006, TRAY_XZ[1]];
const STAMP_HOME: [number, number, number] = [STAMP_XZ[0], TABLE_DIMENSIONS.surfaceY + 0.002, STAMP_XZ[1]];
const STAPLER_HOME: [number, number, number] = [STAPLER_XZ[0], TABLE_DIMENSIONS.surfaceY + 0.002, STAPLER_XZ[1]];

// Three loosely-offset "sub-pile" anchors within the tray's footprint, so
// bundles read as a neat set of small stacks rather than one single tower
// that keeps growing taller as more invoices get reconciled (or, before
// this, a single wide pile scattered almost edge-to-edge across the tray).
// Cycling through these keeps each sub-pile's height - and the position
// jitter within it - small and tidy.
const TRAY_SUBPILE_ANCHORS: Array<[number, number]> = [
  [-0.075, -0.02],
  [0, 0.03],
  [0.075, -0.03],
];

function trayBundlePosition(index: number, seedPrefix: string): [number, number, number] {
  const anchor = TRAY_SUBPILE_ANCHORS[index % TRAY_SUBPILE_ANCHORS.length];
  const layer = Math.floor(index / TRAY_SUBPILE_ANCHORS.length);
  const jitter = rngFromString(`${seedPrefix}-${index}`);
  return [
    TRAY_POSITION[0] + anchor[0] + (jitter() - 0.5) * 0.02,
    TRAY_POSITION[1] + 0.01 + layer * 0.0035,
    TRAY_POSITION[2] + anchor[1] + (jitter() - 0.5) * 0.016,
  ];
}

interface StapledBundleData {
  id: string;
  invoiceId: string;
  chequeIds: string[];
  startPosition: [number, number, number];
  endPosition: [number, number, number];
}

export function Scene() {
  const { invoices, mode, error } = useInvoices();
  const [heldId, setHeldIdState] = useState<string | null>(null);
  const [selectedChequeIds, setSelectedChequeIds] = useState<string[]>([]);
  const [manuallyPaidIds, setManuallyPaidIds] = useState<Set<string>>(new Set());
  const [archivedInvoiceIds, setArchivedInvoiceIds] = useState<Set<string>>(new Set());
  const [archivedChequeIds, setArchivedChequeIds] = useState<Set<string>>(new Set());
  const [bundles, setBundles] = useState<StapledBundleData[]>([]);
  const bundleCountRef = useRef(0);
  // Cheque ids currently mid-way through the "being stapled" animation
  // (rotating to vertical + snapping to the invoice's top-left corner)
  // before they're archived and the fly-to-tray bundle takes over.
  const [staplingChequeIds, setStaplingChequeIds] = useState<string[]>([]);
  const staplingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (staplingTimeoutRef.current) clearTimeout(staplingTimeoutRef.current);
    };
  }, []);

  // Picking up a different invoice (or dropping the current one) always
  // clears any cheques that were floated up to sit beside it.
  const setHeldId = useCallback((id: string | null) => {
    setHeldIdState(id);
    setSelectedChequeIds([]);
  }, []);

  const resetToken = useResetOnSpace(() => setHeldId(null));

  // Tracks how many papers/cheques currently have an active pointer-down
  // (dragging) gesture on them, so the orbit camera can be suspended for
  // the whole gesture - otherwise OrbitControls fights the drag and both
  // the pan and the click-to-hold break. Holding an invoice/cheque up to
  // view it does *not* set this (that's a settled state, not an in-progress
  // gesture), so the camera can still be freely orbited/panned/zoomed while
  // something is held - the held item just follows the camera live.
  const dragCountRef = useRef(0);
  const [isDraggingPaper, setIsDraggingPaper] = useState(false);
  const handleDragStateChange = useCallback((dragging: boolean) => {
    dragCountRef.current += dragging ? 1 : -1;
    setIsDraggingPaper(dragCountRef.current > 0);
  }, []);

  const layouts = useMemo(() => generateInitialLayout(invoices), [invoices]);
  const referenceDate = useMemo(() => getReferenceDate(invoices), [invoices]);
  const cheques = useMemo(() => generateCheques(invoices), [invoices]);
  const chequeLayouts = useMemo(() => generateChequeLayout(cheques), [cheques]);
  const invoiceById = useMemo(() => new Map(invoices.map((inv) => [inv.id, inv])), [invoices]);

  // Invoices that are already PAID start the scene pre-reconciled: their
  // cheque(s) are already stapled on and resting in the payments tray,
  // rather than loose on the desk waiting to be matched up - there's
  // nothing left to do for money that's already been recorded as settled.
  const preStapledInvoiceIds = useMemo(
    () => new Set(invoices.filter((inv) => inv.status === "PAID").map((inv) => inv.id)),
    [invoices],
  );
  const preStapledBundles = useMemo(() => {
    const chequesByInvoice = new Map<string, string[]>();
    for (const cheque of cheques) {
      if (!preStapledInvoiceIds.has(cheque.invoiceId)) continue;
      const list = chequesByInvoice.get(cheque.invoiceId) ?? [];
      list.push(cheque.id);
      chequesByInvoice.set(cheque.invoiceId, list);
    }
    return Array.from(chequesByInvoice.entries()).map(([invoiceId, chequeIds], index) => {
      const position = trayBundlePosition(index, "tray-preexisting");
      return { invoiceId, chequeIds, position };
    });
  }, [cheques, preStapledInvoiceIds]);
  const preStapledChequeIds = useMemo(
    () => new Set(preStapledBundles.flatMap((b) => b.chequeIds)),
    [preStapledBundles],
  );
  // Future (user-triggered) staples index their tray slot after however many
  // are already sitting there from the pre-reconciled invoices, so they
  // don't stack into the same spots.
  useEffect(() => {
    bundleCountRef.current = Math.max(bundleCountRef.current, preStapledBundles.length);
  }, [preStapledBundles.length]);

  const handleToggleChequeSelect = useCallback((chequeId: string) => {
    setSelectedChequeIds((prev) =>
      prev.includes(chequeId) ? prev.filter((id) => id !== chequeId) : [...prev, chequeId],
    );
  }, []);

  const heldInvoice = heldId ? invoiceById.get(heldId) ?? null : null;
  // The stamp + stapler stay visible on the desk at all times so they're
  // easy to find, but only *do* anything once an invoice awaiting payment
  // has at least one matching cheque pulled up alongside it - there's
  // nothing to reconcile for an invoice that's already settled/void, or
  // while a previous staple's "being stapled" animation is still playing.
  // The stapler stays enabled even after the invoice has been manually
  // stamped PAID (that's the whole point - stamp it, then staple the
  // cheque(s) to it and send the bundle to the tray); only the stamp itself
  // disables once used, so you can't stack multiple PAID marks on one
  // invoice.
  const canReconcile =
    !!heldInvoice &&
    selectedChequeIds.length > 0 &&
    staplingChequeIds.length === 0 &&
    heldInvoice.status !== "PAID" &&
    heldInvoice.status !== "VOIDED";
  const canStamp = canReconcile && !manuallyPaidIds.has(heldInvoice!.id);

  const handleApplyStamp = useCallback(() => {
    if (!heldId) return;
    setManuallyPaidIds((prev) => {
      const next = new Set(prev);
      next.add(heldId);
      return next;
    });
  }, [heldId]);

  const handleStaple = useCallback(
    (startPosition: [number, number, number]) => {
      if (!heldId || selectedChequeIds.length === 0 || staplingChequeIds.length > 0) return;
      const invoiceId = heldId;
      const chequeIds = selectedChequeIds;
      // First, play the "being stapled" animation (the cheque(s) rotate to
      // vertical and snap to the invoice's top-left corner) for a beat
      // before the invoice+cheques actually get archived and fly off to
      // the tray - see Cheque.tsx's isStapling handling.
      setStaplingChequeIds(chequeIds);
      staplingTimeoutRef.current = setTimeout(() => {
        const index = bundleCountRef.current++;
        const endPosition = trayBundlePosition(index, "tray");
        setBundles((prev) => [
          ...prev,
          { id: `bundle-${invoiceId}`, invoiceId, chequeIds, startPosition, endPosition },
        ]);
        setArchivedInvoiceIds((prev) => new Set(prev).add(invoiceId));
        setArchivedChequeIds((prev) => {
          const next = new Set(prev);
          chequeIds.forEach((id) => next.add(id));
          return next;
        });
        setStaplingChequeIds([]);
        setHeldId(null);
      }, STAPLE_ANIM_DURATION * 1000);
    },
    [heldId, selectedChequeIds, staplingChequeIds.length, setHeldId],
  );

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <StatusOverlay mode={mode} error={error} invoiceCount={invoices.length} />
      <Canvas shadows camera={{ position: [0, 1.6, 1.7], fov: 55 }}>
        <color attach="background" args={["#20232a"]} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[1.5, 3, 2]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Physics gravity={[0, -9.81, 0]}>
          <Desk />
          <CubicleWall />
          <RotaryPhone />
          <PaymentsTray position={TRAY_POSITION} />
          {layouts
            .filter((layout) => !archivedInvoiceIds.has(layout.id) && !preStapledInvoiceIds.has(layout.id))
            .map((layout) => (
              <Paper
                key={layout.id}
                layout={layout}
                heldId={heldId}
                onHold={setHeldId}
                resetToken={resetToken}
                surfaceY={TABLE_DIMENSIONS.surfaceY}
                onDragStateChange={handleDragStateChange}
                referenceDate={referenceDate}
                manuallyPaid={manuallyPaidIds.has(layout.id)}
              />
            ))}
          {chequeLayouts
            .filter((cl) => !archivedChequeIds.has(cl.id) && !preStapledChequeIds.has(cl.id))
            .map((cl) => (
              <Cheque
                key={cl.id}
                layout={cl}
                heldInvoiceId={heldId}
                isSelected={selectedChequeIds.includes(cl.id)}
                isStapling={staplingChequeIds.includes(cl.id)}
                selectedIndex={Math.max(0, selectedChequeIds.indexOf(cl.id))}
                onToggleSelect={handleToggleChequeSelect}
                resetToken={resetToken}
                surfaceY={TABLE_DIMENSIONS.surfaceY}
                onDragStateChange={handleDragStateChange}
              />
            ))}
          {preStapledBundles.map((bundle) => (
            <StapledBundle
              key={`bundle-preexisting-${bundle.invoiceId}`}
              id={`bundle-preexisting-${bundle.invoiceId}`}
              invoice={invoiceById.get(bundle.invoiceId)!}
              referenceDate={referenceDate}
              startPosition={bundle.position}
              endPosition={bundle.position}
              chequeCount={bundle.chequeIds.length}
              instant
            />
          ))}
          {bundles.map((bundle) => (
            <StapledBundle
              key={bundle.id}
              id={bundle.id}
              invoice={invoiceById.get(bundle.invoiceId)!}
              referenceDate={referenceDate}
              startPosition={bundle.startPosition}
              endPosition={bundle.endPosition}
              chequeCount={bundle.chequeIds.length}
            />
          ))}
          <StampTool
            visible
            enabled={canStamp}
            homePosition={STAMP_HOME}
            onApplyStamp={handleApplyStamp}
            scale={1.7}
          />
          <StaplerTool
            visible
            enabled={canReconcile}
            homePosition={STAPLER_HOME}
            onStaple={handleStaple}
            scale={1.9}
          />
        </Physics>
        <OrbitControls
          enabled={!isDraggingPaper}
          target={[0, TABLE_DIMENSIONS.height, 0]}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={0.8}
          maxDistance={4}
        />
      </Canvas>
    </div>
  );
}
