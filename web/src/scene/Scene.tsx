import { useCallback, useMemo, useRef, useState } from "react";
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
import { StatusOverlay } from "../components/StatusOverlay";

// Fixed desk spots for the reconciliation tools. The stamp/stapler sit just
// outside the footprint of a held invoice (which fills most of the center of
// the view) but still safely inside the *default*, un-orbited camera frustum
// - OrbitControls is disabled while an invoice is held, so unlike the tray
// (which is only ever looked at once nothing is held) these two must be
// reachable without the user rotating the view first.
const TRAY_POSITION: [number, number, number] = [1.5, TABLE_DIMENSIONS.surfaceY + 0.006, 0.55];
const STAMP_HOME: [number, number, number] = [1.15, TABLE_DIMENSIONS.surfaceY + 0.05, 0.15];
const STAPLER_HOME: [number, number, number] = [-1.1, TABLE_DIMENSIONS.surfaceY + 0.02, 0.15];

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

  // Picking up a different invoice (or dropping the current one) always
  // clears any cheques that were floated up to sit beside it.
  const setHeldId = useCallback((id: string | null) => {
    setHeldIdState(id);
    setSelectedChequeIds([]);
  }, []);

  const resetToken = useResetOnSpace(() => setHeldId(null));

  // Tracks how many papers/cheques currently have an active pointer-down
  // (dragging) gesture on them, so the orbit camera can be suspended for
  // the whole gesture - not just once something is "held" - otherwise
  // OrbitControls fights the drag and both the pan and the click-to-hold
  // break.
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

  const handleToggleChequeSelect = useCallback((chequeId: string) => {
    setSelectedChequeIds((prev) =>
      prev.includes(chequeId) ? prev.filter((id) => id !== chequeId) : [...prev, chequeId],
    );
  }, []);

  const heldInvoice = heldId ? invoiceById.get(heldId) ?? null : null;
  // The stamp + stapler appear once an invoice awaiting payment has at least
  // one matching cheque pulled up alongside it - there's nothing to
  // reconcile for an invoice that's already settled/void. The stapler stays
  // available even after the invoice has been manually stamped PAID (that's
  // the whole point - stamp it, then staple the cheque(s) to it and send the
  // bundle to the tray); only the stamp itself hides once used, so you can't
  // stack multiple PAID marks on the same invoice.
  const canReconcile =
    !!heldInvoice &&
    selectedChequeIds.length > 0 &&
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
      if (!heldId || selectedChequeIds.length === 0) return;
      const invoice = invoiceById.get(heldId);
      if (!invoice) return;
      const chequeIds = selectedChequeIds;
      const index = bundleCountRef.current++;
      const jitter = rngFromString(`tray-${index}`);
      const endPosition: [number, number, number] = [
        TRAY_POSITION[0] + (jitter() - 0.5) * 0.08,
        TRAY_POSITION[1] + 0.01 + index * 0.006,
        TRAY_POSITION[2] + (jitter() - 0.5) * 0.06,
      ];
      setBundles((prev) => [
        ...prev,
        { id: `bundle-${heldId}`, invoiceId: heldId, chequeIds, startPosition, endPosition },
      ]);
      setArchivedInvoiceIds((prev) => new Set(prev).add(heldId));
      setArchivedChequeIds((prev) => {
        const next = new Set(prev);
        chequeIds.forEach((id) => next.add(id));
        return next;
      });
      setHeldId(null);
    },
    [heldId, selectedChequeIds, invoiceById, setHeldId],
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
            .filter((layout) => !archivedInvoiceIds.has(layout.id))
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
            .filter((cl) => !archivedChequeIds.has(cl.id))
            .map((cl) => (
              <Cheque
                key={cl.id}
                layout={cl}
                heldInvoiceId={heldId}
                isSelected={selectedChequeIds.includes(cl.id)}
                selectedIndex={Math.max(0, selectedChequeIds.indexOf(cl.id))}
                onToggleSelect={handleToggleChequeSelect}
                resetToken={resetToken}
                surfaceY={TABLE_DIMENSIONS.surfaceY}
                onDragStateChange={handleDragStateChange}
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
          <StampTool visible={canStamp} homePosition={STAMP_HOME} onApplyStamp={handleApplyStamp} />
          <StaplerTool visible={canReconcile} homePosition={STAPLER_HOME} onStaple={handleStaple} />
        </Physics>
        <OrbitControls
          enabled={!heldId && !isDraggingPaper}
          target={[0, TABLE_DIMENSIONS.height, 0]}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={0.8}
          maxDistance={4}
        />
      </Canvas>
    </div>
  );
}
