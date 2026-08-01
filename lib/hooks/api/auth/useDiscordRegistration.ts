import useSWRMutation from "swr/mutation";

import poster from "@/lib/services/poster";
import type {
  PostAuthDiscordStartData,
  PostAuthDiscordStartResponse,
  PostAuthDiscordVerificationData,
  PostAuthDiscordVerificationResponse,
} from "@/lib/types/api";

type DiscordStartBody = NonNullable<PostAuthDiscordStartData["body"]>;
type DiscordVerificationBody = NonNullable<PostAuthDiscordVerificationData["body"]>;

export function useStartDiscordRegistration() {
  return useSWRMutation("auth/discord/start", startDiscordRegistration);
}

export function useVerifyDiscordRegistration() {
  return useSWRMutation(
    "auth/discord/verification",
    verifyDiscordRegistration,
  );
}

async function startDiscordRegistration(
  url: string,
  { arg }: { arg: DiscordStartBody },
) {
  return await poster<PostAuthDiscordStartResponse>(url, {
    json: arg,
    credentials: "include",
  });
}

async function verifyDiscordRegistration(
  url: string,
  { arg }: { arg: DiscordVerificationBody },
) {
  return await poster<PostAuthDiscordVerificationResponse>(url, {
    json: arg,
    credentials: "include",
  });
}
