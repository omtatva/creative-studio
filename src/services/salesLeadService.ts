import { getDoc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { salesLeadsCol, salesLeadDoc } from "@/lib/firebase/firestore";
import { SalesLead, SalesLeadStatus } from "@/types/billing.types";

/**
 * Reading/updating a lead's status IS a direct client Firestore call —
 * safe because firestore.rules gates both to isSuperAdmin(), the exact
 * same check every other cross-workspace admin view in this app
 * already uses. Only CREATING a lead (a public, unauthenticated
 * marketing-form submission) needs a server route — see
 * submitSalesLead below — since firestore.rules denies client
 * `create` entirely (an anonymous visitor has nothing to be
 * authorized by).
 */

export interface SubmitLeadPayload {
  name: string;
  companyName: string;
  email: string;
  phone?: string;
  teamSize?: string;
  currentWorkflow?: string;
  lookingFor?: string;
  message?: string;
  expectedProjects?: string;
  storageRequirements?: string;
  aiRequirements?: string;
  integrationsNeeded?: string;
  timeline?: string;
  workspaceId?: string;
}

export async function submitSalesLead(payload: SubmitLeadPayload): Promise<{ ok: boolean; error?: string; leadId?: string }> {
  let response: Response;
  try {
    response = await fetch("/api/sales-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: data?.error ?? "Couldn't send your request." };
  return { ok: true, leadId: data.leadId };
}

export async function getSalesLeads(): Promise<SalesLead[]> {
  const snapshot = await getDocs(query(salesLeadsCol(), orderBy("createdAt", "desc")));
  return snapshot.docs.map((d) => d.data());
}

export async function getSalesLead(leadId: string): Promise<SalesLead | null> {
  const snapshot = await getDoc(salesLeadDoc(leadId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function updateSalesLeadStatus(leadId: string, status: SalesLeadStatus): Promise<void> {
  await updateDoc(salesLeadDoc(leadId), { status, updatedAt: new Date().toISOString() });
}
