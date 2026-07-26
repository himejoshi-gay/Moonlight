import { zodResolver } from "@hookform/resolvers/zod";
import { Clock9, Star } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ModsSelector } from "@/app/(website)/beatmapsets/components/leaderboard/ModsSelector";
import RoundedContent from "@/components/General/RoundedContent";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { EosIconsThreeDotsLoading } from "@/components/ui/icons/three-dots-loading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useBeatmapPp } from "@/lib/hooks/api/beatmap/useBeatmapPp";
import { useT } from "@/lib/i18n/utils";
import type { BeatmapResponse, GameMode } from "@/lib/types/api";
import { Mods } from "@/lib/types/api";
import { gameModeToVanilla } from "@/lib/utils/gameMode.util";
import numberWith from "@/lib/utils/numberWith";
import { SecondsToString } from "@/lib/utils/secondsTo";

function createFormSchema(t: ReturnType<typeof useT>) {
  return z.object({
    accuracy: z.coerce
      .number()
      .min(0, {
        message: t("form.accuracy.validation.negative"),
      })
      .max(100, {
        message: t("form.accuracy.validation.tooHigh"),
      }),
    combo: z.coerce
      .number()
      .int()
      .min(0, {
        message: t("form.combo.validation.negative"),
      }),
    misses: z.coerce
      .number()
      .int()
      .min(0, {
        message: t("form.misses.validation.negative"),
      }),
    clockRate: z.coerce
      .number()
      .min(0.5, {
        message: t("form.clockRate.validation.tooLow"),
      })
      .max(2, {
        message: t("form.clockRate.validation.tooHigh"),
      }),
  });
}

export function PPCalculatorDialog({
  beatmap,
  mode,
  children,
}: {
  beatmap: BeatmapResponse;
  mode: GameMode;
  children: React.ReactNode;
}) {
  const t = useT("pages.beatmapsets.components.ppCalculator");
  const [isOpen, setIsOpen] = useState(false);

  const defaultValues = {
    accuracy: 100,
    combo: beatmap.max_combo,
    misses: 0,
    clockRate: 1,
  };

  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const [mods, setMods] = useState<Mods[]>([]);

  const [scoreAttributes, setScoreAttributes] = useState<{
    accuracy?: number;
    combo?: number;
    misses?: number;
    mods?: Mods[];
    clockRate?: number;
  }>(defaultValues);

  const { data, error } = useBeatmapPp(
    isOpen ? beatmap.id : null,
    {
      mode: gameModeToVanilla(mode),
      mods: scoreAttributes.mods,
      combo: scoreAttributes.combo,
      misses: scoreAttributes.misses,
      accuracy: scoreAttributes.accuracy,
      clockRate: scoreAttributes.clockRate,
    },
    { keepPreviousData: true },
  );

  const performanceResult = data;

  const speedMods = [Mods.DOUBLE_TIME, Mods.NIGHTCORE, Mods.HALF_TIME];
  const hasSpeedMod = mods.some(mod => speedMods.includes(mod));
  const selectedClockRate = form.watch("clockRate");
  const effectiveClockRate = mods.some(mod => [Mods.DOUBLE_TIME, Mods.NIGHTCORE].includes(mod))
    ? 1.5
    : mods.includes(Mods.HALF_TIME)
      ? 0.75
      : selectedClockRate;
  const beatmapLength = Math.floor(beatmap.total_length / effectiveClockRate);

  function onModsChange(nextMods: Mods[]) {
    const newlySelectedSpeedMod = speedMods.find(mod => nextMods.includes(mod) && !mods.includes(mod));
    if (newlySelectedSpeedMod) {
      form.setValue("clockRate", 1, { shouldDirty: true, shouldValidate: true });
      setMods([...nextMods.filter(mod => !speedMods.includes(mod)), newlySelectedSpeedMod]);
      return;
    }

    setMods(nextMods);
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    const { accuracy, combo, misses, clockRate } = values;

    setScoreAttributes({
      accuracy,
      combo,
      misses,
      mods,
      clockRate: hasSpeedMod ? undefined : clockRate,
    });
  }

  return (
    <Dialog onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <RoundedContent className="flex place-content-between rounded-lg ">
          {performanceResult ? (
            <>
              <p>
                {t.rich("pp", {
                  b: (chunks: ReactNode) => (
                    <b className="font-bold text-primary">{chunks}</b>
                  ),
                  value: `~${numberWith(
                    performanceResult?.pp.toFixed(2),
                    ",",
                  )}`,
                })}
              </p>

              <Tooltip content={t("totalLength")}>
                <p className="flex items-center text-sm">
                  <Clock9 className="h-4" />
                  <span className="font-bold text-primary">
                    {SecondsToString(beatmapLength)}
                  </span>
                </p>
              </Tooltip>

              <p className="flex items-center text-sm">
                <Star className="h-4" />
                <span className="font-bold text-primary">
                  {performanceResult?.difficulty.stars.toFixed(2)}
                </span>
              </p>
            </>
          ) : (
            <EosIconsThreeDotsLoading className="mx-auto size-6" />
          )}
        </RoundedContent>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
            <div className="flex items-center space-x-2">
              <FormField
                control={form.control}
                name="accuracy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.accuracy.label")}</FormLabel>
                    <FormControl>
                      <Input step="any" type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="combo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.combo.label")}</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="misses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.misses.label")}</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <ModsSelector
              mods={mods}
              setMods={onModsChange}
              mode={mode}
              variant="big"
              className="border-none bg-transparent p-0 shadow-none"
              ignoreMods={[
                Mods.NONE,
                Mods.SUDDEN_DEATH,
                Mods.PERFECT,
              ]}
            />

            <FormField
              control={form.control}
              name="clockRate"
              render={({ field }) => (
                <FormItem className="rounded-lg border border-border/50 bg-card/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>{t("form.clockRate.label")}</FormLabel>
                    <span className="font-mono text-sm font-semibold text-primary">
                      {Number(field.value).toFixed(2)}x
                    </span>
                  </div>
                  <FormControl>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.01"
                        disabled={hasSpeedMod}
                        value={field.value}
                        onChange={event => field.onChange(Number(event.target.value))}
                        className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <Input
                        type="number"
                        min="0.5"
                        max="2"
                        step="0.01"
                        disabled={hasSpeedMod}
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={event => field.onChange(event.target.value)}
                        className="w-24 font-mono"
                      />
                    </div>
                  </FormControl>
                  {hasSpeedMod && (
                    <p className="text-xs text-muted-foreground">{t("form.clockRate.locked")}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className="my-2" />
            {error && (
              <p className="text-center text-sm text-destructive">
                {error?.message ?? t("form.unknownError")}
              </p>
            )}
            <DialogFooter>
              <Button className="w-full" type="submit">
                {t("form.calculate")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
