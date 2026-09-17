import React, { useState } from "react";
import { Customer, Invoice, ProductSKU, UserRole } from "../types";
import { formatCurrency } from "../utils/finance";
import {
  Users,
  FileText,
  PlusCircle,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Receipt,
} from "lucide-react";

interface CommercialModuleProps {
  customers: Customer[];
  invoices: Invoice[];
  products: ProductSKU[];
  currentRole: UserRole;
  onCreateInvoice: (newInvoice: Omit<Invoice, "id" | "code">) => void;
  onRecordPayment: (
    customerId: string,
    invoiceId: string,
    amount: number,
    paymentMethod: "transferencia" | "efectivo" | "tarjeta",
    notes: string
  ) => void;
  onAskCopilot: (prompt: string) => void;
}

export const CommercialModule: React.FC<CommercialModuleProps> = ({
  customers,
  invoices,
  products,
  onCreateInvoice,
  onRecordPayment,
  onAskCopilot,
}) => {
  const [activeSubtab, setActiveSubtab] = useState<"invoices" | "customers">("invoices");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Invoice creation form state
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || "");
  const [invoiceType, setInvoiceType] = useState<"contado" | "credito">("credito");
  const [selectedItems, setSelectedItems] = useState<
    { productId: string; quantity: number; unitPrice: number }[]
  >([{ productId: products[0]?.id || "", quantity: 1, unitPrice: products[0]?.sellingPrice || 0 }]);

  // Payment receipt form state
  const [paymentCustomerId, setPaymentCustomerId] = useState(customers[0]?.id || "");
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState<number>(1000000);
  const [paymentMethod, setPaymentMethod] = useState<"transferencia" | "efectivo" | "tarjeta">("transferencia");
  const [paymentNotes, setPaymentNotes] = useState("");

  const pendingInvoices = invoices.filter((i) => i.status !== "pagada");
  const totalReceivables = customers.reduce((acc, c) => acc + c.currentBalance, 0);

  const handleAddItemRow = () => {
    setSelectedItems((prev) => [
      ...prev,
      { productId: products[0]?.id || "", quantity: 1, unitPrice: products[0]?.sellingPrice || 0 },
    ]);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setSelectedItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === "productId") {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          item.unitPrice = prod.sellingPrice;
        }
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleRemoveItemRow = (index: number) => {
    if (selectedItems.length > 1) {
      setSelectedItems((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmitInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) return;

    let subtotal = 0;
    let totalCost = 0;
    const items = selectedItems.map((it) => {
      const prod = products.find((p) => p.id === it.productId);
      const qty = Number(it.quantity) || 1;
      const price = Number(it.unitPrice) || (prod ? prod.sellingPrice : 0);
      const cost = prod ? prod.unitCost : 0;
      const sub = qty * price;
      const cTot = qty * cost;
      subtotal += sub;
      totalCost += cTot;

      return {
        productId: it.productId,
        sku: prod?.sku || "SKU-GEN",
        name: prod?.name || "Producto",
        quantity: qty,
        unitPrice: price,
        unitCost: cost,
        subtotal: sub,
        totalCost: cTot,
      };
    });

    const tax = subtotal * 0.19; // IVA 19%
    const total = subtotal + tax;
    const isContado = invoiceType === "contado";

    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + (isContado ? 0 : cust.termDays || 30));

    onCreateInvoice({
      date: new Date().toISOString().split("T")[0],
      customerId: cust.id,
      customerName: cust.name,
      paymentType: invoiceType,
      items,
      subtotal,
      tax,
      total,
      totalCost,
      status: isContado ? "pagada" : "pendiente",
      balanceRemaining: isContado ? 0 : total,
      dueDate: dueDateObj.toISOString().split("T")[0],
    });

    setShowInvoiceModal(false);
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentInvoiceId || paymentAmount <= 0) return;
    onRecordPayment(paymentCustomerId, paymentInvoiceId, paymentAmount, paymentMethod, paymentNotes);
    setShowPaymentModal(false);
    setPaymentNotes("");
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCustomers = customers.filter(
    (cust) =>
      cust.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.document.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-stone-100 text-stone-800">
                <Users className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-stone-900">Comercial & Cuentas por Cobrar (CxC)</h1>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Gestión de clientes, emisión de facturas (contado/crédito) y amortización de cartera con recibos de caja.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              id="btn-new-invoice"
              onClick={() => setShowInvoiceModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors shadow-2xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nueva Factura</span>
            </button>
            <button
              id="btn-new-payment"
              onClick={() => {
                setShowPaymentModal(true);
                if (pendingInvoices.length > 0) {
                  setPaymentCustomerId(pendingInvoices[0].customerId);
                  setPaymentInvoiceId(pendingInvoices[0].id);
                  setPaymentAmount(pendingInvoices[0].balanceRemaining);
                }
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-2xs"
            >
              <Receipt className="w-4 h-4" />
              <span>Registrar Abono</span>
            </button>
          </div>
        </div>

        {/* Metric Ribbons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-stone-100">
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Total Cartera Pendiente (CxC)</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">{formatCurrency(totalReceivables)}</div>
            <span className="text-[11px] text-amber-700 font-medium">
              {customers.filter((c) => c.status === "vencido").length} clientes con saldos vencidos
            </span>
          </div>
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Facturas Emitidas</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">{invoices.length} facturas</div>
            <span className="text-[11px] text-stone-500">
              {invoices.filter((i) => i.status === "pagada").length} pagadas | {pendingInvoices.length} con saldo
            </span>
          </div>
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Asistencia del Copiloto</span>
            <div className="mt-1">
              <button
                onClick={() =>
                  onAskCopilot("Analiza la cartera por cobrar (CxC): clientes con saldos vencidos y riesgo de crédito.")
                }
                className="text-xs text-amber-700 hover:text-amber-800 font-semibold underline text-left"
              >
                Analizar envejecimiento de cartera con Copiloto &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSubtab("invoices")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeSubtab === "invoices"
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
            }`}
          >
            Facturas de Venta ({invoices.length})
          </button>
          <button
            onClick={() => setActiveSubtab("customers")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeSubtab === "customers"
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
            }`}
          >
            Directorio de Clientes & Límites ({customers.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por código, cliente, NIT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
          />
        </div>
      </div>

      {/* Invoices Table */}
      {activeSubtab === "invoices" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Factura</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Fecha / Venc.</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Saldo Pendiente</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.status === "pagada";
                  const isPartial = inv.status === "abono_parcial";
                  return (
                    <tr key={inv.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-stone-900 flex items-center space-x-1.5">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>{inv.code}</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-stone-900">{inv.customerName}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            inv.paymentType === "contado"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {inv.paymentType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-stone-500">
                        <div>{inv.date}</div>
                        <div className="text-[10px] text-stone-400">Vence: {inv.dueDate}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-stone-900">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-amber-900">
                        {formatCurrency(inv.balanceRemaining)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isPaid ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Pagada</span>
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center space-x-1 text-amber-700 font-semibold text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Clock className="w-3 h-3" />
                            <span>Abono Parcial</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-rose-700 font-semibold text-[11px] bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <AlertCircle className="w-3 h-3" />
                            <span>Pendiente</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {!isPaid && (
                          <button
                            onClick={() => {
                              setPaymentCustomerId(inv.customerId);
                              setPaymentInvoiceId(inv.id);
                              setPaymentAmount(inv.balanceRemaining);
                              setShowPaymentModal(true);
                            }}
                            className="text-emerald-700 hover:text-emerald-900 font-semibold text-xs underline"
                          >
                            Abonar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customers Table */}
      {activeSubtab === "customers" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Razón Social</th>
                  <th className="py-3 px-4">Documento / NIT</th>
                  <th className="py-3 px-4">Plazo Crédito</th>
                  <th className="py-3 px-4 text-right">Límite de Crédito</th>
                  <th className="py-3 px-4 text-right">Saldo Actual (CxC)</th>
                  <th className="py-3 px-4 text-center">Estado Cartera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-stone-900">{c.name}</td>
                    <td className="py-3 px-4 text-stone-500 font-mono">{c.document}</td>
                    <td className="py-3 px-4">{c.termDays} días</td>
                    <td className="py-3 px-4 text-right text-stone-700">{formatCurrency(c.creditLimit)}</td>
                    <td className="py-3 px-4 text-right font-bold text-stone-900">
                      {formatCurrency(c.currentBalance)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {c.status === "al_dia" && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          Al Día
                        </span>
                      )}
                      {c.status === "por_vencer" && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800">
                          Por Vencer
                        </span>
                      )}
                      {c.status === "vencido" && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800">
                          Vencido
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Nueva Factura */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-stone-200">
            <h2 className="text-base font-bold text-stone-900 mb-1">Emitir Factura de Venta</h2>
            <p className="text-xs text-stone-500 mb-4">
              Genera facturación a contado o a crédito. Afecta automáticamente existencias y costo de ventas.
            </p>

            <form onSubmit={handleSubmitInvoice} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Cliente</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.document}) - Cupo disp: {formatCurrency(c.creditLimit - c.currentBalance)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Modalidad de Pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInvoiceType("contado")}
                    className={`py-2 text-center rounded-lg border font-semibold ${
                      invoiceType === "contado"
                        ? "bg-emerald-50 border-emerald-600 text-emerald-800"
                        : "border-stone-200 text-stone-600"
                    }`}
                  >
                    Contado (Ingreso a Caja)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceType("credito")}
                    className={`py-2 text-center rounded-lg border font-semibold ${
                      invoiceType === "credito"
                        ? "bg-blue-50 border-blue-600 text-blue-800"
                        : "border-stone-200 text-stone-600"
                    }`}
                  >
                    Crédito (Afecta CxC)
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="border-t border-stone-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-stone-800">Líneas de Producto</span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-stone-800 font-semibold hover:underline"
                  >
                    + Agregar ítem
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center space-x-2 bg-stone-50 p-2 rounded border border-stone-200">
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemChange(idx, "productId", e.target.value)}
                        className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-xs"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} - {p.name} (Stock: {p.currentStock})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        placeholder="Cant"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                        className="w-16 bg-white border border-stone-300 rounded px-2 py-1 text-xs"
                      />
                      {selectedItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="text-rose-600 hover:text-rose-800 text-xs px-1 font-bold"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-semibold"
                >
                  Confirmar Emisión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Abono */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-stone-200">
            <h2 className="text-base font-bold text-stone-900 mb-1">Registrar Recibo de Abono (Recaudo CxC)</h2>
            <p className="text-xs text-stone-500 mb-4">
              Amortiza el saldo pendiente de una factura e incrementa el flujo de caja efectivo de la compañía.
            </p>

            <form onSubmit={handleSubmitPayment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Factura a Amortizar</label>
                <select
                  value={paymentInvoiceId}
                  onChange={(e) => {
                    setPaymentInvoiceId(e.target.value);
                    const inv = invoices.find((i) => i.id === e.target.value);
                    if (inv) {
                      setPaymentCustomerId(inv.customerId);
                      setPaymentAmount(inv.balanceRemaining);
                    }
                  }}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-stone-800 outline-none"
                >
                  {pendingInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.code} - {inv.customerName} (Saldo: {formatCurrency(inv.balanceRemaining)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Monto del Abono ($)</label>
                <input
                  type="number"
                  min="1"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-stone-800 outline-none"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Medio de Pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs"
                >
                  <option value="transferencia">Transferencia Bancaria (Bancolombia/PSE)</option>
                  <option value="efectivo">Efectivo (Caja General)</option>
                  <option value="tarjeta">Tarjeta Débito/Crédito</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Notas / Soporte de Pago</label>
                <input
                  type="text"
                  placeholder="Número de comprobante bancario..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 font-semibold"
                >
                  Aplicar Amortización
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
