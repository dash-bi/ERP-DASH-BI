import React, { useState } from "react";
import { ProductSKU, UserRole } from "../types";
import { formatCurrency, formatPercent } from "../utils/finance";
import {
  Boxes,
  AlertTriangle,
  PackageCheck,
  Search,
  PlusCircle,
  TrendingUp,
  Tag,
  Barcode,
} from "lucide-react";

interface InventoryModuleProps {
  products: ProductSKU[];
  currentRole: UserRole;
  onUpdateStock: (productId: string, newStock: number) => void;
  onAddNewProduct: (product: Omit<ProductSKU, "id">) => void;
  onAskCopilot: (prompt: string) => void;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  products,
  currentRole,
  onUpdateStock,
  onAddNewProduct,
  onAskCopilot,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<ProductSKU | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState<number>(0);

  // New product state
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Automatización");
  const [newCurrentStock, setNewCurrentStock] = useState(10);
  const [newMinStock, setNewMinStock] = useState(5);
  const [newUnitCost, setNewUnitCost] = useState(150000);
  const [newSellingPrice, setNewSellingPrice] = useState(250000);
  const [newUnit, setNewUnit] = useState("Und");

  const totalInventoryValue = products.reduce(
    (acc, p) => acc + p.currentStock * p.unitCost,
    0
  );
  const criticalProducts = products.filter((p) => p.currentStock < p.minStock);

  const categories = Array.from(new Set(products.map((p) => p.category)));

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    onUpdateStock(adjustingProduct.id, adjustmentQty);
    setAdjustingProduct(null);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.trim() || !newName.trim()) return;

    onAddNewProduct({
      sku: newSku.toUpperCase().trim(),
      name: newName.trim(),
      category: newCategory,
      currentStock: newCurrentStock,
      minStock: newMinStock,
      unitCost: newUnitCost,
      sellingPrice: newSellingPrice,
      unit: newUnit,
    });

    setShowAddModal(false);
    setNewSku("");
    setNewName("");
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-stone-100 text-stone-800">
                <Boxes className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-stone-900">Control de Inventario SKU</h1>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Catálogo de existencias en tiempo real, alertas de stock mínimo y valoración por Costo Promedio Ponderado.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-new-sku"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors shadow-2xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nuevo SKU</span>
            </button>
          </div>
        </div>

        {/* Metric Ribbons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-stone-100">
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Valoración Total Inventario</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">
              {formatCurrency(totalInventoryValue)}
            </div>
            <span className="text-[11px] text-stone-500">
              Valorado según Costo Promedio Ponderado
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Estado de Existencias</span>
            <div className="text-lg font-bold text-stone-900 mt-0.5">
              {products.length} SKUs activos
            </div>
            <span
              className={`text-[11px] font-semibold ${
                criticalProducts.length > 0 ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {criticalProducts.length > 0
                ? `⚠️ ${criticalProducts.length} producto(s) bajo el stock mínimo`
                : "✓ Todos los ítems sobre nivel de seguridad"}
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
            <span className="text-xs text-stone-500">Inteligencia de Abastecimiento</span>
            <div className="mt-1">
              <button
                onClick={() =>
                  onAskCopilot(
                    "Revisa los productos con alerta de stock crítico, sugiere el lote de reorden económico y estima el capital necesario para comprar."
                  )
                }
                className="text-xs text-amber-700 hover:text-amber-800 font-semibold underline text-left"
              >
                Plan de reabastecimiento con Copiloto &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Critical Stock Alert Banner */}
      {criticalProducts.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold">Alertas de Stock Crítico Detectadas:</span>
              <p className="text-rose-800 mt-0.5">
                {criticalProducts.map((p) => `${p.sku} (${p.currentStock}/${p.minStock} ${p.unit})`).join(", ")}
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              onAskCopilot(
                `¿Cuál es el impacto financiero y de costo promedio si compramos inmediatamente las unidades faltantes de los SKUs críticos: ${criticalProducts
                  .map((p) => p.sku)
                  .join(", ")}?`
              )
            }
            className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold whitespace-nowrap transition-colors"
          >
            Consultar al Copiloto
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              selectedCategory === "all"
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
            }`}
          >
            Todas las Categorías ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por SKU, nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
          />
        </div>
      </div>

      {/* SKU Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">SKU / Código</th>
                <th className="py-3 px-4">Descripción Producto</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4 text-center">Stock Actual</th>
                <th className="py-3 px-4 text-center">Stock Mínimo</th>
                <th className="py-3 px-4 text-right">Costo Promedio</th>
                <th className="py-3 px-4 text-right">Precio Venta</th>
                <th className="py-3 px-4 text-right">Margen Bruto</th>
                <th className="py-3 px-4 text-right">Valor en Inventario</th>
                <th className="py-3 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {filteredProducts.map((p) => {
                const isCritical = p.currentStock < p.minStock;
                const unitMargin = p.sellingPrice - p.unitCost;
                const marginPercent = p.sellingPrice > 0 ? (unitMargin / p.sellingPrice) * 100 : 0;
                const totalItemVal = p.currentStock * p.unitCost;

                return (
                  <tr key={p.id} className="hover:bg-stone-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-stone-900 flex items-center space-x-1.5">
                      <Barcode className="w-4 h-4 text-stone-400" />
                      <span>{p.sku}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-stone-900">{p.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-md font-bold text-xs ${
                          isCritical
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {p.currentStock} {p.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-stone-500 font-medium">
                      {p.minStock} {p.unit}
                    </td>
                    <td className="py-3 px-4 text-right text-stone-700 font-mono">
                      {formatCurrency(p.unitCost)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-stone-900 font-mono">
                      {formatCurrency(p.sellingPrice)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-emerald-700">
                        {formatPercent(marginPercent)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-stone-900 font-mono">
                      {formatCurrency(totalItemVal)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          setAdjustingProduct(p);
                          setAdjustmentQty(p.currentStock);
                        }}
                        className="text-stone-900 hover:text-amber-700 font-semibold underline text-xs"
                      >
                        Ajustar Stock
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Ajustar Stock */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-stone-200">
            <h2 className="text-base font-bold text-stone-900 mb-1">Ajuste de Existencias</h2>
            <p className="text-xs text-stone-500 mb-4">
              Modifica directamente el conteo físico en bodega para el SKU <strong>{adjustingProduct.sku}</strong>.
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Producto</label>
                <div className="p-2.5 rounded bg-stone-50 border border-stone-200 text-stone-800 font-medium">
                  {adjustingProduct.name}
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Nuevo Stock Físico</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustmentQty}
                  onChange={(e) => setAdjustmentQty(Number(e.target.value))}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-900 focus:ring-1 focus:ring-stone-800 outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-semibold"
                >
                  Guardar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo SKU */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-stone-200">
            <h2 className="text-base font-bold text-stone-900 mb-1">Crear Nuevo Producto / SKU</h2>
            <p className="text-xs text-stone-500 mb-4">
              Agrega una referencia al catálogo con sus parámetros de costo y precio de venta.
            </p>

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Código SKU</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: SKU-VAL-801"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Categoría</label>
                  <input
                    type="text"
                    required
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Nombre del Producto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Actuador Lineal 500mm 12V"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Stock Inicial</label>
                  <input
                    type="number"
                    min="0"
                    value={newCurrentStock}
                    onChange={(e) => setNewCurrentStock(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Stock Mínimo</label>
                  <input
                    type="number"
                    min="1"
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Unidad</label>
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Costo Unitario ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={newUnitCost}
                    onChange={(e) => setNewUnitCost(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Precio Venta ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={newSellingPrice}
                    onChange={(e) => setNewSellingPrice(Number(e.target.value))}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-semibold"
                >
                  Crear SKU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
