import { TbCalendarEvent, TbPlus, TbRepeat, TbTrash } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { cn } from "@/lib/utils";
import { MAX_RECIPE_TRIGGERS } from "@/../convex/schemas/recipesSchema";
import {
  WEEKDAYS,
  browserTimezone,
  fromDateTimeLocal,
  newOnce,
  newSchedule,
  toDateTimeLocal,
  withEvery,
  type OnceTrigger,
  type RecipeTrigger,
  type ScheduleTrigger,
} from "./recipeTriggers";

type TriggersEditorProps = {
  triggers: RecipeTrigger[];
  onChange: (triggers: RecipeTrigger[]) => void;
};

/**
 * Les déclencheurs d'une recipe : une ligne par créneau planifié ou lancement
 * unique.
 */
export default function TriggersEditor({
  triggers,
  onChange,
}: TriggersEditorProps) {
  // Le déclencheur `manual` (lancement par les membres du canvas) n'a pas
  // encore de porte d'entrée : le TaskNode viendra plus tard. On ne
  // l'affiche pas, mais on le conserve s'il est déjà là.
  const manual = triggers.some((t) => t.kind === "manual");
  const timed = triggers.filter(
    (t): t is ScheduleTrigger | OnceTrigger => t.kind !== "manual",
  );
  const canAdd = triggers.length < MAX_RECIPE_TRIGGERS;

  const emit = (nextManual: boolean, nextTimed: RecipeTrigger[]) =>
    onChange([
      ...(nextManual ? [{ kind: "manual" as const }] : []),
      ...nextTimed,
    ]);

  const replaceAt = (index: number, trigger: RecipeTrigger) =>
    emit(
      manual,
      timed.map((t, i) => (i === index ? trigger : t)),
    );

  const removeAt = (index: number) =>
    emit(
      manual,
      timed.filter((_, i) => i !== index),
    );

  return (
    <div className="flex flex-col gap-3">
      {timed.length === 0 && (
        <p className="text-sm text-slate-500">
          No schedule: the recipe only runs when you run it from here.
        </p>
      )}

      {timed.length > 0 && (
        <div className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-surface">
          {timed.map((trigger, index) =>
            trigger.kind === "schedule" ? (
              <ScheduleRow
                key={index}
                schedule={trigger}
                onChange={(next) => replaceAt(index, next)}
                onRemove={() => removeAt(index)}
              />
            ) : (
              <OnceRow
                key={index}
                once={trigger}
                onChange={(next) => replaceAt(index, next)}
                onRemove={() => removeAt(index)}
              />
            ),
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={() => emit(manual, [...timed, newSchedule()])}
        >
          <TbPlus /> Repeat on a schedule
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={() => emit(manual, [...timed, newOnce()])}
        >
          <TbPlus /> Run once at a date
        </Button>
      </div>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0 text-slate-400 hover:text-red-600"
      onClick={onClick}
      aria-label="Remove trigger"
    >
      <TbTrash />
    </Button>
  );
}

function ScheduleRow({
  schedule,
  onChange,
  onRemove,
}: {
  schedule: ScheduleTrigger;
  onChange: (schedule: ScheduleTrigger) => void;
  onRemove: () => void;
}) {
  const toggleDay = (day: number) => {
    if (schedule.every !== "week") return;
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day];
    // Au moins un jour : le backend refuserait une semaine vide.
    if (days.length > 0) onChange({ ...schedule, days });
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <TbRepeat className="shrink-0 text-slate-400" />
        <Select
          value={schedule.every}
          onValueChange={(value) =>
            onChange(withEvery(schedule, value as ScheduleTrigger["every"]))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hour">Every hour</SelectItem>
            <SelectItem value="day">Every day</SelectItem>
            <SelectItem value="week">Some days</SelectItem>
          </SelectContent>
        </Select>
        {schedule.every !== "hour" && (
          <>
            <span className="text-sm text-slate-500">at</span>
            <Input
              type="time"
              value={schedule.at}
              onChange={(e) =>
                e.target.value && onChange({ ...schedule, at: e.target.value })
              }
              className="w-36"
            />
          </>
        )}
        <div className="flex-1" />
        <RemoveButton onClick={onRemove} />
      </div>

      {schedule.every === "week" && (
        <div className="flex flex-wrap gap-1 pl-6">
          {WEEKDAYS.map((day) => {
            const active = schedule.days.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                aria-pressed={active}
                className={cn(
                  "h-8 w-11 rounded-lg border text-sm transition-colors",
                  active
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-100",
                )}
              >
                {day.short}
              </button>
            );
          })}
        </div>
      )}

      {schedule.timezone !== browserTimezone() && (
        <p className="pl-6 text-xs text-slate-500">
          Times are in {schedule.timezone}.{" "}
          <button
            type="button"
            className="underline hover:text-slate-700"
            onClick={() =>
              onChange({ ...schedule, timezone: browserTimezone() })
            }
          >
            Use {browserTimezone()}
          </button>
        </p>
      )}
    </div>
  );
}

function OnceRow({
  once,
  onChange,
  onRemove,
}: {
  once: OnceTrigger;
  onChange: (once: OnceTrigger) => void;
  onRemove: () => void;
}) {
  const past = once.at <= Date.now();
  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <TbCalendarEvent className="shrink-0 text-slate-400" />
        <span className="text-sm text-slate-500">Once, on</span>
        <Input
          type="datetime-local"
          value={toDateTimeLocal(once.at)}
          onChange={(e) => {
            const at = fromDateTimeLocal(e.target.value);
            if (at !== null) onChange({ kind: "once", at });
          }}
          className="w-56"
        />
        <div className="flex-1" />
        <RemoveButton onClick={onRemove} />
      </div>
      {past && (
        <p className="pl-6 text-xs text-slate-500">
          This date has passed: the recipe will not run again from it.
        </p>
      )}
    </div>
  );
}
