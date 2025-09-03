import React, { useState, useEffect } from 'react'; // Added useEffect import
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE_URL = 'https://quantnow-cu1v.onrender.com'; // Ensure this matches your backend URL

// --- Define Types Inline ---
interface FamilyMember {
    id?: string;
    name: string;
    surname: string;
    relationship: string;
    date_of_birth: string | null; // YYYY-MM-DD or null
}

interface ExtendedFamilyMember {
    id?: string;
    name: string;
    surname: string;
    relationship: string;
    date_of_birth: string | null; // YYYY-MM-DD or null
    premium: number;
}

interface Application {
    id?: string;
    // Member Details
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string;
    nationality: string;
    gender: string;
    date_of_birth: string | null; // YYYY-MM-DD or null
    id_number: string;
    alt_name: string;
    relation_to_member: string;
    relation_dob: string | null; // YYYY-MM-DD or null

    // Family & Extended Family
    family_members: FamilyMember[];
    extended_family: ExtendedFamilyMember[];

    // Plan and Payment
    plan_options: Record<string, boolean>;
    beneficiary_name: string;
    beneficiary_surname: string;
    beneficiary_contact: string;
    pay_options: Record<string, boolean>;
    total_amount: number;
    bank: string;
    branch_code: string;
    account_holder: string;
    account_number: string;
    deduction_date: string | null; // YYYY-MM-DD or null
    account_type: string;
    commencement_date: string | null; // YYYY-MM-DD or null

    // Declaration
    declaration_signature: string;
    declaration_date: string | null; // YYYY-MM-DD or null
    call_time: string | null; // HH:MM or null
    agent_name: string;

    // Agent Details
    connector_name: string;
    connector_contact: string;
    connector_province: string;
    team_leader: string;
    team_contact: string;
    team_province: string;
}

/** A4 (210mm) at CSS px density (96dpi) */
const A4_WIDTH_PX = 210 * 3.7795275591; // ≈ 794px

const AgentSignup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- NEW: State for authentication token ---
  const [authToken, setAuthToken] = useState<string | null>(null);

  // --- NEW: Effect to get token from localStorage ---
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    setAuthToken(token);
  }, []);

const handleSaveApplication = async (applicationData: any) => {
  if (!authToken) {
    toast({
      title: '❌ Authentication Error',
      description: 'You are not logged in. Please log in and try again.',
      variant: 'destructive',
    });
    return;
  }

  setIsSubmitting(true);
  try {
    // 🔁 Map what the backend expects:
    // - name/surname (not firstName/lastName)
    // - keep the rest as-is
    const payload = {
      ...applicationData,
      name: applicationData.firstName || '',   // 👈 map
      surname: applicationData.lastName || '', // 👈 map
    };

    // (Optional) clean up if you don’t want to send firstName/lastName at all:
    // delete payload.firstName;
    // delete payload.lastName;

    const response = await fetch(`${API_BASE_URL}/api/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to submit application: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Application submitted successfully:', result);
    toast({ title: '✅ Success!', description: 'Application submitted successfully.' });
  } catch (err: any) {
    console.error('Error submitting application:', err);
    toast({
      title: '❌ Submission Failed',
      description: err.message || 'An error occurred while submitting the application. Please try again.',
      variant: 'destructive',
    });
  } finally {
    setIsSubmitting(false);
  }
};


  const handleCancel = () => {
    // Optionally navigate back or to a specific agent page
    // navigate(-1); // Go back
    navigate('/'); // Go to dashboard
  };

  return (
    <div className="container mx-auto py-6">
      <Card className="w-full max-w-6xl mx-auto"> {/* Adjust max-w if needed */}
        <CardHeader>
          <CardTitle>Register New Person</CardTitle>
          <CardDescription>
            Please fill in the details for the new applicant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* --- EMBEDDED FORM START --- */}
          <CustomerFormFullPage onSave={handleSaveApplication} onCancel={handleCancel} />
          {/* --- EMBEDDED FORM END --- */}

          {/* Show a global submitting indicator if needed, though the form handles its own button state */}
          {isSubmitting && (
             <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-4 rounded-md shadow-lg">
                   <p>Submitting application...</p>
                </div>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/* =========================================================
    FULL‑PAGE, SCROLLABLE FORM (NO MODAL)
    ========================================================= */
function CustomerFormFullPage({
    application,
    onSave,
    onCancel,
}: {
    application?: Application;
    onSave: (a: Application) => void;
    onCancel?: () => void;
}) {
    return (
        <div className="w-full h-[100vh] flex flex-col">
            {/* Sticky top bar (not printed) */

            /* Page body (scrollable) */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-[1200px] mx-auto w-full px-4 py-4">
                    <CustomerForm application={application} onSave={onSave} onCancel={onCancel} />
                </div>
            </div>
        </div>
    );
}

/* =========================================================
    Print‑perfect A4 Form (scaled to fit container width)
    ========================================================= */
function CustomerForm({
    application,
    onSave,
    onCancel,
}: {
    application?: Application;
    onSave: (application: Application) => void;
    onCancel?: () => void;
}) {
    // Helper function to format date from DD/MM/YYYY to YYYY-MM-DD, or return null for empty strings
    const formatDate = (dateStr: string) => {
        if (!dateStr || dateStr.trim() === '') {
            return null;
        }
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month}-${day}`;
    };

    // Helper function to return null for empty time strings
    const formatTime = (timeStr: string) => {
        if (!timeStr || timeStr.trim() === '') {
            return null;
        }
        return timeStr;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formElement = e.target as HTMLFormElement; // Get the form element directly
        const fd = new FormData(formElement);

        // Extract main application fields
        const applicationData: Partial<Application> = {
            firstName: fd.get("firstName") as string,
            lastName: fd.get("lastName") as string,
            phone: fd.get("phone") as string,
            email: fd.get("email") as string,
            address: fd.get("address") as string,
            nationality: fd.get("nationality") as string,
            gender: fd.get("gender") as string,
            date_of_birth: formatDate(fd.get("dob") as string),
            id_number: fd.get("id_number") as string,
            alt_name: fd.get("alt_name") as string,
            relation_to_member: fd.get("relation_to_member") as string,
            relation_dob: formatDate(fd.get("relation_dob") as string),
            beneficiary_name: fd.get("beneficiary_name") as string,
            beneficiary_surname: fd.get("beneficiary_surname") as string,
            beneficiary_contact: fd.get("beneficiary_contact") as string,
            total_amount: parseFloat(fd.get("total_amount") as string),
            bank: fd.get("bank") as string,
            branch_code: fd.get("branch_code") as string,
            account_holder: fd.get("account_holder") as string,
            account_number: fd.get("account_number") as string,
            deduction_date: formatDate(fd.get("deduction_date") as string),
            account_type: fd.get("account_type") as string,
            commencement_date: formatDate(fd.get("commencement_date") as string),
            declaration_signature: fd.get("declaration_signature") as string,
            declaration_date: formatDate(fd.get("declaration_date") as string),
            call_time: formatTime(fd.get("call_time") as string),
            agent_name: fd.get("agent_name") as string,
            connector_name: fd.get("connector_name") as string,
            connector_contact: fd.get("connector_contact") as string,
            connector_province: fd.get("connector_province") as string,
            team_leader: fd.get("team_leader") as string,
            team_contact: fd.get("team_contact") as string,
            team_province: fd.get("team_province") as string,
        };

        // Extract plan options
        const plan_options: Record<string, boolean> = {};
        fd.forEach((v, k) => {
            if (k.startsWith('plan_')) {
                plan_options[k] = true;
            }
        });
        applicationData.plan_options = plan_options;

        // Extract pay options
        const pay_options: Record<string, boolean> = {};
        fd.forEach((v, k) => {
            if (k.startsWith('pay_option_')) {
                pay_options[k] = true;
            }
        });
        applicationData.pay_options = pay_options;

        // Extract family members
        const family_members: FamilyMember[] = [];
        for (let i = 0; i < 6; i++) {
            const name = fd.get(`family_${i}_name`) as string;
            const surname = fd.get(`family_${i}_surname`) as string;
            if (name || surname) {
                family_members.push({
                    name,
                    surname,
                    relationship: fd.get(`family_${i}_relationship`) as string,
                    date_of_birth: formatDate(fd.get(`family_${i}_dob`) as string),
                });
            }
        }
        applicationData.family_members = family_members;

        // Extract extended family members
        const extended_family: ExtendedFamilyMember[] = [];
        for (let i = 0; i < 4; i++) {
            const name = fd.get(`ext_${i}_name`) as string;
            const surname = fd.get(`ext_${i}_surname`) as string;
            if (name || surname) {
                extended_family.push({
                    name,
                    surname,
                    relationship: fd.get(`ext_${i}_relationship`) as string,
                    date_of_birth: formatDate(fd.get(`ext_${i}_dob`) as string),
                    premium: parseFloat(fd.get(`ext_${i}_premium`) as string)
                });
            }
        }
        applicationData.extended_family = extended_family;

        // Validate required fields (basic example)
        if (!applicationData.firstName || !applicationData.lastName || !applicationData.phone) {
             alert('Please fill in at least the Name, Surname, and Phone fields.');
             return;
        }

        // Call the onSave prop with the new application data
        onSave(applicationData as Application);
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            {/* Inline actions (hidden on print) */}
            <div className="flex items-center justify-end gap-2 mb-3 print:hidden">
                <Button type="button" variant="outline" onClick={() => (onCancel ? onCancel() : window.history.back())}>
                    Cancel
                </Button>

                <Button type="submit">{application ? "Update" : "Create"} Application</Button>
            </div>

            {/* PREVIEW AREA */}
            <div className="bg-gray-100 p-3 rounded-md border print:bg-white">
                {/* --- A4 PAGE START --- */}
                <div
                    className="relative bg-white text-[11px] leading-tight mx-auto"
                    style={{ width: "210mm", minHeight: "297mm", boxShadow: "0 0 0.5rem rgba(0,0,0,.15)" }}
                >
                    {/* Left vertical strip */}
                    <div className="absolute top-0 left-0 h-full" style={{ width: "28mm", background: "#4b5563" }}>
                        <div className="h-full flex items-center justify-center">
                            <span className="text-white tracking-widest font-semibold writing-vertical">APPLICATION FORM</span>
                        </div>
                    </div>

                    {/* CONTENT */}
                    <div className="pl-[32mm] pr-4 pt-4 pb-6">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <div className="font-semibold text-[12px]">Funeral Plan</div>
                                <div className="text-[10px] text-gray-600">Company / Branch • Address • Tel • Email</div>
                            </div>
                            <div className="w-28 h-10 border border-gray-400 flex items-center justify-center text-[10px]">LOGO</div>
                        </div>

                        {/* Member details */}
                        <Section>
                            <div className="grid grid-cols-12">
                                {/* policy number squares */}
                                <div className="col-span-12 border-b border-gray-400 flex gap-[2px] pb-[2px] mb-[6px]">
                                    {Array.from({ length: 14 }).map((_, i) => (
                                        <div key={i} className="h-4 w-6 border border-gray-400" />
                                    ))}
                                </div>

                                <div className="col-span-12">
                                    <GridRows
                                        rows={[
                                            [
                                                { label: "Name", span: 3, name: "firstName", defaultValue: application?.firstName },
                                                { label: "Surname", span: 3, name: "lastName", defaultValue: application?.lastName },
                                                { label: "Contact Number", span: 3, name: "phone", defaultValue: application?.phone },
                                                { label: "Address", span: 3, name: "address", defaultValue: application?.address },
                                            ],
                                            [
                                                { label: "Nationality", span: 3, name: "nationality", defaultValue: application?.nationality },
                                                { label: "Gender", span: 3, name: "gender", defaultValue: application?.gender },
                                                { label: "Date of Birth", span: 3, name: "dob", defaultValue: application?.date_of_birth },
                                                { label: "Email", span: 3, name: "email", defaultValue: application?.email },
                                            ],
                                            [
                                                { label: "Passport / ID", span: 3, name: "id_number", defaultValue: application?.id_number },
                                                { label: "Name", span: 3, hideLabel: true, name: "alt_name", defaultValue: application?.alt_name },
                                                { label: "Relationship to Member", span: 3, name: "relation_to_member", defaultValue: application?.relation_to_member },
                                                { label: "Date of Birth", span: 3, name: "relation_dob", defaultValue: application?.relation_dob },
                                            ],
                                        ]}
                                    />
                                </div>
                            </div>
                        </Section>

                        {/* Family details */}
                        <Section title="FAMILY DETAILS">
                            <table className="w-full table-fixed border-collapse text-[10px]">
                                <thead>
                                    <tr>{["Name", "Surname", "Relationship", "Date of Birth"].map(h => <Th key={h}>{h}</Th>)}</tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <tr key={i}>
                                            <TdInput name={`family_${i}_name`} defaultValue={application?.family_members?.[i]?.name} />
                                            <TdInput name={`family_${i}_surname`} defaultValue={application?.family_members?.[i]?.surname} />
                                            <TdInput name={`family_${i}_relationship`} defaultValue={application?.family_members?.[i]?.relationship} />
                                            <TdInput name={`family_${i}_dob`} defaultValue={application?.family_members?.[i]?.date_of_birth} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        {/* Plan option */}
                        <Section title="PLAN OPTION">
                            <div className="mb-2 text-[10px] font-medium">COVER</div>
                            <table className="w-full table-fixed border-collapse text-[10px] mb-3">
                                <thead>
                                    <tr>{["R2000", "R5000", "R10000", "R15000", "R18000", "R25000", "R30000"].map(h => <Th key={h}>{h}</Th>)}</tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        {["R79", "R119", "R159", "R209", "R229", "R259", "R299"].map((v, i) => (
                                            <Td key={i}><CheckRow name={`plan_single_${i}`} labelLeft="Single" valueRight={v} checked={application?.plan_options?.[`plan_single_${i}`]} /></Td>
                                        ))}
                                    </tr>
                                    <tr>
                                        {["R89", "R129", "R169", "R219", "R239", "R269", "R309"].map((v, i) => (
                                            <Td key={i}><CheckRow name={`plan_family_${i}`} labelLeft="Family" valueRight={v} checked={application?.plan_options?.[`plan_family_${i}`]} /></Td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>

                            <div className="text-[10px] font-medium mb-1">Extended Family</div>
                            <table className="w-full table-fixed border-collapse text-[10px]">
                                <thead>
                                    <tr>{["Name", "Surname", "Relationship", "Date of Birth", "Premium"].map(h => <Th key={h}>{h}</Th>)}</tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <tr key={i}>
                                            <TdInput name={`ext_${i}_name`} defaultValue={application?.extended_family?.[i]?.name} />
                                            <TdInput name={`ext_${i}_surname`} defaultValue={application?.extended_family?.[i]?.surname} />
                                            <TdInput name={`ext_${i}_relationship`} defaultValue={application?.extended_family?.[i]?.relationship} />
                                            <TdInput name={`ext_${i}_dob`} defaultValue={application?.extended_family?.[i]?.date_of_birth} />
                                            <TdInput name={`ext_${i}_premium`} type="number" defaultValue={application?.extended_family?.[i]?.premium?.toString()} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        {/* Beneficiary / Debit Order */}
                        <Section>
                            <GridRows
                                rows={[
                                    [
                                        { label: "Beneficiary Name", span: 3, name: "beneficiary_name", defaultValue: application?.beneficiary_name },
                                        { label: "Surname", span: 3, name: "beneficiary_surname", defaultValue: application?.beneficiary_surname },
                                        { label: "Contact", span: 3, name: "beneficiary_contact", defaultValue: application?.beneficiary_contact },
                                       // { custom: <PayOptions checkedOptions={application?.pay_options} />, span: 3, label: "Premium", name: "premium_block" },
                                    ],
                                    [
                                        { label: "Total Amount (R)", span: 3, name: "total_amount", defaultValue: application?.total_amount?.toString() },
                                        { label: "Bank", span: 3, name: "bank", defaultValue: application?.bank },
                                        { label: "Branch Code", span: 3, name: "branch_code", defaultValue: application?.branch_code },
                                        { label: "Account Holder", span: 3, name: "account_holder", defaultValue: application?.account_holder },
                                    ],
                                    [
                                        { label: "Account Number", span: 3, name: "account_number", defaultValue: application?.account_number },
                                        { label: "Deduction Date", span: 3, name: "deduction_date", defaultValue: application?.deduction_date },
                                        { label: "Account Type", span: 3, name: "account_type", defaultValue: application?.account_type },
                                        { label: "Commencement Date", span: 3, name: "commencement_date", defaultValue: application?.commencement_date },
                                    ],
                                ]}
                            />
                        </Section>
                        <Section title="PAYMENT OPTIONS">
            <PayOptions checkedOptions={application?.pay_options} />
        </Section>

                        {/* Declaration */}
                        <Section title="DECLARATION">
                            <div className="text-[10px] mb-2">
                                I, the undersigned, declare that the information provided above is true and correct. I agree to the terms and conditions of the policy.
                            </div>
                            <GridRows
                                rows={[
                                    [
                                        { label: "Signature (Account Holder)", span: 5, name: "declaration_signature", defaultValue: application?.declaration_signature },
                                        { label: "Date", span: 1, name: "declaration_date", defaultValue: application?.declaration_date },
                                        { label: "Call Time", span: 2, name: "call_time", defaultValue: application?.call_time },
                                        { label: "Agent / Consultant", span: 4, name: "agent_name", defaultValue: application?.agent_name },
                                    ],
                                ]}
                            />
                        </Section>

                        {/* Agent details */}
                        <Section title="CONNECTOR / AGENT DETAILS">
                            <GridRows
                                rows={[
                                    [
                                        { label: "Name of Connector / Agent", span: 4, name: "connector_name", defaultValue: application?.connector_name },
                                        { label: "Contact", span: 4, name: "connector_contact", defaultValue: application?.connector_contact },
                                        { label: "Province", span: 4, name: "connector_province", defaultValue: application?.connector_province },
                                    ],
                                    [
                                        { label: "Team Leader", span: 4, name: "team_leader", defaultValue: application?.team_leader },
                                        { label: "Contact", span: 4, name: "team_contact", defaultValue: application?.team_contact },
                                        { label: "Province", span: 4, name: "team_province", defaultValue: application?.team_province },
                                    ],
                                ]}
                            />
                        </Section>

                        <div className="text-[9px] text-gray-600 mt-2">Powered by Quantilytix • Computer generated form.</div>
                    </div>
                </div>
                {/* --- A4 PAGE END --- */}
            </div>

            {/* PRINT CSS & helpers */}
            <style>{`
                @page { size: A4; margin: 10mm; }
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print\\:hidden { display: none !important; }
                    .bg-gray-100 { background: white !important; }
                }
                .writing-vertical { writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 0.08em; }
                table, th, td { border: 1px solid #9CA3AF; }
                th, td { padding: 4px; }
                input[type="text"], input[type="date"], input[type="number"], input[type="email"] {
                    width: 100%; border: none; outline: none; font-size: 10px; padding: 2px 4px; background: transparent;
                }
                .line-cell { height: 26px; }
            `}</style>
        </form>
    );
}

/* ===== helpers ===== */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
    return (
        <div className="mb-3">
            {title ? <div className="uppercase font-semibold text-[10px] mb-1 tracking-wide">{title}</div> : null}
            <div className="border border-gray-400 p-2">{children}</div>
        </div>
    );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="text-left font-semibold bg-gray-100">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="align-middle">{children}</td>; }
function TdInput({ name, defaultValue, type = "text" }: { name: string; defaultValue?: string; type?: string }) { return <td className="line-cell"><input name={name} type={type} defaultValue={defaultValue} /></td>; }

function GridRows({
    rows,
}: {
    rows: { label?: string; span: number; hideLabel?: boolean; custom?: React.ReactNode; name?: string; defaultValue?: string }[][];
}) {
    return (
        <div className="space-y-[6px]">
            {rows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-[6px]">
                    {row.map((cell, i) => (
                        <div key={i} className="col-span-12" style={{ gridColumn: `span ${cell.span} / span ${cell.span}` }}>
                            <div className="border border-gray-400 h-7 flex items-end">
                                <div className="w-full">
                                    {!cell.hideLabel ? (
                                        <div className="px-1 text-[9px] text-gray-600 border-b border-gray-300">{cell.label ?? ""}</div>
                                    ) : null}
                                    <div className="px-1">{cell.custom ?? <input name={cell.name} defaultValue={cell.defaultValue} type="text" />}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function CheckRow({ labelLeft, valueRight, name, checked }: { labelLeft: string; valueRight: string; name: string; checked?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1">
                <input className="w-3 h-3 border border-gray-500" type="checkbox" name={name} defaultChecked={checked} />
                <span>{labelLeft}</span>
            </label>
            <span className="font-medium">{valueRight}</span>
        </div>
    );
}

function PayOptions({ checkedOptions }: { checkedOptions?: Record<string, boolean> }) {
    const payOptions = ["Pay @", "Debit Order"];
    return (
        <div className="px-1 py-[2px]">
            <div className="text-[9px] text-gray-600 mb-[2px]">Debit Order</div>
            <div className="flex flex-wrap gap-3 text-[10px]">
                {payOptions.map((p, i) => (
                    <label key={p} className="inline-flex items-center gap-1">
                        <input
                            type="checkbox"
                            name={`pay_option_${i}`}
                            className="w-3 h-3 border border-gray-500"
                            defaultChecked={checkedOptions?.[`pay_option_${i}`]}
                        />
                        <span>{p}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

export default AgentSignup;