import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getListingBySlug, submitApplication } from "@/lib/appfolio.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BUCKET = "application-documents";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const SAUDI_PHONE = /^0?5\d{8}$/;

type UploadedDoc = {
  name: string;
  path: string;
  size: number;
  type: string;
};

export const Route = createFileRoute("/listings/$slug/apply")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["listing", params.slug],
      queryFn: () => getListingBySlug({ data: { slug: params.slug } }),
    }),
  head: ({ params, loaderData }) => {
    const l = loaderData as { title?: string } | null;
    const title = l?.title
      ? `Apply for ${l.title} — Aqari`
      : "Rental application — Aqari";
    return {
      meta: [
        { title },
        { name: "description", content: "Apply online for this rental property in 3 quick steps." },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: `https://hrhbs.com/listings/${params.slug}/apply` }],
    };
  },
  component: ApplyPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center">
      <p className="text-destructive">{String(error)}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-center">Listing not found.</div>
  ),
});

function ApplyPage() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language?.startsWith("ar");
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => getListingBySlug({ data: { slug } }),
  });
  const listing = q.data as
    | { id: string; org_id: string; title: string; hero_image?: string; city?: string; price?: number; currency?: string }
    | undefined;

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  // Step 1 — personal details
  const [applicantName, setApplicantName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [idType, setIdType] = useState<"national" | "iqama" | "passport">("national");
  const [nationalId, setNationalId] = useState("");
  const [dependents, setDependents] = useState("");

  // Step 2 — employment
  const [employmentType, setEmploymentType] = useState<
    "private" | "government" | "self" | "student" | "unemployed"
  >("private");
  const [employer, setEmployer] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [currentRent, setCurrentRent] = useState("");
  const [moveInDate, setMoveInDate] = useState("");

  // Step 3 — documents + consent
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [consent, setConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // The `nonce` scopes uploads to one submission session so they can be
  // linked to the created row without colliding with other applicants
  // for the same listing.
  const nonce = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    [],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!listing) return;
      const list = Array.from(files);
      const errors: string[] = [];
      const okFiles = list.filter((f) => {
        if (f.size > MAX_FILE_BYTES) {
          errors.push(`${f.name}: ${t("listings.apply.wizard.fileTooLarge")}`);
          return false;
        }
        if (!ALLOWED_TYPES.includes(f.type)) {
          errors.push(`${f.name}: ${t("listings.apply.wizard.invalidType")}`);
          return false;
        }
        return true;
      });
      if (errors.length > 0) errors.forEach((e) => toast.error(e));
      if (okFiles.length === 0) return;

      setUploading(true);
      try {
        const uploaded: UploadedDoc[] = [];
        for (const file of okFiles) {
          const safeName = file.name.replace(/[^\w.\-]/g, "_");
          const path = `${listing.org_id}/${listing.id}/${nonce}/${Date.now()}-${safeName}`;
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { contentType: file.type, upsert: false });
          if (error) {
            toast.error(`${file.name}: ${t("listings.apply.wizard.uploadFailed")}`);
            continue;
          }
          uploaded.push({ name: file.name, path, size: file.size, type: file.type });
        }
        setDocuments((d) => [...d, ...uploaded].slice(0, 10));
      } finally {
        setUploading(false);
      }
    },
    [listing, nonce, t],
  );

  const removeDocument = useCallback(async (doc: UploadedDoc) => {
    setDocuments((d) => d.filter((x) => x.path !== doc.path));
    try {
      await supabase.storage.from(BUCKET).remove([doc.path]);
    } catch {
      /* best-effort */
    }
  }, []);

  const validateStep = useCallback(
    (idx: number): string | null => {
      if (idx === 0) {
        if (!applicantName.trim()) return t("listings.apply.wizard.nameRequired");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          return t("listings.apply.wizard.emailInvalid");
        if (phone && !SAUDI_PHONE.test(phone.trim()))
          return t("listings.apply.wizard.phoneInvalid");
      }
      if (idx === 2) {
        if (!consent) return t("listings.apply.wizard.consentRequired");
      }
      return null;
    },
    [applicantName, email, phone, consent, t],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!listing) throw new Error("Listing missing");
      return submitApplication({
        data: {
          listingId: listing.id,
          orgId: listing.org_id,
          applicantName: applicantName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          monthlyIncome: monthlyIncome ? Number(monthlyIncome) : undefined,
          employer: employer.trim() || undefined,
          moveInDate: moveInDate || undefined,
          creditCheckConsent: consent,
          nationalId: nationalId.trim() || undefined,
          idType,
          employmentType,
          dependents: dependents ? Number(dependents) : undefined,
          currentRent: currentRent ? Number(currentRent) : undefined,
          documents: documents.length > 0 ? documents : undefined,
        },
      });
    },
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => toast.error(e.message || t("listings.apply.wizard.errorTitle")),
  });

  if (q.isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!listing) {
    return (
      <div className="p-8 text-center">
        <p>{t("listings.notFound")}</p>
        <Button asChild variant="link" className="mt-4">
          <Link to="/listings">{t("listings.allListings")}</Link>
        </Button>
      </div>
    );
  }

  const steps = [
    t("listings.apply.wizard.step1.label"),
    t("listings.apply.wizard.step2.label"),
    t("listings.apply.wizard.step3.label"),
  ];

  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    if (step === 2) {
      submit.mutate();
      return;
    }
    setDirection(1);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: (isRTL ? -1 : 1) * dir * 40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: (isRTL ? 1 : -1) * dir * 40, opacity: 0 }),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30" dir={isRTL ? "rtl" : "ltr"}>
      <header className="border-b bg-background/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/listings/$slug" params={{ slug }}>
              <ArrowLeft className={`size-4 ${isRTL ? "ml-1 rotate-180" : "mr-1"}`} />
              {t("listings.apply.wizard.backToListing")}
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground truncate max-w-[50%]">{listing.title}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mb-6 text-center"
        >
          <h1 className="text-2xl md:text-3xl font-bold">{t("listings.apply.wizard.heading")}</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            {t("listings.apply.wizard.subheading")}
          </p>
        </motion.div>

        {/* Stepper */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            {steps.map((label, i) => (
              <div key={label} className="flex-1 flex items-center gap-2">
                <motion.div
                  animate={{
                    scale: i === step ? 1.05 : 1,
                    backgroundColor:
                      i < step
                        ? "hsl(var(--primary))"
                        : i === step
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted))",
                    color:
                      i <= step ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  }}
                  transition={{ duration: 0.25 }}
                  className="size-8 rounded-full grid place-items-center text-xs font-semibold shadow-sm"
                >
                  {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
                </motion.div>
                <span className={`text-xs md:text-sm ${i === step ? "font-semibold" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {i < steps.length - 1 && (
                  <div className="flex-1 h-0.5 bg-muted overflow-hidden rounded">
                    <motion.div
                      className="h-full bg-primary"
                      animate={{ width: i < step ? "100%" : "0%" }}
                      transition={{ duration: 0.35 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {t("listings.apply.wizard.stepOf", { current: step + 1, total: steps.length })}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 min-h-[320px] overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              {submitted ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="py-10 text-center space-y-3"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="mx-auto size-16 rounded-full bg-primary/10 grid place-items-center"
                  >
                    <CheckCircle2 className="size-8 text-primary" />
                  </motion.div>
                  <h2 className="text-xl font-semibold">
                    {t("listings.apply.wizard.successTitle")}
                  </h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {t("listings.apply.wizard.successBody", { name: applicantName })}
                  </p>
                  <div className="pt-4 flex gap-2 justify-center">
                    <Button variant="outline" onClick={() => navigate({ to: "/listings/$slug", params: { slug } })}>
                      {t("listings.apply.wizard.backToListing")}
                    </Button>
                    <Button asChild>
                      <Link to="/listings">{t("listings.allListings")}</Link>
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="space-y-4"
                >
                  {step === 0 && (
                    <>
                      <h2 className="text-lg font-semibold mb-2">
                        {t("listings.apply.wizard.step1.title")}
                      </h2>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <Label htmlFor="applicantName">{t("listings.apply.fullName")}</Label>
                          <Input
                            id="applicantName"
                            value={applicantName}
                            onChange={(e) => setApplicantName(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div>
                          <Label htmlFor="email">{t("listings.apply.email")}</Label>
                          <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone">{t("listings.apply.phone")}</Label>
                          <Input
                            id="phone"
                            inputMode="tel"
                            placeholder="05XXXXXXXX"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>{t("listings.apply.wizard.idType")}</Label>
                          <Select value={idType} onValueChange={(v) => setIdType(v as typeof idType)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="national">{t("listings.apply.wizard.idNational")}</SelectItem>
                              <SelectItem value="iqama">{t("listings.apply.wizard.idIqama")}</SelectItem>
                              <SelectItem value="passport">{t("listings.apply.wizard.idPassport")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="nationalId">{t("listings.apply.wizard.nationalId")}</Label>
                          <Input
                            id="nationalId"
                            value={nationalId}
                            onChange={(e) => setNationalId(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="dependents">{t("listings.apply.wizard.dependents")}</Label>
                          <Input
                            id="dependents"
                            type="number"
                            min={0}
                            max={20}
                            value={dependents}
                            onChange={(e) => setDependents(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {step === 1 && (
                    <>
                      <h2 className="text-lg font-semibold mb-2">
                        {t("listings.apply.wizard.step2.title")}
                      </h2>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>{t("listings.apply.wizard.employmentType")}</Label>
                          <Select
                            value={employmentType}
                            onValueChange={(v) => setEmploymentType(v as typeof employmentType)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(["private", "government", "self", "student", "unemployed"] as const).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {t(`listings.apply.wizard.emp.${k}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="employer">{t("listings.apply.employer")}</Label>
                          <Input
                            id="employer"
                            value={employer}
                            onChange={(e) => setEmployer(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="monthlyIncome">{t("listings.apply.monthlyIncome")}</Label>
                          <Input
                            id="monthlyIncome"
                            type="number"
                            min={0}
                            value={monthlyIncome}
                            onChange={(e) => setMonthlyIncome(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="currentRent">{t("listings.apply.wizard.currentRent")}</Label>
                          <Input
                            id="currentRent"
                            type="number"
                            min={0}
                            value={currentRent}
                            onChange={(e) => setCurrentRent(e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="moveInDate">{t("listings.apply.moveInDate")}</Label>
                          <Input
                            id="moveInDate"
                            type="date"
                            value={moveInDate}
                            onChange={(e) => setMoveInDate(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {step === 2 && (
                    <>
                      <h2 className="text-lg font-semibold mb-2">
                        {t("listings.apply.wizard.step3.title")}
                      </h2>
                      <div>
                        <Label>{t("listings.apply.wizard.documents")}</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t("listings.apply.wizard.documentsHint")}
                        </p>
                        <motion.div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                          }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          animate={{
                            borderColor: dragOver ? "hsl(var(--primary))" : "hsl(var(--border))",
                            backgroundColor: dragOver ? "hsl(var(--primary) / 0.05)" : "transparent",
                          }}
                          className="cursor-pointer border-2 border-dashed rounded-lg p-6 text-center transition-colors"
                        >
                          <Upload className="mx-auto size-6 text-muted-foreground" />
                          <p className="mt-2 text-sm">{t("listings.apply.wizard.dropHere")}</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                          >
                            {t("listings.apply.wizard.addFiles")}
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files) uploadFiles(e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </motion.div>

                        {uploading && (
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Loader2 className="size-3 animate-spin" />
                            {t("listings.apply.wizard.uploading")}
                          </p>
                        )}

                        <ul className="mt-3 space-y-2">
                          <AnimatePresence>
                            {documents.map((doc) => (
                              <motion.li
                                key={doc.path}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: isRTL ? -20 : 20 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
                              >
                                <FileText className="size-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 truncate">{doc.name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {(doc.size / 1024).toFixed(0)} KB
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeDocument(doc)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  aria-label={t("listings.apply.wizard.remove")}
                                >
                                  <X className="size-4" />
                                </button>
                              </motion.li>
                            ))}
                          </AnimatePresence>
                        </ul>
                      </div>

                      <label className="flex items-start gap-2 pt-2 text-sm">
                        <Checkbox
                          checked={consent}
                          onCheckedChange={(v) => setConsent(!!v)}
                          className="mt-0.5"
                        />
                        <span>{t("listings.apply.consent")}</span>
                      </label>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {!submitted && (
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={goBack}
              disabled={step === 0 || submit.isPending}
            >
              <ArrowLeft className={`size-4 ${isRTL ? "ml-1 rotate-180" : "mr-1"}`} />
              {t("listings.apply.wizard.back")}
            </Button>
            <Button type="button" onClick={goNext} disabled={submit.isPending || uploading}>
              {submit.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {t("listings.apply.wizard.submitting")}
                </>
              ) : step === steps.length - 1 ? (
                t("listings.apply.wizard.submit")
              ) : (
                <>
                  {t("listings.apply.wizard.next")}
                  <ArrowRight className={`size-4 ${isRTL ? "mr-1 rotate-180" : "ml-1"}`} />
                </>
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
