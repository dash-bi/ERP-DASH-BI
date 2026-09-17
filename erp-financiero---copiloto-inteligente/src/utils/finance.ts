// Utilidades y cálculos financieros estándar para el ERP y Copilot

export function formatCurrency(value: number): string {
  if (isNaN(value) || value === null || value === undefined) return "$ 0";
  return (
    "$ " +
    Math.round(value)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  );
}

export function formatPercent(value: number): string {
  if (isNaN(value) || value === null || value === undefined) return "0.0%";
  return `${Number(value).toFixed(1)}%`;
}

// Simulador de Crédito: Sistema Francés (Cuota Fija)
export interface FrenchLoanRow {
  period: number;
  payment: number; // Cuota total
  principalPayment: number; // Abono a capital
  interestPayment: number; // Intereses
  remainingBalance: number; // Saldo final
}

export function calculateFrenchLoan(
  principal: number,
  monthlyRatePercent: number,
  months: number
): {
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
  schedule: FrenchLoanRow[];
} {
  const i = monthlyRatePercent / 100;
  if (i === 0 || months <= 0) {
    const payment = principal / (months || 1);
    return {
      monthlyPayment: payment,
      totalInterest: 0,
      totalPayment: principal,
      schedule: [],
    };
  }

  // Cuota fija: R = P * [i * (1+i)^n] / [(1+i)^n - 1]
  const factor = Math.pow(1 + i, months);
  const monthlyPayment = (principal * (i * factor)) / (factor - 1);

  let balance = principal;
  let totalInterest = 0;
  const schedule: FrenchLoanRow[] = [];

  for (let m = 1; m <= months; m++) {
    const interest = balance * i;
    const principalPaid = monthlyPayment - interest;
    balance = Math.max(0, balance - principalPaid);
    totalInterest += interest;

    schedule.push({
      period: m,
      payment: monthlyPayment,
      principalPayment: principalPaid,
      interestPayment: interest,
      remainingBalance: balance,
    });
  }

  return {
    monthlyPayment,
    totalInterest,
    totalPayment: principal + totalInterest,
    schedule,
  };
}

// Simulador de Crédito: Sistema Alemán (Abono Constante a Capital)
export interface GermanLoanRow {
  period: number;
  payment: number; // Cuota decreciente
  principalPayment: number; // Abono fijo
  interestPayment: number; // Intereses sobre saldo
  remainingBalance: number; // Saldo final
}

export function calculateGermanLoan(
  principal: number,
  monthlyRatePercent: number,
  months: number
): {
  firstPayment: number;
  lastPayment: number;
  totalInterest: number;
  totalPayment: number;
  schedule: GermanLoanRow[];
} {
  const i = monthlyRatePercent / 100;
  const fixedPrincipal = principal / (months || 1);
  let balance = principal;
  let totalInterest = 0;
  const schedule: GermanLoanRow[] = [];

  for (let m = 1; m <= months; m++) {
    const interest = balance * i;
    const payment = fixedPrincipal + interest;
    balance = Math.max(0, balance - fixedPrincipal);
    totalInterest += interest;

    schedule.push({
      period: m,
      payment,
      principalPayment: fixedPrincipal,
      interestPayment: interest,
      remainingBalance: balance,
    });
  }

  return {
    firstPayment: schedule[0]?.payment || 0,
    lastPayment: schedule[schedule.length - 1]?.payment || 0,
    totalInterest,
    totalPayment: principal + totalInterest,
    schedule,
  };
}

// Punto de Equilibrio: Q = Costos Fijos / (Precio Promedio - Costo Variable Unitario)
export function calculateBreakEven(
  fixedCosts: number,
  avgSellingPrice: number,
  unitVariableCost: number
): {
  unitsNeeded: number;
  monetaryNeeded: number;
  unitContributionMargin: number;
  contributionMarginRatio: number;
} {
  const unitContributionMargin = avgSellingPrice - unitVariableCost;
  if (unitContributionMargin <= 0) {
    return {
      unitsNeeded: 0,
      monetaryNeeded: 0,
      unitContributionMargin: 0,
      contributionMarginRatio: 0,
    };
  }
  const unitsNeeded = Math.ceil(fixedCosts / unitContributionMargin);
  const contributionMarginRatio = (unitContributionMargin / avgSellingPrice) * 100;
  const monetaryNeeded = unitsNeeded * avgSellingPrice;

  return {
    unitsNeeded,
    monetaryNeeded,
    unitContributionMargin,
    contributionMarginRatio,
  };
}

// Liquidador de Nómina (Normativa Local estándar SME)
export interface PayrollSummary {
  baseSalary: number;
  transportAllowance: number;
  totalAccrued: number; // Total Devengado
  // Deducciones empleado
  healthEmployee: number; // 4%
  pensionEmployee: number; // 4%
  totalDeductions: number; // 8%
  netPay: number; // Neto a pagar en cuenta al empleado
  // Aportes de seguridad social empleador
  healthEmployer: number; // 8.5%
  pensionEmployer: number; // 12%
  arlEmployer: number; // Nivel I: 0.522%
  // Parafiscales
  compensationFund: number; // Caja compensación 4%
  // Prestaciones sociales (provisiones)
  severance: number; // Cesantías 8.33%
  severanceInterest: number; // Intereses a cesantías 1% mensual (12% anual)
  serviceBonus: number; // Prima de servicios 8.33%
  vacations: number; // Vacaciones 4.16%
  totalEmployerProvisions: number;
  totalCompanyCost: number; // Costo total para la empresa
}

export function calculatePayroll(
  baseSalary: number,
  includeTransport: boolean = true,
  riskLevelPercent: number = 0.522 // ARL Riesgo I
): PayrollSummary {
  // Parámetros normativos
  const SMMLV_REFERENCIA = 1423500;
  const AUX_TRANSPORTE_REF = 200000;

  // Auxilio aplica si gana hasta 2 salarios mínimos
  const qualifiesTransport = includeTransport && baseSalary <= SMMLV_REFERENCIA * 2;
  const transportAllowance = qualifiesTransport ? AUX_TRANSPORTE_REF : 0;
  const totalAccrued = baseSalary + transportAllowance;

  // Deducciones trabajador (solo sobre base salarial sin auxilio)
  const healthEmployee = baseSalary * 0.04;
  const pensionEmployee = baseSalary * 0.04;
  const totalDeductions = healthEmployee + pensionEmployee;
  const netPay = totalAccrued - totalDeductions;

  // Aportes Empleador
  const healthEmployer = baseSalary * 0.085;
  const pensionEmployer = baseSalary * 0.12;
  const arlEmployer = baseSalary * (riskLevelPercent / 100);
  const compensationFund = baseSalary * 0.04;

  // Prestaciones Sociales (base para cesantías y prima incluye auxilio de transporte; vacaciones solo salario)
  const severanceBase = baseSalary + transportAllowance;
  const severance = severanceBase * 0.0833;
  const severanceInterest = severance * 0.12;
  const serviceBonus = severanceBase * 0.0833;
  const vacations = baseSalary * 0.0416;

  const totalEmployerProvisions =
    healthEmployer +
    pensionEmployer +
    arlEmployer +
    compensationFund +
    severance +
    severanceInterest +
    serviceBonus +
    vacations;

  const totalCompanyCost = totalAccrued + totalEmployerProvisions;

  return {
    baseSalary,
    transportAllowance,
    totalAccrued,
    healthEmployee,
    pensionEmployee,
    totalDeductions,
    netPay,
    healthEmployer,
    pensionEmployer,
    arlEmployer,
    compensationFund,
    severance,
    severanceInterest,
    serviceBonus,
    vacations,
    totalEmployerProvisions,
    totalCompanyCost,
  };
}
