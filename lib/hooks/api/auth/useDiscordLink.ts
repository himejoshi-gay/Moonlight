"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";

import fetcher from "@/lib/services/fetcher";
import poster from "@/lib/services/poster";
import type { DiscordRegistrationStartResponse } from "@/lib/types/api";

export interface DiscordLinkStatusResponse {
  linked: boolean;
  username: string | null;
  linked_at: string | null;
}

const DISCORD_LINK_STATUS_ENDPOINT = "user/self/discord-link";

export function useDiscordLinkStatus(userId: number | null) {
  return useSWR<DiscordLinkStatusResponse>(
    userId === null ? null : [DISCORD_LINK_STATUS_ENDPOINT, userId],
    ([url]: [string, number]) => fetcher<DiscordLinkStatusResponse>(url, {
      cache: "no-store",
    }),
    { refreshInterval: 0 },
  );
}

export function useStartDiscordLink() {
  return useSWRMutation("auth/discord/link/start", startDiscordLink);
}

export function useUnlinkDiscord() {
  return useSWRMutation("user/self/discord-link/unlink", unlinkDiscord);
}

async function startDiscordLink(url: string) {
  return await poster<DiscordRegistrationStartResponse>(url, {
    credentials: "include",
  });
}

async function unlinkDiscord(url: string) {
  await poster<Response>(url);
}
