import React, { useState, useMemo } from "react";
import {
  UserRole,
  ProductSKU,
  Customer,
  Invoice,
  PaymentReceipt,
  Purchase,
  Expense,
  ERPSnapshot,
} from "./types";
import {
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_INVOICES,
  INITIAL_PAYMENTS,
  INITIAL_PURCHASES,
  INITIAL_EXPENSES,
  INITIAL_CASH_BALANCE,
} from "./data/initialData";
import { Navbar } from "./components/Navbar";
import { CommercialModule } from "./components/CommercialModule";
import { PurchasesModule } from "./components/PurchasesModule";
import { InventoryModule } from "./components/InventoryModule";
import { FinancialIntelligenceModule } from "./components/FinancialIntelligenceModule";
import { AnalysisToolsModule } from "./components/AnalysisToolsModule";
import { CopilotDrawer } from "./components/CopilotDrawer";

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>("administrador");
  const [activeTab, setActiveTab] = useState<string>("comercial");
  const [copilotOpen, setCopilotOpen] = useState<boolean>(false);

  // Core ERP State
  const [products, setProducts] = useState<ProductSKU[]>(INITIAL_PRODUCTS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [payments, setPayments] = useState<PaymentReceipt[]>(INITIAL_PAYMENTS);
  const [purchases, setPurchases] = useState<Purchase[]>(INITIAL_PURCHASES);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [cashBalance, setCashBalance] = useState<number>(INITIAL_CASH_BALANCE);

  // Computed Financial Metrics
  const financials = useMemo(() => {
    const totalSales = invoices.reduce((acc, i) => acc + i.subtotal, 0);
    const costOfSales = invoices.reduce((acc, i) => acc + i.totalCost, 0);
    const grossProfit = totalSales - costOfSales;
    const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    const operatingExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossProfit - operatingExpenses;
    const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    const totalReceivables = customers.reduce((acc, c) => acc + c.currentBalance, 0);

    const creditPurchases = purchases
      .filter((p) => p.paymentType === "credito")
      .reduce((acc, p) => acc + p.total, 0);
    const unpaidExpenses = expenses
      .filter((e) => !e.isPaid)
      .reduce((acc, e) => acc + e.amount, 0);
    const totalPayables = creditPurchases + unpaidExpenses;

    const totalInventoryValue = products.reduce(
      (acc, p) => acc + p.currentStock * p.unitCost,
      0
    );

    // Effective Cash Flow
    const cashSalesTotal = invoices
      .filter((i) => i.paymentType === "contado")
      .reduce((acc, i) => acc + i.total, 0);
    const customerPaymentsTotal = payments.reduce((acc, p) => acc + p.amount, 0);
    const effectiveInflows = cashSalesTotal + customerPaymentsTotal;

    const cashPurchasesTotal = purchases
      .filter((p) => p.paymentType === "contado")
      .reduce((acc, p) => acc + p.total, 0);
    const paidExpensesTotal = expenses
      .filter((e) => e.isPaid)
      .reduce((acc, e) => acc + e.amount, 0);
    const effectiveOutflows = cashPurchasesTotal + paidExpensesTotal;
    const netCashFlow = effectiveInflows - effectiveOutflows;

    // Ratios
    const totalCurrentAssets = cashBalance + totalReceivables + totalInventoryValue;
    const currentRatio = totalPayables > 0 ? totalCurrentAssets / totalPayables : 3.5;
    const dsoDays = totalSales > 0 ? Math.round((totalReceivables / totalSales) * 365) : 35;

    const criticalProducts = products.filter((p) => p.currentStock < p.minStock);

    return {
      totalSales,
      costOfSales,
      grossProfit,
      grossMargin,
      operatingExpenses,
      netProfit,
      netMargin,
      totalReceivables,
      totalPayables,
      totalInventoryValue,
      effectiveInflows,
      effectiveOutflows,
      netCashFlow,
      currentRatio,
      dsoDays,
      criticalAlertsCount: criticalProducts.length,
      criticalProducts,
    };
  }, [invoices, expenses, customers, purchases, products, payments, cashBalance]);

  // ERP Real-time Snapshot for Copilot
  const erpSnapshot: ERPSnapshot = useMemo(() => {
    return {
      totalSales: financials.totalSales,
      costOfSales: financials.costOfSales,
      grossProfit: financials.grossProfit,
      grossMargin: financials.grossMargin.toFixed(1),
      operatingExpenses: financials.operatingExpenses,
      netProfit: financials.netProfit,
      netMargin: financials.netMargin.toFixed(1),
      cashBalance: cashBalance,
      accountsReceivable: financials.totalReceivables,
      accountsPayable: financials.totalPayables,
      inventoryValue: financials.totalInventoryValue,
      currentRatio: financials.currentRatio.toFixed(2),
      dso: financials.dsoDays.toString(),
      criticalAlertsCount: financials.criticalAlertsCount,
      topDebtors: customers
        .filter((c) => c.currentBalance > 0)
        .sort((a, b) => b.currentBalance - a.currentBalance)
        .slice(0, 3)
        .map((c) => ({ name: c.name, balance: c.currentBalance })),
      lowStockProducts: financials.criticalProducts.map((p) => ({
        sku: p.sku,
        name: p.name,
        stock: p.currentStock,
        min: p.minStock,
      })),
    };
  }, [financials, cashBalance, customers]);

  // Handlers
  const handleCreateInvoice = (newInvData: Omit<Invoice, "id" | "code">) => {
    const newCode = `FAC-${1080 + invoices.length + 1}`;
    const newInv: Invoice = {
      ...newInvData,
      id: `inv-${Date.now()}`,
      code: newCode,
    };

    // Deduct stock for sold products
    setProducts((prev) =>
      prev.map((prod) => {
        const item = newInvData.items.find((it) => it.productId === prod.id);
        if (item) {
          return {
            ...prod,
            currentStock: Math.max(0, prod.currentStock - item.quantity),
          };
        }
        return prod;
      })
    );

    // Update customer balance if credit, or increase cash if contado
    if (newInvData.paymentType === "credito") {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === newInvData.customerId
            ? { ...c, currentBalance: c.currentBalance + newInvData.total }
            : c
        )
      );
    } else {
      setCashBalance((prev) => prev + newInvData.total);
    }

    setInvoices((prev) => [newInv, ...prev]);
  };

  const handleRecordPayment = (
    customerId: string,
    invoiceId: string,
    amount: number,
    paymentMethod: "transferencia" | "efectivo" | "tarjeta",
    notes: string
  ) => {
    const newCode = `RC-${400 + payments.length + 1}`;
    const targetInvoice = invoices.find((i) => i.id === invoiceId);
    const targetCustomer = customers.find((c) => c.id === customerId);

    const receipt: PaymentReceipt = {
      id: `rec-${Date.now()}`,
      code: newCode,
      date: new Date().toISOString().split("T")[0],
      customerId,
      customerName: targetCustomer?.name || "Cliente",
      invoiceId,
      invoiceCode: targetInvoice?.code || "FAC",
      amount,
      paymentMethod,
      notes,
    };

    // Amortize invoice balance
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === invoiceId) {
          const newBal = Math.max(0, inv.balanceRemaining - amount);
          return {
            ...inv,
            balanceRemaining: newBal,
            status: newBal === 0 ? "pagada" : "abono_parcial",
          };
        }
        return inv;
      })
    );

    // Amortize customer balance
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === customerId) {
          const newBal = Math.max(0, c.currentBalance - amount);
          return {
            ...c,
            currentBalance: newBal,
            status: newBal === 0 ? "al_dia" : c.status,
          };
        }
        return c;
      })
    );

    // Inflow to cash
    setCashBalance((prev) => prev + amount);
    setPayments((prev) => [receipt, ...prev]);
  };

  const handleRegisterPurchase = (
    newPurchaseData: Omit<Purchase, "id" | "code">,
    affectedProduct: { id: string; addedQty: number; newPurchaseCost: number }
  ) => {
    const newCode = `COM-${700 + purchases.length + 1}`;
    const newPurchase: Purchase = {
      ...newPurchaseData,
      id: `pur-${Date.now()}`,
      code: newCode,
    };

    // Update product stock AND recalculate Weighted Average Cost (Costo Promedio Ponderado)
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === affectedProduct.id) {
          const totalExistingValue = p.currentStock * p.unitCost;
          const newPurchasedValue = affectedProduct.addedQty * affectedProduct.newPurchaseCost;
          const updatedStock = p.currentStock + affectedProduct.addedQty;
          const weightedUnitCost =
            updatedStock > 0 ? (totalExistingValue + newPurchasedValue) / updatedStock : p.unitCost;

          return {
            ...p,
            currentStock: updatedStock,
            unitCost: Math.round(weightedUnitCost),
          };
        }
        return p;
      })
    );

    // If purchase was paid cash, deduct from cashBalance
    if (newPurchaseData.paymentType === "contado") {
      setCashBalance((prev) => prev - newPurchaseData.total);
    }

    setPurchases((prev) => [newPurchase, ...prev]);
  };

  const handleRecordExpense = (newExpenseData: Omit<Expense, "id" | "code">) => {
    const newCode = `GAS-${300 + expenses.length + 1}`;
    const newExp: Expense = {
      ...newExpenseData,
      id: `exp-${Date.now()}`,
      code: newCode,
    };

    if (newExpenseData.isPaid) {
      setCashBalance((prev) => prev - newExpenseData.amount);
    }

    setExpenses((prev) => [newExp, ...prev]);
  };

  const handlePayExpense = (expenseId: string) => {
    const exp = expenses.find((e) => e.id === expenseId);
    if (!exp || exp.isPaid) return;

    setCashBalance((prev) => prev - exp.amount);
    setExpenses((prev) =>
      prev.map((e) => (e.id === expenseId ? { ...e, isPaid: true } : e))
    );
  };

  const handleUpdateStock = (productId: string, newStock: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, currentStock: newStock } : p))
    );
  };

  const handleAddNewProduct = (newProd: Omit<ProductSKU, "id">) => {
    const created: ProductSKU = {
      ...newProd,
      id: `prod-${Date.now()}`,
    };
    setProducts((prev) => [...prev, created]);
  };

  const handleAskCopilot = (prompt: string) => {
    setCopilotOpen(true);
    // Focus or trigger prompt in Copilot
    setTimeout(() => {
      const input = document.getElementById("copilot-input") as HTMLInputElement;
      if (input) {
        input.value = prompt;
        input.focus();
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans selection:bg-amber-200 selection:text-stone-900">
      {/* Top Navigation */}
      <Navbar
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        copilotOpen={copilotOpen}
        onToggleCopilot={() => setCopilotOpen(!copilotOpen)}
        cashBalance={cashBalance}
        netProfit={financials.netProfit}
        totalReceivables={financials.totalReceivables}
        criticalStockAlerts={financials.criticalAlertsCount}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "comercial" && (
          <CommercialModule
            customers={customers}
            invoices={invoices}
            products={products}
            currentRole={currentRole}
            onCreateInvoice={handleCreateInvoice}
            onRecordPayment={handleRecordPayment}
            onAskCopilot={handleAskCopilot}
          />
        )}

        {activeTab === "compras" && (
          <PurchasesModule
            purchases={purchases}
            expenses={expenses}
            products={products}
            onRegisterPurchase={handleRegisterPurchase}
            onRecordExpense={handleRecordExpense}
            onPayExpense={handlePayExpense}
            onAskCopilot={handleAskCopilot}
          />
        )}

        {activeTab === "inventario" && (
          <InventoryModule
            products={products}
            currentRole={currentRole}
            onUpdateStock={handleUpdateStock}
            onAddNewProduct={handleAddNewProduct}
            onAskCopilot={handleAskCopilot}
          />
        )}

        {activeTab === "finanzas" && (
          <FinancialIntelligenceModule
            currentRole={currentRole}
            totalSales={financials.totalSales}
            costOfSales={financials.costOfSales}
            grossProfit={financials.grossProfit}
            grossMargin={financials.grossMargin}
            operatingExpenses={financials.operatingExpenses}
            netProfit={financials.netProfit}
            netMargin={financials.netMargin}
            cashBalance={cashBalance}
            accountsReceivable={financials.totalReceivables}
            accountsPayable={financials.totalPayables}
            inventoryValue={financials.totalInventoryValue}
            effectiveCashInflows={financials.effectiveInflows}
            effectiveCashOutflows={financials.effectiveOutflows}
            netCashFlow={financials.netCashFlow}
            currentRatio={financials.currentRatio}
            dsoDays={financials.dsoDays}
            onAskCopilot={handleAskCopilot}
            onSwitchRole={setCurrentRole}
          />
        )}

        {activeTab === "herramientas" && (
          <AnalysisToolsModule
            currentRole={currentRole}
            defaultFixedCosts={financials.operatingExpenses}
            onAskCopilot={handleAskCopilot}
            onSwitchRole={setCurrentRole}
          />
        )}
      </main>

      {/* Copilot Drawer (Multi-turn Gemini Chat with RBAC) */}
      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        currentRole={currentRole}
        erpSnapshot={erpSnapshot}
        onNavigateToTab={(tab) => {
          setActiveTab(tab);
        }}
      />
    </div>
  );
}
