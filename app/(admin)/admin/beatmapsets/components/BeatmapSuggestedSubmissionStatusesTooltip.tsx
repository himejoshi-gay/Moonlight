import { Binoculars, Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Tooltip } from "@/components/Tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EosIconsThreeDotsLoading } from "@/components/ui/icons/three-dots-loading";
import { useToast } from "@/hooks/use-toast";
import { getUserToken } from "@/lib/actions/getUserToken";
import { gatariFetcher } from "@/lib/services/fetcher";
import type { BeatmapResponse } from "@/lib/types/api";
import { BeatmapStatusWeb, Mods } from "@/lib/types/api";

const statusMap: Record<number, BeatmapStatusWeb> = {
  0: BeatmapStatusWeb.GRAVEYARD,
  1: BeatmapStatusWeb.PENDING,
  2: BeatmapStatusWeb.RANKED,
  3: BeatmapStatusWeb.APPROVED,
  4: BeatmapStatusWeb.QUALIFIED,
  5: BeatmapStatusWeb.LOVED,
};

type SuggestionStatus = {
  serverName: string;
  suggestedStatus?: BeatmapStatusWeb;
};

export function BeatmapSuggestedSubmissionStatusesTooltip({
  beatmap,
  onApplyStatus,
}: {
  beatmap: BeatmapResponse;
  onApplyStatus: (status: BeatmapStatusWeb) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [currentGamerule] = useState(Mods.NONE);
  const [suggestions, setSuggestions] = useState<SuggestionStatus[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>();

  const selectedSuggestion = suggestions.find(
    s => s.serverName === selectedServer,
  );

  const canApply = Boolean(selectedSuggestion?.suggestedStatus);

  const applySelectedSuggestion = useCallback(async () => {
    if (!selectedSuggestion?.suggestedStatus || !selectedSuggestion.serverName) {
      toast({
        title: "Select a source to apply",
        description: "Choose Akatsuki or Gatari suggestion first.",
        variant: "destructive",
      });
      return;
    }

    try {
      await onApplyStatus(selectedSuggestion.suggestedStatus);
      toast({
        title: "Beatmap status updated",
        description: `${selectedSuggestion.serverName}: ${selectedSuggestion.suggestedStatus}`,
      });
    }
    catch {
      toast({
        title: "Failed to apply status",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
  }, [onApplyStatus, selectedSuggestion, toast]);

  const fetchData = useCallback(async (force?: boolean) => {
    if (suggestions.length > 0 && !force)
      return;

    const token = await getUserToken();

    const results = await Promise.all(
      [
        {
          serverName: "Akatsuki",
          suggestedStatus: (async () => {
            if (!token) {
              return;
            }
            try {
              const response = await fetch(
                `/api/getBeatmapSuggestion?beatmapId=${beatmap.id}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
              );
              if (!response.ok) {
                return;
              }
              const data: { suggestedStatus?: BeatmapStatusWeb }
                = await response.json();
              return data.suggestedStatus;
            }
            catch {
              // Ignore errors
            }
          })(),
        },
        {
          serverName: "Gatari",
          suggestedStatus: gatariFetcher<{ data: [{ ranked: number }] }>(
            `beatmaps/get?bb=${beatmap.id}`,
          ).then((res) => {
            return statusMap[res?.data?.[0]?.ranked];
          }),
        },
      ].map(async (item) => {
        const suggestedStatus = await item.suggestedStatus;
        return {
          serverName: item.serverName,
          suggestedStatus,
        };
      }),
    );

    setSuggestions(results);
  }, [beatmap.id, suggestions.length]);

  useEffect(() => {
    if (suggestions.length === 0) {
      setSelectedServer(undefined);
      return;
    }

    const hasSelectedServer = suggestions.some(
      s => s.serverName === selectedServer && s.suggestedStatus,
    );

    if (hasSelectedServer) {
      return;
    }

    const firstAvailableSuggestion = suggestions.find(s => s.suggestedStatus);
    setSelectedServer(firstAvailableSuggestion?.serverName);
  }, [selectedServer, suggestions]);

  useEffect(() => {
    if (suggestions.length === 0)
      return;
    fetchData(true);
  }, [currentGamerule, fetchData, suggestions.length]);

  return (
    <Tooltip
      onOpenChange={fetchData}
      content={(
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            {suggestions.length > 0 ? (
              suggestions.map((data) => {
                const hasSuggestion = Boolean(data.suggestedStatus);
                const isSelected = selectedServer === data.serverName;

                return (
                  <Badge
                    variant="outline"
                    className="place-content-between gap-1 p-1"
                    key={`suggestion-status-${data.serverName}`}
                  >
                    <Button
                      variant={isSelected ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 w-full justify-between"
                      disabled={!hasSuggestion}
                      onClick={() => setSelectedServer(data.serverName)}
                    >
                      <span>{data.serverName}</span>
                      <span>{data.suggestedStatus ?? "Not found"}</span>
                    </Button>
                  </Badge>
                );
              })
            ) : (
              <EosIconsThreeDotsLoading className="mx-auto size-6" />
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={applySelectedSuggestion}
            disabled={!canApply}
          >
            <Check className="size-4" />
            Apply selected ranking
          </Button>
        </div>
      )}
    >
      <Badge
        variant="outline"
        className="flex size-8 items-center justify-center rounded-full p-0"
      >
        <Binoculars className="size-4" />
      </Badge>
    </Tooltip>
  );
}
