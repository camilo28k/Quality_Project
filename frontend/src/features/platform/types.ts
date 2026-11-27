import type { Role } from '@/lib/session-types';

export interface CompanySummary {
  id: string;
  tradeName: string;
  email: string | null;
  emailVerifiedAt: string | null;
  onboardingCompleted: boolean;
  active: boolean;
  createdAt: string;
  _count: { users: number; products: number; sales: number };
}

export interface CompanyDetail {
  id: string;
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  city: string | null;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  onboardingCompleted: boolean;
  active: boolean;
  createdAt: string;
  users: { id: string; name: string; email: string; role: Role; active: boolean }[];
  stats: { confirmedSales: number; salesTotal: number };
}
