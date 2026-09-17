import React from "react";
import { UserRole } from "../types";
import {
  Building2,
  Shield,
  Bot,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Coins,
  Sparkles,
} from "lucide-react";
import { formatCurrency } from "../utils/finance";

interface NavbarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  copilotOpen: boolean;
  onToggleCopilot: () => void;
  cashBalance: number;
  netProfit: number;
  totalReceivables: number;
  criticalStockAlerts: number;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onRoleChange,
  copilotOpen,
  onToggleCopilot,
  cashBalance,
  netProfit,
  totalReceivables,
  criticalStockAlerts,
  activeTab,
  onSelectTab,
}) => {
  const roleLabels: Record<UserRole, { label: string; badgeColor: string; desc: string }> = {
    super_administrador: {
      label: "Super Admin",
      badgeColor: "bg-purple-100 text-purple-800 border-purple-300",
      desc: "Acceso total, auditoría y análisis irrestricto",
    },
    administrador: {
      label: "Administrador",
      badgeColor: "bg-blue-100 text-blue-800 border-blue-300",
      desc: "Gestión ejecutiva, salud financiera y control general",
    },
    contador: {
      label: "Contador",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
      desc: "Técnica contable, P&G, balance, deducciones e impuestos",
    },
    vendedor: {
      label: "Vendedor",
      badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
      desc: "Catálogo, disponibilidad SKU, clientes y pedidos",
    },
    auxiliar: {
      label: "Auxiliar Operativo",
      badgeColor: "bg-stone-100 text-stone-800 border-stone-300",
      desc: "Operación de inventario, clientes y recaudos",
    },
  };

  const navItems = [
    { id: "comercial", label: "Comercial & CxC" },
    { id: "compras", label: "Compras & CxP" },
    { id: "inventario", label: "Inventario SKU" },
    { id: "finanzas", label: "Inteligencia Financiera" },
    { id: "herramientas", label: "Herramientas de Análisis" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur-md">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-stone-900 flex items-center justify-center text-white shadow-sm">
              <Building2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-stone-900 tracking-tight">
                  ERP Financiero
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-stone-200 text-stone-700">
                  SaaS Enterprise
                </span>
              </div>
              <p className="text-xs text-stone-500 hidden sm:block">
                Gestión comercial, operativa & contable con Copiloto Inteligente
              </p>
            </div>
          </div>

          {/* Center / Right: Live KPIs & Role Switcher */}
          <div className="flex items-center space-x-3 lg:space-x-4">
            {/* Quick KPI pills for desktop */}
            <div className="hidden xl:flex items-center space-x-3 text-xs bg-white border border-stone-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <div className="flex items-center space-x-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-stone-500">Caja:</span>
                <span className="font-semibold text-stone-800">{formatCurrency(cashBalance)}</span>
              </div>
              <div className="w-px h-3.5 bg-stone-200" />
              <div className="flex items-center space-x-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-stone-500">Utilidad:</span>
                <span className="font-semibold text-stone-800">{formatCurrency(netProfit)}</span>
              </div>
              <div className="w-px h-3.5 bg-stone-200" />
              <div className="flex items-center space-x-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-stone-500">CxC:</span>
                <span className="font-semibold text-stone-800">{formatCurrency(totalReceivables)}</span>
              </div>
              {criticalStockAlerts > 0 && (
                <>
                  <div className="w-px h-3.5 bg-stone-200" />
                  <div className="flex items-center space-x-1 text-rose-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>{criticalStockAlerts} alertas SKU</span>
                  </div>
                </>
              )}
            </div>

            {/* Role Switcher */}
            <div className="flex items-center space-x-2 bg-white border border-stone-200 px-2.5 py-1.5 rounded-lg">
              <Shield className="w-4 h-4 text-stone-600 hidden sm:block" />
              <div className="text-xs">
                <label htmlFor="role-select" className="sr-only">
                  Rol de Usuario
                </label>
                <select
                  id="role-select"
                  value={currentRole}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  className="font-medium text-xs text-stone-800 bg-transparent border-0 focus:ring-0 cursor-pointer outline-none"
                  title="Cambiar rol para simular políticas RBAC"
                >
                  <option value="super_administrador">Super Admin (Total)</option>
                  <option value="administrador">Administrador</option>
                  <option value="contador">Contador (Técnico)</option>
                  <option value="vendedor">Vendedor (Catálogo/CxC)</option>
                  <option value="auxiliar">Auxiliar Operativo</option>
                </select>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold hidden md:inline-block ${
                  roleLabels[currentRole].badgeColor
                }`}
              >
                {roleLabels[currentRole].label}
              </span>
            </div>

            {/* Copilot Toggle Button */}
            <button
              id="btn-toggle-copilot"
              onClick={onToggleCopilot}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                copilotOpen
                  ? "bg-amber-600 text-white hover:bg-amber-700 ring-2 ring-amber-400/50"
                  : "bg-stone-900 text-stone-100 hover:bg-stone-800"
              }`}
            >
              <Bot className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Copiloto Inteligente</span>
              <span className="sm:hidden">Copiloto</span>
              <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center space-x-1 border-t border-stone-200 overflow-x-auto py-2 no-scrollbar">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isRestricted =
              (item.id === "finanzas" || item.id === "herramientas") &&
              (currentRole === "vendedor" || currentRole === "auxiliar");

            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  isActive
                    ? "bg-stone-900 text-white shadow-2xs"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                }`}
              >
                <span>{item.label}</span>
                {isRestricted && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-stone-300 text-stone-700 font-normal">
                    Restringido
                  </span>
                )}
                {item.id === "inventario" && criticalStockAlerts > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
