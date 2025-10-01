// src/pages/PricingPage.tsx
import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, X, BarChart3, Users, TrendingUp, Cpu, Shield, RefreshCw, Mic } from "lucide-react";

function Card({ className = "", children }) {
  return <div className={`rounded-2xl border bg-white ${className}`}>{children}</div>;
}
function CardContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}
function Button({ className = "", children, onClick, size = "md", variant = "solid", ...props }) {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
  const sizes = size === "lg" ? "px-4 py-2 text-sm" : size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const variants = variant === "outline" ? "border bg-white hover:bg-gray-50" : "bg-gray-900 text-white hover:bg-black";
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} onClick={onClick} {...props}>
      {children}
    </button>
  );
}
function Badge({ className = "", children }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

// You can also drive these from the backend if you prefer
const PLAN_PRICES_ZAR = { free: 0, basic: 100, pro: 150, business: 350 };

function Feature({ label, included = true }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className={`mt-0.5 rounded-full p-1 ${included ? "bg-green-100" : "bg-red-100"}`}>
        {included ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </div>
      <span className={`leading-5 ${included ? "text-gray-800" : "text-gray-500 line-through"}`}>{label}</span>
    </div>
  );
}

const plans = [
  {
    id: "free",
    name: "Free (Starter)",
    price: PLAN_PRICES_ZAR.free,
    ribbon: "Start here",
    color: "from-gray-50 to-white",
    blurb: "Great for trying out Qx and logging basics.",
    features: [
      { label: "Record transactions manually (POS + imports)", included: true },
      { label: "Basic invoices & quotations", included: true },
      { label: "Dashboard with limited KPIs (revenue, expenses)", included: true },
      { label: "Limited AI help (5 AI queries/month)", included: true },
      { label: "ElevenLabs voice agent", included: false },
      { label: "Automatic bank statement AI parsing", included: false },
    ],
  },
  {
    id: "basic",
    name: "Basic (Growth)",
    price: PLAN_PRICES_ZAR.basic,
    ribbon: "Popular",
    color: "from-indigo-50 to-white",
    blurb: "Level up with AI parsing and docs.",
    features: [
      { label: "Everything in Free", included: true },
      { label: "AI transaction parsing from bank statements (up to 50/month)", included: true },
      { label: "Basic ElevenLabs voice agent access (text → voice guidance)", included: true },
      { label: "Save multiple customers & suppliers", included: true },
      { label: "Export invoices/quotes to PDF", included: true },
      { label: "Basic support (email/FAQ)", included: true },
      { label: "Advanced analytics", included: false },
      { label: "Real-time AI coach", included: false },
      { label: "Document storage (limited)", included: true },
    ],
  },
  {
    id: "pro",
    name: "Pro (Smart)",
    price: PLAN_PRICES_ZAR.pro,
    ribbon: "Best value",
    color: "from-emerald-50 to-white",
    blurb: "Smarter automation and analytics.",
    features: [
      { label: "Everything in Basic", included: true },
      { label: "AI-powered reconciliation & classification", included: true },
      { label: "AI assistant 'item helper' (suggest fixes for mis-recorded transactions)", included: true },
      { label: "ElevenLabs interactive voice agent (ask questions & get answers)", included: true },
      { label: "Advanced dashboards (cashflow, customer/product trends)", included: true },
      { label: "Bank statement parsing (up to 200 transactions/month)", included: true },
      { label: "Priority support (chat/email)", included: true },
      { label: "Team/multi-user features", included: false },
      { label: "Send invoices & quotations", included: true },
      { label: "Unlimited document storage", included: true },
    ],
  },
  {
    id: "business",
    name: "Business (Enterprise AI)",
    price: PLAN_PRICES_ZAR.business,
    ribbon: "For teams",
    color: "from-amber-50 to-white",
    blurb: "Everything unlocked with team controls.",
    features: [
      { label: "Everything in Pro", included: true },
      { label: "Unlimited AI assistant queries", included: true },
      { label: "Unlimited ElevenLabs agent usage (voice & coaching)", included: true },
      { label: "Full AI transaction parsing (no monthly cap)", included: true },
      { label: "Multi-user/team accounts (staff logins)", included: true },
      { label: "Advanced compliance & VAT reports", included: true },
      { label: "Dedicated hosting priority (better performance)", included: true },
      { label: "Premium support (call/WhatsApp + onboarding help)", included: true },
    ],
  },
];

function Rand({ amount }: { amount: number }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-3xl font-semibold tracking-tight">R{amount}</span>
      <span className="text-sm text-gray-500">/ month</span>
    </div>
  );
}

function usePaystackScript() {
  useEffect(() => {
    if (document.getElementById("paystack-inline-js")) return;
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.id = "paystack-inline-js";
    s.async = true;
    document.body.appendChild(s);
  }, []);
}

const PAYSTACK_PLAN_CODES: Record<string, string> = {
  basic: "PLN_aw3mn2f2cvowysy",
  pro: "PLN_tbvcc0hh614jppr",
  business: "PLN_qh8fu904qs8xqlu",
};

declare global {
  interface Window { PaystackPop?: any }
}

export default function PricingPage() {
  const [email, setEmail] = useState("");

  usePaystackScript();

  const startPaystack = useCallback(({ planId, planName }: { planId: "basic"|"pro"|"business", planName: string }) => {
    if (!PAYSTACK_PUBLIC_KEY) {
      alert("Missing Paystack public key. Set VITE_PAYSTACK_PUBLIC_KEY in your .env.");
      return;
    }
    if (!window.PaystackPop) {
      alert("Paystack not loaded yet. Please try again in a moment.");
      return;
    }
    if (!email) {
      alert("Please enter your email for the receipt.");
      return;
    }

    const planCode = PAYSTACK_PLAN_CODES[planId];
    if (!planCode) {
      alert("Missing Paystack Plan Code mapping for this plan.");
      return;
    }

    const reference = `sub_${planId}_${Date.now()}`;
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email,
      ref: reference,
      plan: planCode,         // Subscriptions use the plan code
      currency: "ZAR",
      metadata: { plan: planId, plan_name: planName },
      callback: function (response: { reference: string }) {
        // Send the reference to a success route where we verify it server-side
        window.location.assign(`/pricing/success?reference=${encodeURIComponent(response.reference)}`);
      },
      onClose: function () {
        console.log("Paystack checkout closed");
      },
      channels: ["card"],
    });

    handler.openIframe();
  }, [email]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex flex-col">
      <section className="mx-auto max-w-6xl w-full px-4 py-16 flex-1 grid place-content-center">
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-600">
            <Cpu className="h-3.5 w-3.5" /> <span>Qx System • AI-assisted finance</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Qx System Pricing Plans</h1>
          <p className="mx-auto mt-2 max-w-2xl text-gray-600">Choose a plan that fits your growth. Upgrade, downgrade, or cancel anytime.</p>
        </div>

        <div className="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-xl border bg-white p-2 shadow-sm">
          <input
            type="email"
            placeholder="Enter your email for receipt"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
          <span className="text-xs text-gray-500 pr-2">Required for checkout</span>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 place-items-center mx-auto">
          <div className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
            <BarChart3 className="h-5 w-5" />
            <span className="text-sm">Dashboards & KPIs</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
            <RefreshCw className="h-5 w-5" />
            <span className="text-sm">AI Reconciliation</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
            <Mic className="h-5 w-5" />
            <span className="text-sm">Voice Agents</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
            <Shield className="h-5 w-5" />
            <span className="text-sm">Secure & Compliant</span>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 place-items-center mx-auto">
          {plans.map((plan) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              {plan.ribbon && (
                <Badge className="absolute -top-3 left-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow">
                  {plan.ribbon}
                </Badge>
              )}

              <Card className={`border-2 ${plan.id === "pro" ? "border-indigo-600" : "border-gray-200"} shadow-sm hover:shadow-md transition-shadow w-full max-w-sm`}>
                <CardContent className="p-6">
                  <div className={`mb-4 h-12 w-12 rounded-2xl bg-gradient-to-br ${plan.color} grid place-items-center shadow-inner`}>
                    {plan.id === "business" ? <Users className="h-6 w-6" /> : plan.id === "pro" ? <BarChart3 className="h-6 w-6" /> : plan.id === "basic" ? <TrendingUp className="h-6 w-6" /> : <BarChart3 className="h-6 w-6" />}
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-center">{plan.name}</h3>
                  <p className="mt-1 text-sm text-gray-600 text-center">{plan.blurb}</p>

                  <div className="mt-4 text-center">
                    <Rand amount={plan.price} />
                  </div>

                  <div className="my-6 h-px bg-gray-100" />

                  <div className="flex flex-col gap-3">
                    {plan.features.map((f, idx) => (
                      <Feature key={idx} label={f.label} included={f.included} />
                    ))}
                  </div>

                  {plan.id === "free" ? (
                    <Button className="mt-6 w-full" size="lg" onClick={() => alert("Free plan activated! Create account flow here.")}>Get started for free</Button>
                  ) : (
                    <Button
                      className={`mt-6 w-full ${plan.id === "pro" ? "bg-indigo-600 hover:bg-indigo-700" : ""}`}
                      size="lg"
                      onClick={() => startPaystack({ planId: plan.id as "basic"|"pro"|"business", planName: plan.name })}
                    >
                      Choose plan
                    </Button>
                  )}

                  {plan.id === "free" && (
                    <p className="mt-2 text-xs text-gray-500">Free plan activates instantly — no card required.</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-3xl text-center text-xs text-gray-500">
          Prices shown are in South African Rand (ZAR) and billed monthly. VAT may apply. By subscribing, you agree to our Terms & Privacy.
        </div>
      </section>

      <footer className="mt-auto border-t bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="text-sm text-gray-600">Need help choosing? <span className="font-medium text-gray-800">Chat to our team.</span></div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full">View docs</Button>
            <Button className="rounded-full">Contact sales</Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
