"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { submitSalesLead } from "@/services/salesLeadService";

interface ContactSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMPTY_FORM = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  teamSize: "",
  currentWorkflow: "",
  lookingFor: "",
  message: "",
  expectedProjects: "",
  storageRequirements: "",
  aiRequirements: "",
  integrationsNeeded: "",
  timeline: "",
};

/**
 * Section 13's Enterprise Contact Sales form — public, no sign-in
 * required (a marketing-site visitor evaluating the product has no
 * account yet). Submits via salesLeadService.submitSalesLead, which
 * goes through POST /api/sales-leads (firebase-admin, since
 * firestore.rules denies ALL direct client access to sales_leads —
 * see that collection's rules block). Enterprise never activates from
 * this form — see Settings > Sales Leads' "Mark Won" flow.
 */
export function ContactSalesModal({ isOpen, onClose }: ContactSalesModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleClose() {
    onClose();
    // Reset after the close animation rather than mid-transition.
    setTimeout(() => {
      setForm(EMPTY_FORM);
      setIsSubmitted(false);
      setError(null);
    }, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.companyName.trim() || !form.email.trim()) {
      setError("Full name, company name, and work email are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await submitSalesLead(form);
      if (!result.ok) {
        setError(result.error ?? "Couldn't send your request. Try again.");
        return;
      }
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isSubmitted ? undefined : "Contact Sales"} className="max-w-lg">
      {isSubmitted ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="text-base font-semibold text-foreground">Request sent</p>
          <p className="text-sm text-foreground-muted">Our team will reach out to you shortly.</p>
          <Button className="mt-2" onClick={handleClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Full name *" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            <Input label="Company name *" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} required />
            <Input label="Work email *" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            <Input label="Phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            <Input label="Team size" value={form.teamSize} onChange={(e) => set("teamSize", e.target.value)} placeholder="e.g. 50-100" />
            <Input label="Timeline" value={form.timeline} onChange={(e) => set("timeline", e.target.value)} placeholder="e.g. This quarter" />
          </div>
          <Input label="Current workflow" value={form.currentWorkflow} onChange={(e) => set("currentWorkflow", e.target.value)} placeholder="What do you use today?" />
          <Input label="What are you looking for?" value={form.lookingFor} onChange={(e) => set("lookingFor", e.target.value)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Expected number of projects" value={form.expectedProjects} onChange={(e) => set("expectedProjects", e.target.value)} />
            <Input label="Storage requirements" value={form.storageRequirements} onChange={(e) => set("storageRequirements", e.target.value)} />
            <Input label="AI requirements" value={form.aiRequirements} onChange={(e) => set("aiRequirements", e.target.value)} />
            <Input label="Integrations needed" value={form.integrationsNeeded} onChange={(e) => set("integrationsNeeded", e.target.value)} />
          </div>
          <Textarea label="Message" rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} />

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Send request</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
