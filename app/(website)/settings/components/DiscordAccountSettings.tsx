"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DiscordLinkCallbackResult } from "@/app/(website)/settings/discordLinkCallback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { IcBaselineDiscord } from "@/components/ui/icons/ic-baseline-discord";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useDiscordLinkStatus,
  useStartDiscordLink,
  useUnlinkDiscord,
} from "@/lib/hooks/api/auth/useDiscordLink";
import { useT } from "@/lib/i18n/utils";
import { parseDiscordAuthorizationUrl } from "@/lib/utils/discordOAuth";

interface DiscordAccountSettingsProps {
  userId: number;
  callbackResult: DiscordLinkCallbackResult | null;
  onCallbackHandled: () => void;
}

function getHttpStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("response" in error))
    return;

  return (error as { response?: { status?: number } }).response?.status;
}

function getRequestErrorKey(error: unknown, fallback: "failed" | "unavailable") {
  const status = getHttpStatus(error);
  if (status === 401)
    return "sessionExpired";
  if (status === 429)
    return "rateLimited";
  if (status === 503)
    return "unavailable";

  return fallback;
}

export default function DiscordAccountSettings({
  userId,
  callbackResult,
  onCallbackHandled,
}: DiscordAccountSettingsProps) {
  const t = useT("pages.settings.components.discordAccount");
  const { toast } = useToast();
  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);
  const [isCompletingCallback, setIsCompletingCallback]
    = useState(callbackResult?.status === "success");
  const handledCallback = useRef<DiscordLinkCallbackResult | null>(null);
  const connectButton = useRef<HTMLButtonElement | null>(null);

  const {
    data: linkStatus,
    error: linkStatusError,
    isLoading: isLinkStatusLoading,
    isValidating: isValidatingLinkStatus,
    mutate: revalidateLinkStatus,
  } = useDiscordLinkStatus(userId);
  const { trigger: startDiscordLink, isMutating: isStartingLink }
    = useStartDiscordLink();
  const { trigger: unlinkDiscord, isMutating: isUnlinking }
    = useUnlinkDiscord();

  useEffect(() => {
    if (!callbackResult || handledCallback.current === callbackResult)
      return;

    handledCallback.current = callbackResult;
    onCallbackHandled();

    if (callbackResult.status === "error") {
      toast({
        title: t("toast.linkError"),
        description: t(`callbackErrors.${callbackResult.error}`),
        variant: "destructive",
      });
      return;
    }

    setIsCompletingCallback(true);
    void revalidateLinkStatus()
      .then((status) => {
        if (!status?.linked) {
          toast({
            title: t("toast.linkError"),
            description: t("callbackErrors.failed"),
            variant: "destructive",
          });
          return;
        }

        toast({
          title: t("toast.linkSuccess"),
          description: status.username
            ? t("toast.linkedAs", { username: status.username })
            : undefined,
          variant: "success",
        });
      })
      .catch(() => {
        toast({
          title: t("toast.confirmationError"),
          description: t("status.loadErrorDescription"),
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsCompletingCallback(false);
      });
  }, [callbackResult, onCallbackHandled, revalidateLinkStatus, t, toast]);

  const handleStartLink = async () => {
    try {
      const result = await startDiscordLink();
      const authorizationUrl = parseDiscordAuthorizationUrl(result.authorization_url);
      window.location.assign(authorizationUrl.toString());
    }
    catch (error) {
      toast({
        title: t("toast.linkError"),
        description: t(`callbackErrors.${getRequestErrorKey(error, "unavailable")}`),
        variant: "destructive",
      });
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkDiscord();
      await revalidateLinkStatus(
        { linked: false, username: null, linked_at: null },
        { revalidate: false },
      );
      setIsDisconnectDialogOpen(false);
      toast({
        title: t("toast.unlinkSuccess"),
        variant: "success",
      });
      window.requestAnimationFrame(() => connectButton.current?.focus());
      void revalidateLinkStatus().catch(() => null);
    }
    catch (error) {
      toast({
        title: t("toast.unlinkError"),
        description: t(`callbackErrors.${getRequestErrorKey(error, "failed")}`),
        variant: "destructive",
      });
    }
  };

  if (isLinkStatusLoading && !linkStatus) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/30 p-4">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36 rounded" />
          <Skeleton className="h-3 w-56 max-w-full rounded" />
        </div>
        <Skeleton className="hidden h-9 w-28 rounded-md sm:block" />
      </div>
    );
  }

  if (linkStatusError) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium">{t("status.loadErrorTitle")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("status.loadErrorDescription")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void revalidateLinkStatus().catch(() => null)}
          isLoading={isValidatingLinkStatus}
          className="shrink-0 transition-transform duration-150 active:scale-[0.97]"
        >
          {t("actions.retry")}
        </Button>
      </div>
    );
  }

  const isLinked = linkStatus?.linked === true;
  const areActionsDisabled = isStartingLink || isUnlinking || isCompletingCallback;

  return (
    <AlertDialog
      open={isDisconnectDialogOpen}
      onOpenChange={(open) => {
        if (!isUnlinking)
          setIsDisconnectDialogOpen(open);
      }}
    >
      <div className="flex flex-col gap-4 rounded-lg border border-border/50 bg-background/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2]/10 text-[#7289DA]">
            <IcBaselineDiscord className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">
                {isLinked ? t("status.connected") : t("status.notConnected")}
              </p>
              {isLinked && <CheckCircle2 className="size-4 text-[#9BA88A]" />}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {isLinked && linkStatus.username
                ? t("status.connectedAs", { username: linkStatus.username })
                : t(isLinked ? "status.connectedDescription" : "status.notConnectedDescription")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {isLinked ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleStartLink()}
                disabled={areActionsDisabled}
                aria-busy={isStartingLink || isCompletingCallback}
                className="transition-transform duration-150 active:scale-[0.97]"
              >
                {(isStartingLink || isCompletingCallback) && (
                  <Loader2 className="animate-spin" />
                )}
                {t(isCompletingCallback
                  ? "actions.confirming"
                  : isStartingLink
                    ? "actions.connecting"
                    : "actions.change")}
              </Button>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={areActionsDisabled}
                  className="text-destructive transition-transform duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
                >
                  {t("actions.disconnect")}
                </Button>
              </AlertDialogTrigger>
            </>
          ) : (
            <Button
              ref={connectButton}
              type="button"
              size="sm"
              onClick={() => void handleStartLink()}
              disabled={areActionsDisabled}
              aria-busy={isStartingLink || isCompletingCallback}
              className="bg-[#5865F2] text-white transition-transform duration-150 hover:bg-[#5865F2]/90 active:scale-[0.97]"
            >
              {isStartingLink || isCompletingCallback
                ? <Loader2 className="animate-spin" />
                : <IcBaselineDiscord />}
              {t(isCompletingCallback
                ? "actions.confirming"
                : isStartingLink
                  ? "actions.connecting"
                  : "actions.connect")}
            </Button>
          )}
        </div>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("disconnectDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("disconnectDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isUnlinking}>
            {t("disconnectDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isUnlinking}
            aria-busy={isUnlinking}
            onClick={(event) => {
              event.preventDefault();
              void handleUnlink();
            }}
            className="bg-destructive text-destructive-foreground transition-transform duration-150 hover:bg-destructive/90 active:scale-[0.97]"
          >
            {isUnlinking && <Loader2 className="animate-spin" />}
            {t(isUnlinking
              ? "disconnectDialog.disconnecting"
              : "disconnectDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
