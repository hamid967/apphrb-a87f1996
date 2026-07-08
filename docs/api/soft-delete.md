# Soft-Delete API — دليل الاستخدام

هذا الدليل يوثّق آلية الحذف الناعم (soft-delete) الموحّدة عبر موارد النظام
(`contracts`, `payments`, `tenants`, `units`) وطريقة استدعائها من الواجهة.

## المبادئ العامة

- كل جدول مشمول يحتوي عمود `deleted_at timestamptz` — قيمة `NULL` تعني نشط،
  وقيمة زمنية تعني مؤرشف/محذوف.
- **كل استعلامات القراءة الافتراضية تستبعد المؤرشفات تلقائيًا** عبر
  `.is("deleted_at", null)`؛ لا حاجة لأي فلترة يدوية من الواجهة.
- لعرض المؤرشفات صراحةً استخدم دوال `listArchived*` المخصّصة أو علم
  `includeDeleted` في الدوال التي تدعمه.
- عمليات الحذف تستخدم `archive*` (تعيين `deleted_at`) والاسترجاع
  `restore*` (تصفير `deleted_at`)، وكلاهما يقبل حتى 200 معرّف دفعة واحدة.
- جميع الدوال محميّة بـ `requireSupabaseAuth` وتخضع لسياسات RLS الخاصة
  بالمؤسسة/المالك.

## جدول الدوال المتاحة

| المورد     | القوائم النشطة       | القوائم المؤرشفة          | الأرشفة              | الاسترجاع           |
| ---------- | -------------------- | ------------------------- | -------------------- | ------------------- |
| Contracts  | `listContracts`      | `listArchivedContracts`   | `archiveContracts`   | `restoreContracts`  |
| Payments   | (مضمّنة في العقد)    | `listArchivedPayments`    | `archivePayments`    | `restorePayments`   |
| Tenants    | `listTenants`        | `listArchivedTenants`     | `deleteTenant`       | `restoreTenants`    |
| Units      | `listUnits`          | `listArchivedUnits`       | `archiveUnits`       | `restoreUnits`      |

> `deleteTenant` يُطبّق حذفًا ناعمًا (يضع `deleted_at`) وليس حذفًا فيزيائيًا.

## علم `includeDeleted`

الدوال التي تعرض تفاصيل مورد فرد تقبل علم `includeDeleted` لضمّ السجلات
الفرعية المؤرشفة في نتيجة واحدة (مفيد لصفحة الأرشيف/سجل التدقيق).

### `getContractDetail`

```ts
import { getContractDetail } from "@/lib/contracts.functions";

// الاستخدام العادي: الدفعات النشطة فقط
const detail = await getContractDetail({
  data: { orgId, contractId },
});

// عرض الدفعات مع المؤرشفة (مثلاً صفحة "أرشيف العقد")
const withArchived = await getContractDetail({
  data: { orgId, contractId, includeDeleted: true },
});
// detail.payments[i].deleted_at قد يكون timestamp أو null
```

الافتراضي: `includeDeleted = false`.

## أمثلة `listArchived*`

### العقود

```ts
import { listArchivedContracts } from "@/lib/contracts.functions";

const archived = await listArchivedContracts({ data: { org_id: orgId } });
// [{ id, contract_number, status, deleted_at, tenants: {…}, units: {…} }, …]
```

### الدفعات

```ts
import { listArchivedPayments } from "@/lib/rent-payments.functions";

const archived = await listArchivedPayments({ data: { org_id: orgId } });
// [{ id, contract_id, amount, paid_at, deleted_at, contracts: {…}, tenants: {…} }, …]
```

### المستأجرون

```ts
import { listArchivedTenants } from "@/lib/tenants.functions";

const archived = await listArchivedTenants({ data: { org_id: orgId } });
```

### الوحدات

```ts
import { listArchivedUnits } from "@/lib/units.functions";

const archived = await listArchivedUnits({ data: { org_id: orgId } });
// يشمل join مع buildings/properties لعرض السياق كما في القائمة النشطة
```

## أمثلة `archive*` و`restore*`

كل الدوال تقبل مصفوفة `ids` بحد أقصى 200 معرّف. الأرشفة لا تلمس السجلات
المؤرشفة سابقًا، والاسترجاع لا يلمس السجلات النشطة.

### أرشفة/استرجاع عقود

```ts
import { archiveContracts, restoreContracts } from "@/lib/contracts.functions";

await archiveContracts({ data: { ids: [contractId1, contractId2] } });
await restoreContracts({ data: { ids: [contractId1] } });
// => { ok: true, count: N }
```

### أرشفة/استرجاع دفعات

```ts
import { archivePayments, restorePayments } from "@/lib/rent-payments.functions";

await archivePayments({ data: { ids: [paymentId] } });
await restorePayments({ data: { ids: [paymentId] } });
```

### حذف/استرجاع مستأجر

```ts
import { deleteTenant, restoreTenants } from "@/lib/tenants.functions";

await deleteTenant({ data: { id: tenantId, org_id: orgId } });
await restoreTenants({ data: { ids: [tenantId] } });
```

### أرشفة/استرجاع وحدات

```ts
import { archiveUnits, restoreUnits } from "@/lib/units.functions";

await archiveUnits({ data: { ids: [unitId] } });
await restoreUnits({ data: { ids: [unitId] } });
```

## نمط الاستخدام في React (TanStack Query)

```tsx
const [showArchived, setShowArchived] = useState(false);

const q = useQuery({
  queryKey: ["tenants", orgId, showArchived ? "archived" : "active"],
  queryFn: () =>
    showArchived
      ? listArchivedTenants({ data: { org_id: orgId! } })
      : listTenants({ data: { org_id: orgId! } }),
  enabled: !!orgId,
});

const restoreMut = useMutation({
  mutationFn: (id: string) => restoreTenants({ data: { ids: [id] } }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants", orgId] }),
});
```

> لا تنسَ إبطال كلا المفتاحين (`active` و`archived`) بعد
> `archive`/`restore` — استخدم `qc.invalidateQueries({ queryKey: ["tenants", orgId] })`
> بدون التمييز بينهما ليطابق الاثنين.

## سلوك RLS

- الأرشفة والاسترجاع يحدثان تحت هوية المستخدم الحالي؛ سياسة `UPDATE`
  الخاصة بكل جدول (org admin/owner) هي التي تحكم من يستطيع تنفيذها.
- سياسات القراءة الافتراضية **لا** تفلتر `deleted_at`؛ الفلترة تحدث في
  طبقة الدوال. هذا يسمح لصفحات الأرشيف بقراءة نفس الجدول بنفس السياسة.
- لا يوجد "حذف صلب" (`DELETE`) مكشوف عبر الـ API لهذه الموارد؛ إذا لزم
  حذف نهائي فيتم عبر مهمة صيانة على الخادم فقط.