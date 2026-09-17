export type UserRole =
  | "super_administrador"
  | "administrador"
  | "contador"
  | "vendedor"
  | "auxiliar";

export interface Customer {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  creditLimit: number;
  currentBalance: number; // CxC
  termDays: number;
  status: "al_dia" | "por_vencer" | "vencido";
}

export interface ProductSKU {
  id: string;
  sku: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unitCost: number; // Costo promedio ponderado
  sellingPrice: number;
  unit: string;
}

export interface InvoiceItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  totalCost: number;
}

export interface Invoice {
  id: string;
  code: string;
  date: string;
  customerId: string;
  customerName: string;
  paymentType: "contado" | "credito";
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  totalCost: number;
  status: "pagada" | "pendiente" | "abono_parcial";
  balanceRemaining: number;
  dueDate: string;
}

export interface PaymentReceipt {
  id: string;
  code: string;
  date: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceCode: string;
  amount: number;
  paymentMethod: "transferencia" | "efectivo" | "tarjeta";
  notes: string;
}

export interface PurchaseItem {
  productId: string;
  sku: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  code: string;
  date: string;
  supplierName: string;
  supplierDoc: string;
  items: PurchaseItem[];
  total: number;
  paymentType: "contado" | "credito";
  status: "recibida" | "pendiente";
}

export interface Expense {
  id: string;
  code: string;
  date: string;
  category: "arriendo" | "servicios" | "nomina" | "marketing" | "software" | "operativo";
  description: string;
  amount: number;
  isPaid: boolean;
  dueDate: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  modelUsed?: string;
  suggestedActions?: { label: string; tab: string }[];
}

export interface ERPSnapshot {
  totalSales: number;
  costOfSales: number;
  grossProfit: number;
  grossMargin: string;
  operatingExpenses: number;
  netProfit: number;
  netMargin: string;
  cashBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  inventoryValue: number;
  currentRatio: string;
  dso: string;
  criticalAlertsCount: number;
  topDebtors: { name: string; balance: number }[];
  lowStockProducts: { sku: string; name: string; stock: number; min: number }[];
}
