import React, { useState } from "react";
import { UserRole } from "../types";
import {
  calculateBreakEven,
  calculateFrenchLoan,
  calculateGermanLoan,
  calculatePayroll,
  formatCurrency,
  formatPercent,
} from "../utils/finance";
import {
  Calculator,
  Landmark,
  Users,
  ShieldAlert,
  ArrowRight,
  HelpCircle,
  BarChart3,
  Percent,
} from "lucide-react";

interface AnalysisToolsModuleProps {
  currentRole: UserRole;
  defaultFixedCosts: number;
  onAskCopilot: (prompt: string) => void;
  onSwitchRole: (role: UserRole) => void;
}

export const AnalysisToolsModule: React.FC<AnalysisToolsModuleProps> = ({
  currentRole,
  defaultFixedCosts,
  onAskCopilot,
  onSwitchRole,
}) => {
  const [activeTool, setActiveTool] = useState<"breakeven" | "loan" | "payroll">("breakeven");

  // Break-even states
  const [fixedCosts, setFixedCosts] = useState<number>(defaultFixedCosts || 14930000);
  const [avgPrice, setAvgPrice] = useState<number>(550000);
  const [avgVarCost, setAvgVarCost] = useState<number>(280000);

  // Loan simulator states
  const [loanPrincipal, setLoanPrincipal] = useState<number>(30000000);
  const [loanRate, setLoanRate] = useState<number>(1.75); // 1.75% mensual
  const [loanMonths, setLoanMonths] = useState<number>(12);
  const [loanSystem, setLoanSystem] = useState<"french" | "german">("french");

  // Payroll simulator states
  const [baseSalary, setBaseSalary] = useState<number>(2500000);
  const [includeTransport, setIncludeTransport] = useState<boolean>(true);
  const [riskPercent, setRiskPercent] = useState<number>(0.522); // Riesgo I

  const isRestrictedRole = currentRole === "vendedor" || currentRole === "auxiliar";

  if (isRestrictedRole) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center max-w-2xl mx-auto shadow-2xs space-y-4 my-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-stone-900">Módulo de Análisis Restringido</h2>
        <p className="text-xs text-stone-600 leading-relaxed max-w-md mx-auto">
          Las herramientas de <strong>Punto de Equilibrio, Simulación de Créditos y Liquidación de Nómina</strong> contienen fórmulas financieras ejecutivas reservadas para <code>super_administrador</code>, <code>administrador</code> y <code>contador</code>.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => onSwitchRole("administrador")}
            className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-2xs"
          >
            Cambiar a Rol Administrador
          </button>
          <button
            onClick={() => onSwitchRole("contador")}
            className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-2xs"
          >
            Cambiar a Rol Contador
          </button>
        </div>
      </div>
    );
  }

  // Calculations
  const breakEvenResult = calculateBreakEven(fixedCosts, avgPrice, avgVarCost);
  const frenchLoanResult = calculateFrenchLoan(loanPrincipal, loanRate, loanMonths);
  const germanLoanResult = calculateGermanLoan(loanPrincipal, loanRate, loanMonths);
  const payrollResult = calculatePayroll(baseSalary, includeTransport, riskPercent);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-stone-100 text-stone-800">
                <Calculator className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-stone-900">Herramientas de Análisis Financiero</h1>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Simulador interactivo de Punto de Equilibrio, Créditos Bancarios (Francés vs Alemán) y Liquidación de Nómina.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                if (activeTool === "breakeven") {
                  onAskCopilot(
                    `Calcula y analiza el Punto de Equilibrio con costos fijos de ${formatCurrency(
                      fixedCosts
                    )}, precio promedio de ${formatCurrency(
                      avgPrice
                    )} y costo variable de ${formatCurrency(avgVarCost)}. Brinda estrategias de optimización.`
                  );
                } else if (activeTool === "loan") {
                  onAskCopilot(
                    `Compara una obligación financiera de ${formatCurrency(
                      loanPrincipal
                    )} a ${loanMonths} meses al ${loanRate}% mensual entre el Sistema Francés y el Sistema Alemán. ¿Cuál conviene más a nuestro flujo de caja?`
                  );
                } else {
                  onAskCopilot(
                    `Explica el desglose y la carga prestacional completa de una nómina con salario base de ${formatCurrency(
                      baseSalary
                    )}, auxilio de transporte y provisiones para la empresa.`
                  );
                }
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors shadow-2xs"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>Consultar Cálculo con Copiloto</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tool Selector Tabs */}
      <div className="flex space-x-2 border-b border-stone-200 pb-1">
        <button
          onClick={() => setActiveTool("breakeven")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
            activeTool === "breakeven"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Punto de Equilibrio</span>
        </button>
        <button
          onClick={() => setActiveTool("loan")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
            activeTool === "loan"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Simulador de Crédito (Francés / Alemán)</span>
        </button>
        <button
          onClick={() => setActiveTool("payroll")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
            activeTool === "payroll"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Liquidador de Nómina</span>
        </button>
      </div>

      {/* TOOL 1: PUNTO DE EQUILIBRIO */}
      {activeTool === "breakeven" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="font-bold text-sm text-stone-900 border-b border-stone-200 pb-2">
              Parámetros Operativos
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  Costos Fijos Totales del Mes ($)
                </label>
                <input
                  type="number"
                  min="0"
                  value={fixedCosts}
                  onChange={(e) => setFixedCosts(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono font-semibold"
                />
                <span className="text-[10px] text-stone-500">
                  Arriendo, nómina administrativa, software, servicios.
                </span>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  Precio de Venta Promedio Ponderado ($)
                </label>
                <input
                  type="number"
                  min="0"
                  value={avgPrice}
                  onChange={(e) => setAvgPrice(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  Costo Variable Unitario Promedio ($)
                </label>
                <input
                  type="number"
                  min="0"
                  value={avgVarCost}
                  onChange={(e) => setAvgVarCost(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono font-semibold"
                />
                <span className="text-[10px] text-stone-500">
                  Costo de adquisición SKU + empaque + comisión directa.
                </span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 bg-white border border-stone-200 rounded-xl p-6 shadow-2xs space-y-5">
            <h3 className="font-bold text-sm text-stone-900 border-b border-stone-200 pb-2">
              Diagnóstico del Punto de Equilibrio
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium">Unidades Físicas Requeridas</span>
                <div className="text-3xl font-black text-stone-900">
                  {breakEvenResult.unitsNeeded.toLocaleString("es-CO")}{" "}
                  <span className="text-xs font-normal text-stone-500">unidades</span>
                </div>
                <p className="text-[11px] text-stone-500 pt-1">
                  Volumen mínimo mensual para cubrir el 100% de la estructura de costos sin pérdida.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium">Ventas Monetarias de Equilibrio</span>
                <div className="text-3xl font-black text-emerald-800">
                  {formatCurrency(breakEvenResult.monetaryNeeded)}
                </div>
                <p className="text-[11px] text-stone-500 pt-1">
                  Facturación mínima mensual necesaria a precio de venta promedio.
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="p-4 rounded-xl bg-stone-100/70 border border-stone-200 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-600">Margen de Contribución Unitario:</span>
                <span className="font-bold text-stone-900 font-mono">
                  {formatCurrency(breakEvenResult.unitContributionMargin)} por unidad
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200">
                <span className="text-stone-600">Razón de Contribución Marginal (%):</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {formatPercent(breakEvenResult.contributionMarginRatio)}
                </span>
              </div>
              <div className="flex justify-between py-1 font-semibold text-stone-900">
                <span>Fórmula Aplicada:</span>
                <span className="font-mono text-[11px]">
                  Q = Costos Fijos / (Precio Promedio - Costo Variable)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOOL 2: SIMULADOR DE CRÉDITO */}
      {activeTool === "loan" && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Monto del Préstamo ($)</label>
                <input
                  type="number"
                  min="1000000"
                  step="500000"
                  value={loanPrincipal}
                  onChange={(e) => setLoanPrincipal(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Tasa Interés Mensual (%)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.05"
                  value={loanRate}
                  onChange={(e) => setLoanRate(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Plazo (Meses)</label>
                <input
                  type="number"
                  min="1"
                  max="72"
                  value={loanMonths}
                  onChange={(e) => setLoanMonths(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Sistema de Amortización</label>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setLoanSystem("french")}
                    className={`py-2 text-center rounded border font-semibold text-xs ${
                      loanSystem === "french"
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    Francés (Cuota Fija)
                  </button>
                  <button
                    onClick={() => setLoanSystem("german")}
                    className={`py-2 text-center rounded border font-semibold text-xs ${
                      loanSystem === "german"
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    Alemán (Capital Fijo)
                  </button>
                </div>
              </div>
            </div>

            {/* Comparison Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-4 border-t border-stone-100 text-xs">
              <div
                className={`p-4 rounded-xl border transition-all ${
                  loanSystem === "french"
                    ? "bg-stone-50 border-stone-900 ring-1 ring-stone-900/10"
                    : "bg-stone-50/50 border-stone-200"
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-stone-900 text-sm">Sistema Francés</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                    Cuota Fija
                  </span>
                </div>
                <div className="text-2xl font-black text-stone-900">
                  {formatCurrency(frenchLoanResult.monthlyPayment)} / mes
                </div>
                <div className="text-[11px] text-stone-500 mt-2 space-y-0.5">
                  <div>Total Intereses: {formatCurrency(frenchLoanResult.totalInterest)}</div>
                  <div>Total a Pagar: {formatCurrency(frenchLoanResult.totalPayment)}</div>
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border transition-all ${
                  loanSystem === "german"
                    ? "bg-stone-50 border-stone-900 ring-1 ring-stone-900/10"
                    : "bg-stone-50/50 border-stone-200"
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-stone-900 text-sm">Sistema Alemán</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                    Cuota Decreciente
                  </span>
                </div>
                <div className="text-2xl font-black text-stone-900">
                  {formatCurrency(germanLoanResult.firstPayment)} &rarr; {formatCurrency(germanLoanResult.lastPayment)}
                </div>
                <div className="text-[11px] text-stone-500 mt-2 space-y-0.5">
                  <div>Total Intereses: {formatCurrency(germanLoanResult.totalInterest)}</div>
                  <div>
                    Ahorro vs Francés:{" "}
                    <strong className="text-emerald-700">
                      {formatCurrency(Math.max(0, frenchLoanResult.totalInterest - germanLoanResult.totalInterest))}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <h4 className="font-bold text-xs text-stone-900">
                Tabla de Amortización Periodo a Periodo (
                {loanSystem === "french" ? "Sistema Francés" : "Sistema Alemán"})
              </h4>
              <span className="text-[11px] text-stone-500">
                {loanMonths} períodos de pago
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-500 font-semibold uppercase tracking-wider sticky top-0 border-b border-stone-200">
                  <tr>
                    <th className="py-2.5 px-4 text-center">Mes</th>
                    <th className="py-2.5 px-4 text-right">Cuota Total</th>
                    <th className="py-2.5 px-4 text-right">Abono Capital</th>
                    <th className="py-2.5 px-4 text-right">Intereses</th>
                    <th className="py-2.5 px-4 text-right">Saldo Restante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {(loanSystem === "french" ? frenchLoanResult.schedule : germanLoanResult.schedule).map((row) => (
                    <tr key={row.period} className="hover:bg-stone-50/70">
                      <td className="py-2 px-4 text-center font-bold text-stone-900">
                        {row.period}
                      </td>
                      <td className="py-2 px-4 text-right font-bold text-stone-900 font-mono">
                        {formatCurrency(row.payment)}
                      </td>
                      <td className="py-2 px-4 text-right text-emerald-700 font-mono">
                        {formatCurrency(row.principalPayment)}
                      </td>
                      <td className="py-2 px-4 text-right text-rose-700 font-mono">
                        {formatCurrency(row.interestPayment)}
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-stone-600">
                        {formatCurrency(row.remainingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TOOL 3: LIQUIDADOR DE NÓMINA */}
      {activeTool === "payroll" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="font-bold text-sm text-stone-900 border-b border-stone-200 pb-2">
              Datos Salariales del Colaborador
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Salario Base Mensual ($)</label>
                <input
                  type="number"
                  min="1000000"
                  step="50000"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono font-semibold"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="include-transport"
                  checked={includeTransport}
                  onChange={(e) => setIncludeTransport(e.target.checked)}
                  className="rounded border-stone-300 text-stone-900 focus:ring-stone-800"
                />
                <label htmlFor="include-transport" className="text-stone-700 font-medium">
                  Aplica Auxilio de Transporte Reglamentario (si salario &le; 2 SMMLV)
                </label>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Nivel de Riesgo ARL</label>
                <select
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs"
                >
                  <option value={0.522}>Clase I: 0.522% (Administrativo / Oficina)</option>
                  <option value={1.044}>Clase II: 1.044% (Manufactura liviana / Almacén)</option>
                  <option value={2.436}>Clase III: 2.436% (Operaciones industriales)</option>
                  <option value={4.35}>Clase IV: 4.35% (Transporte y logística)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="lg:col-span-2 bg-white border border-stone-200 rounded-xl p-6 shadow-2xs space-y-5">
            <h3 className="font-bold text-sm text-stone-900 border-b border-stone-200 pb-2 flex items-center justify-between">
              <span>Liquidación Mensual de Nómina & Provisiones</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Normativa Laboral Estándar
              </span>
            </h3>

            {/* Employee Net Pay */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3 text-xs">
              <div className="flex justify-between items-center text-sm font-bold text-stone-900 border-b border-stone-200 pb-2">
                <span>1. Neto a Recibir por el Empleado</span>
                <span className="text-emerald-800 text-base">{formatCurrency(payrollResult.netPay)}</span>
              </div>
              <div className="space-y-1.5 text-stone-600">
                <div className="flex justify-between">
                  <span>(+) Salario Base:</span>
                  <span className="font-mono">{formatCurrency(payrollResult.baseSalary)}</span>
                </div>
                <div className="flex justify-between">
                  <span>(+) Auxilio de Transporte Reglamentario:</span>
                  <span className="font-mono">{formatCurrency(payrollResult.transportAllowance)}</span>
                </div>
                <div className="flex justify-between text-rose-700 font-medium">
                  <span>(-) Deducción Salud Trabajador (4%):</span>
                  <span className="font-mono">({formatCurrency(payrollResult.healthEmployee)})</span>
                </div>
                <div className="flex justify-between text-rose-700 font-medium">
                  <span>(-) Deducción Pensión Trabajador (4%):</span>
                  <span className="font-mono">({formatCurrency(payrollResult.pensionEmployee)})</span>
                </div>
              </div>
            </div>

            {/* Employer Burden */}
            <div className="p-4 rounded-xl bg-stone-100/70 border border-stone-200 space-y-3 text-xs">
              <div className="flex justify-between items-center text-sm font-bold text-stone-900 border-b border-stone-200 pb-2">
                <span>2. Carga Prestacional & Seguridad Social (Empresa)</span>
                <span className="font-mono">{formatCurrency(payrollResult.totalEmployerProvisions)}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-stone-600">
                <div className="flex justify-between">
                  <span>Salud Empleador (8.5%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.healthEmployer)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pensión Empleador (12%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.pensionEmployer)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ARL Riesgo ({riskPercent}%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.arlEmployer)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Caja Compensación (4%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.compensationFund)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cesantías (8.33%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.severance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Intereses Cesantías (1%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.severanceInterest)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Prima de Servicios (8.33%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.serviceBonus)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vacaciones (4.16%):</span>
                  <span className="font-mono">{formatCurrency(payrollResult.vacations)}</span>
                </div>
              </div>
            </div>

            {/* Total Company Cost */}
            <div className="p-4 rounded-xl bg-stone-900 text-white flex items-center justify-between font-bold text-sm">
              <span>Costo Total Mensual para la Empresa</span>
              <span className="text-amber-400 text-base">{formatCurrency(payrollResult.totalCompanyCost)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
