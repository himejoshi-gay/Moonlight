"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Cookies from "js-cookie";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { IcBaselineDiscord } from "@/components/ui/icons/ic-baseline-discord";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  useStartDiscordRegistration,
  useVerifyDiscordRegistration,
} from "@/lib/hooks/api/auth/useDiscordRegistration";
import { useRegister } from "@/lib/hooks/api/auth/useRegister";
import { useUserSearch } from "@/lib/hooks/api/user/useUserSearch";
import useDebounce from "@/lib/hooks/useDebounce";
import useSelf from "@/lib/hooks/useSelf";
import { useT } from "@/lib/i18n/utils";
import type { DiscordRegistrationVerificationResponse } from "@/lib/types/api";

import type { RegistrationDeviceIdentity } from "./registrationDevice";
import { getRegistrationDeviceIdentity } from "./registrationDevice";
import type {
  VerificationError,
  VerificationPhase,
} from "./registrationVerification";
import {
  clearStoredVerification,
  consumeOAuthCallback,
  getHttpStatus,
  getRegistrationErrorMessage,
  getVerificationErrorForStatus,
  readStoredVerification,
  storeVerification,
} from "./registrationVerification";

export default function Register() {
  const [isSuccessfulDialogOpen, setIsSuccessfulDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationPhase, setVerificationPhase] = useState<VerificationPhase>("initializing");
  const [verificationError, setVerificationError] = useState<VerificationError | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verifiedDiscord, setVerifiedDiscord] = useState<DiscordRegistrationVerificationResponse | null>(null);
  const [deviceIdentity, setDeviceIdentity] = useState<RegistrationDeviceIdentity | null>(null);
  const [usernameInput, setUsernameInput] = useState("");

  const shouldReduceMotion = useReducedMotion();
  const { trigger: triggerRegister, isMutating: isRegistering } = useRegister();
  const { trigger: triggerDiscordStart, isMutating: isStartingDiscord } = useStartDiscordRegistration();
  const { trigger: triggerDiscordVerification } = useVerifyDiscordRegistration();
  const { self, revalidate } = useSelf();
  const { toast } = useToast();
  const t = useT("pages.register");

  const debouncedUsername = useDebounce(usernameInput, 400);
  const isUsernameValid = debouncedUsername.length >= 2
    && /^[\w\- ]{1,32}$/.test(debouncedUsername);
  const { data: searchResults, isLoading: isCheckingUsername } = useUserSearch(
    verificationPhase === "verified" && isUsernameValid ? debouncedUsername : null,
    undefined,
    5,
    { revalidateOnFocus: false },
  );

  const isUsernameTaken = isUsernameValid && searchResults
    ? searchResults.some(user =>
        user.username.toLowerCase() === debouncedUsername.toLowerCase())
    : false;
  const isUsernameAvailable = isUsernameValid && searchResults && !isUsernameTaken;
  const isUsernameChecking = isUsernameValid
    && (isCheckingUsername || debouncedUsername !== usernameInput);

  const formSchema = useMemo(
    () =>
      z.object({
        username: z
          .string()
          .min(2, {
            message: t("form.validation.usernameMin", { min: 2 }),
          })
          .max(32, {
            message: t("form.validation.usernameMax", { max: 32 }),
          }),
        password: z
          .string()
          .min(8, {
            message: t("form.validation.passwordMin", { min: 8 }),
          })
          .max(32, {
            message: t("form.validation.passwordMax", { max: 32 }),
          }),
        confirmPassword: z
          .string()
          .min(8, {
            message: t("form.validation.passwordMin", { min: 8 }),
          })
          .max(32, {
            message: t("form.validation.passwordMax", { max: 32 }),
          }),
      }).refine(values => values.password === values.confirmPassword, {
        message: t("form.validation.passwordsDoNotMatch"),
        path: ["confirmPassword"],
      }),
    [t],
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
    },
  });

  const clearVerification = useCallback(() => {
    clearStoredVerification();
    setVerificationToken(null);
    setVerifiedDiscord(null);
    setVerificationError(null);
    setError(null);
    setVerificationPhase("unverified");
  }, []);

  useEffect(() => {
    let isActive = true;

    async function initializeRegistration() {
      const callback = consumeOAuthCallback();
      if (callback.error)
        clearStoredVerification();
      else if (callback.token)
        storeVerification({ token: callback.token });

      let identity: RegistrationDeviceIdentity;

      try {
        identity = await getRegistrationDeviceIdentity();
      }
      catch {
        if (!isActive)
          return;

        setVerificationError("unsupportedBrowser");
        setVerificationPhase("error");
        return;
      }

      if (!isActive)
        return;

      setDeviceIdentity(identity);

      if (callback.error) {
        setVerificationError(callback.error);
        setVerificationPhase("error");
        return;
      }

      const storedVerification = readStoredVerification();
      const token = callback.token ?? storedVerification?.token;

      if (!token) {
        setVerificationPhase("unverified");
        return;
      }

      storeVerification(
        storedVerification?.token === token
          ? { token, expiresAt: storedVerification.expiresAt }
          : { token },
      );
      setVerificationPhase("validating");

      try {
        const verified = await triggerDiscordVerification({
          ...identity,
          verification_token: token,
        });

        if (!isActive)
          return;

        const expiresAt = Date.parse(verified.expires_at);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          clearStoredVerification();
          setVerificationError("expired");
          setVerificationPhase("error");
          return;
        }

        storeVerification({ token, expiresAt });
        setVerificationToken(token);
        setVerifiedDiscord(verified);
        setVerificationError(null);
        setVerificationPhase("verified");
      }
      catch (verificationRequestError) {
        if (!isActive)
          return;

        clearStoredVerification();
        setVerificationError(
          getVerificationErrorForStatus(getHttpStatus(verificationRequestError)),
        );
        setVerificationPhase("error");
      }
    }

    void initializeRegistration();

    return () => {
      isActive = false;
    };
  }, [triggerDiscordVerification]);

  useEffect(() => {
    if (!verifiedDiscord)
      return;

    const expiresAt = Date.parse(verifiedDiscord.expires_at);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearVerification();
      setVerificationError("expired");
      setVerificationPhase("error");
      return;
    }

    const timeout = window.setTimeout(() => {
      clearVerification();
      setVerificationError("expired");
      setVerificationPhase("error");
    }, Math.min(remaining, 2_147_483_647));

    return () => window.clearTimeout(timeout);
  }, [clearVerification, verifiedDiscord]);

  const handleDiscordStart = useCallback(async () => {
    if (!deviceIdentity)
      return;

    setVerificationError(null);
    setError(null);
    clearStoredVerification();

    try {
      const data = await triggerDiscordStart(deviceIdentity);
      const authorizationUrl = new URL(data.authorization_url);

      if (
        authorizationUrl.protocol !== "https:"
        || authorizationUrl.hostname !== "discord.com"
      ) {
        throw new Error("Unexpected Discord authorization URL");
      }

      window.location.assign(authorizationUrl.toString());
    }
    catch (discordStartError) {
      setVerificationError(
        getHttpStatus(discordStartError) === 429 ? "rateLimited" : "unavailable",
      );
      setVerificationPhase("error");
    }
  }, [deviceIdentity, triggerDiscordStart]);

  const onSubmit = useCallback(
    async (values: z.infer<typeof formSchema>) => {
      setError(null);

      if (!deviceIdentity || !verificationToken || !verifiedDiscord) {
        clearVerification();
        setVerificationError("expired");
        setVerificationPhase("error");
        return;
      }

      try {
        const data = await triggerRegister({
          username: values.username,
          password: values.password,
          email: verifiedDiscord.email,
          discord_verification_token: verificationToken,
          ...deviceIdentity,
        });

        Cookies.set("session_token", data.token, {
          expires: new Date(Date.now() + data.expires_in * 1000),
        });

        Cookies.set("refresh_token", data.refresh_token, {
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        clearStoredVerification();
        setVerificationToken(null);
        setVerifiedDiscord(null);
        setVerificationError(null);
        setVerificationPhase("unverified");
        form.reset();
        setUsernameInput("");
        revalidate();
        toast({ title: t("success.toast") });
        setIsSuccessfulDialogOpen(true);
      }
      catch (registrationError) {
        const status = getHttpStatus(registrationError);

        if (status === 401 || status === 410) {
          clearVerification();
          setVerificationError("expired");
          setVerificationPhase("error");
          return;
        }

        if (status === 409) {
          setError(t("form.error.duplicateAccount"));
          return;
        }

        if (status === 429) {
          setError(t("form.error.rateLimited"));
          return;
        }

        setError(getRegistrationErrorMessage(
          registrationError,
          t("form.error.unknown"),
        ));
      }
    },
    [
      clearVerification,
      deviceIdentity,
      form,
      revalidate,
      t,
      toast,
      triggerRegister,
      verificationToken,
      verifiedDiscord,
    ],
  );

  const welcomeDescription = useMemo(
    () =>
      t.rich("welcome.description", {
        a: chunks => (
          <Link href="/wiki" className="text-primary hover:underline">
            {chunks}
          </Link>
        ),
      }),
    [t],
  );

  const termsText = useMemo(
    () =>
      t.rich("form.terms", {
        a: chunks => (
          <Link href="/rules" className="text-primary hover:underline">
            {chunks}
          </Link>
        ),
      }),
    [t],
  );

  const successMessage = useMemo(
    () =>
      t.rich("success.dialog.message", {
        a: chunks => (
          <Link
            href="/wiki#How%20to%20connect"
            className="text-primary hover:underline"
          >
            {chunks}
          </Link>
        ),
      }),
    [t],
  );

  const transitionDuration = shouldReduceMotion ? 0 : 0.2;

  return (
    <div className="flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: "easeOut" }}
        className="relative w-full max-w-lg overflow-hidden rounded-[10px] border border-border/50 bg-card shadow-md"
      >
        <div className="relative space-y-6 p-6 sm:p-8">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {t("welcome.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {welcomeDescription}
            </p>
          </div>

          <Separator className="bg-border/50" />

          <AnimatePresence mode="wait" initial={false}>
            {(verificationPhase === "initializing" || verificationPhase === "validating") && (
              <motion.div
                key="verification-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: transitionDuration }}
                className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"
                aria-live="polite"
              >
                <Loader2 className="size-6 animate-spin text-primary" />
                <div>
                  <p className="font-medium">
                    {verificationPhase === "validating"
                      ? t("verification.validating")
                      : t("verification.preparing")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("verification.pleaseWait")}
                  </p>
                </div>
              </motion.div>
            )}

            {(verificationPhase === "unverified" || verificationPhase === "error") && (
              <motion.section
                key="discord-verification"
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: transitionDuration, ease: "easeOut" }}
                className="space-y-5"
                aria-labelledby="discord-verification-title"
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-11 items-center justify-center rounded-full border border-primary/25 bg-primary/[0.08] text-primary">
                    <IcBaselineDiscord className="size-6" />
                  </div>
                  <div>
                    <h2 id="discord-verification-title" className="font-semibold">
                      {t("verification.title")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("verification.description")}
                    </p>
                  </div>
                </div>

                {verificationError && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertTitle>{t("verification.errorTitle")}</AlertTitle>
                    <AlertDescription>
                      {t(`verification.errors.${verificationError}`)}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="button"
                  onClick={() => void handleDiscordStart()}
                  disabled={!deviceIdentity || isStartingDiscord}
                  aria-busy={isStartingDiscord}
                  className="w-full bg-[#5865F2] font-medium text-white transition-transform duration-150 hover:bg-[#5865F2]/90 active:scale-[0.98]"
                >
                  {isStartingDiscord
                    ? <Loader2 className="size-4 animate-spin" />
                    : <IcBaselineDiscord className="size-4" />}
                  {isStartingDiscord
                    ? t("verification.connecting")
                    : t("verification.button")}
                </Button>

                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>{t("verification.privacy")}</span>
                </p>
              </motion.section>
            )}

            {verificationPhase === "verified" && verifiedDiscord && (
              <motion.div
                key="registration-form"
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: transitionDuration, ease: "easeOut" }}
                className="space-y-5"
              >
                <section
                  className="space-y-4 rounded-lg border border-[#8C977D]/30 bg-[#8C977D]/[0.06] p-4"
                  aria-labelledby="discord-verified-title"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#9BA88A]" />
                    <div className="min-w-0 flex-1">
                      <h2 id="discord-verified-title" className="font-medium">
                        {t("verification.verifiedTitle")}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("verification.verifiedDescription")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearVerification}
                      disabled={isRegistering}
                      className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                    >
                      {t("verification.changeAccount")}
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="verified-discord-username">
                        {t("verification.labels.username")}
                      </Label>
                      <Input
                        id="verified-discord-username"
                        value={verifiedDiscord.username}
                        readOnly
                        className="bg-background/40 text-muted-foreground"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="verified-discord-email">
                        {t("verification.labels.email")}
                      </Label>
                      <Input
                        id="verified-discord-email"
                        type="email"
                        value={verifiedDiscord.email}
                        readOnly
                        className="bg-background/40 text-muted-foreground"
                      />
                    </div>
                  </div>
                </section>

                <Separator className="bg-border/50" />

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("form.labels.username")}</FormLabel>
                          <FormControl>
                            <Input
                              autoComplete="username"
                              placeholder={t("form.placeholders.username")}
                              {...field}
                              onChange={(event) => {
                                field.onChange(event);
                                setUsernameInput(event.target.value);
                              }}
                            />
                          </FormControl>
                          <AnimatePresence mode="wait" initial={false}>
                            {isUsernameChecking && (
                              <motion.p
                                key="checking"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: transitionDuration }}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              >
                                <Loader2 className="size-3 animate-spin" />
                                {t("form.validation.checkingUsername")}
                              </motion.p>
                            )}
                            {!isUsernameChecking && isUsernameTaken && (
                              <motion.p
                                key="taken"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: transitionDuration }}
                                className="flex items-center gap-1.5 text-xs text-destructive"
                              >
                                <X className="size-3" />
                                {t("form.validation.usernameTaken")}
                              </motion.p>
                            )}
                            {!isUsernameChecking && isUsernameAvailable && (
                              <motion.p
                                key="available"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: transitionDuration }}
                                className="flex items-center gap-1.5 text-xs text-[#9BA88A]"
                              >
                                <Check className="size-3" />
                                {t("form.validation.usernameAvailable")}
                              </motion.p>
                            )}
                          </AnimatePresence>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("form.labels.password")}</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              placeholder={t("form.placeholders.password")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("form.labels.confirmPassword")}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              placeholder={t("form.placeholders.password")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="size-4" />
                        <AlertTitle>{t("form.error.title")}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      disabled={isRegistering
                        || isUsernameTaken
                        || isUsernameChecking}
                      aria-busy={isRegistering}
                      className="smooth-transition w-full transform-gpu bg-primary font-medium text-primary-foreground hover:scale-[1.01] hover:bg-primary/90 hover:shadow-[0_0_24px_rgba(141,163,185,0.2)] active:scale-[0.98]"
                    >
                      {isRegistering && <Loader2 className="size-4 animate-spin" />}
                      {isRegistering ? t("form.submitting") : t("form.submit")}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      {termsText}
                    </p>
                  </form>
                </Form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <Dialog
        open={isSuccessfulDialogOpen}
        onOpenChange={setIsSuccessfulDialogOpen}
      >
        <DialogContent className="sm:min-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("success.dialog.title")}</DialogTitle>

            <DialogDescription>
              {t("success.dialog.description")}
            </DialogDescription>
          </DialogHeader>
          <p>{successMessage}</p>

          <DialogFooter>
            <Button asChild variant="secondary" className="my-2 md:my-0">
              <Link href="/wiki#How%20to%20connect">
                {t("success.dialog.buttons.viewWiki")}
              </Link>
            </Button>

            {self && (
              <Button asChild className="my-2 md:my-0">
                <Link href={`/user/${self.user_id}`}>
                  {t("success.dialog.buttons.goToProfile")}
                </Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
