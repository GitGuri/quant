// src/utils/calculatePayroll.ts
import type { Employee, PayrollCalculation } from '../types/payroll';

// 2024/25 SA brackets
const TAX_BRACKETS = [
  { min: 0,       max: 237_100,  rate: 0.18 },
  { min: 237_100, max: 370_500,  rate: 0.26 },
  { min: 370_500, max: 512_800,  rate: 0.31 },
  { min: 512_800, max: 673_000,  rate: 0.36 },
  { min: 673_000, max: 857_900,  rate: 0.39 },
  { min: 857_900, max: 1_817_000,rate: 0.41 },
  { min: 1_817_000, max: Infinity, rate: 0.45 },
];

// Rebates (primary only applied here)
const ANNUAL_TAX_REBATES = { primary: 17_235 };

export const calculatePAYE = (annualSalary: number): number => {
  let tax = 0;
  for (const b of TAX_BRACKETS) {
    if (annualSalary > b.min) {
      const upper = b.max === Infinity ? annualSalary : b.max;
      const taxable = Math.max(0, Math.min(annualSalary, upper) - b.min);
      tax += taxable * b.rate;
    }
    if (annualSalary <= b.max) break;
  }
  tax = Math.max(0, tax - ANNUAL_TAX_REBATES.primary);
  return tax / 12; // monthly PAYE
};

export const calculateUIF = (monthlySalary: number): number => {
  // 1% capped at R177.12 / month (employee portion)
  return Math.min(monthlySalary * 0.01, 177.12);
};

// SDL is employer-paid; do not deduct from employee
export const calculateSDL = (_monthlySalary: number): number => 0;

/**
 * Calculates payroll using your schema:
 * - Hourly: gross = hours_worked_total * hourly_rate
 * - Salary: gross = base_salary (already monthly)
 */
export const calculatePayroll = (employee: Employee): PayrollCalculation => {
  const paymentType = (employee.payment_type || '').toLowerCase();

  const hours = Number.parseFloat((employee as any).hours_worked_total ?? '0') || 0;
  const hourlyRate = Number.parseFloat((employee as any).hourly_rate ?? '0') || 0;
  const baseSalary = Number.parseFloat((employee as any).base_salary ?? '0') || 0;

  const grossSalary =
    paymentType === 'hourly' ? hours * hourlyRate : baseSalary;

  // Convert monthly to annual for PAYE calc
  const annualSalary = grossSalary * 12;

  const paye = calculatePAYE(annualSalary);
  const uif  = calculateUIF(grossSalary);
  const sdl  = calculateSDL(grossSalary);

  const totalDeductions = paye + uif + sdl;
  const netSalary = grossSalary - totalDeductions;

  return {
    grossSalary,
    paye,
    uif,
    sdl,
    totalDeductions,
    netSalary,
  };
};
