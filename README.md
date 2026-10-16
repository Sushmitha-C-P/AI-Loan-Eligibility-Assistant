# loaneligibilitycheck · AI Loan Eligibility (TechStop · Code Monks)

One end-to-end app with **two roles**:

- **Admin console** (Product Manager): maintains the eligibility rules module by module, previews the impact on demo applicants, and **publishes** a version.
- **RM app** (Relationship Manager): captures an application in **4 steps**, and the **rules engine decides** using the *published* rules. The **AI** fills forms from notes, reviews the data, writes the remarks and answers questions. It never decides.

## Run it

1. Install **Node.js (LTS)** from https://nodejs.org (one time).
2. Double-click **START-WINDOWS.bat** (Mac: **START-MAC.command**). The browser opens at http://localhost:5173.
3. Sign in with a demo account (password **demo@123**):
   - `rm.anand@loaneligibilitycheck.in` → RM app
   - `priya.sharma@loaneligibilitycheck.in` → Admin console
4. Optional, for live AI: click **AI offline · add key**, paste a free Gemini key from https://aistudio.google.com/apikey, **Test connection**, **Save**.

Developers: `npm install` then `npm run dev`. You can also put the key in `.env.local` (copy `.env.example`).
Without a key everything still works with clearly labelled offline templates and a keyword parser.

| Provider | Free? | Key | Default model |
|---|---|---|---|
| Google Gemini | Free tier | https://aistudio.google.com/apikey | `gemini-2.5-flash` |
| Groq | Free tier | https://console.groq.com/keys | `llama-3.3-70b-versatile` |
| OpenRouter | Some free | https://openrouter.ai/keys | `meta-llama/llama-3.3-70b-instruct:free` |
| OpenAI | Paid | https://platform.openai.com/api-keys | `gpt-4o-mini` |

## Demo script (5 minutes)

1. **Admin** → Dashboard: module tiles, "Needs your attention", latest applications.
2. **Credit Bureau**: change CIBIL minimum 650 → 800. The **Impact preview** shows which demo applicants flip. **Review & publish** lists the change → **Publish v2**. (Change it back afterwards, or use *Configurations → Reset demo data*.)
3. Dashboard → **Draft rules from a policy note** → *Use sample policy* → *Draft with AI* → *Create as new configuration* → AI review → Publish.
4. Sign out → **RM** → *+ New application* → in *Quick fill with AI* click the **Shiva Kumar** sample → *Extract with AI*.
5. *Continue* (credit bureau is pulled) → **Bank statement**: Account Aggregator (consent → OTP shown in the toast → select accounts → analysed) or **Upload PDF**.
6. **Financial details**: live FOIR / internal score, *Review data with AI* → *Run eligibility check*.
7. **Decision**: score ring, chips (CB quality, FOIR, margins, documents), **AI remarks** (Tamil / Hindi for the customer), rules by category, what-if, *Guardrail test* in the chat → **Proceed to sanction** / **Decline** with remarks.
8. Shortcut: pick any **Demo applicant** at the top and press **Run to decision** (Anjali, Shiva, Farhan, Ramesh, Rao Textiles, Meena Traders).

## How the two uploaded designs were merged (no duplicate fields)

| Was in two places / twice | Now |
|---|---|
| Customer category (config) + Individual/Business toggle (RM) | One **applicant type**; config scope and RM toggle use the same list |
| Loan type field + product | **Loan type is a property of the product** (never typed) |
| Age in Basic Details and in Credit Bureau | **Age only in Global Rules**; Credit Bureau shows it read-only |
| Hard-coded case-note rules (FOIR < 50, internal ≥ 50…) | **Custom rules** in Global Rules (seeded, editable) |
| Bureau report checks + questionnaire | **One bureau parameters table** (max + loan band) |
| Two bounce fields per bank band | **One inward-bounce limit per band** |
| Written-off / settled as statuses and as counts | **Counts/amounts** in the parameters table only |
| Promoter name / DOB for business | Reuses the same **name / DOB** fields |
| ITR filing asked in several steps | **One `ITR filing` field** + optional upload |
| Existing EMIs typed by the RM | **Taken from the credit bureau** |
| Monthly income (single box) + ITR heads | **Monthly income by ITR head**; admin chooses which heads count |
| 11 P&L expense lines | RM enters **total operating expenses** (+ depreciation, finance cost, tax); formulas shown read-only |
| Udyam / GSTIN always mandatory | **Optional**, unless the configuration requires them |
| Employment type | Removed (not used by any rule) |

## Architecture

```
src/
  App.jsx                 sign-in → RM app or Admin console
  Login.jsx
  store.jsx               AI settings, toast, the RM's current application
  engine/
    master.js             every dropdown / list (single source of truth)
    configStore.js        configurations: scope + DRAFT + PUBLISHED + version
    configValidation.js   admin validation (errors block publish, warnings)
    validation.js         RM field validation (Aadhaar Verhoeff, PAN, GSTIN check char, Udyam, PIN…)
    bre.js                rules engine: reads the published config, returns every rule + decision
    appsStore.js          saved applications and statuses
    mocks.js              bureau, GST, AA, bank analyzer, demo applicants (swap for real APIs)
    session.js            demo sign-in
  rm/                     Home, ApplicantStep, BankStep, FinancialStep, DecisionStep, CaseFile
  admin/                  AdminConsole, Dashboard, Configurations, modules (5 pages), ReviewPublish, Preview
  ai/                     providers, tasks (6 AI jobs), guardrails, fallback, log
  components/             shared UI, AI panels, settings, activity drawer
```

**Rules engine vs AI.** `bre.js` is the only thing that decides. Rule IDs: C (customer: KYC, name match, age, vintage, Udyam, negative PIN), G (custom global rules), I (ITR, income, GST, EBITDA / PAT margins, income vs bank), K (bank balance and bounces by loan band), B/P (bureau scores, report parameters, asset class, negative status), O01 (eligible amount). The decision is *fail* if any rule fails, *review* if any needs review, *partial* if data is missing, otherwise *eligible*. The eligibility score % is a transparent weighted summary of those rules, not an AI prediction.

**Six AI jobs** (all advisory): RM note → form fields · data-quality review · AI remarks + customer message (EN/TA/HI) · grounded Q&A · policy text → draft configuration · configuration risk review.
**Guardrails:** identifiers masked before sending and an outbound PII scan; JSON schema checks; enum/range sanitising; blocks "approved / sanctioned / guaranteed"; checks the text agrees with the decision and never quotes amounts above the engine's; every call is visible under **AI activity**.

**Why Node.js?** Only as the developer tool (Vite dev server and build). The app itself runs fully in the browser; `npm run build` produces static files you can host anywhere. In production the AI calls and data would go through your backend so the key never reaches the browser.

Data (configurations, applications, AI key) is stored in this browser's localStorage for the demo. Thresholds are illustrative.
