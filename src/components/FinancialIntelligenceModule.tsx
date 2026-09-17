import React, { useState } from "react";
import { UserRole } from "../types";
import { formatCurrency, formatPercent } from "../utils/finance";
import {
  TrendingUp,
  Scale,
  DollarSign,
  PieChart,
  ShieldAlert,
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  CheckCircle,
} from "lucide-react";

interface FinancialIntelligenceModuleProps {
  currentRole: UserRole;
  totalSales: number;
  costOfSales: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  netProfit: number;
  netMargin: number;
  cashBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  inventoryValue: number;
  effectiveCashInflows: number;
  effectiveCashOutflows: number;
  netCashFlow: number;
  currentRatio: number;
  dsoDays: number;
  onAskCopilot: (prompt: string) => void;
  onSwitchRole: (role: UserRole) => void;
}

export const FinancialIntelligenceModule: React.FC<FinancialIntelligenceModuleProps> = ({
  currentRole,
  totalSales,
  costOfSales,
  grossProfit,
  grossMargin,
  operatingExpenses,
  netProfit,
  netMargin,
  cashBalance,
  accountsReceivable,
  accountsPayable,
  inventoryValue,
  effectiveCashInflows,
  effectiveCashOutflows,
  netCashFlow,
  currentRatio,
  dsoDays,
  onAskCopilot,
  onSwitchRole,
}) => {
  const [activeReport, setActiveReport] = useState<"pg" | "balance" | "cashflow" | "ratios">("pg");

  // Balance calculations
  const totalCurrentAssets = cashBalance + accountsReceivable + inventoryValue;
  const totalCurrentLiabilities = accountsPayable;
  // Equity = Initial capital (55M) + Net Profit of the period
  const totalEquity = 55000000 + netProfit;
  const totalLiabilitiesAndEquity = totalCurrentLiabilities + totalEquity;

  const isRestrictedRole = currentRole === "vendedor" || currentRole === "auxiliar";

  if (isRestrictedRole) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center max-w-2xl mx-auto shadow-2xs space-y-4 my-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-stone-900">Módulo Restringido por Política RBAC</h2>
        <p className="text-xs text-stone-600 leading-relaxed max-w-md mx-auto">
          El acceso a los <strong>Estados Financieros (P&G, Balance General y Flujo de Caja)</strong> está restringido exclusivamente a perfiles directivos y contables (<code>super_administrador</code>, <code>administrador</code>, <code>contador</code>).
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-stone-100 text-stone-800">
                <TrendingUp className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-stone-900">Inteligencia Financiera & Contable</h1>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Estado de Resultados (P&G), Balance General, Flujo de Caja Operativo y Ratios Financieros de Liquidez.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() =>
                onAskCopilot(
                  "Genera un diagnóstico ejecutivo integral de la salud financiera de la empresa: analiza el P&G, la solvencia del Balance General, la liquidez del Flujo de Caja y la rotación de cartera."
                )
              }
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              <span>Diagnóstico Financiero con Copiloto</span>
            </button>
          </div>
        </div>

        {/* Top 4 KPI Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-stone-100">
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Margen Bruto</span>
            <div className="text-lg font-bold text-emerald-800 mt-0.5">
              {formatPercent(grossMargin)}
            </div>
            <span className="text-[11px] text-stone-500">
              Utilidad Bruta: {formatCurrency(grossProfit)}
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Margen Neto</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">
              {formatPercent(netMargin)}
            </div>
            <span className="text-[11px] text-stone-500">
              Utilidad Neta: {formatCurrency(netProfit)}
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Razón Corriente (Liquidez)</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">
              {currentRatio.toFixed(2)}x
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">
              {currentRatio >= 1.5 ? "Solvencia óptima (> 1.5x)" : "Atención a liquidez"}
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Rotación de Cartera (DSO)</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">
              {dsoDays} días
            </div>
            <span className="text-[11px] text-stone-500">
              Promedio recuperación de crédito
            </span>
          </div>
        </div>
      </div>

      {/* Subtab Navigation */}
      <div className="flex space-x-2 border-b border-stone-200 pb-1">
        <button
          onClick={() => setActiveReport("pg")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeReport === "pg"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          Estado de Resultados (P&G)
        </button>
        <button
          onClick={() => setActiveReport("balance")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeReport === "balance"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          Balance General
        </button>
        <button
          onClick={() => setActiveReport("cashflow")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeReport === "cashflow"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          Flujo de Caja Real
        </button>
        <button
          onClick={() => setActiveReport("ratios")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeReport === "ratios"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          Análisis de Ratios Contables
        </button>
      </div>

      {/* 1. Estado de Resultados (P&G) */}
      {activeReport === "pg" && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-2xs space-y-4 max-w-3xl">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">Estado de Resultados Integral (P&G)</h2>
              <p className="text-xs text-stone-500">Corte al período contable corriente (Cifras en COP)</p>
            </div>
            <span className="text-xs font-semibold px-2 py-1 bg-stone-100 rounded border border-stone-300 text-stone-800">
              Moneda: COP ($)
            </span>
          </div>

          <div className="divide-y divide-stone-100 text-xs text-stone-700">
            {/* Ingresos Operacionales */}
            <div className="py-3 flex items-center justify-between font-semibold text-stone-900 text-sm">
              <span className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>(+) Ingresos Operacionales (Ventas Totales)</span>
              </span>
              <span>{formatCurrency(totalSales)}</span>
            </div>

            {/* Costo de Ventas */}
            <div className="py-3 flex items-center justify-between text-rose-700 font-medium">
              <span className="pl-4">(-) Costo de Ventas (Mercancía Facturada)</span>
              <span>({formatCurrency(costOfSales)})</span>
            </div>

            {/* Utilidad Bruta */}
            <div className="py-3 flex items-center justify-between font-bold text-stone-900 bg-stone-50/80 px-2 rounded">
              <span>(=) Utilidad Bruta</span>
              <div className="text-right">
                <div>{formatCurrency(grossProfit)}</div>
                <div className="text-[10px] text-emerald-700 font-medium">
                  Margen Bruto: {formatPercent(grossMargin)}
                </div>
              </div>
            </div>

            {/* Gastos Operativos */}
            <div className="py-3 flex items-center justify-between text-rose-700 font-medium">
              <span className="pl-4">(-) Gastos Operativos & Administrativos Causados</span>
              <span>({formatCurrency(operatingExpenses)})</span>
            </div>

            {/* Utilidad Neta */}
            <div className="py-3.5 flex items-center justify-between font-bold text-base text-stone-950 bg-stone-100 px-3 rounded-lg border border-stone-200">
              <span>(=) Utilidad Neta del Período</span>
              <div className="text-right">
                <div>{formatCurrency(netProfit)}</div>
                <div className="text-xs text-emerald-800 font-semibold">
                  Margen Neto: {formatPercent(netMargin)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Balance General */}
      {activeReport === "balance" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {/* Activos */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="font-bold text-sm text-stone-900 flex items-center space-x-1.5 border-b border-stone-200 pb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Activo Corriente</span>
            </h3>
            <div className="space-y-2 text-xs text-stone-700">
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span>Efectivo disponible en Caja y Bancos</span>
                <span className="font-semibold text-stone-900">{formatCurrency(cashBalance)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span>Cuentas por Cobrar (Clientes CxC)</span>
                <span className="font-semibold text-stone-900">{formatCurrency(accountsReceivable)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span>Inventario de Mercancías (Valoración SKU)</span>
                <span className="font-semibold text-stone-900">{formatCurrency(inventoryValue)}</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-sm text-stone-900 bg-blue-50 px-2 rounded border border-blue-100">
                <span>Total Activo</span>
                <span>{formatCurrency(totalCurrentAssets)}</span>
              </div>
            </div>
          </div>

          {/* Pasivos y Patrimonio */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
            {/* Pasivo */}
            <div className="space-y-2 text-xs text-stone-700">
              <h3 className="font-bold text-sm text-stone-900 flex items-center space-x-1.5 border-b border-stone-200 pb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                <span>Pasivo Corriente</span>
              </h3>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span>Cuentas por Pagar Proveedores (CxP)</span>
                <span className="font-semibold text-stone-900">{formatCurrency(accountsPayable)}</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-stone-900">
                <span>Total Pasivo</span>
                <span>{formatCurrency(totalCurrentLiabilities)}</span>
              </div>
            </div>

            {/* Patrimonio */}
            <div className="space-y-2 text-xs text-stone-700 pt-2 border-t border-stone-200">
              <h3 className="font-bold text-sm text-stone-900 flex items-center space-x-1.5 border-b border-stone-200 pb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>Patrimonio</span>
              </h3>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span>Capital Social Aportado</span>
                <span className="font-semibold text-stone-900">{formatCurrency(55000000)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span>Utilidad del Ejercicio Contable</span>
                <span className="font-semibold text-emerald-700">{formatCurrency(netProfit)}</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-stone-900">
                <span>Total Patrimonio</span>
                <span>{formatCurrency(totalEquity)}</span>
              </div>
            </div>

            {/* Total Pasivo + Patrimonio */}
            <div className="flex justify-between py-2 font-bold text-sm text-stone-900 bg-stone-100 px-2 rounded border border-stone-200">
              <span>Total Pasivo + Patrimonio</span>
              <span>{formatCurrency(totalLiabilitiesAndEquity)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Flujo de Caja */}
      {activeReport === "cashflow" && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-2xs space-y-4 max-w-3xl">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">Estado de Flujo de Efectivo (Caja Real)</h2>
              <p className="text-xs text-stone-500">Conciliación de entradas y salidas efectivas en bancos</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {/* Entradas */}
            <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between font-bold text-emerald-900 text-sm">
                <span className="flex items-center space-x-1.5">
                  <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                  <span>Entradas Efectivas de Dinero</span>
                </span>
                <span>{formatCurrency(effectiveCashInflows)}</span>
              </div>
              <p className="text-emerald-700 text-[11px]">
                Incluye cobros de ventas de contado y recibos de abono recaudados de clientes (CxC).
              </p>
            </div>

            {/* Salidas */}
            <div className="p-4 rounded-lg bg-rose-50/70 border border-rose-200 space-y-2">
              <div className="flex items-center justify-between font-bold text-rose-900 text-sm">
                <span className="flex items-center space-x-1.5">
                  <ArrowUpRight className="w-4 h-4 text-rose-600" />
                  <span>Salidas Efectivas de Dinero</span>
                </span>
                <span>({formatCurrency(effectiveCashOutflows)})</span>
              </div>
              <p className="text-rose-700 text-[11px]">
                Incluye compras a proveedores pagadas de contado y gastos operativos cancelados.
              </p>
            </div>

            {/* Flujo Neto */}
            <div className="p-4 rounded-lg bg-stone-900 text-white flex items-center justify-between font-bold text-sm">
              <span>Flujo Neto Operativo del Período</span>
              <span className={netCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {formatCurrency(netCashFlow)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Ratios Contables */}
      {activeReport === "ratios" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-2">
            <h4 className="font-bold text-sm text-stone-900">Razón Corriente (Liquidez)</h4>
            <div className="text-2xl font-black text-stone-900">{currentRatio.toFixed(2)}</div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Fórmula: <code>Activo Corriente / Pasivo Corriente</code>. Indica que la empresa cuenta con{" "}
              <strong>${currentRatio.toFixed(2)}</strong> de respaldo líquido por cada $1.00 de pasivo a corto plazo.
            </p>
          </div>

          <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-2">
            <h4 className="font-bold text-sm text-stone-900">Días de Venta Pendientes (DSO)</h4>
            <div className="text-2xl font-black text-stone-900">{dsoDays} días</div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Fórmula: <code>(CxC Promedio / Ventas Totales) * 365</code>. Mide el ciclo de cobro de clientes y la eficiencia en la recuperación de cuentas por cobrar.
            </p>
          </div>

          <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-2">
            <h4 className="font-bold text-sm text-stone-900">Margen de Utilidad Bruta</h4>
            <div className="text-2xl font-black text-emerald-800">{formatPercent(grossMargin)}</div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Fórmula: <code>(Utilidad Bruta / Ventas Totales) * 100</code>. Rendimiento porcentual obtenido tras descontar el costo directo de la mercancía vendida.
            </p>
          </div>

          <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-2">
            <h4 className="font-bold text-sm text-stone-900">Margen de Utilidad Neta</h4>
            <div className="text-2xl font-black text-stone-900">{formatPercent(netMargin)}</div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Fórmula: <code>(Utilidad Neta / Ventas Totales) * 100</code>. Beneficio real que queda disponible para los socios y reinversión tras deducir todos los gastos operativos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
