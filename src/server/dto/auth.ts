import type { StaffRole } from "@/generated/prisma/enums";

export type StaffSessionDto = {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; name: string; email: string; role: StaffRole };
  company: { id: string; name: string; slug: string };
};

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};
