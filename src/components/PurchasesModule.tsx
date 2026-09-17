import React, { useState } from "react";
import { Purchase, Expense, ProductSKU } from "../types";
import { formatCurrency } from "../utils/finance";
import {
  ShoppingBag,
  DollarSign,
  PlusCircle,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
} from "lucide-react";

interface PurchasesModuleProps {
  purchases: Purchase[];
  expenses: Expense[];
  products: ProductSKU[];
  onRegisterPurchase: (
    newPurchase: Omit<Purchase, "id" | "code">,
    affectedProduct: { id: string; addedQty: number; newPurchaseCost: number }
  ) => void;
  onRecordExpense: (newExpense: Omit<Expense, "id" | "code">) => void;
  onPayExpense: (expenseId: string) => void;
  onAskCopilot: (prompt: string) => void;
}

export const PurchasesModule: React.FC<PurchasesModuleProps> = ({
  purchases,
  expenses,
  products,
  onRegisterPurchase,
  onRecordExpense,
  onPayExpense,
  onAskCopilot,
}) => {
  const [activeSubtab, setActiveSubtab] = useState<"purchases" | "expenses">("purchases");
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Purchase Form State
  const [supplierName, setSupplierName] = useState("");
  const [supplierDoc, setSupplierDoc] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [purchaseQty, setPurchaseQty] = useState<number>(10);
  const [purchaseUnitCost, setPurchaseUnitCost] = useState<number>(products[0]?.unitCost || 100000);
  const [purchasePaymentType, setPurchasePaymentType] = useState<"contado" | "credito">("contado");

  // Expense Form State
  const [expenseCategory, setExpenseCategory] = useState<Expense["category"]>("operativo");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<number>(500000);
  const [expenseIsPaid, setExpenseIsPaid] = useState(true);

  const totalPurchasesAmount = purchases.reduce((acc, p) => acc + p.total, 0);
  const totalExpensesAmount = expenses.reduce((acc, e) => acc + e.amount, 0);
  const pendingExpensesAmount = expenses
    .filter((e) => !e.isPaid)
    .reduce((acc, e) => acc + e.amount, 0);

  const selectedProd = products.find((p) => p.id === selectedProductId);

  // Preview Weighted Average Cost impact
  const currentStock = selectedProd?.currentStock || 0;
  const currentCost = selectedProd?.unitCost || 0;
  const newTotalStock = currentStock + purchaseQty;
  const previewWeightedCost =
    newTotalStock > 0
      ? (currentStock * currentCost + purchaseQty * purchaseUnitCost) / newTotalStock
      : purchaseUnitCost;

  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || purchaseQty <= 0 || purchaseUnitCost <= 0) return;

    const prod = products.find((p) => p.id === selectedProductId);
    const subtotal = purchaseQty * purchaseUnitCost;

    onRegisterPurchase(
      {
        date: new Date().toISOString().split("T")[0],
        supplierName,
        supplierDoc: supplierDoc || "NIT 900.000.000-0",
        items: [
          {
            productId: selectedProductId,
            sku: prod?.sku || "SKU-GEN",
            quantity: purchaseQty,
            unitCost: purchaseUnitCost,
            subtotal,
          },
        ],
        total: subtotal,
        paymentType: purchasePaymentType,
        status: "recibida",
      },
      {
        id: selectedProductId,
        addedQty: purchaseQty,
        newPurchaseCost: purchaseUnitCost,
      }
    );

    setShowPurchaseModal(false);
    setSupplierName("");
    setSupplierDoc("");
  };

  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim() || expenseAmount <= 0) return;

    onRecordExpense({
      date: new Date().toISOString().split("T")[0],
      category: expenseCategory,
      description: expenseDesc,
      amount: expenseAmount,
      isPaid: expenseIsPaid,
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
    });

    setShowExpenseModal(false);
    setExpenseDesc("");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-stone-100 text-stone-800">
                <ShoppingBag className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-stone-900">
                Compras, Gastos & Cuentas por Pagar (CxP)
              </h1>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Registro de compras a proveedores con recalculo de Costo Promedio Ponderado y causación de gastos operativos.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-new-purchase"
              onClick={() => setShowPurchaseModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors shadow-2xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Registrar Compra SKU</span>
            </button>
            <button
              id="btn-new-expense"
              onClick={() => setShowExpenseModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 text-xs font-semibold transition-colors shadow-2xs"
            >
              <DollarSign className="w-4 h-4" />
              <span>Causar Gasto</span>
            </button>
          </div>
        </div>

        {/* Ribbons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-stone-100">
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Total Compras Realizadas</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">
              {formatCurrency(totalPurchasesAmount)}
            </div>
            <span className="text-[11px] text-stone-500">
              {purchases.length} órdenes recibidas en bodega
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Gastos Operativos del Período</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">
              {formatCurrency(totalExpensesAmount)}
            </div>
            <span className="text-[11px] text-amber-700 font-medium">
              {formatCurrency(pendingExpensesAmount)} pendientes de desembolso
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Lógica Contable de Costeo</span>
            <div className="mt-1">
              <button
                onClick={() =>
                  onAskCopilot(
                    "Explica detalladamente cómo impacta una nueva compra en el Costo Promedio Ponderado del inventario y en el margen bruto final de la venta."
                  )
                }
                className="text-xs text-amber-700 hover:text-amber-800 font-semibold underline text-left"
              >
                Consultar Costo Promedio Ponderado con Copiloto &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex space-x-2">
        <button
          onClick={() => setActiveSubtab("purchases")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeSubtab === "purchases"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          Órdenes de Compra a Proveedores ({purchases.length})
        </button>
        <button
          onClick={() => setActiveSubtab("expenses")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeSubtab === "expenses"
              ? "bg-stone-900 text-white"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
          }`}
        >
          Causación de Gastos ({expenses.length})
        </button>
      </div>

      {/* Purchases Table */}
      {activeSubtab === "purchases" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Comprobante</th>
                  <th className="py-3 px-4">Proveedor</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Ítems / SKU Comprados</th>
                  <th className="py-3 px-4">Modalidad</th>
                  <th className="py-3 px-4 text-right">Total Factura</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-stone-900 flex items-center space-x-1.5">
                      <Truck className="w-3.5 h-3.5 text-stone-400" />
                      <span>{p.code}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-stone-900">
                      <div>{p.supplierName}</div>
                      <div className="text-[10px] text-stone-400">{p.supplierDoc}</div>
                    </td>
                    <td className="py-3 px-4 text-stone-500">{p.date}</td>
                    <td className="py-3 px-4">
                      {p.items.map((it, idx) => (
                        <div key={idx} className="text-stone-700">
                          {it.quantity} x <span className="font-mono text-stone-900 font-semibold">{it.sku}</span> ({formatCurrency(it.unitCost)})
                        </div>
                      ))}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          p.paymentType === "contado"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {p.paymentType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-stone-900">
                      {formatCurrency(p.total)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center space-x-1 text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Recibida</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      {activeSubtab === "expenses" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">Concepto / Descripción</th>
                  <th className="py-3 px-4">Fecha Causación</th>
                  <th className="py-3 px-4 text-right">Monto</th>
                  <th className="py-3 px-4 text-center">Estado Pago</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-stone-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-stone-900 font-mono">{exp.code}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-stone-100 text-stone-800 border border-stone-200">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-stone-900">{exp.description}</td>
                    <td className="py-3 px-4 text-stone-500">{exp.date}</td>
                    <td className="py-3 px-4 text-right font-bold text-stone-900">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {exp.isPaid ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          Pagado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800">
                          Por Pagar
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {!exp.isPaid && (
                        <button
                          onClick={() => onPayExpense(exp.id)}
                          className="text-emerald-700 hover:text-emerald-900 font-semibold underline text-xs"
                        >
                          Pagar ahora
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Compra */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-stone-200">
            <h2 className="text-base font-bold text-stone-900 mb-1">Registrar Compra a Proveedor</h2>
            <p className="text-xs text-stone-500 mb-4">
              Ingresa mercancía a la bodega y actualiza en tiempo real el Costo Promedio Ponderado del SKU.
            </p>

            <form onSubmit={handleSubmitPurchase} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Nombre Proveedor</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Siemens Automation Corp"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Producto / SKU a Reabastecer</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const p = products.find((pr) => pr.id === e.target.value);
                    if (p) setPurchaseUnitCost(p.unitCost);
                  }}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} - {p.name} (Stock: {p.currentStock} | Costo Actual: {formatCurrency(p.unitCost)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Cantidad Comprada</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Costo Unitario Compra ($)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={purchaseUnitCost}
                    onChange={(e) => setPurchaseUnitCost(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Costo Promedio Preview Callout */}
              {selectedProd && (
                <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-stone-700 space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-stone-900">
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    <span>Impacto en Costo Promedio Ponderado:</span>
                  </div>
                  <div className="text-[11px] grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <span className="text-stone-500">Costo Actual:</span>{" "}
                      <span className="font-semibold">{formatCurrency(currentCost)}</span>
                    </div>
                    <div>
                      <span className="text-stone-500">Nuevo Stock:</span>{" "}
                      <span className="font-semibold">{newTotalStock} unds</span>
                    </div>
                    <div>
                      <span className="text-stone-500">Nuevo Costo Promedio:</span>{" "}
                      <span className="font-bold text-emerald-800">{formatCurrency(previewWeightedCost)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-stone-700 font-medium mb-1">Forma de Pago a Proveedor</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPurchasePaymentType("contado")}
                    className={`py-2 text-center rounded-lg border font-semibold ${
                      purchasePaymentType === "contado"
                        ? "bg-emerald-50 border-emerald-600 text-emerald-800"
                        : "border-stone-200 text-stone-600"
                    }`}
                  >
                    Contado (Desembolso Inmediato)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurchasePaymentType("credito")}
                    className={`py-2 text-center rounded-lg border font-semibold ${
                      purchasePaymentType === "credito"
                        ? "bg-amber-50 border-amber-600 text-amber-800"
                        : "border-stone-200 text-stone-600"
                    }`}
                  >
                    Crédito (Afecta CxP)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-semibold"
                >
                  Registrar Compra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Causar Gasto */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-stone-200">
            <h2 className="text-base font-bold text-stone-900 mb-1">Causar Gasto Operativo / Administrativo</h2>
            <p className="text-xs text-stone-500 mb-4">
              Registra los gastos fijos y operativos que impactan directamente el Estado de Resultados (P&G).
            </p>

            <form onSubmit={handleSubmitExpense} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Categoría de Gasto</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as any)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                >
                  <option value="arriendo">Arriendo Bodega / Oficinas</option>
                  <option value="servicios">Servicios Públicos / Energía / Fibra</option>
                  <option value="nomina">Nómina & Seguridad Social</option>
                  <option value="software">Software, ERP & Cloud SaaS</option>
                  <option value="marketing">Marketing & Publicidad Digital</option>
                  <option value="operativo">Mantenimiento & Gastos Operativos</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Descripción / Concepto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago de canon de arrendamiento sede principal..."
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Monto del Gasto ($)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-stone-800 outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="expense-is-paid"
                  checked={expenseIsPaid}
                  onChange={(e) => setExpenseIsPaid(e.target.checked)}
                  className="rounded border-stone-300 text-stone-900 focus:ring-stone-800"
                />
                <label htmlFor="expense-is-paid" className="text-stone-700 font-medium">
                  Gasto pagado de inmediato (disminuye saldo en bancos/caja)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-semibold"
                >
                  Causar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
