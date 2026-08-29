"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { loginSchema, registerSchema } from "@/lib/validators";

export interface AuthFormState {
  error?: string;
}

/** 仅允许站内相对路径作为登录后跳转目标（防开放重定向） */
function safeNext(raw: FormDataEntryValue | null): string {
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/";
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "输入不合法" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeNext(formData.get("next")),
    });
  } catch (error) {
    // CredentialsSignin：邮箱或密码错误；其余（如 NEXT_REDIRECT）原样抛出
    if (error instanceof AuthError) {
      return { error: "邮箱或密码错误" };
    }
    throw error;
  }
  return {};
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "输入不合法" };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "该邮箱已被注册" };
  }

  try {
    await prisma.user.create({
      data: { name, email, passwordHash: hashPassword(password), role: "USER" },
    });
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeNext(formData.get("next")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "注册成功但自动登录失败，请手动登录" };
    }
    throw error;
  }
  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
