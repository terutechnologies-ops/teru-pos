"use server";

import { redirect } from "next/navigation";

import {
  clearPlatformSessionCookie,
  PLATFORM_LOGIN_PATH,
  readPlatformSessionToken,
} from "@/server/http/platform-session";
import { getRequestContext } from "@/server/http/staff-session";
import { logoutPlatform } from "@/server/services/platform/auth";

export async function platformLogoutAction() {
  await logoutPlatform(await readPlatformSessionToken(), await getRequestContext());
  await clearPlatformSessionCookie();
  redirect(PLATFORM_LOGIN_PATH);
}
