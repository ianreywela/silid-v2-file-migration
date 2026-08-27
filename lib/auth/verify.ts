import { auth } from "@/auth";

export type AuthUser = {
  uid: string;
  email?: string;
};

export async function verifyAuth(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return null;
  }

  return {
    uid: session.user.id ?? session.user.email,
    email: session.user.email,
  };
}

export function unauthorizedResponse() {
  return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
}
