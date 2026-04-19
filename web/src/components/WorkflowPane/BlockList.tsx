import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Manifest, Plan } from "../../types";
import { useStore } from "../../state/store";
import BlockCard from "./BlockCard";

interface Props {
  plan: Plan;
  stepStates: { status: string; detail: string }[];
  manifest: Manifest | null;
  disabled?: boolean;
}

export default function BlockList({ plan, stepStates, manifest, disabled }: Props) {
  const reorderSteps = useStore((s) => s.reorderSteps);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const items = plan.steps.map((_, i) => `step-${i}`);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.indexOf(String(active.id));
    const to = items.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorderSteps(from, to);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-3">
          {plan.steps.map((step, i) => (
            <BlockCard
              key={`step-${i}-${step.skill_id}`}
              id={`step-${i}`}
              index={i}
              step={step}
              status={(stepStates[i]?.status as any) ?? "pending"}
              detail={stepStates[i]?.detail ?? ""}
              manifest={manifest}
              disabled={disabled}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
