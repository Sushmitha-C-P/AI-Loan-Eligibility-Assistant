// Simulated integrations: KYC (UIDAI/NSDL), Udyam & GSTN, four credit bureaus, Cygnet GST score,
// Account Aggregator + bank statement analyzer, document analyzer. Swap these for real APIs.
import { TODAY, hash } from './format.js';
import { aadhaarFrom, gstinFrom } from './finance.js';

function bureau(scores, common = {}, loans = [], biz = {}) {
  const emi = loans.reduce((a, l) => a + l.emi, 0);
  const base = { overdue: 0, dpd: 0, enquiries90: 1, inquiries6m: 2, activeLoans: loans.length, newAccounts6m: 0, newDelinquent6m: 0, writtenOffAccounts: 0, settledAccounts: 0, writtenOffAmount: 0, settledAmount: 0, totalObligations: emi, totalCurrentBalance: loans.reduce((a, l) => a + l.outstanding, 0), statuses: [], ...common };
  const by = {};
  Object.entries(scores).forEach(([k, sc]) => { by[k] = { ...base, score: sc, directorScore: biz.director ? sc : null, businessScore: biz.business ? biz.business + (sc - scores.cibil) : null, cmrRank: biz.cmr ?? null }; });
  return { loans, by };
}

const IND = { idType: 'aadhaar', country: 'India', consent: true, capital: '0', other: '0', family: '0', businessName: '', udyam: '', gstin: '', startYear: '' };
const BIZ = { idType: 'aadhaar', idNumber: '', country: 'India', consent: true, salary: '0', house: '0', capital: '0', other: '0', family: '0' };

export const SAMPLES = {
  anjali: {
    label: 'Anjali Rao · Personal Loan',
    note: 'New customer Anjali Rao, individual, 36, salaried with monthly income of 85,000. Wants a personal loan of 3 lakh for home renovation over 36 months. Living in own house for 4 years, more than 5 years of work experience, 2 years in current company, same mobile for 6 years. Monthly expenses: food 6,000, medical 2,000, insurance 1,500, child education 4,000, house maintenance 2,000 and other 1,000. Files ITR. PIN 560034.',
    d: { ...IND, applicantType: 'Individual', customerType: 'New', productId: 'Personal Loan', amount: '300000', tenure: '36', purpose: 'Home renovation',
      fullName: 'Anjali Rao', dob: '1990-03-14', idNumber: aadhaarFrom('38912045617'), pan: 'CQXPR7719M', pincode: '560034', address: '12, 4th Cross, Indiranagar', city: 'Bengaluru', state: 'Karnataka', mobile: '9845012345', email: 'anjali.rao@example.com',
      salary: '85000', business: '0', house: '0', food: '6000', medical: '2000', insurance: '1500', education: '4000', rent: '2000', otherExp: '1000',
      resBand: '3to5', workBand: 'gt5', companyBand: '1to3', mobBand: 'gt5', houseType: 'Owned', itrFiled: 'Yes', itrFile: 'ITR_2025-26.pdf' },
    bureau: bureau({ cibil: 764, equifax: 760, highmark: 758, experian: 761 }, { enquiries90: 0, inquiries6m: 1 }, [{ type: 'Two-wheeler loan', lender: 'NBFC', emi: 3000, outstanding: 42000 }]),
    bank: { avgCredits: 86500, avgClosing3m: 64200, bounces: 0, salaryMonths: 6, emiDebits: 3000 },
    aaHandle: 'anjali.rao@ignosis',
  },
  shiva: {
    label: 'Shiva Kumar · Personal Loan (case notes)',
    note: 'New customer Shiva Kumar, 36, individual, salaried at Sri Balaji Textiles for 4 years, salary 50k per month. Gets 5k rent from a small shop and around 5k profit from a side tailoring business. Same house for 6 years, same mobile for 5 years, total work experience 4 years. Monthly expenses: food 4,000, medical 1,500, insurance 1,000, school fees 2,500, house maintenance 1,000 and other 1,000. Has one consumer durable EMI of 2k. Files ITR. Wants an unsecured personal loan of 3.5 lakh for home renovation over 48 months. PIN 600040.',
    d: { ...IND, applicantType: 'Individual', customerType: 'New', productId: 'Personal Loan', amount: '350000', tenure: '48', purpose: 'Home renovation',
      fullName: 'Shiva Kumar', dob: '1990-05-14', idNumber: aadhaarFrom('23456789012'), pan: 'BQRPK4821H', pincode: '600040', address: '18, 2nd Avenue, Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', mobile: '9840012345', email: 'shiva.kumar@example.com',
      salary: '50000', business: '5000', house: '5000', food: '4000', medical: '1500', insurance: '1000', education: '2500', rent: '1000', otherExp: '1000',
      resBand: 'gt5', workBand: '3to5', companyBand: '3to5', mobBand: '3to5', houseType: 'Rented', itrFiled: 'Yes', itrFile: '' },
    bureau: bureau({ cibil: 652, equifax: 660, highmark: 650, experian: 648 }, { enquiries90: 1, inquiries6m: 2 }, [{ type: 'Consumer durable loan', lender: 'NBFC', emi: 2000, outstanding: 18000 }]),
    bank: { avgCredits: 58500, avgClosing3m: 21400, bounces: 0, salaryMonths: 6, emiDebits: 2000 },
  },
  farhan: {
    label: 'Farhan Sheikh · needs review',
    note: 'New customer Farhan Sheikh, individual, salary 95k at Harbour Logistics plus 10k rent from a flat. 8 years experience, 3 years in current job. Staying 4 years at current rented address, mobile 6 years. Expenses: food 6,000, medical 1,500, insurance 1,500, rent 5,000, other 2,000. Credit card EMI 4k. Files ITR. Wants a personal loan of 10 lakh for his wedding, 60 months. PIN 400053.',
    d: { ...IND, applicantType: 'Individual', customerType: 'New', productId: 'Personal Loan', amount: '1000000', tenure: '60', purpose: 'Wedding',
      fullName: 'Farhan Sheikh', dob: '1988-03-21', idNumber: aadhaarFrom('45123678901'), pan: 'DMWPS3308K', pincode: '400053', address: '7B, Sea View Apartments, Andheri West', city: 'Mumbai', state: 'Maharashtra', mobile: '9988776655', email: 'farhan.sheikh@example.com',
      salary: '95000', business: '0', house: '10000', food: '6000', medical: '1500', insurance: '1500', education: '0', rent: '5000', otherExp: '2000',
      resBand: '3to5', workBand: 'gt5', companyBand: '3to5', mobBand: 'gt5', houseType: 'Rented', itrFiled: 'Yes', itrFile: 'ITR_2025-26.pdf' },
    bureau: bureau({ cibil: 741, equifax: 735, highmark: 736, experian: 738 }, { enquiries90: 3, inquiries6m: 5 }, [{ type: 'Credit card EMI', lender: 'Private bank', emi: 4000, outstanding: 36000 }]),
    bank: { avgCredits: 104000, avgClosing3m: 46200, bounces: 0, salaryMonths: 6, emiDebits: 4000 },
  },
  ramesh: {
    label: 'Ramesh Iyer · not eligible',
    note: 'New customer Ramesh Iyer, individual, works at a local retail store for about 6 months, salary 28k. Moved to a rented house 6 months ago, mobile number 2 years, 1 year total experience. Expenses: food 5,000, medical 3,000, education 1,000, rent 2,000, other 1,000. Has a personal loan and a two-wheeler loan. Does not file ITR. Wants a personal loan of 4 lakh for medical expenses over 36 months. PIN 625001.',
    d: { ...IND, idType: 'voter', applicantType: 'Individual', customerType: 'New', productId: 'Personal Loan', amount: '400000', tenure: '36', purpose: 'Medical expenses',
      fullName: 'Ramesh Iyer', dob: '1995-08-09', idNumber: 'TNX4829173', pan: 'EKLPI5520Q', pincode: '625001', address: '3/41, West Masi Street', city: 'Madurai', state: 'Tamil Nadu', mobile: '8056781234', email: 'ramesh.iyer@example.com',
      salary: '28000', business: '0', house: '0', food: '5000', medical: '3000', insurance: '0', education: '1000', rent: '2000', otherExp: '1000',
      resBand: 'lt1', workBand: '1to3', companyBand: 'lt1', mobBand: '1to3', houseType: 'Rented', itrFiled: 'No', itrFile: '' },
    bureau: bureau({ cibil: 540, equifax: 548, highmark: 552, experian: 545 }, { overdue: 2, dpd: 45, enquiries90: 5, inquiries6m: 8, newDelinquent6m: 1, statuses: ['SMA'] }, [{ type: 'Personal loan', lender: 'NBFC', emi: 5000, outstanding: 95000 }, { type: 'Two-wheeler loan', lender: 'NBFC', emi: 3000, outstanding: 41000 }]),
    bank: { avgCredits: 22000, avgClosing3m: 1800, bounces: 3, salaryMonths: 5, emiDebits: 8000 },
  },
  rao: {
    label: 'Rao Textiles & Traders · Business Loan',
    note: 'New business customer Rao Textiles & Traders, textiles and apparel, running since 2016, promoter Ravi Rao aged 48. Has Udyam and GST registration, trade license and owns the factory. Annual turnover 1.85 crore, total income 42 lakh, total operating expenses 31 lakh, depreciation 1 lakh, tax 2.2 lakh. Promoter has lived at the same address for over 5 years and has more than 5 years experience. One business vehicle EMI of 4k. Wants a business loan of 12 lakh for working capital over 60 months. PIN 560001.',
    d: { ...BIZ, applicantType: 'Business', customerType: 'New', productId: 'Business Loan', amount: '1200000', tenure: '60', purpose: 'Working capital',
      businessName: 'Rao Textiles & Traders', fullName: 'Ravi Rao', dob: '1978-07-22', pan: 'AACCR1234F', udyam: 'UDYAM-KR-03-0012345', gstin: gstinFrom('29AACCR1234F1Z'), startYear: '2016',
      pincode: '560001', address: '45, MG Road', city: 'Bengaluru', state: 'Karnataka', mobile: '9845067890', email: 'accounts@raotextiles.in',
      industry: 'Textiles & Apparel', gstFiling: 'Yes', itrFiled: 'Yes', tradeLicense: 'Yes', premises: 'Owned', resBand: 'gt5', workBand: 'gt5',
      turnover: '18500000', totalIncome: '4200000', opex: '3100000', depreciation: '100000', financeCost: '48000', taxPaid: '220000',
      itrFile: 'ITR_2025-26.pdf', bsFile: 'BalanceSheet_2025-26.pdf', plFile: 'PL_Statement_2025-26.pdf' },
    bureau: bureau({ cibil: 712, equifax: 716, highmark: 705, experian: 709 }, { enquiries90: 1, inquiries6m: 3 }, [{ type: 'Commercial vehicle loan', lender: 'Private bank', emi: 4000, outstanding: 96000 }], { director: true, business: 680, cmr: 5 }),
    bank: { avgCredits: 1560000, avgClosing3m: 285000, bounces: 0, salaryMonths: 0, emiDebits: 4000 },
    gst: { score: 78, onTime: '11 of 12 returns on time' },
  },
  meena: {
    label: 'Meena Traders · Business Loan',
    note: 'Existing business customer Meena Traders, wholesale groceries, running since 2019, proprietor Meena Sundaram aged 44, Udyam and GST registered, trade license yes, shop owned. Annual turnover 3.2 crore, total income 60 lakh, operating expenses 42 lakh, depreciation 1.2 lakh, finance cost 1.44 lakh, tax 3.5 lakh. More than 5 years at same address and over 5 years of experience. Vehicle loan EMI of 12k. Wants a business loan of 15 lakh for working capital over 60 months. PIN 600017.',
    d: { ...BIZ, applicantType: 'Business', customerType: 'Existing', productId: 'Business Loan', amount: '1500000', tenure: '60', purpose: 'Working capital',
      businessName: 'Meena Traders', fullName: 'Meena Sundaram', dob: '1982-04-10', pan: 'BKLPS4417M', udyam: 'UDYAM-TN-02-0012345', gstin: gstinFrom('33BKLPS4417M1Z'), startYear: '2019',
      pincode: '600017', address: '22, Usman Road, T. Nagar', city: 'Chennai', state: 'Tamil Nadu', mobile: '9884456712', email: 'meena.traders@example.com',
      industry: 'Wholesale & Retail Trade', gstFiling: 'Yes', itrFiled: 'Yes', tradeLicense: 'Yes', premises: 'Owned', resBand: 'gt5', workBand: 'gt5',
      turnover: '32000000', totalIncome: '6000000', opex: '4200000', depreciation: '120000', financeCost: '144000', taxPaid: '350000',
      itrFile: 'ITR_2025-26.pdf', bsFile: 'BalanceSheet_2025-26.pdf', plFile: 'PL_Statement_2025-26.pdf' },
    bureau: bureau({ cibil: 745, equifax: 751, highmark: 738, experian: 742 }, { enquiries90: 2, inquiries6m: 3 }, [{ type: 'Commercial vehicle loan', lender: 'Private bank', emi: 12000, outstanding: 380000 }], { director: true, business: 702, cmr: 4 }),
    bank: { avgCredits: 2680000, avgClosing3m: 320000, bounces: 0, salaryMonths: 0, emiDebits: 12000 },
    gst: { score: 82, onTime: '11 of 12 returns on time' },
  },
};

export const sampleByPan = (pan) => Object.values(SAMPLES).find((s) => s.d.pan === pan);

export function mockBureau(pan, isBusiness) {
  const s = sampleByPan(pan);
  const r = s ? JSON.parse(JSON.stringify(s.bureau)) : (() => {
    const h = hash(pan); const n = (h >>> 7) % 3;
    const types = ['Two-wheeler loan', 'Consumer durable loan', 'Gold loan', 'Credit card EMI'];
    const loans = []; for (let i = 0; i < n; i++) loans.push({ type: types[(h >>> (9 + i * 3)) % 4], lender: i ? 'Private bank' : 'NBFC', emi: 1500 + ((h >>> (11 + i)) % 8) * 750, outstanding: 20000 + ((h >>> (13 + i)) % 10) * 9000 });
    const sc = 580 + (h % 240);
    return bureau({ cibil: sc, equifax: Math.min(900, sc + 6), highmark: sc - 4, experian: sc + 3 }, { enquiries90: (h >>> 5) % 4, inquiries6m: (h >>> 5) % 7, overdue: (h >>> 3) % 9 === 0 ? 1 : 0 }, loans, isBusiness ? { director: true, business: sc - 30, cmr: 1 + ((h >>> 4) % 8) } : {});
  })();
  r.pulledOn = TODAY;
  return r;
}
export function mockGst(pan, gstin) {
  const s = sampleByPan(pan);
  if (s?.gst) return { ...s.gst };
  if (!gstin) return null;
  const h = hash(gstin); return { score: 45 + (h % 50), onTime: `${8 + (h % 5)} of 12 returns on time` };
}
export function mockBank(pan, months = 6) {
  const s = sampleByPan(pan);
  const b = s ? { ...s.bank } : (() => { const h = hash(pan + 'bank'); return { avgCredits: 30000 + (h % 10) * 9000, avgClosing3m: 5000 + ((h >>> 6) % 12) * 4000, bounces: (h >>> 4) % 5 === 0 ? 1 : 0, salaryMonths: 5 + (h % 2), emiDebits: 0 }; })();
  return { ...b, months };
}
export function aaAccounts(pan) {
  const h = hash(pan || 'x');
  const d = (n) => String((h >>> n) % 10000).padStart(4, '0');
  return [
    { id: 'a1', mask: 'XXXXXXXX' + d(1), type: 'Savings Account', fip: 'Primary bank' },
    { id: 'a2', mask: 'XXXXXXXX' + d(5), type: 'Current Account', fip: 'Primary bank' },
    { id: 'a3', mask: 'XXXXXXXX' + d(9), type: 'Savings Account', fip: 'Setu FIP' },
  ];
}
export const aaHandleFor = (pan) => sampleByPan(pan)?.aaHandle || null;
