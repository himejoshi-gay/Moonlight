"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { ModIcons } from "@/components/ModIcons";
import { Button } from "@/components/ui/button";
import type { BeatmapResponse, ScoreResponse } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import numberWith from "@/lib/utils/numberWith";

import { ScoreAccuracyDial } from "./ScoreAccuracyDial";
import { ScoreBeatmapInfo } from "./ScoreBeatmapInfo";
import { ScoreRankTower } from "./ScoreRankTower";

interface ScoreHeroProps {
  score: ScoreResponse;
  beatmap: BeatmapResponse;
  isReplayLoading: boolean;
  canDownloadReplay: boolean;
  onDownloadReplay: () => void;
  downloadReplayLabel: string;
}

export function ScoreHero({
  score,
  beatmap,
  isReplayLoading,
  canDownloadReplay,
  onDownloadReplay,
  downloadReplayLabel,
}: ScoreHeroProps) {
  const [coverLoaded, setCoverLoaded] = useState(false);

  return (
    <div className="overflow-hidden rounded-[10px] border border-border/50 shadow-md">
      <ScoreBeatmapInfo beatmap={beatmap} score={score} />

      {/* Hero with cover background */}
      <div className="relative min-h-[240px]">
        {/* Cover image */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="size-full"
            style={{ backgroundColor: "hsl(var(--secondary))" }}
          >
            <img
              src={`https://assets.ppy.sh/beatmaps/${beatmap.beatmapset_id}/covers/cover@2x.jpg`}
              alt=""
              onLoad={() => setCoverLoaded(true)}
              className={cn(
                "size-full object-cover transition-opacity duration-500",
                coverLoaded ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
          {/* Dark overlay */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "hsl(var(--card) / 0.78)" }}
          />
        </div>

        {/* Hero content */}
        <div className="relative flex flex-col items-center gap-5 px-4 py-6 md:flex-row md:items-center md:gap-8 md:p-8">
          {/* Rank tower */}
          <ScoreRankTower grade={score.grade} />

          {/* Accuracy dial */}
          <div className="flex-shrink-0">
            <ScoreAccuracyDial
              accuracy={score.accuracy}
              grade={score.grade}
              gameMode={score.game_mode}
            />
          </div>

          {/* Player info: mods, score value, global rank */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-3 md:items-start">
            {/* Mods */}
            {score.mods_int != null && (score.mods_int > 0 || score.clock_rate !== 1) && (
              <ModIcons modsBitset={score.mods_int} speedMultiplier={score.clock_rate} />
            )}

            {/* Score value */}
            <p
              className="text-5xl font-light leading-none text-white md:text-7xl"
              style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
            >
              {numberWith(score.total_score, ",")}
            </p>

            {/* Global rank */}
            <div className="flex flex-col items-center md:items-start">
              <span className="rounded-full bg-secondary/90 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Global Ranking
              </span>
              <span className="text-xl font-bold text-white">
                {score.leaderboard_rank
                  ? `#${numberWith(score.leaderboard_rank, ",")}`
                  : "-"}
              </span>
            </div>
          </div>

          {/* Replay button */}
          <div className="md:absolute md:bottom-5 md:right-8">
            <Button
              onClick={onDownloadReplay}
              disabled={!canDownloadReplay}
              isLoading={isReplayLoading}
              variant="secondary"
              size="sm"
              className="rounded-full"
            >
              <Download className="size-4" />
              {downloadReplayLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
