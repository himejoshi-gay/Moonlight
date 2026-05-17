"use client";
import { Github, ServerCrash, VoteIcon } from "lucide-react";

import { IcBaselineDiscord } from "@/components/ui/icons/ic-baseline-discord";
import { useT } from "@/lib/i18n/utils";

export default function Footer() {
  const t = useT("components.footer");
  const tBrand = useT("general.serverTitle.split");

  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_LINK;

  return (
    <footer className="relative overflow-hidden bg-background px-4 py-10 text-center text-sm">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(var(--primary) / 0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "linear-gradient(to bottom, black 0%, transparent 60%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto flex max-w-screen-xl flex-col items-center gap-5">
        <div className="flex items-center gap-0.5 text-2xl font-semibold tracking-tight">
          <span className="title-glow text-primary">{tBrand("part1")}</span>
          <span className="text-foreground">{tBrand("part2")}</span>
        </div>
        {process.env.NEXT_PUBLIC_OSU_SERVER_LIST_LINK && (
          <a
            href={process.env.NEXT_PUBLIC_OSU_SERVER_LIST_LINK}
            className="smooth-transition inline-flex items-center justify-center gap-2 font-bold hover:scale-105"
          >
            <VoteIcon className="size-4 text-muted-foreground" />
            <span className="animate-gradient bg-gradient-to-r from-primary via-foreground to-primary bg-size-300 bg-clip-text text-transparent">
              {t("voteMessage")}
            </span>
          </a>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-muted-foreground">
          <a
            href="https://github.com/himejoshi-gay/Moonlight"
            className="smooth-transition inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <Github className="size-4" />
            {t("sourceCode")}
          </a>

          {process.env.NEXT_PUBLIC_STATUS_PAGE_LINK && (
            <a
              href={process.env.NEXT_PUBLIC_STATUS_PAGE_LINK}
              className="smooth-transition inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <ServerCrash className="size-4" />
              {t("serverStatus")}
            </a>
          )}

          {discordUrl && (
            <a
              href={discordUrl.startsWith("http") ? discordUrl : `https://${discordUrl}`}
              className="smooth-transition inline-flex items-center gap-1.5 hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IcBaselineDiscord className="size-4" />
              Discord
            </a>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <p className="max-w-xl">{t("disclaimer")}</p>

          <p>
            Maintained by{" "}
            <a
              href="https://github.com/himejoshi-gay"
              className="smooth-transition font-medium text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              himejoshi team
            </a>
          </p>
        </div>

        <p className="text-xs text-muted-foreground">{t("copyright")}</p>
      </div>
    </footer>
  );
}
